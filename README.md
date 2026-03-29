# CVE Chatbot

A desktop vulnerability intelligence assistant that uses **Google Gemini AI** to generate structured CVE (Common Vulnerabilities and Exposures) reports. Search by CVE ID, upload CSV/Excel files of CVE IDs, and get detailed analysis including severity, CVSS scores, CWE mappings, mitigations, and similar vulnerabilities.

## Architecture

```
cve-chatbot/
├── server/          # Fpp./astAPI backend (Python)
│   ├── app.py       # Main API – CVE lookup, auth, Gemini integration
│   ├── db.py        # SQLAlchemy database config (SQLite)
│   ├── models.py    # Activity log ORM model
│   ├── logger.py    # Write activity logs to DB
│   ├── users.json   # Registered user store (auto-created)
│   ├── activity.db  # SQLite activity log (auto-created)
│   ├── .env         # API keys (GEMINI_API_KEY, NVD_API_KEY)
│   └── requirements.txt
│
├── frontend/        # Static web UI
│   ├── index.html   # Main page with auth overlay
│   ├── app.js       # All frontend logic (auth, search, results)
│   └── styles.css   # Styling
│
├── desktop/         # Electron desktop wrapper
│   ├── main.js      # Electron main process + embedded HTTP server
│   ├── preload.js   # Bridge API for renderer fetch calls
│   └── package.json
│
└── README.md
```

## Features

- 🔍 **CVE Lookup** — Search any CVE ID (e.g., `CVE-2021-44228`) and get a full AI-generated report
- 📊 **Structured Reports** — Severity, CVSS score, CWEs, consequences, mitigations, detection methods
- 🔎 **Similar CVEs** — Gemini finds ~10 similar vulnerabilities for each search
- 📁 **File Upload** — Bulk search via CSV or Excel file containing CVE IDs
- 🔐 **User Authentication** — Register/Login with persistent accounts (backend `users.json`)
- 📝 **Activity Logging** — All searches logged to SQLite with timestamps and usernames
- 🖥️ **Desktop App** — Electron wrapper for standalone desktop experience

---

## Setup Guide

### Prerequisites

- **Python 3.10+** with `pip`
- **Node.js 18+** with `npm`
- A **Google Gemini API key** (set in `server/.env`)

### 1. Backend (server/)

```bash
cd server
python -m venv .venv

# Activate the virtual environment
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

**Configure API keys** in `server/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
NVD_API_KEY=your_nvd_api_key_here
```

### 2. Desktop App (desktop/)

```bash
cd desktop
npm install
```

### 3. Run the Application

**Terminal 1 — Start the backend:**
```bash
cd server
.\.venv\Scripts\activate
python app.py
# → Uvicorn running on http://127.0.0.1:5003
```

**Terminal 2 — Start the Electron app:**
```bash
cd desktop
npm start
# → Opens the desktop window
```

### 4. First Use

1. Register a new account (email + name + mobile + password)
2. Login with your credentials
3. Enter a CVE ID (e.g., `CVE-2021-44228`) and click **Search**
4. View the structured report in the results window

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/register` | Register a new user |
| `POST` | `/login` | Authenticate a user |
| `POST` | `/fastapi_get_cve` | Get structured CVE report via Gemini |
| `POST` | `/fastapi_find_similar` | Find similar CVEs via Gemini |
| `GET` | `/admin/logs?limit=N` | View activity logs (requires `X-Admin-Token` header) |

---

## Project Restructuring Changelog

This project was significantly restructured and cleaned up. Below is a complete record of all changes.

### Renamed Folders

| Old Name | New Name | Reason |
|----------|----------|--------|
| `backend2/` | `server/` | Descriptive name, removed version number |
| `electron_app/` | `desktop/` | Describes purpose, not technology |

### Renamed Files

| Old Path | New Path | Reason |
|----------|----------|--------|
| `server/main.py` | `server/app.py` | Standard naming convention |
| `server/log_writer.py` | `server/logger.py` | Cleaner name |
| `server/requirements_1.txt` | `server/requirements.txt` | Removed version suffix |
| `frontend/script.js` | `frontend/app.js` | Standard naming |
| `frontend/style.css` | `frontend/styles.css` | Standard naming |

### Deleted — Entire `backend/` folder (49 files)

The old Flask-based backend was fully replaced by `server/` (FastAPI). Contained:
- `app.py`, `cve_utils.py`, `gemini_utils.py` — old Flask server and utilities
- 20+ debug/test scripts (`debug_*.py`, `test_*.py`, `tmp_*.py`, `diag_*.py`)
- Merge and fill scripts (`merge_gemini_*.py`, `fill_parameters_all.py`, `targeted_*.py`)
- `smoke_results.json`, `smoke_test.py` — old test artifacts

