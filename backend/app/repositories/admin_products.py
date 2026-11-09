from app.repositories.products import strength_label


class AdminProductRepository:
    """Read queries for the admin dashboard (shows inactive and out-of-stock products too)."""

    def __init__(self, conn):
        self.conn = conn

    def get_counts(self):
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS total_products,
                       COUNT(*) FILTER (WHERE is_active) AS active_products
                FROM products
                """
            )
            return cur.fetchone()

    def list_products(self, search: str | None = None, page: int = 1, page_size: int = 20):
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        offset = (page - 1) * page_size

        joins = """
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN brands br ON br.id = p.brand_id
            LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
        """
        where = "TRUE"
        params = []
        if search:
            search = search.replace("!", "!!").replace("%", "!%").replace("_", "!_")
            pattern = f"%{search}%"
            where = """(
                p.name ILIKE %s ESCAPE '!'
                OR c.name ILIKE %s ESCAPE '!'
                OR br.name ILIKE %s ESCAPE '!'
                OR m.name ILIKE %s ESCAPE '!'
            )"""
            params = [pattern] * 4

        with self.conn.cursor() as cur:
            # One row per product. All batches of that product are packed into
            # a JSON list (json_agg), and stock/expiry are summed from the same batches.
            cur.execute(
                f"""
                SELECT p.id, p.name, {strength_label("p")} AS strength, p.form, p.pack_size, p.schedule,
                       p.is_active, p.image_url,
                       c.name AS category, m.name AS manufacturer,
                       COALESCE(bs.total_stock, 0) AS total_stock,
                       bs.nearest_expiry,
                       bs.batches
                {joins}
                LEFT JOIN LATERAL (
                    SELECT SUM(b.quantity)::int AS total_stock,
                           MIN(b.expiry_date) AS nearest_expiry,
                           COALESCE(
                               json_agg(
                                   json_build_object(
                                       'id', b.id,
                                       'batch_no', b.batch_no,
                                       'mfg_date', b.mfg_date,
                                       'expiry_date', b.expiry_date,
                                       'quantity', b.quantity,
                                       'purchase_price', b.purchase_price,
                                       'mrp', b.mrp,
                                       'discount_percent', b.discount_percent,
                                       'supplier_id', b.supplier_id,
                                       'rack_location', b.rack_location
                                   )
                                   ORDER BY b.expiry_date, b.id
                               ),
                               '[]'::json
                           ) AS batches
                    FROM batches b
                    WHERE b.product_id = p.id
                ) bs ON TRUE
                WHERE {where}
                ORDER BY p.name, p.id
                LIMIT %s OFFSET %s
                """,
                (*params, page_size, offset),
            )
            items = cur.fetchall()

            cur.execute(f"SELECT COUNT(*) AS total {joins} WHERE {where}", params)
            total = cur.fetchone()["total"]

        return {"items": items, "page": page, "page_size": page_size, "total": total}

    def get_product(self, product_id: int):
        """Product fields + salts, used to fill the edit dialog."""
        with self.conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT p.id, p.name, {strength_label("p")} AS strength, p.form, p.pack_size, p.schedule,
                       p.gst_percent, p.hsn_code, p.storage_condition, p.description,
                       p.image_url, p.is_active, p.category_id, p.manufacturer_id, p.brand_id,
                       c.name AS category, m.name AS manufacturer,
                       COALESCE(
                           (
                               SELECT json_agg(
                                          json_build_object('salt_id', ps.salt_id, 'name', s.name, 'strength', ps.strength)
                                          ORDER BY ps.id
                                      )
                               FROM product_salts ps
                               JOIN salts s ON s.id = ps.salt_id
                               WHERE ps.product_id = p.id
                           ),
                           '[]'::json
                       ) AS salts
                FROM products p
                LEFT JOIN categories c ON c.id = p.category_id
                LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
                WHERE p.id = %s
                """,
                (product_id,),
            )
            return cur.fetchone()

    def salt_strengths(self):
        """Strengths already used with each salt, offered as suggestions in the product dialog."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT salt_id, array_agg(DISTINCT strength ORDER BY strength) AS strengths
                FROM product_salts
                WHERE NULLIF(strength, '') IS NOT NULL
                GROUP BY salt_id
                ORDER BY salt_id
                """
            )
            return {"items": cur.fetchall()}
