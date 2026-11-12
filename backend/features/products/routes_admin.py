# libraries import
from fastapi import APIRouter, Depends, HTTPException, Path, Query
import psycopg

from core.db.database import get_db

# db and models imports
from backend.features.products.schemas import CreateBatch, EditBatch, ProductWithBatch, UpdateProductWithBatch

# Repositories import
from models.admin_products import AdminProductRepository
from models.batch import BatchRepository
from models.products import ProductRepository

admin_router = APIRouter()

# ============================================================================= #
#                    Admin: product + first batch (one transaction)             #
# ============================================================================= #

FK_MESSAGES = {
    "products_category_id_fkey": "That category does not exist.",
    "products_manufacturer_id_fkey": "That manufacturer does not exist.",
    "products_brand_id_fkey": "That brand does not exist.",
    "product_salts_salt_id_fkey": "One of the salts does not exist.",
    "batches_supplier_id_fkey": "That supplier does not exist.",
}

DUPLICATE_PRODUCT = "A product with the same name, form, pack size and salts (with strengths) already exists."

def _missing_item(exc):
    return HTTPException(
        status_code=422,
        detail=FK_MESSAGES.get(exc.diag.constraint_name, "A selected item does not exist."),
    )

@admin_router.post("/products", status_code=201)
def add_product(
    data: ProductWithBatch, conn=Depends(get_db),
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

@admin_router.put("/products/{product_id}")
def update_product(product_id: int, data: UpdateProductWithBatch, conn=Depends(get_db)):
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

@admin_router.delete("/products/{product_id}")
def delete_product(product_id: int, conn=Depends(get_db)):
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


# ============================================================================= #
#                   Admin: batches of an existing product                     #
# ============================================================================= #

@admin_router.post("/batches", status_code=201)
def create_batch(batch: CreateBatch, conn=Depends(get_db)):
    result = BatchRepository(conn).create_batch(batch)
    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return {"message": "Batch created successfully", "batch_id": result["id"]}

@admin_router.patch("/batches/{batch_id}")
def edit_batch(batch_id: int, batch: EditBatch, conn=Depends(get_db)):
    result = BatchRepository(conn).edit_batch(batch_id, batch)
    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return {"message": "Batch updated successfully"}

@admin_router.delete("/batches/{batch_id}")
def delete_batch(batch_id: int, conn=Depends(get_db)):
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

@admin_router.get("/batches/stock-alerts")
def list_stock_alerts(conn=Depends(get_db)):
    return BatchRepository(conn).list_stock_alerts()


@admin_router.get("")
def list_products(
    search: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    search = search.strip() if search else None
    return AdminProductRepository(conn).list_products(search or None, page, page_size)


# "counts" and "salt-strengths" must stay above "/{product_id}" so they are not read as an id.
@admin_router.get("/counts")
def get_counts(conn=Depends(get_db)):
    return AdminProductRepository(conn).get_counts()


@admin_router.get("/salt-strengths")
def get_salt_strengths(conn=Depends(get_db)):
    return AdminProductRepository(conn).salt_strengths()


@admin_router.get("/{product_id}")
def get_product(product_id: int = Path(gt=0), conn=Depends(get_db)):
    product = AdminProductRepository(conn).get_product(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product
