from fastapi import FastAPI
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

app = FastAPI()

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
