from products import strength_label


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

# class ProductQueryBuilder:
#     def __init__(self, conn, page: int = 1, page_size: int = 20):
#         self.conn = conn
#         self.page = max(1, page)
#         self.page_size = max(1, min(100, page_size))
#         self.offset = (self.page - 1) * self.page_size
        
#         self._mode = "admin" # Default mode
#         self._is_customer_query = False

#         # ---------------------------------------------------------
#         # 1. COMMON COLUMNS (Jo Customer aur Admin dono ko chahiye)
#         # ---------------------------------------------------------
#         self._select_cols = f"""
#             p.id,
#             p.name,
#             {strength_label("p")} AS strength,
#             p.form,
#             p.pack_size,
#             p.schedule,
#             p.image_url,
#             c.name AS category,
#             br.name AS brand,
#             m.name AS manufacturer
#         """

#         # ---------------------------------------------------------
#         # 2. COMMON JOINS (Categories, Brands, Manufacturers)
#         # ---------------------------------------------------------
#         self._joins = """
#             FROM products p
#             LEFT JOIN categories c ON c.id = p.category_id
#             LEFT JOIN brands br ON br.id = p.brand_id
#             LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
#         """

#         self._where_conditions = ["TRUE"]
#         self._params = []

#     def for_admin(self):
#         """Admin ke saare extra columns aur batch JSON logic"""
#         self._mode = "admin"
        
#         self._select_cols += """,
#             p.is_active,
#             COALESCE(bs.total_stock, 0) AS total_stock,
#             bs.nearest_expiry,
#             bs.batches
#         """
        
#         # Admin ko saare batches list mein chahiye
#         self._joins += """
#             LEFT JOIN LATERAL (
#                 SELECT SUM(b.quantity)::int AS total_stock,
#                        MIN(b.expiry_date) AS nearest_expiry,
#                        COALESCE(
#                            json_agg(
#                                json_build_object(
#                                    'id', b.id,
#                                    'batch_no', b.batch_no,
#                                    'mfg_date', b.mfg_date,
#                                    'expiry_date', b.expiry_date,
#                                    'quantity', b.quantity,
#                                    'purchase_price', b.purchase_price,
#                                    'mrp', b.mrp,
#                                    'discount_percent', b.discount_percent,
#                                    'supplier_id', b.supplier_id,
#                                    'rack_location', b.rack_location
#                                ) ORDER BY b.expiry_date, b.id
#                            ), '[]'::json
#                        ) AS batches
#                 FROM batches b
#                 WHERE b.product_id = p.id
#             ) bs ON TRUE
#         """
#         return self

#     def for_customer(self):
#         """Customer ke saare extra columns, salts aur single batch logic"""
#         self._mode = "customer"
#         self._is_customer_query = True
        
#         self._select_cols += f""",
#             p.requires_prescription,
#             p.gst_percent,
#             p.storage_condition,
#             p.description,
#             COALESCE(
#                 s.name,
#                 (
#                     SELECT string_agg(salt.name, ', ' ORDER BY salt.name)
#                     FROM product_salts ps
#                     JOIN salts salt ON salt.id = ps.salt_id
#                     WHERE ps.product_id = p.id
#                 )
#             ) AS salt,
#             b.mrp,
#             b.discount_percent,
#             b.discount_percent AS discount_percentage,
#             b.quantity
#         """
        
#         # Customer ko sirf Salts aur 1 sellable batch chahiye
#         self._joins += f"""
#             LEFT JOIN salts s ON s.id = p.salt_id
#             JOIN LATERAL (
#                 SELECT mrp, discount_percent, quantity
#                 FROM batches
#                 WHERE product_id = p.id AND {{SELLABLE_BATCH_CONDITION}}
#                 ORDER BY expiry_date, id
#                 LIMIT 1
#             ) b ON TRUE
#         """
        
#         # Customer hamesha sirf active products dekhega
#         self._where_conditions.append("p.is_active = TRUE")
#         return self

#     def search(self, search_term: str | None):
#         """Smart Search based on mode (Customer ya Admin)"""
#         if search_term:
#             search_term = search_term.replace("!", "!!").replace("%", "!%").replace("_", "!_")
#             pattern = f"%{search_term}%"
            
#             if self._mode == "customer":
#                 # Customer Search: Product, Brand, Category 
#                 # (Manufacturer include nahi karte)
#                 self._where_conditions.append("""(
#                     p.name ILIKE %s ESCAPE '!'
#                     OR br.name ILIKE %s ESCAPE '!'
#                     OR c.name ILIKE %s ESCAPE '!'
#                 )""")
#                 self._params.extend([pattern, pattern, pattern])
#             else:
#                 # Admin Search: Product, Category, Brand, Manufacturer sab kuch
#                 self._where_conditions.append("""(
#                     p.name ILIKE %s ESCAPE '!'
#                     OR c.name ILIKE %s ESCAPE '!'
#                     OR br.name ILIKE %s ESCAPE '!'
#                     OR m.name ILIKE %s ESCAPE '!'
#                 )""")
#                 self._params.extend([pattern, pattern, pattern, pattern])
                
#         return self

#     def execute(self):
#         """Final execution - Query banana, chalana aur format karna"""
#         where_clause = " AND ".join(self._where_conditions)
        
#         # 1. Main Items Query
#         final_query = f"""
#             SELECT {self._select_cols}
#             {self._joins}
#             WHERE {where_clause}
#             ORDER BY p.name, p.id
#             LIMIT %s OFFSET %s
#         """
        
#         # 2. Total Count Query (Joins ka use karke precise count)
#         count_query = f"""
#             SELECT COUNT(*) AS total
#             {self._joins}
#             WHERE {where_clause}
#         """

#         with self.conn.cursor() as cur:
#             # Fetch Items
#             cur.execute(final_query, (*self._params, self.page_size, self.offset))
#             items = cur.fetchall()
            
#             # Fetch Count
#             cur.execute(count_query, tuple(self._params))
#             total = cur.fetchone()["total"]

#         # Python Logic: Agar Customer hai toh Selling Price calculate karo
#         if self._is_customer_query:
#             for item in items:
#                 item["selling_price"] = (
#                     selling_price(item["mrp"], item["discount_percent"]) 
#                     if item["mrp"] is not None else None
#                 )

#         return {
#             "items": items,
#             "page": self.page,
#             "page_size": self.page_size,
#             "total": total
#         }