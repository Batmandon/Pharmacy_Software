from typing import Literal
from pydantic import BaseModel, ValidationError

from shared.signature import make_signature
from features.products.schemas import (
    AddProduct,
    UpdateProduct,
    CreateBatch,
    EditBatch,
    CreateBrand,
    CreateCategory,
    CreateManufacturer,
    CreateSalt,
    CreateSupplier,
)

CatalogEntity = Literal[
    "categories",
    "brands",
    "manufacturers",
    "suppliers",
    "salts",
]

ENTITY_CONFIG = {
    "categories": (CreateCategory, (("name",),)),
    "brands": (CreateBrand, (("name",),)),
    "manufacturers": (CreateManufacturer, (("name",),)),
    "suppliers": (CreateSupplier, (("name",), ("phone",), ("gstin",))),
    "salts": (CreateSalt, (("name",),)),
}

# no catalog entity points at another one any more (a product's salts are managed with the product,
# because the product's duplicate-check signature depends on them)
REFERENCE_CHECKS = {}

DELETE_REFERENCES = {
    "categories": (("products", "category_id"),),
    "brands": (("products", "brand_id"),),
    "manufacturers": (("products", "manufacturer_id"),),
    "suppliers": (("batches", "supplier_id"),),
    "salts": (("products", "salt_id"), ("product_salts", "salt_id")),
}

ENTITY_LABELS = {
    "categories": "category",
    "brands": "brand",
    "manufacturers": "manufacturer",
    "suppliers": "supplier",
    "salts": "salt",
}

