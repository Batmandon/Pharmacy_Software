# libraries import
from fastapi import APIRouter, Depends, HTTPException, Path, Query
import psycopg

from database import get_db
from features.auth.auth_repo import require_admin

# db and models imports
from features.products.schemas import (
    CreateBatch, EditBatch, ProductWithBatch, UpdateProductWithBatch, 
    CreateBrand, EditBrand,
    CreateCategory, EditCategory,
    CreateManufacturer, EditManufacturer,
    CreateSalt, EditSalt,
    CreateSupplier, EditSupplier,)

# Repositories import
from features.products.repository_reads import ReadProductOperation
from features.products.repository_writes import CrudProductOperation

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
        created_product = CrudProductOperation(conn).add_product(data.product)
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail=DUPLICATE_PRODUCT)
    except psycopg.errors.ForeignKeyViolation as exc:
        raise _missing_item(exc)

    batch = CreateBatch(product_id=created_product["id"], **data.batch.model_dump())
    created_batch = CrudProductOperation(conn).create_batch(batch)
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
            result = CrudProductOperation(conn).update_product(product_id, data.product)
            if "error" in result:
                raise HTTPException(status_code=404, detail=result["error"])

        if data.batch is not None:
            batches = CrudProductOperation(conn)
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
    service = CrudProductOperation(conn)
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
    result = CrudProductOperation(conn).create_batch(batch)
    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return {"message": "Batch created successfully", "batch_id": result["id"]}

@admin_router.patch("/batches/{batch_id}")
def edit_batch(batch_id: int, batch: EditBatch, conn=Depends(get_db)):
    result = CrudProductOperation(conn).edit_batch(batch_id, batch)
    if "error" in result:
        raise HTTPException(
            status_code=result["status_code"],
            detail=result["error"],
        )
    return {"message": "Batch updated successfully"}

@admin_router.delete("/batches/{batch_id}")
def delete_batch(batch_id: int, conn=Depends(get_db)):
    try:
        result = CrudProductOperation(conn).delete_batch(batch_id)
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
    return ReadProductOperation(conn).list_stock_alerts()


@admin_router.get("")
@admin_router.get("/products")
def list_products(
    search: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    search = search.strip() if search else None
    return ReadProductOperation(conn).list_products(search or None, page, page_size)


# "counts" and "salt-strengths" must stay above "/{product_id}" so they are not read as an id.
@admin_router.get("/counts")
@admin_router.get("/products/counts")
def get_counts(conn=Depends(get_db)):
    return ReadProductOperation(conn).get_counts()


@admin_router.get("/salt-strengths")
@admin_router.get("/products/salt-strengths")
def get_salt_strengths(conn=Depends(get_db)):
    return ReadProductOperation(conn).salt_strengths()


@admin_router.get("/{product_id}")
@admin_router.get("/products/{product_id}")
def get_product(product_id: int = Path(gt=0), conn=Depends(get_db)):
    product = ReadProductOperation(conn).get_product(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product

# ============================================================================= #
#                          Admin: Catalog Operations                            #
# ============================================================================= #


def _result_or_raise(result):
    if "status_code" in result:
        raise HTTPException(status_code=result["status_code"], detail=result["error"])
    return result


def _run(action):
    """Run a repository call. The repository checks for duplicates first; the database's UNIQUE
    rule still catches two requests that arrive at the same moment."""
    try:
        return _result_or_raise(action())
    except psycopg.errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="A record with these unique value(s) already exists.",
        )


@admin_router.get("/categories")
def list_categories(conn=Depends(get_db)):
    return CrudProductOperation(conn).list_items("categories")


@admin_router.post("/categories", status_code=201)
def create_category(item: CreateCategory, conn=Depends(get_db)):
    return _run(lambda: CrudProductOperation(conn).create_item("categories", item))


@admin_router.patch("/categories/{item_id}")
def edit_category(
    item: EditCategory,
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).edit_item("categories", item_id, item))


@admin_router.delete("/categories/{item_id}")
def delete_category(
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).delete_item("categories", item_id))


@admin_router.get("/brands")
def list_brands(conn=Depends(get_db)):
    return CrudProductOperation(conn).list_items("brands")


@admin_router.post("/brands", status_code=201)
def create_brand(item: CreateBrand, conn=Depends(get_db)):
    return _run(lambda: CrudProductOperation(conn).create_item("brands", item))


@admin_router.patch("/brands/{item_id}")
def edit_brand(
    item: EditBrand,
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).edit_item("brands", item_id, item))


@admin_router.delete("/brands/{item_id}")
def delete_brand(
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).delete_item("brands", item_id))


@admin_router.get("/manufacturers")
def list_manufacturers(conn=Depends(get_db)):
    return CrudProductOperation(conn).list_items("manufacturers")


@admin_router.post("/manufacturers", status_code=201)
def create_manufacturer(item: CreateManufacturer, conn=Depends(get_db)):
    return _run(lambda: CrudProductOperation(conn).create_item("manufacturers", item))


@admin_router.patch("/manufacturers/{item_id}")
def edit_manufacturer(
    item: EditManufacturer,
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).edit_item("manufacturers", item_id, item))


@admin_router.delete("/manufacturers/{item_id}")
def delete_manufacturer(
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).delete_item("manufacturers", item_id))


@admin_router.get("/suppliers")
def list_suppliers(conn=Depends(get_db)):
    return CrudProductOperation(conn).list_items("suppliers")


@admin_router.post("/suppliers", status_code=201)
def create_supplier(item: CreateSupplier, conn=Depends(get_db)):
    return _run(lambda: CrudProductOperation(conn).create_item("suppliers", item))


@admin_router.patch("/suppliers/{item_id}")
def edit_supplier(
    item: EditSupplier,
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).edit_item("suppliers", item_id, item))


@admin_router.delete("/suppliers/{item_id}")
def delete_supplier(
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).delete_item("suppliers", item_id))


@admin_router.get("/salts")
def list_salts(conn=Depends(get_db)):
    return CrudProductOperation(conn).list_items("salts")


@admin_router.post("/salts", status_code=201)
def create_salt(item: CreateSalt, conn=Depends(get_db)):
    return _run(lambda: CrudProductOperation(conn).create_item("salts", item))


@admin_router.patch("/salts/{item_id}")
def edit_salt(
    item: EditSalt,
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).edit_item("salts", item_id, item))


@admin_router.delete("/salts/{item_id}")
def delete_salt(
    item_id: int = Path(ge=1),
    conn=Depends(get_db),
):
    return _run(lambda: CrudProductOperation(conn).delete_item("salts", item_id))


@admin_router.get("/expired")
@admin_router.get("/expiry/expired")
def expired(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    return ReadProductOperation(conn).list_expiry(
        expired=True,
        page=page,
        page_size=page_size,
    )

@admin_router.get("/expiring")
@admin_router.get("/expiry/expiring")
def expiring(
    days: int = Query(90, ge=1, le=3650),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    return ReadProductOperation(conn).list_expiry(
        expired=False,
        within_days=days,
        page=page,
        page_size=page_size,
    )