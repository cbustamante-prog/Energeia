# Energeia

Energeia is an Ionic + React JavaScript web app with a FastAPI + Python backend and a MySQL database that runs locally with WampServer. It estimates household electricity usage from appliance wattage, quantity, and saved weekly schedules. It is a useful estimate—not a smart meter or an official electricity bill.

## Features

- Personal registration, sign-in, sign-out, and password hashing.
- Private, multiple household profiles and configurable electricity providers and rates.
- Editable appliances and multiple active or paused schedules per appliance.
- Period-specific kilowatt-hour and estimated-bill calculations.
- Persistent appliance-consumption and bill histories, actual-bill entry, and period comparisons.
- Rule-based conservation suggestions with dismissal.
- Saved what-if plans and previews that do not change your real appliance data.
- Access controls so one account cannot read another account's households.
- Historical electricity-rate snapshots; appliances with history are archived instead of deleted.

## Run locally with WampServer

### Before you start

Install Git, Node.js with npm, Python 3.11 or newer, and [uv](https://docs.astral.sh/uv/). Each developer runs the app and database locally; your partner should use their own MySQL database and register their own Energeia account.

For a step-by-step Windows guide to set up the project on another laptop, see [PARTNER-SETUP.txt](./PARTNER-SETUP.txt).

### 1. Get the project

If the GitHub repository is private, first ask the repository owner to add you as a collaborator. Then clone it in PowerShell:

```powershell
git clone https://github.com/cbustamante-prog/Energeia.git
cd Energeia
```

### 2. Start MySQL

Start MySQL in the WampServer control panel. In phpMyAdmin, select **Import** and import [`backend/schema.sql`](./backend/schema.sql).

**Already using a database created from `energeia_db.sql`?** Back up the database first, then run [`backend/migrate.sql`](./backend/migrate.sql) against `energeia_db` **once**. This migration retains existing tables and records while adding appliance archiving and protecting historical consumption. Do not reimport the original SQL file: it contains `DROP TABLE` statements.

The default local connection is `root` with an empty password. If your MySQL credentials differ, update `DATABASE_URL` in the next step.

### 3. Start the Python API

Install Python 3.11 or newer and [uv](https://docs.astral.sh/uv/), then open PowerShell:

```powershell
cd backend
Copy-Item .env.example .env
uv sync
uv run uvicorn app.main:app --reload
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) for the interactive API and [http://localhost:8000/api/health](http://localhost:8000/api/health) to check its connection to MySQL.

If your MySQL password includes URL-reserved characters, URL-encode it in `DATABASE_URL`. For example, encode `@` as `%40`. Before deploying outside a local development computer, set `JWT_SECRET` to a new, long, random secret, restrict `CORS_ORIGINS`, use HTTPS, and protect the `.env` file.

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

The FastAPI test suite uses an isolated in-memory SQLite database; it does **not** need your WAMP server or modify its records. The live `/api/health` endpoint separately verifies the configured MySQL connection.
