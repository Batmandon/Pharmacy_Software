import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import products, expiry, auth_routes, catalog, order, address, prescription, admin_products

app = FastAPI()

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
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
