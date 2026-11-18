import logging

import psycopg
from fastapi import APIRouter, HTTPException, Depends, Path, Query
from database import get_db
from features.products.repository_reads import ReadProductOperation


customer_router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================================================= #
#                                    Public                                     #
# ============================================================================= #

@customer_router.get("/products")
def list_products(page: int = Query(1, ge=1),
                  page_size: int = Query(20, ge=1, le=100),
                  conn=Depends(get_db)):
    return ReadProductOperation(conn).list_products(page, page_size, is_customer=True)

@customer_router.get("/products/search")
def search_products(
    name: str = Query(..., min_length=1, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    name = name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Search name cannot be blank")
    result = ReadProductOperation(conn).search_products(name, page, page_size, is_customer=True)
    if result["total"] == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No products found matching '{name}'.",
        )
    return result

@customer_router.get("/products/{product_id}")
@customer_router.get("/products/{product_id}/details")
def get_product_details(
    product_id: int = Path(gt=0),
    conn=Depends(get_db),
):
    try:
        product = ReadProductOperation(conn).get_product(product_id, is_customer_query=True)
    except psycopg.Error:
        logger.exception("get_product_details failed")
        raise HTTPException(
            status_code=500,
            detail="Could not fetch product details.",
        )

    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product

