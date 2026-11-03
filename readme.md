# Pharmacy Inventory & Online Ordering

A pharmacy management website for maintaining medicine inventory and accepting
customer orders. It includes a customer storefront and an administrative
dashboard backed by a FastAPI API and PostgreSQL database.

## Features

- Browse and search the medicine catalog, including product details and prices.
- Register and log in as a customer; authenticated sessions use HTTP-only
  access and refresh cookies.
- Add products to a customer's cart and place orders.
- Manage products, batches, suppliers, categories, brands, and manufacturers.
- Review low-stock, expiring, and expired inventory from the admin dashboard.
- Manage customer orders and their statuses.
- Upload and review prescriptions.

## Project structure

```text
frontend/
  index.html               Redirects to the storefront
  pages/                   Storefront, account, checkout, and admin pages
  assets/
    css/
    images/
    js/
  components/              Shared navbar and footer
backend/
  .env                     
  app/
    main.py
    api/routers/
    core/
    db/
    repositories/
    schemas/
    services/
    uploads/               Runtime prescription uploads (not committed)
    utils/
api-docs/                  API documentation and local Postman resources
requirements.txt
```

## Requirements

- Python 3.10 or later
- PostgreSQL
- A modern browser

## Local development

### 1. Install Python dependencies

From the repository root, create and activate a virtual environment, then
install the packages:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Configure the backend

Create `backend/.env` with settings for your local PostgreSQL database and JWT
signing key:

```dotenv
SECRET_KEY=replace-with-a-private-random-secret
ALGORITHM=HS256
ENVIRONMENT=development
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-local-database-password
DB_NAME=postgres
FRONTEND_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

Use your own local values. Keep `backend/.env` private; it is excluded from
version control.

### 3. Initialize the development database

Run this only against your development database. From the repository root:

```powershell
Set-Location backend
python -m app.db.database
```

### 4. Start the API

From the `backend` directory:

```powershell
python -m uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`. FastAPI's interactive API
documentation is at `http://127.0.0.1:8000/docs`.

### 5. Serve the frontend

In another terminal, from the repository root:

```powershell
python -m http.server 5500 --directory frontend
```

Open `http://localhost:5500`. The local API URL is configured in
`frontend/assets/js/config.js`. If you change the frontend host or port, update
`FRONTEND_ORIGINS` in `backend/.env` to match.

## Production notes

- Configure database credentials, `SECRET_KEY`, and `FRONTEND_ORIGINS` through
  the deployment environment; never commit secrets.
- Serve the frontend and API over HTTPS and set `ENVIRONMENT=production` so
  authentication cookies use secure production settings.
- Use a planned database migration/backup procedure for production. Do not run
  the development database initialization command against production without
  reviewing its effects.
- Configure persistent, access-controlled storage for prescription uploads
  when deploying; local upload files are not tracked by Git.