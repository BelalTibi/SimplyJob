# SimplyJob Backend — Development Notes

## Setup

cd backend

python -m venv .venv

.venv\Scripts\activate (Windows) or source .venv/bin/activate (Mac/Linux)

pip install -r requirements.txt

python init_db.py

python app.py

## Running

Backend runs on http://localhost:5000

Frontend runs on http://localhost:3000 (npm start in /frontend)

## Database

Local PostgreSQL: database = simplyjob, user = postgres

Run init_db.py after any schema changes

All migrations use ALTER TABLE ... ADD COLUMN IF NOT EXISTS pattern

## API Endpoints

GET    /api/jobs/         — fetch all jobs for authenticated user

POST   /api/jobs/         — create job

PATCH  /api/jobs/<id>     — update job (status, notes, title, company, url, priority)

DELETE /api/jobs/<id>     — delete job

POST   /api/auth/register — register new user (returns token)

POST   /api/auth/login    — login (returns token)

POST   /api/ai/feedback   — AI feedback (hidden, quota issues)

POST   /api/ai/extract-cv — PDF text extraction (hidden)

GET    /health            — health check

## Adding New Features

1. Add route to appropriate file in routes/

2. Register blueprint in app.py if new file

3. Add migration in init_db.py using ADD COLUMN IF NOT EXISTS

4. Run init_db.py to apply migration
