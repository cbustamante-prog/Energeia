# Energeia

Energeia is an Ionic + React JavaScript web app with a FastAPI + Python backend and a PostgreSQL database hosted on Supabase. It estimates household electricity usage from appliance wattage, quantity, and saved weekly schedules. It is a useful estimate—not a smart meter or an official electricity bill.

## Features

- Email/password registration and sign-in, Google OAuth on web and Android, GitHub OAuth on web, profile completion, and password reset.
- Private account profile and home-location settings; addresses are not shown on the dashboard.
- Private, multiple household profiles and configurable electricity providers and rates.
- Editable appliances and multiple active or paused schedules per appliance.
- Period-specific kilowatt-hour and estimated-bill calculations.
- Persistent appliance-consumption and bill histories, actual-bill entry, and period comparisons.
- Rule-based conservation suggestions with dismissal.
- Saved what-if plans and previews that do not change your real appliance data.
- Access controls so one account cannot read another account's households.
- Historical electricity-rate snapshots; appliances with history are archived instead of deleted.

For existing database migrations and Google/GitHub, SMTP, and Vercel configuration, see [AUTH-SETUP.md](./AUTH-SETUP.md). OAuth credentials and SMTP secrets belong only in the FastAPI host environment, never in frontend or Vercel `VITE_*` variables.

## Android app

The Capacitor Android app is currently version **1.1.5 (version code 16)**. It supports Google sign-in and email/password authentication; GitHub sign-in is intentionally not shown in the Android app. The website continues to offer GitHub sign-in.

Build a debug APK for device testing from PowerShell:

```powershell
cd frontend
npm ci
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

The APK is written to `frontend/android/app/build/outputs/apk/debug/Energeia-v16.apk`. Set `VITE_API_URL` to the deployed FastAPI API URL before building for a phone; the default `http://localhost:8000/api` is only suitable for local development. Google sign-in also requires the Google credentials and Android signing fingerprints described in [AUTH-SETUP.md](./AUTH-SETUP.md). Debug APKs are for testing, not Play Store releases; see [Android release signing](#android-release-signing) for signed release builds.

## Run locally with Supabase

### Before you start

