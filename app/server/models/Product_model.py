from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

FormType = Literal[
    "Tablet", "Capsule", "Syrup", "Suspension", "Injection",
    "Ointment", "Cream", "Gel", "Drops", "Powder",
    "Inhaler", "Lotion", "Other",
]
ScheduleType = Literal["OTC", "H", "H1", "X"]


def _check_unique_salts(salts):
    ids = [s.salt_id for s in salts]
    if len(ids) != len(set(ids)):
        raise ValueError("Same salt added more than once")


class ProductSaltInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    salt_id: int = Field(gt=0)
    strength: str = Field(max_length=20)


class AddProduct(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=20)
    salts: list[ProductSaltInput] = Field(min_length=1)
    category_id: int = Field(gt=0)
    form: FormType
    pack_size: str = Field(max_length=20)
    manufacturer_id: int = Field(gt=0)
    schedule: ScheduleType
    gst_percent: float = Field(ge=0, le=99.99)
    hsn_code: str = Field(max_length=20)
    storage_condition: str = Field(max_length=100)
    description: str = Field(max_length=500)
    image_url: str = Field(max_length=200)

    @model_validator(mode="after")
    def validate_salts(self):
        _check_unique_salts(self.salts)
        return self


class UpdateProduct(BaseModel):
    """Partial update: only the fields that are sent get changed."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Optional[str] = Field(default=None, min_length=1, max_length=20)
    salts: Optional[list[ProductSaltInput]] = Field(default=None, min_length=1)
    category_id: Optional[int] = Field(default=None, gt=0)
    form: Optional[FormType] = None
    pack_size: Optional[str] = Field(default=None, max_length=20)
    manufacturer_id: Optional[int] = Field(default=None, gt=0)
    schedule: Optional[ScheduleType] = None
    gst_percent: Optional[float] = Field(default=None, ge=0, le=99.99)
    hsn_code: Optional[str] = Field(default=None, max_length=20)
    storage_condition: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    image_url: Optional[str] = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def validate_update(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one product field to update")
        for field in ("name", "salts", "category_id", "form", "manufacturer_id", "schedule", "gst_percent"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if self.salts is not None:
            _check_unique_salts(self.salts)
        return self
