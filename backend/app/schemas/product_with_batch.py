from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.batch import EditBatch, NewBatch
from app.schemas.product import AddProduct, UpdateProduct


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