Install Git, Node.js with npm, Python 3.11 or newer, and [uv](https://docs.astral.sh/uv/). Create a Supabase project to host the shared PostgreSQL database. Each developer runs the app and API locally and registers their own Energeia account.

For a step-by-step Windows guide to set up the project on another laptop, see [PARTNER-SETUP.txt](./PARTNER-SETUP.txt).

### 1. Get the project

If the GitHub repository is private, first ask the repository owner to add you as a collaborator. In PowerShell, clone it under your user profile (not from a protected folder such as `C:\Windows\System32`):

```powershell
New-Item -ItemType Directory -Force "$HOME\source" | Out-Null
Set-Location "$HOME\source"
git clone https://github.com/cbustamante-prog/Energeia.git
cd Energeia
```

### 2. Create the Supabase database

Create a project in [Supabase](https://supabase.com/). In its **SQL Editor**, open [`backend/schema.sql`](./backend/schema.sql), paste the complete script, and run it once. This creates the Energeia tables and the unconfigured **“Set your provider”** rate. It does not copy or alter data in your old MySQL database.

In Supabase, open **Connect**, choose the **Session pooler**, and copy its connection string. Use that string only in the backend's `.env` file. For a direct connection, use the direct connection details if your network supports IPv6.

### 3. Configure and start the Python API

Install Python 3.11 or newer and [uv](https://docs.astral.sh/uv/), then open PowerShell:

```powershell
cd backend
Copy-Item .env.example .env
# Edit .env and replace DATABASE_URL with the Supabase Session pooler connection string.
uv sync
uv run uvicorn app.main:app --reload
```

When adapting the connection string from Supabase, use the SQLAlchemy driver prefix `postgresql+psycopg://` (instead of `postgresql://`) and keep `?sslmode=require`. URL-encode special characters in the database password (for example, encode `@` as `%40`).

Open [http://localhost:8000/docs](http://localhost:8000/docs) for the interactive API and [http://localhost:8000/api/health](http://localhost:8000/api/health) to check its connection to PostgreSQL.

The API expects the tables from `backend/schema.sql` to exist; it does not create or migrate them automatically. Keep the database connection string and `JWT_SECRET` private. Never put the database URL in the frontend or commit `.env`. Before deploying outside a local development computer, set `JWT_SECRET` to a new, long, random secret, restrict `CORS_ORIGINS`, and use HTTPS.

If you are upgrading an existing PostgreSQL database, do not rerun the entire schema script: follow the safe migration steps in [AUTH-SETUP.md](./AUTH-SETUP.md).

### 4. Start the Ionic + React app

In another PowerShell window:

```powershell
cd frontend
Copy-Item .env.example .env
npm ci
npm run dev
```

Visit the local URL Vite prints, usually [http://localhost:5173](http://localhost:5173). Set `VITE_API_URL` in `frontend/.env` if the API is hosted somewhere other than `http://localhost:8000/api`.

After signing up, create a household, add the electricity provider and per-kWh rate shown on your bill, then add appliances and their schedules. The app starts with **“Set your provider”** rather than assuming or inventing a tariff.

## Calculations and history

Each active schedule represents the appliance's hours **on each listed day**. The estimated usage for a billing period is:

```text
wattage × quantity × active scheduled hours per week ÷ 7 × period days ÷ 1,000
```

Overlapping active schedules on the same day may not exceed 24 hours. Inactive schedules are saved but not counted. Estimates are rounded to 2 decimal places for storage and billing. Calculations save appliance consumption records, but a period with no scheduled consumption does not create an estimated bill or appear as a zero-only billing period. Recalculating updates that period rather than adding duplicate records. The current billing period always uses the household's latest provider rate, so changing the rate recalculates the current estimate. Completed periods retain the provider rate recorded for that bill. A bill first calculated before a real rate was configured also updates from its placeholder rate when recalculated. Actual bills and nonzero historical records remain visible even if an appliance is archived. A saved appliance is archived, not erased, to protect consumption history.

## Tests

```powershell
cd frontend
npm run test.unit
npm run build
cd ..\backend
uv run pytest
```

The FastAPI test suite uses an isolated in-memory SQLite database; it does **not** need your Supabase project or modify its records. The live `/api/health` endpoint separately verifies the configured PostgreSQL connection.

## Website routes and browser checks

Public routes are `/`, `/login`, `/register`, `/forgot-password`, and `/reset-password`.
Protected views are `/overview`, `/appliances`, `/history`, `/insights`, `/scenarios`,
and `/settings`. They redirect to sign-in when no session is available. The Vercel
project root should be `frontend`; `frontend/vercel.json` provides the SPA fallback.

Browser QA uses synthetic accounts and the real API against a disposable SQLite
store. It does not verify PostgreSQL deployment or real OAuth/SMTP credentials.

1. From `backend`, run `uv run python scripts/browser_server.py` (port 8000).
   This helper ignores database and provider credentials and removes its database
   on exit. Do not use it as a production server.
2. From `frontend`, run `npm run dev -- --host 0.0.0.0` with the default local API URL.
3. Register/open the local Preview browser, then run `npm run test.browser` from
   `frontend`. It attaches to the shared browser through `coderabbit-agent-browser`.
   Outside this environment, set `ENERGEIA_BROWSER_CDP` to an existing Chromium CDP
   endpoint. The tests navigate the browser and create disposable local data.

The suite exercises all eight requested viewport sizes in both themes, real local
registration and CRUD, planner calculations, navigation, overlays and scrolling.
Run `npm run test.unit`, `npm run lint`, `npm run build`, and backend `uv run pytest`
for the other checks. Real touchpad hardware, mobile keyboards and production OAuth
still need device/provider checks after deployment.

## Android release signing

Release APKs and Play Store bundles must be signed with a private keystore. Keep
the keystore and its passwords outside Git and back them up securely; losing the
keystore can prevent updates to an already-published app. Do not share signing
passwords in chat or commit them to the repository.

Create a keystore once with `keytool` (it prompts for passwords):

```powershell
keytool -genkeypair -v -keystore "$HOME\energeia-release.jks" -alias energeia -keyalg RSA -keysize 4096 -validity 10000
```

Before building, set these environment variables in the same PowerShell session:

```powershell
$env:ENERGEIA_RELEASE_KEYSTORE = "$HOME\energeia-release.jks"
$env:ENERGEIA_RELEASE_KEY_ALIAS = "energeia"
foreach ($name in @("ENERGEIA_RELEASE_STORE_PASSWORD", "ENERGEIA_RELEASE_KEY_PASSWORD")) {
  $secure = Read-Host -Prompt $name -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    [Environment]::SetEnvironmentVariable(
      $name,
      [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer),
      "Process"
    )
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}
```

The Android Gradle build reads the signing values from the environment and fails
release packaging if any value is missing. Do not put actual passwords in a
checked-in file. Clear the password variables after building. From `frontend`,
build either deliverable:

```powershell
npx cap sync android
Set-Location android
.\gradlew.bat assembleRelease
.\gradlew.bat bundleRelease
```

The signed APK is written to
`frontend/android/app/build/outputs/apk/release/app-release.apk`; the signed
Android App Bundle for Google Play is written to
`frontend/android/app/build/outputs/bundle/release/app-release.aab`. The
existing debug APK is for testing and is not a store-release package.