class CrudProductOperation:
    def __init__(self, conn):
        self.conn = conn

    # ============================================================================= #
    #                              Product CRUD                                     #
    # ============================================================================= #
    def _save_salts(self, cur, product_id: int, salts):
        cur.execute("DELETE FROM product_salts WHERE product_id = %s", (product_id,))
        for salt in salts:
            cur.execute(
                "INSERT INTO product_salts (product_id, salt_id, strength) VALUES (%s, %s, %s)",
                (product_id, salt.salt_id, salt.strength),
            )

    def add_product(self, product: AddProduct):
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO products (category_id, manufacturer_id, brand_id, name, form, pack_size, schedule, gst_percent, hsn_code, storage_condition, description, side_effects, dosage_information, image_url, signature)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    product.category_id,
                    product.manufacturer_id,
                    product.brand_id,
                    product.name,
                    product.form,
                    product.pack_size,
                    product.schedule,
                    product.gst_percent,
                    product.hsn_code,
                    product.storage_condition,
                    product.description,
                    product.side_effects,
                    product.dosage_information,
                    product.image_url,
                    make_signature(
                        product.name, product.form, product.pack_size,
                        [(s.salt_id, s.strength) for s in product.salts],
                    ),
                )
            )
            product_id = cur.fetchone()["id"]
            self._save_salts(cur, product_id, product.salts)
            return {"id": product_id}

    def update_product(self, product_id: int, product: UpdateProduct):
        sent = product.model_fields_set
        changes = product.model_dump(exclude_unset=True, exclude={"salts"})
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT name, form, pack_size FROM products WHERE id = %s FOR UPDATE",
                (product_id,),
            )
            current = cur.fetchone()
            if current is None:
                return {"error": f"Product with ID {product_id} does not exist."}

            # the signature depends on name, form, pack size and salts: rebuild it when one of them changes
            if sent & {"name", "form", "pack_size", "salts"}:
                if "salts" in sent:
                    salts = [(s.salt_id, s.strength) for s in product.salts]
                else:
                    cur.execute(
                        """
                        SELECT salt_id, strength FROM product_salts WHERE product_id = %s
                        """,
                        (product_id,),
                    )
                    salts = [(r["salt_id"], r["strength"]) for r in cur.fetchall()]
                changes["signature"] = make_signature(
                    changes.get("name", current["name"]),
                    changes.get("form", current["form"]),
                    changes.get("pack_size", current["pack_size"]),
                    salts,
                )

            if changes:
                assignments = ", ".join(f"{column} = %s" for column in changes)
                cur.execute(
                    f"UPDATE products SET {assignments} WHERE id = %s",
                    (*changes.values(), product_id),
                )
            if "salts" in sent:
                self._save_salts(cur, product_id, product.salts)
            return {"updated": True}

    def delete_product(self, product_id: int):
        with self.conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM products
                WHERE id = %s
                """,
                (product_id,)
            )
            if cur.rowcount == 0:
                return {"error": f"Product with ID {product_id} does not exist."}
            return {"deleted": True}

    # ============================================================================= #
    #                               Batch CRUD                                      #
    # ============================================================================= #

    def create_batch(self, batch: CreateBatch):
        with self.conn.cursor() as cur:
            cur.execute("SELECT 1 FROM products WHERE id = %s", (batch.product_id,))
            if cur.fetchone() is None:
                return {
                    "error": f"Product with ID {batch.product_id} does not exist.",
                    "status_code": 404,
                }

            if batch.supplier_id is not None:
                cur.execute("SELECT 1 FROM suppliers WHERE id = %s", (batch.supplier_id,))
                if cur.fetchone() is None:
                    return {
                        "error": f"Supplier with ID {batch.supplier_id} does not exist.",
                        "status_code": 404,
                    }

            cur.execute(
                "SELECT 1 FROM batches WHERE product_id = %s AND batch_no = %s",
                (batch.product_id, batch.batch_no),
            )
            if cur.fetchone() is not None:
                return {
                    "error": (
                        f"Batch number {batch.batch_no} already exists "
                        f"for product ID {batch.product_id}."
                    ),
                    "status_code": 409,
                }

            cur.execute(
                """
                INSERT INTO batches (
                    product_id, batch_no, mfg_date, expiry_date, quantity,
                    purchase_price, mrp, discount_percent, supplier_id, rack_location
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    batch.product_id,
                    batch.batch_no,
                    batch.mfg_date,
                    batch.expiry_date,
                    batch.quantity,
                    batch.purchase_price,
                    batch.mrp,
                    batch.discount_percent,
                    batch.supplier_id,
                    batch.rack_location,
                ),
            )
            return {"id": cur.fetchone()["id"]}

    def edit_batch(self, batch_id: int, batch: EditBatch):
        changes = batch.model_dump(exclude_unset=True)
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT product_id, batch_no, mfg_date, expiry_date, quantity,
                       purchase_price, mrp, discount_percent, supplier_id, rack_location
                FROM batches
                WHERE id = %s
                FOR UPDATE
                """,
                (batch_id,),
            )
            current = cur.fetchone()
            if current is None:
                return {
                    "error": f"Batch with ID {batch_id} does not exist.",
                    "status_code": 404,
                }

            updated = {**current, **changes}
            try:
                CreateBatch.model_validate(updated)
            except ValidationError as exc:
                return {"error": exc.errors()[0]["msg"], "status_code": 422}

            if "product_id" in changes:
                cur.execute("SELECT 1 FROM products WHERE id = %s", (updated["product_id"],))
                if cur.fetchone() is None:
                    return {
                        "error": f"Product with ID {updated['product_id']} does not exist.",
                        "status_code": 404,
                    }

            if updated["supplier_id"] is not None:
                cur.execute("SELECT 1 FROM suppliers WHERE id = %s", (updated["supplier_id"],))
                if cur.fetchone() is None:
                    return {
                        "error": f"Supplier with ID {updated['supplier_id']} does not exist.",
                        "status_code": 404,
                    }

            cur.execute(
                "SELECT 1 FROM batches WHERE product_id = %s AND batch_no = %s AND id <> %s",
                (updated["product_id"], updated["batch_no"], batch_id),
            )
            if cur.fetchone() is not None:
                return {
                    "error": (
                        f"Batch number {updated['batch_no']} already exists "
                        f"for product ID {updated['product_id']}."
                    ),
                    "status_code": 409,
                }

            assignments = ", ".join(f"{column} = %s" for column in changes)
            values = [updated[column] for column in changes]
            cur.execute(
                f"UPDATE batches SET {assignments} WHERE id = %s",
                (*values, batch_id),
            )
            return {"updated": True}

    def batch_belongs_to_product(self, batch_id: int, product_id: int):
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM batches WHERE id = %s AND product_id = %s",
                (batch_id, product_id),
            )
            return cur.fetchone() is not None

    def delete_batch(self, batch_id: int):
        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM batches WHERE id = %s", (batch_id,))
            if cur.rowcount == 0:
                return {
                    "error": f"Batch with ID {batch_id} does not exist.",
                    "status_code": 404,
                }
            return {"deleted": True}

    # ============================================================================= #
    #                          Admin: Catalog Operations                            #
    # ============================================================================= #
    def list_items(self, entity: CatalogEntity):
              with self.conn.cursor() as cur:
                  cur.execute(f"SELECT * FROM {entity} ORDER BY id")
                  return cur.fetchall()
              
    def create_item(self, entity: CatalogEntity, item: BaseModel):
        values = item.model_dump()
        with self.conn.cursor() as cur:
            reference_error = self._check_references(cur, entity, values)
            if reference_error is not None:
                return reference_error

            duplicate = self._find_duplicate(cur, entity, values)
            if duplicate:
                return self._duplicate_error(entity, duplicate)

            columns = tuple(values)
            cur.execute(
                f"""
                INSERT INTO {entity} ({", ".join(columns)})
                VALUES ({", ".join(["%s"] * len(columns))})
                RETURNING *
                """,
                tuple(values[column] for column in columns),
            )
            return cur.fetchone()

    def edit_item(self, entity: CatalogEntity, item_id: int, item: BaseModel):
        changes = item.model_dump(exclude_unset=True)
        create_model = ENTITY_CONFIG[entity][0]

        with self.conn.cursor() as cur:
            cur.execute(f"SELECT * FROM {entity} WHERE id = %s FOR UPDATE", (item_id,))
            current = cur.fetchone()
            if current is None:
                return {
                    "error": (
                        f"{ENTITY_LABELS[entity].capitalize()} with ID {item_id} does not exist."
                    ),
                    "status_code": 404,
                }

            updated = {key: value for key, value in current.items() if key != "id"}
            updated.update(changes)
            try:
                create_model.model_validate(updated)
            except ValidationError as exc:
                return {"error": exc.errors()[0]["msg"], "status_code": 422}

            reference_error = self._check_references(cur, entity, updated)
            if reference_error is not None:
                return reference_error

            duplicate = self._find_duplicate(cur, entity, updated, excluding_id=item_id)
            if duplicate:
                return self._duplicate_error(entity, duplicate)

            columns = tuple(changes)
            cur.execute(
                f"UPDATE {entity} SET "
                + ", ".join(f"{column} = %s" for column in columns)
                + " WHERE id = %s RETURNING *",
                (*[updated[column] for column in columns], item_id),
            )
            return cur.fetchone()

    def delete_item(self, entity: CatalogEntity, item_id: int):
        with self.conn.cursor() as cur:
            cur.execute(f"SELECT 1 FROM {entity} WHERE id = %s", (item_id,))
            if cur.fetchone() is None:
                return {
                    "error": (
                        f"{ENTITY_LABELS[entity].capitalize()} with ID {item_id} does not exist."
                    ),
                    "status_code": 404,
                }

            for table, column in DELETE_REFERENCES[entity]:
                cur.execute(
                    f"SELECT 1 FROM {table} WHERE {column} = %s LIMIT 1",
                    (item_id,),
                )
                if cur.fetchone() is not None:
                    return {
                        "error": (
                            f"Cannot delete this {ENTITY_LABELS[entity]} because it is in use."
                        ),
                        "status_code": 409,
                    }

            cur.execute(
                f"DELETE FROM {entity} WHERE id = %s RETURNING id",
                (item_id,),
            )
            return {"deleted": True, "id": cur.fetchone()["id"]}

    @staticmethod
    def _find_duplicate(cur, entity: CatalogEntity, values: dict, excluding_id=None):
        unique_keys = ENTITY_CONFIG[entity][1]
        for columns in unique_keys:
            # names are compared ignoring capital letters: "Fever" and "fever" are the same category
            condition = " AND ".join(
                f"lower({column}) = lower(%s)" if column == "name" else f"{column} IS NOT DISTINCT FROM %s"
                for column in columns
            )
            params = [values[column] for column in columns]
            exclude_clause = ""
            if excluding_id is not None:
                exclude_clause = " AND id <> %s"
                params.append(excluding_id)
            cur.execute(
                f"SELECT 1 FROM {entity} WHERE {condition}{exclude_clause} LIMIT 1",
                tuple(params),
            )
            if cur.fetchone() is not None:
                return columns   # which unique value clashed, e.g. ("phone",)
        return None

    @staticmethod
    def _duplicate_error(entity: CatalogEntity, columns):
        return {
            "error": f"A {ENTITY_LABELS[entity]} with this {' and '.join(columns)} already exists.",
            "status_code": 409,
        }

    @staticmethod
    def _check_references(cur, entity: CatalogEntity, values: dict):
        for table, column, display_name in REFERENCE_CHECKS.get(entity, ()):
            cur.execute(f"SELECT 1 FROM {table} WHERE id = %s", (values[column],))
            if cur.fetchone() is None:
                return {
                    "error": f"{display_name} with ID {values[column]} does not exist.",
                    "status_code": 404,
                }
        return None

