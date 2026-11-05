import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import (
    address,
    admin_products,
    auth_routes,
    catalog,
    expiry,
    order,
    prescription,
    products,
)
from app.core.config import FRONTEND_ORIGINS
from app.db.database import init_db, pool


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

app.include_router(auth_routes.router)
app.include_router(products.router)
app.include_router(expiry.router)
app.include_router(catalog.router)
app.include_router(order.router)
app.include_router(order.admin_router)
app.include_router(address.router)
app.include_router(prescription.router)
app.include_router(admin_products.router)
