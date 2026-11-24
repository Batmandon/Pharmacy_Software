import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure backend directory is always in sys.path
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from features.products.routes import products_feature_router
from features.auth.auth_routes import router as auth_router
from features.address.address_router import router as address_router
from features.orders.order_router import router as order_router, admin_router as admin_order_router
from features.orders.prescription_router import router as prescription_router
from config import FRONTEND_ORIGINS
from database import init_db, pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    try:
        pool.wait()
        init_db()
        yield
    finally:
        pool.close()

app = FastAPI(lifespan=lifespan)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    print(f"Validation error on {request.method} {request.url.path}: {errors}", flush=True)
    first_error = errors[0] if errors else {}
    loc = " -> ".join(str(l) for l in first_error.get("loc", []))
    msg = first_error.get("msg", "Validation error")
    return JSONResponse(
        status_code=422,
        content={"detail": f"Field '{loc}': {msg}", "errors": errors},
    )

@app.middleware("http")
async def log_time(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    print(f"{request.method} {request.url.path} took {ms:.0f} ms", flush=True)
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
    allow_credentials=True,
)

@app.get("/health")
async def health_check():
    return {"status": "OK"}


app.include_router(
    products_feature_router,
    prefix="/api",
)

app.include_router(
    auth_router,
    prefix="/api",
)

app.include_router(
    address_router,
    prefix="/api",
)

app.include_router(
    order_router,
    prefix="/api",
)

app.include_router(
    admin_order_router,
    prefix="/api",
)

app.include_router(
    prescription_router,
    prefix="/api",
)
