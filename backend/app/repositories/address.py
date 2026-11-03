from app.schemas.address import CreateAddress, UpdateAddress

MAX_ADDRESSES = 3


class AddressRepository:
    def __init__(self, conn):
        self.conn = conn

    # ---------- helpers ----------

    def _lock_user(self, cur, user_id: int):
        # One create/update per user at a time (released when the transaction ends).
        # Without this, two requests sent together could both pass the
        # "max 3" and "duplicate" checks below and both insert.
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (user_id,))

    def _is_duplicate(self, cur, user_id: int, address, exclude_id: int = 0) -> bool:
        # Same line + city + pincode for the same user (ignoring upper/lower case).
        # exclude_id: when editing, the address being edited must not count as its own duplicate.
        cur.execute(
            """
            SELECT 1
            FROM addresses
            WHERE user_id = %s
              AND lower(line) = lower(%s)
              AND lower(city) = lower(%s)
              AND pincode = %s
              AND id <> %s
            LIMIT 1
            """,
            (user_id, address.line, address.city, address.pincode, exclude_id),
        )
        return cur.fetchone() is not None

    # ---------- queries ----------

    def create_address(self, user_id: int, address: CreateAddress):
        with self.conn.cursor() as cur:
            self._lock_user(cur, user_id)

            cur.execute(
                "SELECT COUNT(*) AS total FROM addresses WHERE user_id = %s",
                (user_id,),
            )
            if cur.fetchone()["total"] >= MAX_ADDRESSES:
                return {
                    "error": f"You can save up to {MAX_ADDRESSES} addresses. Delete one to add a new one.",
                    "status_code": 409,
                }

            if self._is_duplicate(cur, user_id, address):
                return {"error": "This address is already saved.", "status_code": 409}

            cur.execute(
                """
                INSERT INTO addresses (user_id, line, city, pincode, phone)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, line, city, pincode, phone
                """,
                (user_id, address.line, address.city, address.pincode, address.phone),
            )
            return cur.fetchone()

    def list_addresses(self, user_id: int):
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, line, city, pincode, phone
                FROM addresses
                WHERE user_id = %s
                ORDER BY id
                """,
                (user_id,),
            )
            return {"items": cur.fetchall()}

    def update_address(self, user_id: int, address_id: int, address: UpdateAddress):
        with self.conn.cursor() as cur:
            self._lock_user(cur, user_id)

            if self._is_duplicate(cur, user_id, address, exclude_id=address_id):
                return {"error": "This address is already saved.", "status_code": 409}

            # id AND user_id in WHERE: a user can only change their own row.
            # No row matched (wrong id, or someone else's) -> 404.
            cur.execute(
                """
                UPDATE addresses
                SET line = %s, city = %s, pincode = %s, phone = %s
                WHERE id = %s AND user_id = %s
                RETURNING id, line, city, pincode, phone
                """,
                (
                    address.line,
                    address.city,
                    address.pincode,
                    address.phone,
                    address_id,
                    user_id,
                ),
            )
            row = cur.fetchone()
            if row is None:
                return {"error": "Address not found.", "status_code": 404}
            return row

    def delete_address(self, user_id: int, address_id: int):
        # Deletes exactly one row: the one with this id that belongs to this user.
        with self.conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM addresses
                WHERE id = %s AND user_id = %s
                RETURNING id
                """,
                (address_id, user_id),
            )
            row = cur.fetchone()
            if row is None:
                return {"error": "Address not found.", "status_code": 404}
            return {"id": row["id"]}
