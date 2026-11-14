from app.core.auth import get_user
from decimal import Decimal, ROUND_HALF_UP
from app.repositories.pricing import selling_price
from app.repositories.products import strength_label

# Schedules that need a prescription. Orders with these are blocked until the
# prescription flow is built.
RX_SCHEDULES = {"H", "H1", "X"}

# Order status flow: it can only move forward (skipping steps is fine, e.g. pickup
# orders can go pending -> delivered). "delivered" and "cancelled" are final.
ORDER_STATUS_STEPS = ["pending", "confirmed", "processing", "shipped", "delivered"]
ADMIN_CANCELLABLE = {"pending", "confirmed", "processing", "shipped"}
CUSTOMER_CANCELLABLE = {"pending"}


def can_change_status(current: str, new: str) -> bool:
    if new == "cancelled":
        return current in ADMIN_CANCELLABLE
    if current not in ORDER_STATUS_STEPS or new not in ORDER_STATUS_STEPS:
        return False
    return ORDER_STATUS_STEPS.index(new) > ORDER_STATUS_STEPS.index(current)


class OrderError(Exception):
    """Base class for expected order problems. The router maps these to HTTP errors."""


class AddressNotFound(OrderError):
    pass


class EmptyCart(OrderError):
    pass


class OutOfStock(OrderError):
    def __init__(self, product_name: str):
        super().__init__(product_name)
        self.product_name = product_name


class MissingBatchPrice(OrderError):
    def __init__(self, product_name: str):
        super().__init__(product_name)
        self.product_name = product_name


class PrescriptionRequired(OrderError):
    def __init__(self, product_name: str):
        super().__init__(product_name)
        self.product_name = product_name


