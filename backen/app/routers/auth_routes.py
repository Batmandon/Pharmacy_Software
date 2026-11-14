import logging
import psycopg
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from app.core.auth import (
    create_account,
    get_current_user,
    get_profile,
    login_credentials,
    logout,
    refresh_access_token,
    update_profile,
)
from app.db.database import get_db
from app.schemas.auth import RegisterAccount, LoginCredentials, UpdateProfile

router = APIRouter(prefix="/auth_routes", tags=["authentication"])
logger = logging.getLogger(__name__)

@router.post("/register")
def register_user(user: RegisterAccount, conn=Depends(get_db)):
    result = create_account(user, conn)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.post("/login")
def login_user(userlogin: LoginCredentials, response: Response, conn=Depends(get_db)):
    result = login_credentials(userlogin, conn, response)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.post("/refresh_token")
def refresh_user_token(request: Request, response: Response, conn=Depends(get_db)):
    try:
        return refresh_access_token(request, response, conn)
    except psycopg.Error:
        logger.exception("refresh_access_token failed")
        raise HTTPException(status_code=500, detail="Could not refresh session.")

# Profile routes. Validation done here:
#   - get_current_user: no cookie / bad or expired token -> 401
#   - the user is read from the token, never from the request body
#   - UpdateProfile: wrong format or extra fields -> 422
#   - the user must still exist in the database -> 401
#   - database errors -> 500 (details only in the log)
@router.get("/profile")
def read_profile(user=Depends(get_current_user), conn=Depends(get_db)):
    try:
        result = get_profile(user["sub"], conn)
    except psycopg.Error:
        logger.exception("get_profile failed")
        raise HTTPException(status_code=500, detail="Could not fetch profile.")
    if "error" in result:
        raise HTTPException(status_code=result["status_code"], detail=result["error"])
    return result

@router.put("/profile")
def edit_profile(profile: UpdateProfile, user=Depends(get_current_user), conn=Depends(get_db)):
    try:
        result = update_profile(user["sub"], profile, conn)
    except psycopg.Error:
        logger.exception("update_profile failed")
        raise HTTPException(status_code=500, detail="Could not update profile.")
    if "error" in result:
        raise HTTPException(status_code=result["status_code"], detail=result["error"])
    return {"message": "Profile updated successfully", "profile": result}

# Logout: POST only (a plain link or <img> cannot log someone out).
# No login check on purpose: a user with an expired token must still be able to clear the cookies.
@router.post("/logout")
def logout_user(response: Response):
    return logout(response)