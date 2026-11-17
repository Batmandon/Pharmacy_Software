from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Literal

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_PRESCRIPTION_SIZE = 5 * 1024 * 1024
PRESCRIPTION_IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


class CustomerPrescription(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    image: UploadFile

    @field_validator("image")
    @classmethod
    def validate_image(cls, image: UploadFile) -> UploadFile:
        extension = Path(image.filename or "").suffix.lower()
        expected_content_type = PRESCRIPTION_IMAGE_TYPES.get(extension)
        if expected_content_type is None:
            raise ValueError("Prescription image must be a PNG or JPG file")
        if image.content_type != expected_content_type:
            raise ValueError("Prescription image extension and content type must match")
        if image.size is None:
            raise ValueError("Unable to determine prescription image size")
        if image.size > MAX_PRESCRIPTION_SIZE:
            raise ValueError("Prescription image must not exceed 5 MB")
        return image

    @staticmethod
    def validate_image_content(content: bytes, filename: str) -> str:
        try:
            with Image.open(BytesIO(content)) as image:
                image.verify()
                image_format = image.format
        except (
            UnidentifiedImageError,
            OSError,
            SyntaxError,
            Image.DecompressionBombError,
        ) as exc:
            raise ValueError("Uploaded file is not a valid image") from exc

        expected_format = {
            ".png": "PNG",
            ".jpg": "JPEG",
            ".jpeg": "JPEG",
        }[Path(filename).suffix.lower()]
        if image_format != expected_format:
            raise ValueError("Image content does not match its file extension")
        return expected_format


class AdminPrescriptionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending", "approved", "rejected"]
    reviewed_by: int | None
    reviewed_at: datetime | None
    reject_reason: str | None


class AdminPrescriptionReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: Literal["approved", "rejected"]
    reject_reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_review(self):
        if self.status == "rejected" and not self.reject_reason:
            raise ValueError("reject_reason is required when rejecting a prescription")
        if self.status == "approved" and self.reject_reason is not None:
            raise ValueError("reject_reason must be omitted when approving a prescription")
        return self
