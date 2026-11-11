from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NewBatch(BaseModel):
    """Batch fields without product_id (used when the product is created together with its batch)."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    batch_no: str = Field(min_length=1, max_length=100)
    mfg_date: date | None = None
    expiry_date: date
    quantity: int = Field(ge=0)
    purchase_price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    mrp: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    discount_percent: Decimal = Field(default=0, ge=0, le=100, max_digits=5, decimal_places=2)
    supplier_id: int | None = Field(default=None, gt=0)
    rack_location: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_batch_values(self):
        if self.mfg_date is not None and self.expiry_date <= self.mfg_date:
            raise ValueError("expiry_date must be later than mfg_date")
        if (
            self.purchase_price is not None
            and self.mrp is not None
            and self.purchase_price > self.mrp
        ):
            raise ValueError("purchase_price cannot exceed mrp")
        return self


class CreateBatch(NewBatch):
    product_id: int = Field(gt=0)


class EditBatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    product_id: int | None = Field(default=None, gt=0)
    batch_no: str | None = Field(default=None, min_length=1, max_length=100)
    mfg_date: date | None = None
    expiry_date: date | None = None
    quantity: int | None = Field(default=None, ge=0)
    purchase_price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    mrp: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    discount_percent: Decimal | None = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )
    supplier_id: int | None = Field(default=None, gt=0)
    rack_location: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_batch_values(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        if "expiry_date" in self.model_fields_set and self.expiry_date is None:
            raise ValueError("expiry_date cannot be null")
        if "product_id" in self.model_fields_set and self.product_id is None:
            raise ValueError("product_id cannot be null")
        if "batch_no" in self.model_fields_set and self.batch_no is None:
            raise ValueError("batch_no cannot be null")
        if "quantity" in self.model_fields_set and self.quantity is None:
            raise ValueError("quantity cannot be null")
        if "discount_percent" in self.model_fields_set and self.discount_percent is None:
            raise ValueError("discount_percent cannot be null")
        if (
            self.mfg_date is not None
            and self.expiry_date is not None
            and self.expiry_date <= self.mfg_date
        ):
            raise ValueError("expiry_date must be later than mfg_date")
        if (
            self.purchase_price is not None
            and self.mrp is not None
            and self.purchase_price > self.mrp
        ):
            raise ValueError("purchase_price cannot exceed mrp")
        return self
