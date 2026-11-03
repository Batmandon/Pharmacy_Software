from fastapi import APIRouter, Depends, HTTPException, Path, status, Query
from app.core.auth import get_current_user, require_admin
from app.db.database import get_db
from app.repositories.admin_products import AdminProductRepository
from app.repositories.order import (
    AddressNotFound,
    EmptyCart,
    MissingBatchPrice,
    OrderRepository,
    OutOfStock,
    PrescriptionRequired,
)
from app.schemas.order import AddCartItem, OrderStatus, PlaceOrder, UpdateOrderStatus

import logging
import psycopg


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("/items", status_code=status.HTTP_201_CREATED)
def add_cart_item(
    item: AddCartItem,
    user=Depends(get_current_user),
    conn=Depends(get_db),
):
    repository = OrderRepository(conn)
    user_id = repository.get_user_id(user["sub"])
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user no longer exists.",
        )

    result = repository.add_cart_item(user_id, item.product_id, item.quantity)
    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return {"message": "Cart item added successfully", "cart_item": result}


@router.delete("/items/{product_id}")
def delete_cart_item(
    product_id: int = Path(gt=0),
    user=Depends(get_current_user),
    conn=Depends(get_db),
):
    repository = OrderRepository(conn)
    user_id = repository.get_user_id(user["sub"])
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user no longer exists.",
        )

    try:
        result = repository.delete_cart_item(user_id, product_id)
    except psycopg.Error:
        logger.exception("delete_cart_item failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not remove cart item.",
        )

    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return {"message": "Cart item removed successfully"}


@router.get("/items")
def get_cart_items(
    user=Depends(get_current_user),
    conn=Depends(get_db),
):
    try:
        repository = OrderRepository(conn)
        user_id = repository.get_user_id(user["sub"])
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authenticated user no longer exists.",
            )
        result = repository.get_cart_items(user_id)
    except OutOfStock as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Not enough stock for {e.product_name}",
        )
    except MissingBatchPrice as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Batch price is not set for {e.product_name}",
        )
    except psycopg.Error:
        logger.exception("get_cart_items failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not fetch cart items.",
        )

    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return result



@router.post("", status_code=201)
def place_order(
    order: PlaceOrder,
    user=Depends(get_current_user),
    conn=Depends(get_db),
):
    repository = OrderRepository(conn)
    user_id = repository.get_user_id(user["sub"])
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists.")

    try:
        return repository.place_order(
            user_id=user_id,
            address_id=order.address_id,
            payment_method=order.payment_method.value,
        )
    except AddressNotFound:
        raise HTTPException(status_code=404, detail="Address not found")
    except EmptyCart:
        raise HTTPException(status_code=400, detail="Cart is empty")
    except OutOfStock as e:
        raise HTTPException(status_code=409, detail=f"Not enough stock for {e.product_name}")
    except MissingBatchPrice as e:
        raise HTTPException(status_code=409, detail=f"Batch price is not set for {e.product_name}")
    except PrescriptionRequired as e:
        raise HTTPException(status_code=400, detail=f"Prescription required for {e.product_name}")
    except psycopg.Error:
        logger.exception("place_order failed")     # details go to the log, not the user
        raise HTTPException(status_code=500, detail="Could not place order")


@router.get("")
def my_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user=Depends(get_current_user),
    conn=Depends(get_db),
):
    repository = OrderRepository(conn)
    user_id = repository.get_user_id(user["sub"])
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists.")

    try:
        return repository.list_orders(user_id, page, page_size)
    except psycopg.Error:
        logger.exception("list_orders failed")
        raise HTTPException(status_code=500, detail="Could not fetch orders")


@router.get("/{order_id}")
def get_order(
    order_id: int,
    user=Depends(get_current_user),
    conn=Depends(get_db),
):
    repository = OrderRepository(conn)
    user_id = repository.get_user_id(user["sub"])
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists.")

    try:
        order = repository.get_order(order_id, user_id)
    except psycopg.Error:
        logger.exception("get_order failed")
        raise HTTPException(status_code=500, detail="Could not fetch order")

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/{order_id}/cancel")
def cancel_order(
    order_id: int = Path(gt=0),
    user=Depends(get_current_user),
    conn=Depends(get_db),
):
    repository = OrderRepository(conn)
    user_id = repository.get_user_id(user["sub"])
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists.")

    try:
        result = repository.cancel_order(order_id, user_id)
    except psycopg.Error:
        logger.exception("cancel_order failed")
        raise HTTPException(status_code=500, detail="Could not cancel order")

    if "error" in result:
        raise HTTPException(status_code=result["status_code"], detail=result["error"])
    return {"message": "Order cancelled successfully", "order_id": order_id, "status": "cancelled"}


# ---------- Admin dashboard ----------
# Second router in this file (different prefix + admin-only). Include it in main.py too.
admin_router = APIRouter(
    prefix="/admin",
    tags=["admin-orders"],
    dependencies=[Depends(require_admin)],
)


@admin_router.get("/dashboard")
def dashboard(conn=Depends(get_db)):
    try:
        stats = OrderRepository(conn).get_dashboard_stats()
        counts = AdminProductRepository(conn).get_counts()
    except psycopg.Error:
        logger.exception("dashboard failed")
        raise HTTPException(status_code=500, detail="Could not load dashboard")

    return {**stats, **counts}


@admin_router.get("/orders")
def admin_list_orders(
    status_filter: OrderStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    try:
        return OrderRepository(conn).list_all_orders(
            status_filter.value if status_filter else None, page, page_size
        )
    except psycopg.Error:
        logger.exception("admin_list_orders failed")
        raise HTTPException(status_code=500, detail="Could not fetch orders")


@admin_router.patch("/orders/{order_id}/status")
def update_order_status(
    body: UpdateOrderStatus,
    order_id: int = Path(gt=0),
    conn=Depends(get_db),
):
    try:
        result = OrderRepository(conn).update_order_status(order_id, body.status.value)
    except psycopg.Error:
        logger.exception("update_order_status failed")
        raise HTTPException(status_code=500, detail="Could not update order status")

    if "error" in result:
        raise HTTPException(status_code=result["status_code"], detail=result["error"])
    return {"message": "Order status updated", "order_id": order_id, "status": result["status"]}
