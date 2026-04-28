# SimplyJob

A full-stack job application tracker built with React, Flask, and PostgreSQL.

## Features

- Track job applications with status, priority, notes, and application links

- Filter and search applications in real time

- Sort by job title, priority, status, or date applied

- Inline editing of job details

- JWT authentication: each user sees only their own data

- Dark mode with localStorage persistence

- Overdue application highlighting (21+ days with no status change)

- AI-powered CV fit scoring (coming soon)

## Tech Stack

**Frontend:** React, plain CSS, localStorage for auth token and preferences

**Backend:** Flask, PostgreSQL, psycopg2, JWT, Flask-Limiter

**Deployment:** Render (backend + frontend + database)

## Running Locally

See backend/DEVELOPMENT.md for full setup instructions.

Quick start:

cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt && python init_db.py && python app.py

cd frontend && npm install && npm start

## Environment Variables

Copy backend/.env.example to backend/.env and fill in your values.
