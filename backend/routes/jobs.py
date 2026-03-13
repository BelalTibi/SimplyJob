from datetime import date, datetime

from flask import Blueprint, jsonify, request, g

from auth_middleware import token_required
from db import get_db_connection


jobs_bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")

ALLOWED_STATUSES = {"Applied", "Interview", "Offer", "Rejected"}
ALLOWED_PRIORITIES = {"Low", "Medium", "High"}


def _serialize_job(row):
    """
    Convert a database row into a JSON-serializable dict.
    """
    if row is None:
        return None

    job = dict(row)
    applied_date = job.get("applied_date")
    created_at = job.get("created_at")

    if isinstance(applied_date, date):
        job["applied_date"] = applied_date.isoformat()
    if isinstance(created_at, (datetime, date)):
        job["created_at"] = created_at.isoformat()

    return job


@jobs_bp.get("/")
@token_required
def list_jobs():
    """
    Fetch all job applications from the database.
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, title, company, priority, status, applied_date, notes, url, created_at
            FROM jobs
            WHERE user_id = %s
            ORDER BY created_at DESC;
            """,
            (g.current_user_id,),
        )
        rows = cur.fetchall()
        jobs = [_serialize_job(row) for row in rows]
        return jsonify({"jobs": jobs})
    except Exception as exc:  # pragma: no cover - simple error passthrough
        return (
            jsonify({"error": "Failed to fetch jobs.", "details": str(exc)}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


@jobs_bp.post("/")
@token_required
def create_job():
    """
    Insert a new job application and return the created record.
    """
    payload = request.get_json(silent=True) or {}

    title = payload.get("title")
    company = payload.get("company")
    status = payload.get("status")
    priority = payload.get("priority") or "Medium"
    applied_date = payload.get("applied_date")
    notes = payload.get("notes")
    url = payload.get("url")

    if not title or not company:
        return (
            jsonify({"error": "Both 'title' and 'company' are required."}),
            400,
        )

    if status is not None and status not in ALLOWED_STATUSES:
        return (
            jsonify(
                {
                    "error": "Invalid status.",
                    "allowed_statuses": sorted(ALLOWED_STATUSES),
                }
            ),
            400,
        )

    if priority not in ALLOWED_PRIORITIES:
        return (
            jsonify(
                {
                    "error": "Invalid priority.",
                    "allowed_priorities": sorted(ALLOWED_PRIORITIES),
                }
            ),
            400,
        )

    columns = ["title", "company", "user_id", "priority"]
    values = [title, company, g.current_user_id, priority]

    if status is not None:
        columns.append("status")
        values.append(status)
    if applied_date is not None:
        # Let PostgreSQL parse the date string; expect ISO format (YYYY-MM-DD).
        columns.append("applied_date")
        values.append(applied_date)
    if notes is not None:
        columns.append("notes")
        values.append(notes)
    if url is not None:
        columns.append("url")
        values.append(url)

    placeholders = ", ".join(["%s"] * len(columns))
    columns_sql = ", ".join(columns)

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO jobs ({columns_sql})
            VALUES ({placeholders})
            RETURNING id, title, company, priority, status, applied_date, notes, url, created_at;
            """,
            values,
        )
        row = cur.fetchone()
        conn.commit()
        job = _serialize_job(row)
        return jsonify({"job": job}), 201
    except Exception as exc:  # pragma: no cover - simple error passthrough
        if conn is not None:
            conn.rollback()
        return (
            jsonify({"error": "Failed to create job.", "details": str(exc)}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


@jobs_bp.patch("/<int:job_id>")
@token_required
def update_job(job_id):
    """
    Update mutable fields of a job (status, notes, url, basic details).
    """
    payload = request.get_json(silent=True) or {}

    status = payload.get("status")
    notes = payload.get("notes")
    url = payload.get("url")
    title = payload.get("title")
    company = payload.get("company")
    priority = payload.get("priority")

    fields = []
    values = []

    if status is not None:
        if status not in ALLOWED_STATUSES:
            return (
                jsonify(
                    {
                        "error": "Invalid status.",
                        "allowed_statuses": sorted(ALLOWED_STATUSES),
                    }
                ),
                400,
            )
        fields.append("status = %s")
        values.append(status)

    if notes is not None:
        fields.append("notes = %s")
        values.append(notes)

    if url is not None:
        fields.append("url = %s")
        values.append(url)

    if title is not None:
        fields.append("title = %s")
        values.append(title)

    if company is not None:
        fields.append("company = %s")
        values.append(company)

    if priority is not None:
        if priority not in ALLOWED_PRIORITIES:
            return (
                jsonify(
                    {
                        "error": "Invalid priority.",
                        "allowed_priorities": sorted(ALLOWED_PRIORITIES),
                    }
                ),
                400,
            )
        fields.append("priority = %s")
        values.append(priority)

    if not fields:
        return (
            jsonify({"error": "No updatable fields provided."}),
            400,
        )

    values.append(g.current_user_id)
    values.append(job_id)
    set_clause = ", ".join(fields)

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE jobs
            SET {set_clause}
            WHERE user_id = %s AND id = %s
            RETURNING id, title, company, priority, status, applied_date, notes, url, created_at;
            """,
            values,
        )
        row = cur.fetchone()
        if row is None:
            return jsonify({"error": "Job not found."}), 404

        conn.commit()
        job = _serialize_job(row)
        return jsonify({"job": job})
    except Exception as exc:  # pragma: no cover - simple error passthrough
        if conn is not None:
            conn.rollback()
        return (
            jsonify({"error": "Failed to update job.", "details": str(exc)}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


@jobs_bp.delete("/<int:job_id>")
@token_required
def delete_job(job_id):
    """
    Delete a job by its id.
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM jobs WHERE user_id = %s AND id = %s RETURNING id;",
            (g.current_user_id, job_id),
        )
        row = cur.fetchone()
        if row is None:
            return jsonify({"error": "Job not found."}), 404

        conn.commit()
        return ("", 204)
    except Exception as exc:  # pragma: no cover - simple error passthrough
        if conn is not None:
            conn.rollback()
        return (
            jsonify({"error": "Failed to delete job.", "details": str(exc)}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()

