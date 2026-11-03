from pydantic import ValidationError

from app.schemas.batch import CreateBatch, EditBatch


STOCK_ALERT_THRESHOLDS = {
    "Tablet": 5,
    "Capsule": 5,
    "Syrup": 10,
    "Suspension": 10,
    "Injection": 5,
    "Ointment": 5,
    "Cream": 5,
    "Gel": 5,
    "Drops": 3,
    "Powder": 3,
    "Inhaler": 3,
    "Lotion": 3,
    "Other": 3,
}


class BatchRepository:
    def __init__(self, conn):
        self.conn = conn

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

    def list_stock_alerts(self):
        threshold_rows = ", ".join(["(%s, %s)"] * len(STOCK_ALERT_THRESHOLDS))
        threshold_params = tuple(
            value
            for form, threshold in STOCK_ALERT_THRESHOLDS.items()
            for value in (form, threshold)
        )

        with self.conn.cursor() as cur:
            cur.execute(
                f"""
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
                """,
                threshold_params,
            )
            return cur.fetchall()

    def list_expiry(self, *, expired: bool, within_days: int = 90,
                    page: int = 1, page_size: int = 20):
        page_size = min(page_size, 100)
        offset = (page - 1) * page_size

        if expired:
            cond = "b.expiry_date < CURRENT_DATE"
            params = ()
            order = "b.expiry_date DESC, b.id"
        else:
            cond = ("b.expiry_date >= CURRENT_DATE "
                    "AND b.expiry_date <= CURRENT_DATE + %s::int")
            params = (within_days,)
            order = "b.expiry_date ASC, b.id"

        base = f"""
            FROM batches b
            JOIN products p ON p.id = b.product_id
            WHERE {cond} AND b.quantity > 0 AND p.is_active = TRUE
        """

        with self.conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT p.id AS product_id, p.name, b.id AS batch_id, b.batch_no,
                       b.expiry_date, b.quantity,
                       (b.expiry_date - CURRENT_DATE) AS days_left
                {base}
                ORDER BY {order}
                LIMIT %s OFFSET %s
                """,
                (*params, page_size, offset),
            )
            items = cur.fetchall()
            for item in items:
                item["status"] = expiry_status(item["days_left"])

            cur.execute(f"SELECT COUNT(*) AS total {base}", params)
            total = cur.fetchone()["total"]

        return {"items": items, "page": page, "page_size": page_size, "total": total}


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
