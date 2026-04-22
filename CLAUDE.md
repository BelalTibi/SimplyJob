# SimplyJob — Project Context for AI Assistants

## Stack
- Frontend: React (Create React App), plain CSS, App.js + App.css, Sentry client
- Backend: Flask, PostgreSQL, psycopg2, JWT auth, Flask-Limiter, Sentry SDK, Anthropic Claude API
- Database: PostgreSQL (local dev: simplyjob db; prod: Render Postgres), tables: users, jobs, user_ai_calls
- Deployment target: Render (backend = Web Service via gunicorn, frontend = Static Site, db = Render Postgres)

## Key Files
- frontend/src/App.js — entire React app (all components, state, API calls, AI CV upload + feedback wiring)
- frontend/src/App.css — all styles, CSS variables for light/dark mode
- frontend/src/index.js — React entrypoint, initialises Sentry (dsn via env)
- backend/app.py — Flask entry point, registers blueprints, configures CORS, initialises Sentry
- backend/routes/jobs.py — CRUD endpoints for jobs
- backend/routes/auth.py — register/login endpoints
- backend/routes/ai.py — Anthropic Claude feedback endpoint and PDF CV extraction
- backend/auth_middleware.py — JWT token_required decorator
- backend/db.py — PostgreSQL connection helper (supports DATABASE_URL or individual DB vars)
- backend/init_db.py — creates all tables on first run
- backend/Procfile — gunicorn process definition for Render

## Environment Variables (backend .env)
- DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD
- DATABASE_URL — full Postgres URL (Render); overrides individual DB vars if set
- SECRET_KEY — JWT signing key
- ANTHROPIC_API_KEY — Anthropic Claude API key for AI feedback
- BACKEND_PORT, FRONTEND_ORIGIN
- SENTRY_DSN — optional, enables backend Sentry reporting when set

## Environment Variables (frontend)
- REACT_APP_API_URL — base backend URL (e.g. https://backend.onrender.com)
- REACT_APP_SENTRY_DSN — optional, enables frontend Sentry reporting when set

## Current State
- Auth: working (register with password requirements, auto-login, JWT in localStorage)
- Jobs CRUD: working
- Dark mode: working, persisted in localStorage
- AI feature: enabled (Anthropic Claude via backend). CV text is stored server-side on the user record (users.cv_text, users.cv_filename); extracted on PDF upload via POST /api/ai/extract-cv and restored on login/load via GET /api/ai/cv-text. Frontend may cache in localStorage; logout clears local cache and CV is re-fetched from the server on next login.
- AI rate limits: 3 job-specific feedback requests per user/day, 1 CV-wide feedback per user/day (shared limit with CV extract)
- Sorting: fixed — supports priority, status, title, applied date
- Column order: fixed — JOB, PRIORITY, STATUS, APPLIED, NOTES, ACTIONS
- Deployment: ready for Render (gunicorn Procfile, DATABASE_URL support, frontend REACT_APP_API_URL)

## Known Issues To Fix
- None currently

## AI Behaviour Notes
- Job feedback: per-job AI analysis, now cached in the frontend to avoid duplicate calls; cache can be refreshed manually, with "generated X minutes ago" metadata.
- CV text persistence: raw extracted CV text is stored on the user record (`users.cv_text`, `users.cv_filename`). POST `/api/ai/extract-cv` saves it after PDF extraction; GET `/api/ai/cv-text` returns it for restore on login/load; PATCH `/api/ai/cv-text` clears or updates it (e.g. when user clicks Remove CV).
- CV feedback: independent CV-wide review via POST `/api/ai/cv-feedback` (and GET for saved review); last review is persisted on the user record (`users.cv_feedback`, `users.cv_feedback_date`) and can be viewed later via GET `/api/ai/cv-feedback`.
- Usage tracking: `/api/ai/usage` returns per-user daily counts (`job_calls_remaining`, `cv_feedback_available`, `is_admin`) so the frontend can show remaining quota and admin "∞" state.
- Admin bypass: emails in `ADMIN_EMAILS` (currently `["belaltibi@gmail.com"]`) skip all AI rate limits and always see `calls_remaining: 999`, plus an "Admin" badge in the UI.

## CSS Variables
Light: --bg-page:#f4f5f7, --bg-card:#fff, --border:#e4e7ec, 
--accent:#5b5ef4, --text-primary:#0d0f12, --text-secondary:#6b7280

Dark (body.dark): --bg-page:#080a0e, --bg-card:#0f1117, 
--border:#1e2130, --text-primary:#e8eaf0

## Deployment Notes (for when we deploy)
- Backend needs gunicorn + Procfile
- Frontend needs REACT_APP_API_URL env variable replacing hardcoded localhost:5000
- CORS needs updating to allow Render frontend URL
- DATABASE_URL from Render replaces individual DB env vars
