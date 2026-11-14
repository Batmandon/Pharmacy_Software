import logging
from contextlib import contextmanager
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Path, status

from app.core.auth import get_current_user, get_user
from app.db.database import get_db
from app.repositories.address import AddressRepository
from app.schemas.address import CreateAddress, UpdateAddress

router = APIRouter(prefix="/addresses", tags=["addresses"])
logger = logging.getLogger(__name__)

# /addresses/abc or /addresses/0 or /addresses/-3 -> 422 before any query runs
AddressId = Annotated[int, Path(gt=0)]


@contextmanager
def db_errors(message: str):
    """Turn any database error into a clean 500 (the details go to the log only)."""
    try:
        yield
    except psycopg.Error:
        logger.exception(message)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=message,
        )


def get_current_user_id(
    user=Depends(get_current_user),
    conn=Depends(get_db),
) -> int:
    """User validation, done once here for every address route."""
    with db_errors("Could not verify user."):
        with conn.cursor() as cur:
            row = get_user(cur, user["sub"], ("id",))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user no longer exists.",
        )
    return row["id"]


def unwrap(result: dict) -> dict:
    """The repository returns {"error", "status_code"} on a known failure."""
    if "error" in result:
        raise HTTPException(status_code=result["status_code"], detail=result["error"])
    return result


@router.get("")
def list_addresses(
    user_id: int = Depends(get_current_user_id),
    conn=Depends(get_db),
):
    with db_errors("Could not fetch addresses."):
        result = AddressRepository(conn).list_addresses(user_id)
    return unwrap(result)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_address(
    address: CreateAddress,
    user_id: int = Depends(get_current_user_id),
    conn=Depends(get_db),
):
    with db_errors("Could not create address."):
        result = AddressRepository(conn).create_address(user_id, address)
    return {"message": "Address created successfully", "address": unwrap(result)}


@router.put("/{address_id}")
def update_address(
    address_id: AddressId,
    address: UpdateAddress,
    user_id: int = Depends(get_current_user_id),
    conn=Depends(get_db),
):
    with db_errors("Could not update address."):
        result = AddressRepository(conn).update_address(user_id, address_id, address)
    return {"message": "Address updated successfully", "address": unwrap(result)}


@router.delete("/{address_id}")
def delete_address(
    address_id: AddressId,
    user_id: int = Depends(get_current_user_id),
    conn=Depends(get_db),
):
    with db_errors("Could not delete address."):
        result = AddressRepository(conn).delete_address(user_id, address_id)
    return {"message": "Address deleted successfully", **unwrap(result)}
