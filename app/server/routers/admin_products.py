from fastapi import APIRouter, Depends, HTTPException, Path, Query

from auth import require_admin
from database import get_db
from repositories.admin_products import AdminProductRepository

# Read endpoints for the admin dashboard.
# (Create / update / delete stay in routers/products.py)
router = APIRouter(
    prefix="/admin/products",
    tags=["admin-products"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
def list_products(
    search: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    search = search.strip() if search else None
    return AdminProductRepository(conn).list_products(search or None, page, page_size)


# "counts" and "salt-strengths" must stay above "/{product_id}" so they are not read as an id.
@router.get("/counts")
def get_counts(conn=Depends(get_db)):
    return AdminProductRepository(conn).get_counts()


@router.get("/salt-strengths")
def get_salt_strengths(conn=Depends(get_db)):
    return AdminProductRepository(conn).salt_strengths()


@router.get("/{product_id}")
def get_product(product_id: int = Path(gt=0), conn=Depends(get_db)):
    product = AdminProductRepository(conn).get_product(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product
