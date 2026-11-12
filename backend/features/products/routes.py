from fastapi import APIRouter, Depends
from backend.features.products.routes_customer import customer_router
from backend.features.products.routes_admin import admin_router
from core.auth import require_admin

# MASTER ROUTER 
products_feature_router = APIRouter()

# 1. Customer routes
products_feature_router.include_router(
    customer_router, 
    tags=["Products - Customer"]
)

# 2. Admin routes 
products_feature_router.include_router(
    admin_router, 
    prefix="/admin", 
    tags=["Products - Admin"],
    dependencies=[Depends(require_admin)] 
)