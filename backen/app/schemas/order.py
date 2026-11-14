from pydantic import BaseModel, ConfigDict, Field, model_validator
from enum import Enum

class PaymentMethod(str, Enum):
    cod = "cod"
    pickup = "pickup"

class AddCartItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=20)

class UpdateCartItem(BaseModel):
    quantity: int = Field(ge=1, le=20)

class PlaceOrder(BaseModel):
    address_id: int | None = Field(default=None, gt=0)
    payment_method: PaymentMethod

    @model_validator(mode="after")
    def require_delivery_address(self):
        if self.payment_method == PaymentMethod.cod and self.address_id is None:
            raise ValueError("address_id is required for cash/card on delivery.")
        return self


class OrderStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    processing = "processing"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"


class UpdateOrderStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: OrderStatus
