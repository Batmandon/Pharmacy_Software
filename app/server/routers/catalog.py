import psycopg
from fastapi import APIRouter, Depends, HTTPException, Path

from auth import require_admin
from database import get_db
from models.Catalog_model import (
    CreateBrand,
    CreateCategory,
    CreateManufacturer,
    CreateSalt,
    CreateSupplier,
    EditBrand,
    EditCategory,
    EditManufacturer,
    EditSalt,
    EditSupplier,
)
from repositories.catalog import CatalogRepository

router = APIRouter(tags=["catalog"])


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


@router.get("/categories")
def list_categories(conn=Depends(get_db)):
    return CatalogRepository(conn).list_items("categories")


@router.post("/categories", status_code=201)
def create_category(item: CreateCategory, admin=Depends(require_admin), conn=Depends(get_db)):
    return _run(lambda: CatalogRepository(conn).create_item("categories", item))


@router.patch("/categories/{item_id}")
def edit_category(
    item: EditCategory,
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).edit_item("categories", item_id, item))


@router.delete("/categories/{item_id}")
def delete_category(
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).delete_item("categories", item_id))


@router.get("/brands")
def list_brands(conn=Depends(get_db)):
    return CatalogRepository(conn).list_items("brands")


@router.post("/brands", status_code=201)
def create_brand(item: CreateBrand, admin=Depends(require_admin), conn=Depends(get_db)):
    return _run(lambda: CatalogRepository(conn).create_item("brands", item))


@router.patch("/brands/{item_id}")
def edit_brand(
    item: EditBrand,
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).edit_item("brands", item_id, item))


@router.delete("/brands/{item_id}")
def delete_brand(
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).delete_item("brands", item_id))


@router.get("/manufacturers")
def list_manufacturers(conn=Depends(get_db)):
    return CatalogRepository(conn).list_items("manufacturers")


@router.post("/manufacturers", status_code=201)
def create_manufacturer(
    item: CreateManufacturer,
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).create_item("manufacturers", item))


@router.patch("/manufacturers/{item_id}")
def edit_manufacturer(
    item: EditManufacturer,
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).edit_item("manufacturers", item_id, item))


@router.delete("/manufacturers/{item_id}")
def delete_manufacturer(
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).delete_item("manufacturers", item_id))


@router.get("/suppliers")
def list_suppliers(admin=Depends(require_admin), conn=Depends(get_db)):
    return CatalogRepository(conn).list_items("suppliers")


@router.post("/suppliers", status_code=201)
def create_supplier(item: CreateSupplier, admin=Depends(require_admin), conn=Depends(get_db)):
    return _run(lambda: CatalogRepository(conn).create_item("suppliers", item))


@router.patch("/suppliers/{item_id}")
def edit_supplier(
    item: EditSupplier,
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).edit_item("suppliers", item_id, item))


@router.delete("/suppliers/{item_id}")
def delete_supplier(
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).delete_item("suppliers", item_id))


@router.get("/salts")
def list_salts(conn=Depends(get_db)):
    return CatalogRepository(conn).list_items("salts")


@router.post("/salts", status_code=201)
def create_salt(item: CreateSalt, admin=Depends(require_admin), conn=Depends(get_db)):
    return _run(lambda: CatalogRepository(conn).create_item("salts", item))


@router.patch("/salts/{item_id}")
def edit_salt(
    item: EditSalt,
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).edit_item("salts", item_id, item))


@router.delete("/salts/{item_id}")
def delete_salt(
    item_id: int = Path(ge=1),
    admin=Depends(require_admin),
    conn=Depends(get_db),
):
    return _run(lambda: CatalogRepository(conn).delete_item("salts", item_id))
