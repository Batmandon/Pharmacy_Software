from app.core.auth import get_user
from app.schemas.prescription import AdminPrescriptionReview


class PrescriptionRepository:
    def __init__(self, conn):
        self.conn = conn

    def get_user_id(self, email: str):
        with self.conn.cursor() as cur:
            user = get_user(cur, email, ("id",))
            return user["id"] if user is not None else None

    def create_prescription(self, user_id: int, file_path: str):
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO prescriptions (user_id, file_path)
                VALUES (%s, %s)
                RETURNING id, status, created_at
                """,
                (user_id, file_path),
            )
            return cur.fetchone()

    def review_prescription(
        self,
        prescription_id: int,
        reviewer_email: str,
        review: AdminPrescriptionReview,
    ):
        with self.conn.cursor() as cur:
            reviewer = get_user(cur, reviewer_email, ("id",))
            if reviewer is None:
                return {
                    "error": "Authenticated admin no longer exists.",
                    "status_code": 401,
                }

            cur.execute(
                """
                UPDATE prescriptions
                SET status = %s,
                    reviewed_by = %s,
                    reviewed_at = now(),
                    reject_reason = %s
                WHERE id = %s
                RETURNING status, reviewed_by, reviewed_at, reject_reason
                """,
                (
                    review.status,
                    reviewer["id"],
                    review.reject_reason,
                    prescription_id,
                ),
            )
            result = cur.fetchone()
            if result is None:
                return {
                    "error": f"Prescription with ID {prescription_id} does not exist.",
                    "status_code": 404,
                }
            return result
