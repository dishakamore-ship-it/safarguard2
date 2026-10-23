# SafarGuard — AI Driver Drowsiness Analyzer

## Run on Windows
1. Extract this ZIP and open the folder in VS Code.
2. In the terminal run:
   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   py -m pip install -r requirements.txt
   py app.py
   ```
3. Open http://127.0.0.1:5000 in Edge or Chrome. Do not open `index.html` directly and do not use Live Server for the full app; Flask serves the frontend and `/api` backend together.

## Features
- Camera preview + MediaPipe face mesh / EAR drowsiness monitoring.
- Prolonged mouth-opening (yawn) detection, recorded with session safety events.
- Start/stop monitoring and configurable spoken/audio alerts.
- Marathi, Hindi, and English drowsiness announcements with a voice-test control; required speech voices must be available in the browser/OS.
- Session history, weekly session/event analytics and CSV report export.
- Profile details and alert preference saved by the Flask API in SQLite.
- User-started live location, coordinates, accuracy, update time and Google Maps link.
- Contact form API and SQLite storage.

## Backend layout
- `backend/app.py` contains the Flask routes and SQLite schema.
- `app.py` remains the Windows-friendly launch entry point.
- `data/safarguard.db` stores sessions, safety events, profile settings, and contact submissions.

The profile is a single shared demo profile; this application does not provide login or multi-user isolation. Camera and location require browser permission. Geolocation requires localhost or HTTPS. Three.js and the pinned MediaPipe Face Mesh runtime/assets load from jsDelivr, so internet access is needed for visual monitoring. A frame-processing failure is logged with the original cause, retried up to three times, and the camera is stopped if recovery fails. This is a student demo and not a substitute for safe driving practices.
