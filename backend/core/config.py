import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DB_HOST = os.getenv("DB_HOST") or "localhost"
DB_PORT = os.getenv("DB_PORT") or "5432"
DB_USER = os.getenv("DB_USER") or "postgres"
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME") or "postgres"
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500",
    ).split(",")
    if origin.strip()
]