from app.repositories.pricing import selling_price
from app.repositories.signature import make_signature
from app.schemas.product import AddProduct, UpdateProduct


def strength_label(alias: str = "p") -> str:
    # SQL for "Paracetamol 650mg + Caffeine 30mg", built from the product's salts.
    # Products have no strength column any more; the strength lives on each salt.
    return f"""(
        SELECT string_agg(concat_ws(' ', s.name, NULLIF(ps.strength, '')), ' + ' ORDER BY s.name)
        FROM product_salts ps
        JOIN salts s ON s.id = ps.salt_id
        WHERE ps.product_id = {alias}.id
    )"""


PRODUCT_PUBLIC_COLUMNS = (
    "id",
    "name",
    "form",
    "pack_size",
    "schedule",
    "gst_percent",
    "storage_condition",
    "description",
    "image_url",
)

SELLABLE_BATCH_CONDITION = "quantity > 0 AND expiry_date > CURRENT_DATE"

PRODUCT_CARD_SELECT = f"""
    p.id,
    p.name,
    {strength_label("p")} AS strength,
    p.form,
    p.pack_size,
    p.schedule,
    p.requires_prescription,
    p.gst_percent,
    p.storage_condition,
    p.description,
    p.image_url,
    c.name AS category,
    br.name AS brand,
    m.name AS manufacturer,
    COALESCE(
        s.name,
        (
            SELECT string_agg(salt.name, ', ' ORDER BY salt.name)
            FROM product_salts ps
            JOIN salts salt ON salt.id = ps.salt_id
            WHERE ps.product_id = p.id
        )
    ) AS salt,
    b.mrp,
    b.discount_percent,
    b.discount_percent AS discount_percentage,
    b.quantity
"""

PRODUCT_CARD_JOINS = f"""
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands br ON br.id = p.brand_id
    LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
    LEFT JOIN salts s ON s.id = p.salt_id
    JOIN LATERAL (
        SELECT mrp, discount_percent, quantity
        FROM batches
        WHERE product_id = p.id AND {SELLABLE_BATCH_CONDITION}
        ORDER BY expiry_date, id
        LIMIT 1
    ) b ON TRUE
"""

PRODUCT_IN_STOCK_CONDITION = """
    EXISTS (
        SELECT 1
        FROM batches b
        WHERE b.product_id = products.id
          AND b.quantity > 0
          AND b.expiry_date >= CURRENT_DATE
    )
"""

class ProductRepository:
    def __init__(self, conn):
        self.conn = conn

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

    def get_product(self, product_id: int):
        with self.conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {", ".join(PRODUCT_PUBLIC_COLUMNS)}, {strength_label("products")} AS strength
                FROM products
                WHERE id = %s
                  AND {PRODUCT_IN_STOCK_CONDITION}
                """,
                (product_id,)
            )
            return cur.fetchone()

    def get_product_details(self, product_id: int):
        with self.conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT p.id, p.name, {strength_label("p")} AS strength, p.form, p.pack_size, p.schedule,
                       p.description, p.image_url, p.storage_condition,
                       br.name AS brand, c.name AS category,
                       CASE WHEN EXISTS (
                           SELECT 1
                           FROM batches b
                           WHERE b.product_id = p.id
                             AND b.quantity > 0
                             AND b.expiry_date >= CURRENT_DATE
                       ) THEN 'In Stock' ELSE 'Out of Stock' END AS stock_status,
                       price.mrp, price.discount_percent,
                       pd.description_uses, pd.side_effects_warnings,
                       pd.dosage_information, pd.storage_care,
                       pd.information_source, pd.last_reviewed_at
                FROM products p
                LEFT JOIN brands br ON br.id = p.brand_id
                LEFT JOIN categories c ON c.id = p.category_id
                LEFT JOIN product_details pd ON pd.product_id = p.id
                LEFT JOIN LATERAL (
                    SELECT b.mrp, b.discount_percent
                    FROM batches b
                    WHERE b.product_id = p.id
                      AND b.quantity > 0
                      AND b.expiry_date >= CURRENT_DATE
                    ORDER BY b.expiry_date, b.id
                    LIMIT 1
                ) price ON TRUE
                WHERE p.id = %s AND p.is_active = TRUE
                """,
                (product_id,),
            )
            product = cur.fetchone()

        if product is None:
            return None

        product["price"] = (
            selling_price(product["mrp"], product["discount_percent"])
            if product["mrp"] is not None
            else None
        )
        return product

    def list_products(self, page: int = 1, page_size: int = 20):
        offset = (page - 1) * page_size

        with self.conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {PRODUCT_CARD_SELECT}
                FROM products p
                {PRODUCT_CARD_JOINS}
                WHERE p.is_active = TRUE
                ORDER BY p.name, p.id
                LIMIT %s OFFSET %s
                """,
                (page_size, offset),
            )
            items = cur.fetchall()

            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM products p
                WHERE p.is_active = TRUE
                AND EXISTS (
                    SELECT 1 FROM batches
                    WHERE product_id = p.id AND {SELLABLE_BATCH_CONDITION}
                )
                """
            )
            total = cur.fetchone()["total"]

        for item in items:
            item["selling_price"] = (
                selling_price(item["mrp"], item["discount_percent"])
                if item["mrp"] is not None
                else None
            )

        return {"items": items, "page": page, "page_size": page_size, "total": total}

    def search_products(self, search_term: str, page: int = 1, page_size: int = 20):
        search_term = search_term.replace("!", "!!").replace("%", "!%").replace("_", "!_")
        pattern = f"%{search_term}%"
        offset = (page - 1) * page_size
        with self.conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {PRODUCT_CARD_SELECT}
                FROM products p
                {PRODUCT_CARD_JOINS}
                WHERE p.is_active = TRUE
                  AND (
                      p.name ILIKE %s ESCAPE '!'
                      OR br.name ILIKE %s ESCAPE '!'
                      OR c.name ILIKE %s ESCAPE '!'
                  )
                ORDER BY p.name, p.id
                LIMIT %s
                OFFSET %s
                """,
                (pattern, pattern, pattern, page_size, offset)
            )
            items = cur.fetchall()

            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM products p
                WHERE p.is_active = TRUE
                  AND (
                      p.name ILIKE %s ESCAPE '!'
                      OR EXISTS (
                          SELECT 1 FROM brands br
                          WHERE br.id = p.brand_id
                            AND br.name ILIKE %s ESCAPE '!'
                      )
                      OR EXISTS (
                          SELECT 1 FROM categories c
                          WHERE c.id = p.category_id
                            AND c.name ILIKE %s ESCAPE '!'
                      )
                  )
                  AND EXISTS (
                      SELECT 1 FROM batches b
                      WHERE b.product_id = p.id AND {SELLABLE_BATCH_CONDITION}
                  )
                """,
                (pattern, pattern, pattern)
            )
            total = cur.fetchone()["total"]

        for item in items:
            item["selling_price"] = (
                selling_price(item["mrp"], item["discount_percent"])
                if item["mrp"] is not None
                else None
            )

        return {"items": items, "page": page, "page_size": page_size, "total": total}
