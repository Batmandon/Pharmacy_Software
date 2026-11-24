from shared.pricing import selling_price
# ============================================================================= #
#                         Constants & Helpers                                   #
# ============================================================================= #
def strength_label(alias: str = "p") -> str:
    # Builds labels such as "Paracetamol 650mg + Caffeine 30mg" from product salts.
    return f"""(
        SELECT string_agg(concat_ws(' ', s.name, NULLIF(ps.strength, '')), ' + ' ORDER BY s.name)
        FROM product_salts ps
        JOIN salts s ON s.id = ps.salt_id
        WHERE ps.product_id = {alias}.id
    )"""

def expiry_status(days_left: int) -> str:
    if days_left < 0:
        return "expired"
    if days_left <= 30:
        return "critical"
    if days_left <= 60:
        return "warning"
    if days_left <= 90:
        return "soon"
    return "ok"

SELLABLE_BATCH_CONDITION = "quantity > 0 AND expiry_date > CURRENT_DATE"

STOCK_ALERT_THRESHOLDS = {
    "Tablet": 5, "Capsule": 5, "Syrup": 10, "Suspension": 10, "Injection": 5,
    "Ointment": 5, "Cream": 5, "Gel": 5, "Drops": 3, "Powder": 3,
    "Inhaler": 3, "Lotion": 3, "Other": 3,
}

# ============================================================================= #
#                         Query Builder (Lists & Search)                        #
# ============================================================================= #
class ProductQueryBuilder:
    def __init__(self, conn, page: int = 1, page_size: int = 20):
        self.conn = conn
        self.page = max(1, page)
        self.page_size = max(1, min(100, page_size))
        self.offset = (self.page - 1) * self.page_size
        
        self._mode = "admin" # Default mode
        self._is_customer_query = False

        self._select_cols = f"""
            p.id, p.name, {strength_label("p")} AS strength, p.form, p.pack_size, p.schedule,
            p.image_url, c.name AS category, br.name AS brand
        """

        self._joins = """
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN brands br ON br.id = p.brand_id
        """

        self._where_conditions = ["TRUE"]
        self._params = []

    def for_admin(self):
        self._mode = "admin"
        self._select_cols += """,
            p.category_id,
            p.brand_id,
            p.gst_percent,
            p.hsn_code,
            p.storage_condition,
            p.description,
            p.is_active,
            COALESCE(
                (SELECT json_agg(json_build_object('salt_id', ps.salt_id, 'name', s.name, 'strength', ps.strength) ORDER BY ps.id)
                 FROM product_salts ps JOIN salts s ON s.id = ps.salt_id
                 WHERE ps.product_id = p.id),
                '[]'::json
            ) AS salts,
            COALESCE(bs.total_stock, 0) AS total_stock,
            bs.nearest_expiry,
            bs.batches
        """
        self._joins += """
            LEFT JOIN LATERAL (
                SELECT SUM(b.quantity)::int AS total_stock,
                       MIN(b.expiry_date) AS nearest_expiry,
                       COALESCE(
                           json_agg(
                               json_build_object(
                                   'id', b.id, 'batch_no', b.batch_no, 'mfg_date', b.mfg_date,
                                   'expiry_date', b.expiry_date, 'quantity', b.quantity,
                                   'purchase_price', b.purchase_price, 'mrp', b.mrp,
                                   'discount_percent', b.discount_percent,
                                   'supplier_id', b.supplier_id, 'rack_location', b.rack_location
                               ) ORDER BY b.expiry_date, b.id
                           ), '[]'::json
                       ) AS batches
                FROM batches b
                WHERE b.product_id = p.id
            ) bs ON TRUE
        """
        return self

    def for_customer(self):
        self._mode = "customer"
        self._is_customer_query = True
        self._select_cols += f""",
            p.requires_prescription, p.gst_percent, p.storage_condition, p.description,
            COALESCE(
                s.name,
                (
                    SELECT string_agg(salt.name, ', ' ORDER BY salt.name)
                    FROM product_salts ps
                    JOIN salts salt ON salt.id = ps.salt_id
                    WHERE ps.product_id = p.id
                )
            ) AS salt,
            b.mrp, b.discount_percent, b.discount_percent AS discount_percentage, b.quantity
        """
        self._joins += f"""
            LEFT JOIN salts s ON s.id = p.salt_id
            JOIN LATERAL (
                SELECT mrp, discount_percent, quantity
                FROM batches
                WHERE product_id = p.id AND {SELLABLE_BATCH_CONDITION}
                ORDER BY expiry_date, id
                LIMIT 1
            ) b ON TRUE
        """
        self._where_conditions.append("p.is_active = TRUE")
        return self

    def search(self, search_term: str | None):
        if search_term:
            search_term = search_term.replace("!", "!!").replace("%", "!%").replace("_", "!_")
            pattern = f"%{search_term}%"
            if self._mode == "customer":
                self._where_conditions.append("""(
                    p.name ILIKE %s ESCAPE '!' OR br.name ILIKE %s ESCAPE '!' OR c.name ILIKE %s ESCAPE '!'
                )""")
                self._params.extend([pattern] * 3)
            else:
                self._where_conditions.append("""(
                    p.name ILIKE %s ESCAPE '!' OR c.name ILIKE %s ESCAPE '!' 
                    OR br.name ILIKE %s ESCAPE '!' OR m.name ILIKE %s ESCAPE '!'
                )""")
                self._params.extend([pattern] * 4)
        return self

    def execute(self):
        where_clause = " AND ".join(self._where_conditions)
        final_query = f"""
            SELECT {self._select_cols}
            {self._joins}
            WHERE {where_clause}
            ORDER BY p.name, p.id
            LIMIT %s OFFSET %s
        """
        count_query = f"""
            SELECT COUNT(*) AS total
            {self._joins}
            WHERE {where_clause}
        """

        with self.conn.cursor() as cur:
            cur.execute(final_query, (*self._params, self.page_size, self.offset))
            items = cur.fetchall()
            cur.execute(count_query, tuple(self._params))
            total = cur.fetchone()["total"]

        if self._is_customer_query:
            for item in items:
                item["selling_price"] = (
                    selling_price(item["mrp"], item["discount_percent"]) 
                    if item["mrp"] is not None else None
                )
                item["price"] = item["selling_price"]

        return {"items": items, "page": self.page, "page_size": self.page_size, "total": total}

