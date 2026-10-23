
"""SafarGuard backend: Flask API and SQLite database."""

from __future__ import annotations

import math
import re
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATABASE = PROJECT_ROOT / "data" / "safarguard.db"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024  # API JSON payload limit


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def db() -> sqlite3.Connection:
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialise_database() -> None:
    with closing(db()) as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS monitoring_sessions (
                id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                average_ear REAL,
                event_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS safety_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                ear REAL,
                duration_seconds REAL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES monitoring_sessions(id)
            );

            CREATE TABLE IF NOT EXISTS contact_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                name TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                alerts_enabled INTEGER NOT NULL DEFAULT 1,
                alert_language TEXT NOT NULL DEFAULT 'en-IN',
                updated_at TEXT NOT NULL
            );
        """)
        profile_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(user_profile)")
        }
        if "alert_language" not in profile_columns:
            connection.execute(
                "ALTER TABLE user_profile "
                "ADD COLUMN alert_language TEXT NOT NULL DEFAULT 'en-IN'"
            )
        connection.execute(
            """
            INSERT OR IGNORE INTO user_profile
                (id, name, email, alerts_enabled, updated_at)
            VALUES (1, '', '', 1, ?)
            """,
            (utc_now(),),
        )
        connection.commit()


# Allow requests from a local frontend such as Live Server.
# No cookies or authentication credentials are enabled.
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    allowed_origins = {
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
    }

    if origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"

    response.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PATCH, OPTIONS"
    )
    response.headers["Access-Control-Allow-Headers"] = (
        "Content-Type"
    )
    return response


@app.get("/api/health")
def health_check():
    try:
        with closing(db()) as connection:
            connection.execute("SELECT 1").fetchone()
        return jsonify({
            "status": "online",
            "database": "connected",
        })
    except sqlite3.Error:
        app.logger.exception("Database health check failed")
        return jsonify({
            "status": "error",
            "database": "unavailable",
        }), 500


@app.get("/")
def home():
    return send_from_directory(PROJECT_ROOT, "index.html")


@app.get("/css/<path:filename>")
def css(filename: str):
    return send_from_directory(PROJECT_ROOT / "css", filename)


@app.get("/js/<path:filename>")
def javascript(filename: str):
    return send_from_directory(PROJECT_ROOT / "js", filename)


@app.get("/assets/<path:filename>")
def assets(filename: str):
    return send_from_directory(PROJECT_ROOT / "assets", filename)


@app.post("/api/sessions")
def start_session():
    session_id = str(uuid.uuid4())

    with closing(db()) as connection:
        connection.execute(
            "INSERT INTO monitoring_sessions (id, started_at) "
            "VALUES (?, ?)",
            (session_id, utc_now()),
        )
        connection.commit()

    return jsonify({
        "sessionId": session_id,
        "startedAt": utc_now(),
        "message": "Monitoring session created",
    }), 201


@app.post("/api/sessions/<session_id>/events")
def create_event(session_id: str):
    payload = request.get_json(silent=True) or {}
    event_type = payload.get("eventType")

    allowed_events = {"drowsiness_alert", "face_lost", "yawn_detected"}
    if event_type not in allowed_events:
        return jsonify({
            "error": "eventType must be drowsiness_alert or face_lost"
        }), 400

    try:
        ear = float(payload.get("ear", 0))
        duration = float(payload.get("durationSeconds", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid event readings"}), 400

    if (
        not math.isfinite(ear)
        or not math.isfinite(duration)
        or ear < 0
        or ear > 1
        or duration < 0
        or duration > 86400
    ):
        return jsonify({"error": "Event readings are out of range"}), 400

    with closing(db()) as connection:
        session = connection.execute(
            "SELECT ended_at FROM monitoring_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()

        if session is None:
            return jsonify({"error": "Session not found"}), 404

        if session["ended_at"] is not None:
            return jsonify({"error": "Session has already ended"}), 409

        connection.execute(
            """
            INSERT INTO safety_events
            (session_id, event_type, ear, duration_seconds, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, event_type, ear, duration, utc_now()),
        )
        connection.execute(
            "UPDATE monitoring_sessions "
            "SET event_count = event_count + 1 WHERE id = ?",
            (session_id,),
        )
        connection.commit()

    return jsonify({"saved": True, "eventType": event_type}), 201


@app.patch("/api/sessions/<session_id>")
def end_session(session_id: str):
    payload = request.get_json(silent=True) or {}
    average_ear = payload.get("averageEar")

    try:
        if average_ear is not None:
            average_ear = float(average_ear)
            if not math.isfinite(average_ear) or not 0 <= average_ear <= 1:
                raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "averageEar must be between 0 and 1"}), 400

    with closing(db()) as connection:
        result = connection.execute(
            """
            UPDATE monitoring_sessions
            SET ended_at = ?, average_ear = ?
            WHERE id = ? AND ended_at IS NULL
            """,
            (utc_now(), average_ear, session_id),
        )
        connection.commit()

        if result.rowcount == 0:
            exists = connection.execute(
                "SELECT 1 FROM monitoring_sessions WHERE id = ?",
                (session_id,),
            ).fetchone()
            if exists is None:
                return jsonify({"error": "Session not found"}), 404
            return jsonify({"error": "Session already ended"}), 409

    return jsonify({"saved": True, "sessionId": session_id})