class OrderRepository:
    def __init__(self, conn):
        self.conn = conn

    def get_user_id(self, email: str):
        with self.conn.cursor() as cur:
            user = get_user(cur, email, ("id",))
            return user["id"] if user is not None else None

    def add_cart_item(self, user_id: int, product_id: int, quantity: int):
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT id, is_active FROM products WHERE id = %s FOR UPDATE",
                (product_id,),
            )
            product = cur.fetchone()
            if product is None:
                return {
                    "error": f"Product with ID {product_id} does not exist.",
                    "status_code": 404,
                }
            if not product["is_active"]:
                return {
                    "error": f"Product with ID {product_id} is not available.",
                    "status_code": 409,
                }

            cur.execute(
                """
                SELECT COALESCE(SUM(quantity), 0) AS available_stock
                FROM batches
                WHERE product_id = %s
                  AND quantity > 0
                  AND expiry_date >= CURRENT_DATE
                """,
                (product_id,),
            )
            available_stock = cur.fetchone()["available_stock"]

            cur.execute(
                """
                SELECT quantity
                FROM cart_items
                WHERE user_id = %s AND product_id = %s
                FOR UPDATE
                """,
                (user_id, product_id),
            )
            existing = cur.fetchone()
            requested_total = quantity + (existing["quantity"] if existing else 0)
            if requested_total > available_stock:
                return {
                    "error": (
                        f"Only {available_stock} units of product ID {product_id} "
                        "are currently available."
                    ),
                    "status_code": 409,
                }

            cur.execute(
                """
                INSERT INTO cart_items (user_id, product_id, quantity)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id, product_id)
                DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
                RETURNING id, user_id, product_id, quantity
                """,
                (user_id, product_id, quantity),
            )
            return cur.fetchone()

    def delete_cart_item(self, user_id: int, product_id: int):
        if type(product_id) is not int or product_id <= 0:
            return {
                "error": "Product ID must be a positive integer.",
                "status_code": 422,
            }

        with self.conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM cart_items
                WHERE user_id = %s AND product_id = %s
                """,
                (user_id, product_id),
            )
            if cur.rowcount == 0:
                return {
                    "error": f"Product with ID {product_id} was not found in the cart.",
                    "status_code": 404,
                }

        return {"deleted": True, "product_id": product_id}

    def get_cart_items(self, user_id: int) -> dict:
        with self.conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT c.product_id, c.quantity, p.name, {strength_label("p")} AS strength, p.pack_size,
                       p.image_url AS img_url, p.is_active,
                       b.id AS batch_id, b.quantity AS batch_quantity,
                       b.mrp, b.discount_percent
                FROM cart_items c
                JOIN products p ON p.id = c.product_id
                LEFT JOIN batches b
                  ON b.product_id = p.id
                 AND b.quantity > 0
                 AND b.expiry_date >= CURRENT_DATE
                WHERE c.user_id = %s
                ORDER BY c.product_id, b.expiry_date, b.id
                """,
                (user_id,),
            )
            rows = cur.fetchall()

        items = []
        total = Decimal("0.00")
        index = 0
        while index < len(rows):
            first_row = rows[index]
            quantity = first_row["quantity"]
            item_total = Decimal("0.00")
            remaining = quantity

            if not first_row["is_active"]:
                raise OutOfStock(first_row["name"])

            while index < len(rows) and rows[index]["product_id"] == first_row["product_id"]:
                row = rows[index]
                index += 1
                if row["batch_id"] is None or remaining == 0:
                    continue
                if row["mrp"] is None:
                    raise MissingBatchPrice(first_row["name"])

                allocated_quantity = min(remaining, row["batch_quantity"])
                unit_price = selling_price(row["mrp"], row["discount_percent"])
                item_total += unit_price * allocated_quantity
                remaining -= allocated_quantity

            if remaining > 0:
                raise OutOfStock(first_row["name"])

            items.append(
                {
                    "product_id": first_row["product_id"],
                    "name": first_row["name"],
                    "strength": first_row["strength"],
                    "pack_size": first_row["pack_size"],
                    "img_url": first_row["img_url"],
                    "quantity": quantity,
                    "price": (item_total / quantity).quantize(
                        Decimal("0.01"),
                        rounding=ROUND_HALF_UP,
                    ),
                    "line_total": item_total,
                }
            )
            total += item_total

        return {"items": items, "total": total}

    def place_order(
        self,
        user_id: int,
        address_id: int | None,
        payment_method: str,
    ) -> dict:
        # Everything below is one transaction: if anything raises, nothing is saved.
        with self.conn.transaction():
            with self.conn.cursor() as cur:
                if payment_method == "pickup":
                    addr = {
                        "line": "Shama Medical Store, Behjam",
                        "city": "Lakhimpur-kheri",
                        "pincode": "",
                        "phone": "",
                    }
                else:
                    if address_id is None:
                        raise AddressNotFound()
                    cur.execute(
                        """
                        SELECT line, city, pincode, phone
                        FROM addresses
                        WHERE id = %s AND user_id = %s
                        """,
                        (address_id, user_id),
                    )
                    addr = cur.fetchone()
                    if addr is None:
                        raise AddressNotFound()

                # 2. Read the cart (ORDER BY product_id keeps lock order consistent)
                cur.execute(
                    """
                    SELECT c.product_id, c.quantity, p.name, p.schedule, p.is_active
                    FROM cart_items c
                    JOIN products p ON p.id = c.product_id
                    WHERE c.user_id = %s
                    ORDER BY c.product_id
                    """,
                    (user_id,),
                )
                cart = cur.fetchall()
                if not cart:
                    raise EmptyCart()

                # 3. Pick batches (earliest expiry first) and lock them
                lines = []  # (product_id, batch_id, quantity, unit_price)
                total = Decimal("0")

                for item in cart:
                    if not item["is_active"]:
                        raise OutOfStock(item["name"])
                    if item["schedule"] in RX_SCHEDULES:
                        raise PrescriptionRequired(item["name"])

                    needed = item["quantity"]
                    cur.execute(
                        """
                        SELECT id, quantity, mrp, discount_percent
                        FROM batches
                        WHERE product_id = %s
                          AND quantity > 0
                          AND expiry_date >= CURRENT_DATE
                        ORDER BY expiry_date, id
                        FOR UPDATE
                        """,
                        (item["product_id"],),
                    )
                    for batch in cur.fetchall():
                        if batch["mrp"] is None:
                            raise MissingBatchPrice(item["name"])
                        sp = selling_price(batch["mrp"], batch["discount_percent"])
                        take = min(needed, batch["quantity"])
                        lines.append(
                            (
                                item["product_id"],
                                batch["id"],
                                take,
                                sp,
                                batch["mrp"],
                                batch["discount_percent"],
                            )
                        )
                        total += sp * take
                        needed -= take
                        if needed == 0:
                            break

                    if needed > 0:
                        raise OutOfStock(item["name"])

                if payment_method == "cod":
                    total += Decimal("30.00")

                # 4. Insert the order (address copied as a snapshot)
                cur.execute(
                    """
                    INSERT INTO orders (user_id, status, address, total, payment_method)
                    VALUES (
                        %s,
                        'pending',
                        jsonb_build_object(
                            'line', %s::text,
                            'city', %s::text,
                            'pincode', %s::text,
                            'phone', %s::text
                        ),
                        %s,
                        %s
                    )
                    RETURNING id
                    """,
                    (
                        user_id,
                        addr["line"],
                        addr["city"],
                        addr["pincode"],
                        addr["phone"],
                        total,
                        payment_method,
                    ),
                )
                order_id = cur.fetchone()["id"]

                # 5. Insert order_items with the price frozen at order time
                cur.executemany(
                    """
                    INSERT INTO order_items (
                        order_id, product_id, batch_id, quantity, unit_price,
                        mrp, discount_percent
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        (order_id, product_id, batch_id, quantity, price, mrp, discount)
                        for (
                            product_id,
                            batch_id,
                            quantity,
                            price,
                            mrp,
                            discount,
                        ) in lines
                    ],
                )

                # 6. Deduct stock from the locked batches
                cur.executemany(
                    "UPDATE batches SET quantity = quantity - %s WHERE id = %s",
                    [
                        (quantity, batch_id)
                        for _, batch_id, quantity, _, _, _ in lines
                    ],
                )

                # 7. Empty the cart
                cur.execute("DELETE FROM cart_items WHERE user_id = %s", (user_id,))

        return {"order_id": order_id, "total": total}

    def list_orders(self, user_id: int, page: int = 1, page_size: int = 20) -> dict:
        offset = (page - 1) * page_size
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, status, total, payment_method, created_at
                FROM orders
                WHERE user_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT %s OFFSET %s
                """,
                (user_id, page_size, offset),
            )
            items = cur.fetchall()

            cur.execute(
                "SELECT COUNT(*) AS total FROM orders WHERE user_id = %s",
                (user_id,),
            )
            total = cur.fetchone()["total"]

        return {"items": items, "page": page, "page_size": page_size, "total": total}

    def get_order(self, order_id: int, user_id: int):
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, status, address, total, payment_method, created_at
                FROM orders
                WHERE id = %s AND user_id = %s
                """,
                (order_id, user_id),
            )
            order = cur.fetchone()
            if order is None:
                return None

            cur.execute(
                """
                SELECT p.name, b.batch_no, oi.quantity, oi.unit_price,
                       oi.mrp, oi.discount_percent
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                JOIN batches b ON b.id = oi.batch_id
                WHERE oi.order_id = %s
                ORDER BY oi.id
                """,
                (order_id,),
            )
            order["items"] = cur.fetchall()

        return order

    def get_order_admin(self, order_id: int):
        """Admin: ANY customer's order with the customer's details and its items."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT o.id, o.status, o.address, o.total, o.payment_method, o.created_at,
                       u.first_name || ' ' || u.last_name AS customer,
                       u.phone AS customer_phone, u.email AS customer_email
                FROM orders o
                JOIN users u ON u.id = o.user_id
                WHERE o.id = %s
                """,
                (order_id,),
            )
            order = cur.fetchone()
            if order is None:
                return None

            cur.execute(
                f"""
                SELECT p.name, {strength_label("p")} AS strength, p.pack_size, b.batch_no, oi.quantity,
                       oi.unit_price, oi.mrp, oi.discount_percent,
                       (oi.unit_price * oi.quantity) AS line_total
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                JOIN batches b ON b.id = oi.batch_id
                WHERE oi.order_id = %s
                ORDER BY oi.id
                """,
                (order_id,),
            )
            order["items"] = cur.fetchall()

        return order

    # ---------- Admin dashboard ----------

    def get_dashboard_stats(self) -> dict:
        """today / pending / revenue in ONE query (FILTER = a WHERE for a single aggregate)."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (
                        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
                                            AT TIME ZONE 'Asia/Kolkata'
                    ) AS today_orders,
                    COUNT(*) FILTER (WHERE status = 'pending') AS pending_orders,
                    COALESCE(SUM(total) FILTER (WHERE status = 'delivered'), 0) AS revenue
                FROM orders
                """
            )
            return cur.fetchone()

    def list_all_orders(self, status: str | None = None, page: int = 1, page_size: int = 20) -> dict:
        """Admin: orders of ALL customers, newest first. Optional status filter."""
        offset = (page - 1) * page_size
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT o.id, o.status, o.total, o.payment_method, o.created_at,
                       u.first_name || ' ' || u.last_name AS customer
                FROM orders o
                JOIN users u ON u.id = o.user_id
                WHERE (%s::text IS NULL OR o.status = %s::text)
                ORDER BY o.created_at DESC, o.id DESC
                LIMIT %s OFFSET %s
                """,
                (status, status, page_size, offset),
            )
            items = cur.fetchall()

            cur.execute(
                "SELECT COUNT(*) AS total FROM orders WHERE (%s::text IS NULL OR status = %s::text)",
                (status, status),
            )
            total = cur.fetchone()["total"]

        return {"items": items, "page": page, "page_size": page_size, "total": total}

    # ---------- Status change / cancel ----------

    def restore_stock(self, order_id: int) -> int:
        """Put the quantity of every item of this order back into the batch it was taken from.
        Used by every cancel (admin and customer). Returns how many batches were updated."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                UPDATE batches b
                SET quantity = b.quantity + items.quantity
                FROM (
                    SELECT batch_id, SUM(quantity)::int AS quantity
                    FROM order_items
                    WHERE order_id = %s
                    GROUP BY batch_id
                ) items
                WHERE b.id = items.batch_id
                """,
                (order_id,),
            )
            return cur.rowcount

    def update_order_status(self, order_id: int, new_status: str):
        """Admin: change the status of any order. Cancelling also restores stock."""
        with self.conn.cursor() as cur:
            # Lock the order row so two people cannot change (or cancel) it at the same time.
            cur.execute("SELECT status FROM orders WHERE id = %s FOR UPDATE", (order_id,))
            order = cur.fetchone()
            if order is None:
                return {"error": f"Order with ID {order_id} does not exist.", "status_code": 404}

            current = order["status"]
            if not can_change_status(current, new_status):
                return {
                    "error": f"Cannot change order status from {current} to {new_status}.",
                    "status_code": 409,
                }

            if new_status == "cancelled":
                self.restore_stock(order_id)
            cur.execute("UPDATE orders SET status = %s WHERE id = %s", (new_status, order_id))
            return {"id": order_id, "status": new_status}

    def cancel_order(self, order_id: int, user_id: int):
        """Customer: cancel their OWN order, only while it is still pending."""
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM orders WHERE id = %s AND user_id = %s FOR UPDATE",
                (order_id, user_id),
            )
            order = cur.fetchone()
            if order is None:
                return {"error": f"Order with ID {order_id} does not exist.", "status_code": 404}
            if order["status"] not in CUSTOMER_CANCELLABLE:
                return {
                    "error": f"A {order['status']} order cannot be cancelled. Please contact the store.",
                    "status_code": 409,
                }

            self.restore_stock(order_id)
            cur.execute("UPDATE orders SET status = 'cancelled' WHERE id = %s", (order_id,))
            return {"id": order_id, "status": "cancelled"}
