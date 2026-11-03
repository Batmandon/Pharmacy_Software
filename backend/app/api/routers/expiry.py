from fastapi import APIRouter, Depends, Query
from app.core.auth import require_admin
from app.db.database import get_db
from app.repositories.batch import BatchRepository

router = APIRouter(prefix="/admin/expiry", tags=["expiry"], dependencies=[Depends(require_admin)])

@router.get("/expired")
def expired(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    return BatchRepository(conn).list_expiry(
        expired=True,
        page=page,
        page_size=page_size,
    )

@router.get("/expiring")
def expiring(
    days: int = Query(90, ge=1, le=3650),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    return BatchRepository(conn).list_expiry(
        expired=False,
        within_days=days,
        page=page,
        page_size=page_size,
    )
