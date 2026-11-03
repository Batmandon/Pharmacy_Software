# Development setup

## Project layout

```text
frontend/
  pages/                 HTML pages
  assets/
    css/
    images/
    js/
  components/            Shared navbar and footer
backend/
  app/
    api/routers/          FastAPI endpoints
    core/                 Configuration and authentication
    db/                   Database connection and schema setup
    repositories/         Database access
    schemas/              Request/response validation
    services/             Token and other services
    utils/
  .env                    Local backend settings (ignored by Git)
  .env.example            Environment variable template
api-docs/postman/         Local Postman collection (ignored by Git)
requirements.txt
```

## Local development

1. Create and activate a Python virtual environment, then install dependencies:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. Copy `backend/.env.example` to `backend/.env` and set your development database credentials and a private `SECRET_KEY`. Do not commit `.env`.

3. From the repository root, initialize the development database schema:

   ```powershell
   Set-Location backend
   python -m app.db.database
   ```

4. Start the API from `backend/`:

   ```powershell
   python -m uvicorn app.main:app --reload
   ```

5. In another terminal, serve the frontend from the repository root:

   ```powershell
   python -m http.server 5500 --directory frontend
   ```

   Open `http://localhost:5500`; it redirects to the storefront page. The default CORS origins and `frontend/assets/js/config.js` API URL are set for local development. Update them when using different local ports or hosts.

## Deployment notes

- Set `FRONTEND_ORIGINS` to the exact deployed frontend origin(s).
- Use HTTPS and set `ENVIRONMENT=production` when deploying; authentication cookies then require secure transport.
- Configure database settings and `SECRET_KEY` through deployment environment settings, not source control.
- Initialize or upgrade the target database using the intended deployment procedure; do not run development schema setup against production without a migration plan.
