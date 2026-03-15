import os
from datetime import date

from flask import Blueprint, jsonify, request, g
import anthropic
from pypdf import PdfReader

from auth_middleware import token_required
from db import get_db_connection


ADMIN_EMAILS = ["belaltibi@gmail.com"]


ai_bp = Blueprint("ai", __name__, url_prefix="/api/ai")


@ai_bp.get("/usage")
@token_required
def usage():
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        print(f"Checking limits for user_id: {g.current_user_id}")

        # Determine if admin
        cur.execute(
            "SELECT email FROM users WHERE id = %s;",
            (g.current_user_id,),
        )
        user_row = cur.fetchone()
        user_email = (user_row["email"] if user_row else "") or ""
        is_admin = user_email in ADMIN_EMAILS

        if is_admin:
            return jsonify(
                {
                    "job_calls_remaining": 999,
                    "cv_feedback_available": True,
                    "is_admin": True,
                }
            )

        daily_limit = 3

        cur.execute(
            """
            SELECT call_count, cv_call_date
            FROM user_ai_calls
            WHERE user_id = %s AND call_date = CURRENT_DATE;
            """,
            (g.current_user_id,),
        )
        row = cur.fetchone()

        call_count = row["call_count"] if row else 0
        calls_remaining = max(0, daily_limit - call_count)

        today = date.today()
        cv_feedback_available = not (row and row.get("cv_call_date") == today)

        return jsonify(
            {
                "job_calls_remaining": calls_remaining,
                "cv_feedback_available": cv_feedback_available,
                "is_admin": False,
            }
        )
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Usage endpoint error: {exc}")
        return (
            jsonify({"error": "Failed to load AI usage data."}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()

@ai_bp.post("/feedback")
@token_required
def feedback():
    payload = request.get_json(silent=True) or {}

    job_title = (payload.get("job_title") or "").strip()
    company = (payload.get("company") or "").strip()
    notes = (payload.get("notes") or "").strip()
    url = (payload.get("url") or "").strip()
    priority = (payload.get("priority") or "").strip()
    cv_text = (payload.get("cv_text") or "").strip()

    if not job_title or not company or not cv_text:
        return jsonify({"error": "job_title, company, and cv_text are required."}), 400

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        print(f"Checking limits for user_id: {g.current_user_id}")

        cur.execute(
            "SELECT email FROM users WHERE id = %s;",
            (g.current_user_id,),
        )
        user_row = cur.fetchone()
        user_email = (user_row["email"] if user_row else "") or ""
        is_admin = user_email in ADMIN_EMAILS

        daily_limit = 3
        calls_remaining = None

        if not is_admin:
            cur.execute(
                """
                SELECT call_count
                FROM user_ai_calls
                WHERE user_id = %s AND call_date = CURRENT_DATE
                FOR UPDATE;
                """,
                (g.current_user_id,),
            )
            row = cur.fetchone()

            if row and row["call_count"] >= daily_limit:
                return (
                    jsonify(
                        {
                            "error": "Daily limit of 3 AI feedback requests reached (3/3). Resets tomorrow."
                        }
                    ),
                    429,
                )

            if row:
                new_count = row["call_count"] + 1
                cur.execute(
                    """
                    UPDATE user_ai_calls
                    SET call_count = %s
                    WHERE user_id = %s AND call_date = CURRENT_DATE;
                    """,
                    (new_count, g.current_user_id),
                )
            else:
                new_count = 1
                cur.execute(
                    """
                    INSERT INTO user_ai_calls (user_id, call_date, call_count)
                    VALUES (%s, CURRENT_DATE, %s);
                    """,
                    (g.current_user_id, new_count),
                )

            conn.commit()
            calls_remaining = max(0, daily_limit - new_count)

        prompt = (
            f"CV:\n{cv_text}\n\n"
            f"Job: {job_title} at {company}\n"
            f"Priority: {priority}\n"
            f"Notes: {notes}\n\n"
            "Provide:\n"
            "1) Fit Score: X/10 - one sentence explanation\n"
            "2) Top 3 Strengths: specific CV points relevant to this role\n"
            "3) Two Skill Gaps: honest weaknesses for this role\n"
            "4) One Application Tip: specific and actionable"
        )

        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=(
                "You are a career coach helping a job applicant evaluate their fit for a role. "
                "Be concise, specific, and actionable. Format your response clearly with the exact sections requested."
            ),
            messages=[{"role": "user", "content": prompt}],
        )
        feedback_text = message.content[0].text

        if is_admin:
            calls_remaining = 999

        return jsonify(
            {"feedback": feedback_text, "calls_remaining": calls_remaining}
        )

    except Exception as e:
        if conn is not None:
            conn.rollback()
        print(f"AI feedback error: {e}")
        return jsonify({"error": "Failed to generate AI feedback. Please try again later."}), 500
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


@ai_bp.post("/extract-cv")
@token_required
def extract_cv():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded."}), 400

    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported."}), 400

    try:
        reader = PdfReader(file)
        text_parts = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
        cv_text = "\n".join(text_parts).strip()

        if not cv_text:
            return jsonify({"error": "Could not extract text from PDF."}), 400

        conn = None
        cur = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE users
                SET cv_text = %s, cv_filename = %s
                WHERE id = %s;
                """,
                (cv_text, file.filename or "", g.current_user_id),
            )
            conn.commit()
        finally:
            if cur is not None:
                cur.close()
            if conn is not None:
                conn.close()

        return jsonify({"cv_text": cv_text})
    except Exception as exc:  # pylint: disable=broad-except
        print(f"PDF extract error: {exc}")
        return (
            jsonify(
                {
                    "error": "Failed to process CV PDF. Please check the file and try again."
                }
            ),
            500,
        )


@ai_bp.post("/cv-feedback")
@token_required
def cv_feedback():
    payload = request.get_json(silent=True) or {}
    cv_text = (payload.get("cv_text") or "").strip()

    if not cv_text:
        return jsonify({"error": "cv_text is required."}), 400

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        print(f"Checking limits for user_id: {g.current_user_id}")

        cur.execute(
            "SELECT email FROM users WHERE id = %s;",
            (g.current_user_id,),
        )
        user_row = cur.fetchone()
        user_email = (user_row["email"] if user_row else "") or ""
        is_admin = user_email in ADMIN_EMAILS

        if not is_admin:
            cur.execute(
                """
                SELECT cv_call_date
                FROM user_ai_calls
                WHERE user_id = %s
                FOR UPDATE;
                """,
                (g.current_user_id,),
            )
            row = cur.fetchone()

            today = date.today()
            if row and row.get("cv_call_date") == today:
                return (
                    jsonify(
                        {
                            "error": "Daily CV feedback limit reached (1/1). Resets tomorrow."
                        }
                    ),
                    429,
                )

            if row:
                cur.execute(
                    """
                    UPDATE user_ai_calls
                    SET cv_call_date = CURRENT_DATE
                    WHERE user_id = %s;
                    """,
                    (g.current_user_id,),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO user_ai_calls (user_id, call_date, call_count, cv_call_date)
                    VALUES (%s, CURRENT_DATE, 0, CURRENT_DATE);
                    """,
                    (g.current_user_id,),
                )

            conn.commit()

        prompt = (
            f"CV:\n{cv_text}\n\n"
            "Please provide a comprehensive CV review covering:\n"
            "1) Overall Impression: brief summary of CV strength (score X/10)\n"
            "2) Top 3 Strongest Points: what stands out positively\n"
            "3) Top 3 Areas to Improve: specific weaknesses with actionable fixes\n"
            "4) Missing Sections: important things not included\n"
            "5) One Quick Win: the single most impactful change to make today"
        )

        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=(
                "You are a career coach reviewing a candidate's CV. "
                "Be concise, specific, and actionable. Use clear headings and bullet points."
            ),
            messages=[{"role": "user", "content": prompt}],
        )

        feedback_text = message.content[0].text

        # Persist CV feedback for later viewing
        cur.execute(
            """
            UPDATE users
            SET cv_feedback = %s, cv_feedback_date = NOW()
            WHERE id = %s;
            """,
            (feedback_text, g.current_user_id),
        )
        conn.commit()

        cur.execute(
            "SELECT cv_feedback_date FROM users WHERE id = %s;",
            (g.current_user_id,),
        )
        row = cur.fetchone()
        cv_feedback_date = row["cv_feedback_date"] if row else None

        return jsonify(
            {
                "feedback": feedback_text,
                "cv_feedback_used": True,
                "cv_feedback_date": cv_feedback_date.isoformat()
                if cv_feedback_date
                else None,
            }
        )

    except Exception as exc:  # pylint: disable=broad-except
        if conn is not None:
            conn.rollback()
        print(f"CV feedback error: {exc}")
        return (
            jsonify(
                {
                    "error": "Failed to generate CV feedback. Please try again later."
                }
            ),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


@ai_bp.get("/cv-feedback")
@token_required
def get_cv_feedback():
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT cv_feedback, cv_feedback_date
            FROM users
            WHERE id = %s;
            """,
            (g.current_user_id,),
        )
        row = cur.fetchone()

        if not row or not row.get("cv_feedback"):
            return jsonify({"feedback": None})

        cv_feedback = row["cv_feedback"]
        cv_feedback_date = row.get("cv_feedback_date")

        return jsonify(
            {
                "feedback": cv_feedback,
                "cv_feedback_date": cv_feedback_date.isoformat()
                if cv_feedback_date
                else None,
            }
        )
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Get CV feedback error: {exc}")
        return (
            jsonify({"error": "Failed to load CV feedback."}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


@ai_bp.get("/cv-text")
@token_required
def get_cv_text():
    """Return the current user's stored CV text and filename (for restore on login/load)."""
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT cv_text, cv_filename
            FROM users
            WHERE id = %s;
            """,
            (g.current_user_id,),
        )
        row = cur.fetchone()
        cv_text = (row.get("cv_text") or "").strip() if row else ""
        cv_filename = (row.get("cv_filename") or "") if row else ""
        return jsonify({"cv_text": cv_text, "cv_filename": cv_filename})
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Get CV text error: {exc}")
        return (
            jsonify({"error": "Failed to load CV."}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


@ai_bp.patch("/cv-text")
@token_required
def update_cv_text():
    """Clear or update the user's stored CV text (e.g. on Remove CV)."""
    payload = request.get_json(silent=True) or {}
    cv_text = payload.get("cv_text")
    cv_filename = payload.get("cv_filename")
    if cv_text is None and cv_filename is None:
        cv_text = None
        cv_filename = None
    else:
        cv_text = (cv_text if cv_text is not None else "").strip()
        cv_filename = (cv_filename if cv_filename is not None else "") or None
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE users
            SET cv_text = %s, cv_filename = %s
            WHERE id = %s;
            """,
            (cv_text if cv_text else None, cv_filename, g.current_user_id),
        )
        conn.commit()
        return jsonify({"ok": True})
    except Exception as exc:  # pylint: disable=broad-except
        if conn is not None:
            conn.rollback()
        print(f"Update CV text error: {exc}")
        return (
            jsonify({"error": "Failed to update CV."}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()