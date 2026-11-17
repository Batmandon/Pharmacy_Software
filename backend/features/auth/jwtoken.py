from fastapi import HTTPException, status
from datetime import datetime, timedelta, timezone
from config import SECRET_KEY, ALGORITHM
import jwt

if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY env var is required")

ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)


# ---------- token helpers ----------
def create_access_token(data: dict) -> str:

    try:
        payload = data.copy()
        now = datetime.now(timezone.utc)

        payload.update ({
            "iat": now,
            "exp": now + ACCESS_TTL,
            "token_type": "access"
        })

        return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Token creation failed" + str(e))

def create_refresh_token(data: dict) -> str:
    try:
        payload = data.copy()
        now = datetime.now(timezone.utc)

        payload.update ({
            "iat": now,
            "exp": now + REFRESH_TTL,
            "token_type": "refresh"
        })
        return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Refresh token creation failed") from e

def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    if payload.get("token_type") != expected_type:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return payload
