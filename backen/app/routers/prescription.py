from pathlib import Path
from uuid import uuid4

import psycopg
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Path as PathParameter,
    UploadFile,
    status,
)
from pydantic import ValidationError

from app.core.auth import get_current_user, require_admin
from app.db.database import get_db
from app.repositories.prescription import PrescriptionRepository
from app.schemas.prescription import (
    AdminPrescriptionResponse,
    AdminPrescriptionReview,
    CustomerPrescription,
    MAX_PRESCRIPTION_SIZE,
)
router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])
UPLOAD_DIRECTORY = Path(__file__).resolve().parents[2] / "uploads" / "prescriptions"


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_prescription(
    image: UploadFile = File(...),
    user=Depends(get_current_user),
    conn=Depends(get_db),
):
    repository = PrescriptionRepository(conn)
    user_id = repository.get_user_id(user["sub"])
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user no longer exists.",
        )

    try:
        CustomerPrescription(user_id=user_id, image=image)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=exc.errors(include_input=False, include_context=False),
        ) from exc

    content = await image.read(MAX_PRESCRIPTION_SIZE + 1)
    if len(content) > MAX_PRESCRIPTION_SIZE:
        raise HTTPException(status_code=413, detail="Prescription image must not exceed 5 MB")

    try:
        CustomerPrescription.validate_image_content(content, image.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    extension = Path(image.filename or "").suffix.lower()
    file_name = f"{uuid4().hex}{extension}"
    relative_path = Path("uploads") / "prescriptions" / file_name
    saved_path = UPLOAD_DIRECTORY / file_name
    UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
    saved_path.write_bytes(content)

    try:
        prescription = repository.create_prescription(user_id, relative_path.as_posix())
    except psycopg.Error:
        saved_path.unlink(missing_ok=True)
        raise

    return {
        "message": "Prescription uploaded successfully",
        "prescription": prescription,
    }


@router.patch(
    "/{prescription_id}/review",
    response_model=AdminPrescriptionResponse,
)
def review_prescription(
    review: AdminPrescriptionReview,
    prescription_id: int = PathParameter(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    result = PrescriptionRepository(conn).review_prescription(
        prescription_id,
        admin["sub"],
        review,
    )
    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return result
