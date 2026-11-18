from datetime import date
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Literal, Optional, ClassVar

# ============================================================================= #
#                                 Batch schema                                  #
# ============================================================================= #

class NewBatch(BaseModel):
    """Batch fields without product_id (used when the product is created together with its batch)."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    batch_no: str = Field(min_length=1, max_length=100)
    mfg_date: date | None = None
    expiry_date: date
    quantity: int = Field(ge=0)
    purchase_price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    mrp: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=5, decimal_places=2)
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


# ============================================================================= #
#                               Product schema                                  #
# ============================================================================= #

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

    name: str = Field(min_length=1, max_length=100)
    salts: list[ProductSaltInput] = Field(min_length=1)
    category_id: int = Field(gt=0)
    form: FormType
    pack_size: str = Field(max_length=50)
    manufacturer_id: int = Field(gt=0)
    brand_id: Optional[int] = Field(default=None, gt=0)  # Generic medicines have no brand.
    schedule: ScheduleType = "OTC"
    gst_percent: float = Field(default=12.0, ge=0, le=99.99)
    hsn_code: Optional[str] = Field(default=None, max_length=20)
    storage_condition: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    image_url: Optional[str] = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def validate_salts(self):
        _check_unique_salts(self.salts)
        return self


class UpdateProduct(BaseModel):
    """Partial update: only the fields that are sent get changed."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    salts: Optional[list[ProductSaltInput]] = Field(default=None, min_length=1)
    category_id: Optional[int] = Field(default=None, gt=0)
    form: Optional[FormType] = None
    pack_size: Optional[str] = Field(default=None, max_length=50)
    manufacturer_id: Optional[int] = Field(default=None, gt=0)
    brand_id: Optional[int] = Field(default=None, gt=0)  # Sending null removes the brand.
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

# ============================================================================= #
#                          Product and batch schemas                            #
# ============================================================================= #

class ProductWithBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product: AddProduct
    batch: NewBatch


class UpdateProductWithBatch(BaseModel):
    """Edit only the product, only one batch, or both - send just what changed."""
    model_config = ConfigDict(extra="forbid")

    product: UpdateProduct | None = None
    batch_id: int | None = Field(default=None, gt=0)
    batch: EditBatch | None = None

    @model_validator(mode="after")
    def validate_update(self):
        if self.product is None and self.batch is None:
            raise ValueError("Send product, batch, or both")
        if self.batch is not None and self.batch_id is None:
            raise ValueError("batch_id is required when batch is sent")
        if self.batch is None and self.batch_id is not None:
            raise ValueError("batch_id was sent without batch")
        if self.batch is not None and "product_id" in self.batch.model_fields_set:
            raise ValueError("product_id cannot be changed here")
        return self

# ============================================================================= #
#                              Catalog schema                                   #
# ============================================================================= #

class CatalogInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class NamedCreate(CatalogInput):
    name: str = Field(min_length=1, max_length=100)


class NamedEdit(CatalogInput):
    required_on_update: ClassVar[set[str]] = {"name"}

    name: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_edit(self):
        fields_set = self.model_fields_set
        if not fields_set:
            raise ValueError("Provide at least one field to update")
        for field in self.required_on_update & fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class CreateCategory(NamedCreate):
    pass


class EditCategory(NamedEdit):
    pass


class CreateBrand(NamedCreate):
    pass


class EditBrand(NamedEdit):
    pass


class CreateManufacturer(NamedCreate):
    pass


class EditManufacturer(NamedEdit):
    pass


class CreateSalt(NamedCreate):
    pass


class EditSalt(NamedEdit):
    pass


class CreateSupplier(CatalogInput):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=1, max_length=20)
    gstin: str = Field(min_length=1, max_length=15)


class EditSupplier(CatalogInput):
    required_on_update: ClassVar[set[str]] = {"name", "phone", "gstin"}

    name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, min_length=1, max_length=20)
    gstin: str | None = Field(default=None, min_length=1, max_length=15)

    @model_validator(mode="after")
    def validate_edit(self):
        fields_set = self.model_fields_set
        if not fields_set:
            raise ValueError("Provide at least one field to update")
        for field in self.required_on_update & fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self
