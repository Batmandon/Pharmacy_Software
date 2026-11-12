from pydantic import ValidationError
from backend.features.products.schemas import AddProduct, UpdateProduct
from backend.features.products.schemas import CreateBatch, EditBatch
from shared.signature import make_signature


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
                INSERT INTO products (category_id, manufacturer_id, brand_id, name, form, pack_size, schedule, gst_percent, hsn_code, storage_condition, description, image_url, signature)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
