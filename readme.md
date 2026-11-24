# Pharmacy Inventory & Online Ordering

A pharmacy management website for maintaining medicine inventory and accepting
customer orders. It includes a customer storefront and an administrative
dashboard backed by a FastAPI API and PostgreSQL database.

## New Feature

- Added Suggestions for medicine creating and its details.

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
pharmacywebsite/
├── frontend/
│   ├── vercel.json                  # Vercel deployment routing and rewrites config
│   ├── assets/
│   │   └── images/                  # Store branding and placeholder imagery
│   ├── pages/                       # Storefront, customer account, and admin pages
│   │   ├── index.html               # Storefront landing page
│   │   ├── product.html             # Product catalog browsing page
│   │   ├── product_detail.html      # Medicine product details page
│   │   ├── searchproduct.html       # Product search results page
│   │   ├── account.html             # Customer profile & address management
│   │   ├── Checkout.html            # Cart review and order checkout page
│   │   ├── login.html               # Customer and admin login
│   │   ├── register.html            # Customer account registration
│   │   ├── dashboard.html           # Admin management dashboard
│   │   └── Uploadpresceription.html # Prescription upload page
│   ├── features/                    # Feature-specific JavaScript and CSS modules
│   │   ├── account/                 # Profile, saved addresses, and account UI
│   │   ├── auth/                    # Authentication (login, register) and JWT session handling
│   │   ├── dashboard/               # Admin dashboard controllers (products, batches, orders)
│   │   ├── orders/                  # Cart, checkout, and order placement logic
│   │   ├── prescriptions/           # Prescription upload styles and logic
│   │   └── products/                # Product catalog cards, search, and details controller
│   └── shared/                      # Reusable components, utilities, and global CSS
│       ├── components.js            # Dynamic component loader (navbar and footer)
│       ├── config.js                # API base URL and runtime environment configuration
│       ├── utils.js                 # Shared formatting and DOM helpers
│       ├── navbar.html              # Shared navigation bar component
│       ├── footer.html              # Shared footer component
│       └── css/                     # Global styles (variables, reset, components, utilities)
├── backend/
│   ├── .env                         # Environment variables (DB credentials, JWT secret)
│   ├── config.py                    # App configuration and environment loading
│   ├── database.py                  # PostgreSQL connection pool and schema definitions
│   ├── main.py                      # FastAPI application entry point and middleware
│   ├── requirements.txt             # Python dependencies
│   ├── features/                    # Domain-driven backend features
│   │   ├── address/                 # Customer address schemas, repository, and routes
│   │   ├── auth/                    # Authentication routes, password hashing, and tokens
│   │   ├── orders/                  # Orders and prescription routes, repositories, and models
│   │   └── products/                # Product & batch CRUD, search, and catalog endpoints
│   └── shared/                      # Shared business logic and utilities
│       ├── pricing.py               # Pricing and discount calculation rules
│       └── signature.py             # Product signature fingerprinting for unique constraints
└── readme.md                        # Project documentation
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
pip install -r backend/requirements.txt
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
python database.py
```

### 4. Start the API

From the `backend` directory:

```powershell
uvicorn main:app --reload
```

The API is available at `http://127.0.0.1:8000`. FastAPI's interactive API
documentation is at `http://127.0.0.1:8000/docs`.

### 5. Serve the frontend

In another terminal, from the repository root:

```powershell
python -m http.server 5500 --directory frontend
```

Open `http://localhost:5500`. The local API URL is configured in
`frontend/shared/config.js`. If you change the frontend host or port, update
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


## Features in the Future will be added 

- While adding medicines our software will show you suggestions for matching medicines. This will avoid burden for you typing manually whole thing. -> ADDED
- Planning to add a Qr code scanner this is for same reason of avoiding burden from you to add medicines manually.
  
