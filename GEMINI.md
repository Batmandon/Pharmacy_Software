   1 # Gemini Project Context: Pharmacy Inventory & Online Ordering
    2
    3 This project is a pharmacy management system with a FastAPI backend and a static
      HTML/JavaScript frontend. It features a customer storefront and an administrative
      dashboard for managing inventory, orders, and prescriptions.
    4
    5 ## Project Overview
    6
    7 - **Backend:** FastAPI (Python 3.10+), PostgreSQL (using `psycopg` and `psycopg_pool`),
      JWT authentication with HTTP-only cookies.
    8 - **Frontend:** Static HTML/JS/CSS, served via `http.server`. Components are dynamically
      loaded via JavaScript.
    9 - **Database:** PostgreSQL with a schema for products, batches, users, orders, and
      prescriptions.
   10
   11 ## Architecture & Structure
   12
   13 The project appears to be in a transition state between two structures:
   14
   15 ### 1. New Modular Structure (Primary focus for development)
   16 - **`backend/`**: The main API directory.
   17   - `main.py`: Entry point for the FastAPI application.
   18   - `database.py`: Database connection pool and initialization script.
   19   - `core/`: Core logic like `auth.py` and `config.py`.
   20   - `features/`: Modular feature folders (e.g., `products/`).
   21   - `shared/`: Shared utilities and pricing logic.
   22 - **`frontend/`**: The new frontend structure.
   23   - `src/shared/`: Reusable HTML components (navbar, footer).
   24   - `index.html`: Main entry point.
   25
   26 ### 2. Legacy/Fuller Feature Structure
   27 - **`backen/`**: Contains more implemented repositories and schemas (e.g.,
      `backen/app/repositories/order.py`).
   28 - **`fronten/`**: Contains the full set of pages and assets used in the current UI.
   29   - `pages/`: Individual HTML pages (e.g., `dashboard.html`, `Uploadpresceription.html`).
   30   - `assets/js/`: Client-side logic, including `config.js` for API interaction and
      `components.js` for loading HTML fragments.
   31
   32 **Note:** Developers should refer to `backen/` for reference implementation while
      building out the modular `backend/features/`.
   33
   34 ## Building and Running
   35
   36 ### Backend
   37 1. **Environment:** Create a `.env` file in the root based on `readme.md`.
   38 2. **Dependencies:** `pip install -r backen/requirements.txt`.
   39 3. **Database Setup:**
     cd backend
     python database.py
   1 4. **Run API:**
     python -m uvicorn main:app --reload

   1
   2 ### Frontend
   3 1. **Serve Files:**
     python -m http.server 5500 --directory fronten

    1    (Use `fronten` for the full set of pages currently available).
    2
    3 ## Development Conventions
    4
    5 - **Authentication:** Uses JWT stored in HTTP-only cookies (`access_token` and
      `refresh_token`).
    6 - **Database:** Uses a raw SQL approach with `psycopg`. Migrations are currently manual
      via `database.py`.
    7 - **Feature Organization:** New features should be added to `backend/features/` following
      the modular pattern (routes, schemas, repository_reads/writes).
    8 - **Frontend Components:** Reusable UI elements are stored as HTML files and loaded
      dynamically into placeholders using `fronten/assets/js/components.js`.
    9 - **Naming:** Follow standard Python (PEP 8) and JavaScript naming conventions.
   10 - **Surgical Edits:** When modifying code, ensure that changes are consistent with the
      existing modular or legacy patterns as appropriate.
   11
   12 ### Clean JavaScript Style Guidelines
      To keep frontend code clean, uniform, and easy to read (avoiding messy/cryptic syntax):
      1. **Named Function Declarations:**
         - Use standard `function name(params) { ... }` or `async function name(params) { ... }`.
         - Avoid assigning arrow functions to variables (`const name = () => { ... }`). Keep arrow functions strictly for short inline callbacks (e.g. inside `.map()`, `.filter()`).
      2. **Explicit Asynchronous Flow (Linear & Readable):**
         - Always use `async / await` with `try ... catch` blocks.
         - Do NOT chain `.then().catch().finally()`. Write asynchronous logic top-to-bottom so it reads like clean Python.
      3. **Avoid Cryptic Operators:**
         - Avoid `??=`, complex nested ternary operators (`a ? b ? c : d : e`), or complicated destructuring chains.
         - Prefer explicit, readable `if (...) { ... } else { ... }` blocks.
      4. **Descriptive Naming:**
         - Use full, meaningful variable names (`event`, `address`, `order`, `product`) instead of single-letter names (`e`, `a`, `o`, `p`).
      5. **Single Source of Truth for Shared Utilities:**
         - All shared utility functions must reside in `frontend/shared/utils.js`.
   13
   14 ## Key Files
   13 - `backend/main.py`: FastAPI app initialization and middleware.
   14 - `backend/database.py`: PostgreSQL schema and pool management.
   15 - `backend/core/auth.py`: Token-based authentication logic.
   16 - `frontend/shared/config.js`: Global frontend configuration and API fetch interceptor.
   17 - `frontend/shared/components.js`: Reusable component loader (navbar, footer).
   18 - `frontend/shared/utils.js`: Centralized shared utility functions.
   19 - `readme.md`: Original project documentation and setup guide.