@app.get("/api/sessions")
def recent_sessions():
    with closing(db()) as connection:
        rows = connection.execute(
            """
            SELECT id, started_at, ended_at, average_ear, event_count
            FROM monitoring_sessions
            ORDER BY started_at DESC
            LIMIT 20
            """
        ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.get("/api/sessions/<session_id>/events")
def session_events(session_id: str):
    with closing(db()) as connection:
        exists = connection.execute(
            "SELECT 1 FROM monitoring_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()

        if exists is None:
            return jsonify({"error": "Session not found"}), 404

        rows = connection.execute(
            """
            SELECT id, event_type, ear, duration_seconds, created_at
            FROM safety_events
            WHERE session_id = ?
            ORDER BY created_at DESC
            LIMIT 100
            """,
            (session_id,),
        ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.get("/api/stats")
def dashboard_stats():
    with closing(db()) as connection:
        stats = connection.execute(
            """
            SELECT
                COUNT(*) AS total_sessions,
                COALESCE(SUM(event_count), 0) AS total_events,
                COALESCE(SUM(
                    CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END
                ), 0) AS active_sessions
            FROM monitoring_sessions
            """
        ).fetchone()

        alerts = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM safety_events
            WHERE event_type = 'drowsiness_alert'
            """
        ).fetchone()["total"]

    return jsonify({
        "totalSessions": stats["total_sessions"],
        "totalEvents": stats["total_events"],
        "activeSessions": stats["active_sessions"],
        "drowsinessAlerts": alerts,
    })


@app.post("/api/contact")
def save_contact():
    payload = request.get_json(silent=True) or {}

    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()
    message = str(payload.get("message", "")).strip()

    if (
        not name
        or len(name) > 100
        or not email
        or len(email) > 254
        or "@" not in email
        or not message
        or len(message) > 2000
    ):
        return jsonify({
            "error": "Enter a name, valid email, and message "
                     "(maximum 2000 characters)"
        }), 400

    with closing(db()) as connection:
        connection.execute(
            """
            INSERT INTO contact_messages (name, email, message, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (name, email, message, utc_now()),
        )
        connection.commit()

    return jsonify({"saved": True}), 201


def profile_response(row: sqlite3.Row):
    return {
        "name": row["name"],
        "email": row["email"],
        "alertsEnabled": bool(row["alerts_enabled"]),
        "alertLanguage": row["alert_language"],
        "updatedAt": row["updated_at"],
    }


@app.get("/api/profile")
def get_profile():
    with closing(db()) as connection:
        row = connection.execute(
            "SELECT name, email, alerts_enabled, alert_language, updated_at "
            "FROM user_profile WHERE id = 1"
        ).fetchone()

    if row is None:
        app.logger.error("Default SafarGuard profile row is missing")
        return jsonify({"error": "Profile is unavailable"}), 500

    return jsonify(profile_response(row))


@app.put("/api/profile")
def update_profile():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "A JSON profile object is required"}), 400

    unknown_fields = set(payload) - {
        "name", "email", "alertsEnabled", "alertLanguage"
    }
    if unknown_fields:
        return jsonify({"error": "Profile contains unsupported fields"}), 400

    with closing(db()) as connection:
        current = connection.execute(
            "SELECT name, email, alerts_enabled, alert_language "
            "FROM user_profile WHERE id = 1"
        ).fetchone()

        if current is None:
            app.logger.error("Default SafarGuard profile row is missing")
            return jsonify({"error": "Profile is unavailable"}), 500

        name_value = payload.get("name", current["name"])
        email_value = payload.get("email", current["email"])
        if not isinstance(name_value, str) or not isinstance(email_value, str):
            return jsonify({"error": "Name and email must be text"}), 400

        name = name_value.strip()
        email = email_value.strip()
        alerts_enabled = payload.get(
            "alertsEnabled", bool(current["alerts_enabled"])
        )
        alert_language = payload.get(
            "alertLanguage", current["alert_language"]
        )

        if len(name) > 100:
            return jsonify({"error": "Name must be 100 characters or fewer"}), 400
        if len(email) > 254 or (
            email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)
        ):
            return jsonify({"error": "Enter a valid email address"}), 400
        if not isinstance(alerts_enabled, bool):
            return jsonify({"error": "alertsEnabled must be true or false"}), 400
        if (
            not isinstance(alert_language, str)
            or alert_language not in {"en-IN", "hi-IN", "mr-IN"}
        ):
            return jsonify({
                "error": "alertLanguage must be en-IN, hi-IN, or mr-IN"
            }), 400

        updated_at = utc_now()
        connection.execute(
            """
            UPDATE user_profile
            SET name = ?, email = ?, alerts_enabled = ?,
                alert_language = ?, updated_at = ?
            WHERE id = 1
            """,
            (name, email, int(alerts_enabled), alert_language, updated_at),
        )
        connection.commit()

    return jsonify({
        "name": name,
        "email": email,
        "alertsEnabled": alerts_enabled,
        "alertLanguage": alert_language,
        "updatedAt": updated_at,
    })


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "Route not found"}), 404


@app.errorhandler(413)
def payload_too_large(_error):
    return jsonify({"error": "Request payload is too large"}), 413


initialise_database()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
