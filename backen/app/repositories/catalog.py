from typing import Literal

from pydantic import BaseModel, ValidationError

from app.schemas.catalog import (
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


class CatalogRepository:
    def __init__(self, conn):
        self.conn = conn

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