### Deleted — `node_bridge/` folder

An Express.js auth proxy that was fully redundant — the FastAPI backend has its own `/register` and `/login` endpoints.

### Deleted — Individual files

| File | Reason |
|------|--------|
| `server/test_api.py` | Dev-only test script |
| `server/test_insert_log.py` | Dev-only test script |
| `server/tmp_run_get_cve.py` | Temp debug script with hardcoded paths |
| `server/tmp_test_post.py` | Temp test script |
| `server/env_example.txt` | Template file — `.env` already exists |
| `server/run.py` | Alternate startup — `python app.py` is the standard |
| `server/auth.db` | Old SQLite DB from node_bridge — unused |
| `frontend/test_fastapi.html` | Standalone API test page |
| `frontend/package-lock.json` | Empty lock file — frontend is not a Node project |
| `node_bridge/auth.db` | Auto-generated DB file |
| `README_ENHANCED.md` | Old detailed README (replaced by this file) |
| `STARTUP_GUIDE.md` | Old startup guide (replaced by this file) |
| `.env` (root) | Duplicate — `server/.env` is the one actually used |

### Code Fixes Applied

| Fix | Details |
|-----|---------|
| **Port mismatch** | `frontend/app.js` and `frontend/index.html` CSP were hardcoded to port `5006`; backend runs on `5003`. Changed all references. |
| **SQLAlchemy version** | `requirements.txt` had `SQLAlchemy==2.1.0` (doesn't exist). Changed to `2.0.48`. |
| **Import paths** | Package-qualified imports (`from backend2.x`) failed when running from inside the folder. Changed to relative imports with fallback. |
| **Electron file:// issue** | Loading frontend via `file://` protocol blocked all `fetch()` calls. Rewrote `desktop/main.js` to embed an HTTP server. |
| **Query string in URLs** | HTTP server didn't strip `?v=2` from `script.js?v=2`, returning 404. Fixed URL parsing. |
| **Database default** | `db.py` defaulted to MySQL. Changed to local SQLite (`activity.db`). |
| **BigInteger auto-increment** | SQLite doesn't auto-increment `BigInteger`. Changed `models.py` to use `Integer`. |
| **Auth persistence** | Registration was localStorage-only (lost on restart). Wired to backend `/register` and `/login` APIs. Set `allowPersistedLogin = true`. |
| **Similar CVEs w/o cache** | `/fastapi_find_similar` crashed without `backend/cve_cache.json`. Now asks Gemini directly as fallback. |

---

## Known Issues & Improvements Needed

### 🔴 Bugs to Fix

- **Activity logs not recording** — After deleting and recreating `activity.db`, verify that CVE searches are logged. The `models.py` was changed from `BigInteger` to `Integer` for SQLite compatibility, but the database needs to be recreated (`delete activity.db` and restart). Check the server terminal for any `IntegrityError` messages.
- **Admin Logs button** — Depends on activity logging working. Once logs are fixed, verify the Admin Logs popup displays entries with correct local timestamps.

### 🟡 Features to Test

- **CSV/Excel upload** — Test bulk CVE lookup via the "Choose file" button with `.csv` and `.xlsx` files containing CVE IDs. Verify all IDs are parsed and results appear in the report window.
- **Multiple CVE search** — Test comma-separated input (e.g., `CVE-2021-44228, CVE-2017-0144`). Verify the "PLEASE SEPARATE WITH A COMMA" validation works for space-separated input.
- **Similar CVEs** — Verify the "🔎 Similar CVEs" section appears at the bottom of each CVE report. Since there's no local cache, this relies on Gemini generating similar CVEs directly.
- **Export functionality** — Test the "Export" and "Export All" buttons in the results window to verify CSV download works.
- **Session persistence** — After logging in, close and reopen the Electron app. Verify the user stays logged in without needing to re-authenticate.
- **Password visibility toggle** — Test the Show/Hide buttons on both registration and login forms.

### 🟢 Future Improvements

- **Local CVE cache** — Build a `cve_cache.json` by caching Gemini results, enabling faster lookups and better similar-CVE search via FAISS embeddings.
- **Remove `pymysql` dependency** — Since the database is now SQLite, `pymysql` in `requirements.txt` is unnecessary. Removing it would reduce install size.
- **NVD API integration** — The `NVD_API_KEY` is configured but not actively used. Could supplement Gemini data with official NVD data.
- **DevTools auto-open** — `desktop/main.js` opens DevTools on launch. Remove `win.webContents.openDevTools()` for production builds.
- **Error handling** — Improve frontend error messages when Gemini API key is missing or rate-limited.
