import logging

import psycopg
from fastapi import APIRouter, HTTPException, Depends, Path, Query
from app.core.auth import require_admin
from app.db.database import get_db
from app.repositories.batch import BatchRepository
from app.repositories.products import ProductRepository
from app.schemas.batch import CreateBatch, EditBatch
from app.schemas.product_with_batch import ProductWithBatch, UpdateProductWithBatch

# One router for both products and batches.
# No prefix here, so every path is written in full (URLs stay the same as before).
FK_MESSAGES = {
    "products_category_id_fkey": "That category does not exist.",
    "products_manufacturer_id_fkey": "That manufacturer does not exist.",
    "products_brand_id_fkey": "That brand does not exist.",
    "product_salts_salt_id_fkey": "One of the salts does not exist.",
    "batches_supplier_id_fkey": "That supplier does not exist.",
}


def _missing_item(exc):
    return HTTPException(
        status_code=422,
        detail=FK_MESSAGES.get(exc.diag.constraint_name, "A selected item does not exist."),
    )


DUPLICATE_PRODUCT = "A product with the same name, form, pack size and salts (with strengths) already exists."

router = APIRouter(tags=["products"])
logger = logging.getLogger(__name__)


# ---------- Public ----------

@router.get("/products")
def list_products(page: int = Query(1, ge=1),
                  page_size: int = Query(20, ge=1, le=100),
                  conn=Depends(get_db)):
    return ProductRepository(conn).list_products(page, page_size)

@router.get("/products/search")
def search_products(
    name: str = Query(..., min_length=1, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    name = name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Search name cannot be blank")
    result = ProductRepository(conn).search_products(name, page, page_size)
    if result["total"] == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No products found matching '{name}'.",
        )
    return result

@router.get("/products/{product_id}/details")
def get_product_details(
    product_id: int = Path(gt=0),
    conn=Depends(get_db),
):
    try:
        product = ProductRepository(conn).get_product_details(product_id)
    except psycopg.Error:
        logger.exception("get_product_details failed")
        raise HTTPException(
            status_code=500,
            detail="Could not fetch product details.",
        )

    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


# ---------- Admin: product + first batch (ONE transaction) ----------

@router.post("/products", status_code=201)
def add_product(
    data: ProductWithBatch, admin=Depends(require_admin), conn=Depends(get_db),
):
    # Both inserts use the same `conn` (same request = same transaction).
    # If anything below raises, get_db exits with an exception and psycopg rolls back,
    # so a product is never saved without its batch.
    try:
        created_product = ProductRepository(conn).add_product(data.product)
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail=DUPLICATE_PRODUCT)
    except psycopg.errors.ForeignKeyViolation as exc:
        raise _missing_item(exc)

    batch = CreateBatch(product_id=created_product["id"], **data.batch.model_dump())
    created_batch = BatchRepository(conn).create_batch(batch)
    if "error" in created_batch:
        raise HTTPException(
            status_code=created_batch["status_code"],
            detail=created_batch["error"],
        )

    return {
        "message": "Product and batch added successfully",
        "product_id": created_product["id"],
        "batch_id": created_batch["id"],
    }

@router.put("/products/{product_id}")
def update_product(product_id: int, data: UpdateProductWithBatch, admin=Depends(require_admin), conn=Depends(get_db)):
    # Send only what changed: product fields, one batch (batch_id + batch), or both.
    # Everything runs in one transaction; any error rolls back both.
    try:
        if data.product is not None:
            result = ProductRepository(conn).update_product(product_id, data.product)
            if "error" in result:
                raise HTTPException(status_code=404, detail=result["error"])

        if data.batch is not None:
            batches = BatchRepository(conn)
            if not batches.batch_belongs_to_product(data.batch_id, product_id):
                raise HTTPException(
                    status_code=404,
                    detail=f"Batch {data.batch_id} does not exist for product {product_id}.",
                )
            result = batches.edit_batch(data.batch_id, data.batch)
            if "error" in result:
                raise HTTPException(status_code=result["status_code"], detail=result["error"])
    except psycopg.errors.UniqueViolation as exc:
        # two different unique rules can fire here: the product signature, or the batch number
        if exc.diag.constraint_name == "products_signature_key":
            raise HTTPException(status_code=409, detail=DUPLICATE_PRODUCT)
        raise HTTPException(status_code=409, detail="This batch number already exists for the product.")
    except psycopg.errors.ForeignKeyViolation as exc:
        raise _missing_item(exc)

    return {
        "message": "Updated successfully",
        "updated": {"product": data.product is not None, "batch": data.batch is not None},
    }

@router.delete("/products/{product_id}")
def delete_product(product_id: int, admin=Depends(require_admin), conn=Depends(get_db)):
    service = ProductRepository(conn)
    try:
        result = service.delete_product(product_id)
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: this product still has batches, cart items or orders.",
        )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"message": "Product deleted successfully"}


# ---------- Admin: batches of an existing product ----------

@router.post("/batches", status_code=201)
def create_batch(batch: CreateBatch, admin=Depends(require_admin), conn=Depends(get_db)):
    result = BatchRepository(conn).create_batch(batch)
    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return {"message": "Batch created successfully", "batch_id": result["id"]}

@router.patch("/batches/{batch_id}")
def edit_batch(batch_id: int, batch: EditBatch, admin=Depends(require_admin), conn=Depends(get_db)):
    result = BatchRepository(conn).edit_batch(batch_id, batch)
    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return {"message": "Batch updated successfully"}

@router.delete("/batches/{batch_id}")
def delete_batch(batch_id: int, admin=Depends(require_admin), conn=Depends(get_db)):
    try:
        result = BatchRepository(conn).delete_batch(batch_id)
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(
            status_code=409,
            detail="This batch was sold in an order and cannot be deleted. Set its quantity to 0 instead.",
        )
    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return {"message": "Batch deleted successfully"}

@router.get("/batches/stock-alerts")
def list_stock_alerts(admin=Depends(require_admin), conn=Depends(get_db)):
    return BatchRepository(conn).list_stock_alerts()
