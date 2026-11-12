import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from features.products.router import products_feature_router  
from core.config import FRONTEND_ORIGINS
from core.db.database import init_db, pool


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

@app.get("/health")
async def health_check():
    return {"status": "OK"}


app.include_router(
    products_feature_router,
    prefix="/api",
)

