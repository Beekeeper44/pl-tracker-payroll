# PL Payroll Tracker

Single-page tracker (`public/index.html`) with Vercel serverless functions (`api/`) and a Neon Postgres database.

## Setup

1. Create the Vercel project from this folder (GitHub import or `vercel` CLI). Framework preset: **Other**.
2. In the project, go to **Storage → Neon** and create or connect a database. This sets `DATABASE_URL`.
3. Add the env var `SESSION_SECRET` (32+ random characters, e.g. `openssl rand -base64 48`).
4. Nothing to run by hand: on the first request the app creates its tables and, if the database is empty, loads
   - admins `alan`, `karl`, `peds` (see lib/seed.js — change these passwords in Manage Users after first sign-in)
   - the October 2026 sheet: 30 batches, 129 employees
   (`db/setup.sql` does the same if you'd rather run it in the Neon SQL Editor.)
5. Deploy and sign in.

`lib/seed.js` and `db/setup.sql` contain password hashes and payroll data, so keep the repo private.

## How data is stored

| Table | Contents |
|---|---|
| `users` | username, display name, bcrypt password hash, admin flag |
| `payroll_sheets` | one row per month (`2026-10`), the whole sheet as JSON, a version number, who saved last |

- Edits autosave about a second after you stop typing. The status next to your name shows Saving / Saved / Unsaved.
- Each month is its own sheet. Opening a month with no sheet starts from the closest earlier month. Nothing is written until someone edits it; use **Clear Sheets** to reset variables and OT for the new month.
- If two people edit the same month at once, the second save is rejected rather than overwriting. That person gets the latest version and re-enters their last change. Open tabs pick up other people's saves every 20 seconds while idle.
- Manage Users (admins): add users, toggle admin, change passwords and remove users, all saved immediately. You can't remove or demote yourself, and at least one admin always remains.

## API

| Route | Method | Who |
|---|---|---|
| `/api/login` | POST `{username, password}` → `{token, user}` | anyone |
| `/api/me` | GET | signed in |
| `/api/sheet?period=YYYY-MM` | GET, PUT `{period, version, data}` | signed in |
| `/api/users` | GET, POST, PATCH, DELETE `?username=` | admins |

Sessions are signed tokens (12 hours) kept in the browser tab's session storage.