# ============================================================================= #
#                         Product Read Repository                               #
# ============================================================================= #
class ReadProductOperation:
    """Main read repository operations for products."""
    def __init__(self, conn):
        self.conn = conn

    def get_counts(self):
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) AS total_products,
                       COUNT(*) FILTER (WHERE is_active) AS active_products
                FROM products
            """)
            return cur.fetchone()

    def salt_strengths(self):
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT salt_id, array_agg(DISTINCT strength ORDER BY strength) AS strengths
                FROM product_salts
                WHERE NULLIF(strength, '') IS NOT NULL
                GROUP BY salt_id
                ORDER BY salt_id
            """)
            return {"items": cur.fetchall()}

    def get_product(self, product_id: int, is_customer_query: bool = False):
        with self.conn.cursor() as cur:
            active_check = "AND p.is_active = TRUE" if is_customer_query else ""
            cur.execute(f"""
                SELECT 
                    p.id, p.name, {strength_label("p")} AS strength, p.form, p.pack_size, p.schedule,
                    p.gst_percent, p.hsn_code, p.storage_condition, p.description, p.image_url, 
                    p.side_effects, p.dosage_information,
                    p.description AS description_uses,
                    p.side_effects AS side_effects_warnings,
                    p.storage_condition AS storage_care,
                    NULL::text AS information_source,
                    NULL::date AS last_reviewed_at,
                    p.is_active, p.category_id, p.brand_id,
                    c.name AS category, br.name AS brand,
                    COALESCE(
                        (SELECT json_agg(json_build_object('salt_id', ps.salt_id, 'name', s.name, 'strength', ps.strength) ORDER BY ps.id)
                         FROM product_salts ps JOIN salts s ON s.id = ps.salt_id
                         WHERE ps.product_id = p.id),
                        '[]'::json
                    ) AS salts,
                    batch.mrp, batch.discount_percent, batch.quantity,
                    CASE WHEN batch.mrp IS NOT NULL THEN 'In Stock' ELSE 'Out of Stock' END AS stock_status
                FROM products p
                LEFT JOIN categories c ON c.id = p.category_id
                LEFT JOIN brands br ON br.id = p.brand_id
                LEFT JOIN LATERAL (
                    SELECT b.mrp, b.discount_percent, b.quantity
                    FROM batches b
                    WHERE b.product_id = p.id AND b.quantity > 0 AND b.expiry_date >= CURRENT_DATE
                    ORDER BY b.expiry_date, b.id
                    LIMIT 1
                ) batch ON TRUE
                WHERE p.id = %s {active_check}
            """, (product_id,))
            product = cur.fetchone()

        if product is None:
            return None

        if is_customer_query:
            product["selling_price"] = (
                selling_price(product["mrp"], product["discount_percent"])
                if product["mrp"] is not None else None
            )
            product["price"] = product["selling_price"]

        return product

    def list_products(self, page: int = 1, page_size: int = 20, is_customer: bool = False):
        builder = ProductQueryBuilder(self.conn, page=page, page_size=page_size)
        if is_customer:
            builder.for_customer()
        else:
            builder.for_admin()
        return builder.execute()

    def search_products(self, search_term: str, page: int = 1, page_size: int = 20, is_customer: bool = False):
        builder = ProductQueryBuilder(self.conn, page=page, page_size=page_size)
        if is_customer:
            builder.for_customer()
        else:
            builder.for_admin()
        return builder.search(search_term).execute()

    def list_stock_alerts(self):
        threshold_rows = ", ".join(["(%s, %s)"] * len(STOCK_ALERT_THRESHOLDS))
        threshold_params = tuple(
            value
            for form, threshold in STOCK_ALERT_THRESHOLDS.items()
            for value in (form, threshold)
        )
        with self.conn.cursor() as cur:
            cur.execute(f"""
                WITH stock_thresholds(form, alert_threshold) AS (
                    VALUES {threshold_rows}
                ),
                product_stock AS (
                    SELECT p.id AS product_id, p.name, p.form,
                           COALESCE(SUM(b.quantity), 0)::int AS current_stock,
                           st.alert_threshold
                    FROM products p
                    JOIN stock_thresholds st ON st.form = p.form
                    LEFT JOIN batches b
                        ON b.product_id = p.id
                        AND b.expiry_date >= CURRENT_DATE
                    WHERE p.is_active = TRUE
                    GROUP BY p.id, p.name, p.form, st.alert_threshold
                )
                SELECT product_id, name, form, current_stock, alert_threshold
                FROM product_stock
                WHERE current_stock <= alert_threshold
                ORDER BY current_stock, name, product_id
            """, threshold_params)
            return cur.fetchall()

    def list_expiry(self, *, expired: bool, within_days: int = 90, page: int = 1, page_size: int = 20):
        page_size = min(page_size, 100)
        offset = (page - 1) * page_size
        if expired:
            cond = "b.expiry_date < CURRENT_DATE"
            params = ()
            order = "b.expiry_date DESC, b.id"
        else:
            cond = ("b.expiry_date >= CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + %s::int")
            params = (within_days,)
            order = "b.expiry_date ASC, b.id"
        base = f"""
            FROM batches b
            JOIN products p ON p.id = b.product_id
            WHERE {cond} AND b.quantity > 0 AND p.is_active = TRUE
        """
        with self.conn.cursor() as cur:
            cur.execute(f"""
                SELECT p.id AS product_id, p.name, b.id AS batch_id, b.batch_no,
                       b.expiry_date, b.quantity,
                       (b.expiry_date - CURRENT_DATE) AS days_left
                {base}
                ORDER BY {order}
                LIMIT %s OFFSET %s
            """, (*params, page_size, offset))
            items = cur.fetchall()
            for item in items:
                item["status"] = expiry_status(item["days_left"])
            cur.execute(f"SELECT COUNT(*) AS total {base}", params)
            total = cur.fetchone()["total"]
        return {"items": items, "page": page, "page_size": page_size, "total": total}

    # ============================================================================= #
    #                       Medicine Catalog Auto-Suggestions                       #
    # ============================================================================= #

    def suggest_catalog_medicines(self, query: str, limit: int = 5):
        """Returns matching 5 items from medicine_catalog using text_pattern_ops prefix search."""
        clean_query = query.strip()
        if not clean_query:
            return []
        sanitized = clean_query.replace("!", "!!").replace("%", "!%").replace("_", "!_")
        prefix_pattern = f"{sanitized.lower()}%"
        contains_pattern = f"%{sanitized.lower()}%"
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, brand, form, pack_size, image_url, uses, side_effects, salts
                FROM public.medicine_catalog
                WHERE lower(name) LIKE %s ESCAPE '!'
                   OR (brand IS NOT NULL AND lower(brand) LIKE %s ESCAPE '!')
                   OR (salts::text ILIKE %s ESCAPE '!')
                ORDER BY 
                   CASE WHEN lower(name) LIKE %s ESCAPE '!' THEN 0 ELSE 1 END,
                   name
                LIMIT %s
            """, (prefix_pattern, prefix_pattern, contains_pattern, prefix_pattern, limit))
            return cur.fetchall()

