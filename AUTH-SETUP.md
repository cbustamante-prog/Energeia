# Authentication and deployment setup

Energeia uses its existing FastAPI API, PostgreSQL database, Argon2 password hashes, and JWT bearer tokens. Google and GitHub OAuth callbacks are handled by the API; the Vercel frontend never receives provider client secrets.

## Database update

- **New database:** run the current [`backend/schema.sql`](./backend/schema.sql).
- **Existing PostgreSQL/Supabase database:** back up the database, then run [`backend/auth_profile_migration.sql`](./backend/auth_profile_migration.sql) once in the Supabase SQL Editor. It adds nullable profile fields and auth tables without deleting accounts or household data. Existing accounts will be asked to complete their profile at next sign-in.
- Do not run the PostgreSQL migration against the legacy MySQL database.

## Backend environment

Add these variables to the environment of the service running FastAPI. Use [`backend/.env.example`](./backend/.env.example) as a placeholder-only template.

| Variable | Local value / purpose |
| --- | --- |
| `FRONTEND_URL` | `http://localhost:5173`; set to `https://energeia-drab.vercel.app` in production |
| `API_PUBLIC_URL` | `http://localhost:8000`; in production, the public origin of the FastAPI service, with no `/api` suffix |
| `CORS_ORIGINS` | Comma-separated frontend origins, including `http://localhost:5173` and `https://energeia-drab.vercel.app` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Credentials from Google Cloud; backend only |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Credentials from a GitHub OAuth App; backend only |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_USE_SSL` | Authenticated mail service used for password-reset links |
| `JWT_SECRET` | Long, random, private secret; never reuse the development placeholder |

OAuth callback URLs are built from the configured API origin and the route in the code:

```text
{API_PUBLIC_URL}/api/auth/oauth/google/callback
{API_PUBLIC_URL}/api/auth/oauth/github/callback
```

For local development these are exactly:

```text
http://localhost:8000/api/auth/oauth/google/callback
http://localhost:8000/api/auth/oauth/github/callback
```

In production, replace `{API_PUBLIC_URL}` with the actual public FastAPI origin shown by the backend host. Do not use the Vercel website URL as the provider callback: the callback belongs to the API. Configure HTTPS for the public API. The callback returns the user to the fixed `FRONTEND_URL`; OAuth state is signed, short-lived, and single-use.

### Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create the project.
2. Configure Google Auth Platform branding and audience. For an app still in testing, add the test accounts; complete the production publishing/verification steps Google requests before opening sign-in to everyone.
3. Create an OAuth client of type **Web application**.
4. Add the exact local and production API callback URLs above under **Authorized redirect URIs**.
5. This server-side OAuth flow does not use a Google JavaScript SDK, so it does not require an authorized JavaScript origin. Do not enter the Vercel root as a redirect URI.
6. Copy the client ID and secret into the FastAPI host's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never put the secret in Vercel's `VITE_*` variables or frontend source.

### GitHub OAuth App

1. Open **GitHub → Settings → Developer settings → OAuth Apps** and create an OAuth App.
2. Set **Homepage URL** to `https://energeia-drab.vercel.app`.
3. Set **Authorization callback URL** to the exact production API URL: `{API_PUBLIC_URL}/api/auth/oauth/github/callback`.
4. GitHub OAuth Apps have one callback URL. For local development, create a separate development OAuth App with homepage `http://localhost:5173` and callback `http://localhost:8000/api/auth/oauth/github/callback`; use its credentials only in the local backend `.env`.
5. Store the app's client ID and secret in the corresponding backend environment variables. GitHub sign-in requests `read:user` and `user:email`, then requires a verified primary email.

The backend refuses to auto-link an OAuth identity to a password account based only on a matching email. Sign in to the existing Energia account first, then connect Google or GitHub from **Account settings**. Users can see connected providers there; this version does not offer provider disconnection or account deletion.

## Password-reset email

Configure an SMTP account with TLS and an authorized sender address in the FastAPI host's environment. Use port 587 with `SMTP_USE_SSL=false` for STARTTLS, or port 465 with `SMTP_USE_SSL=true` for implicit TLS. Password-reset tokens are random, stored as hashes, expire after 30 minutes, and can be used once. Requests are limited per account to one in 15 minutes. Without SMTP configuration, reset requests return an explicit service-unavailable error.

## Vercel

In **Vercel Dashboard → Project → Settings → Environment Variables**, set:

```text
VITE_API_URL=https://<your-public-fastapi-origin>/api
```

Use the actual backend service origin; no backend host was discoverable from this source tree, so the placeholder must be replaced. Set it for **Production** and for **Preview** only if preview deployments should call the production API. This variable is public by design. Do not add Google/GitHub client secrets, SMTP credentials, `DATABASE_URL`, or `JWT_SECRET` to frontend variables.

Set `FRONTEND_URL=https://energeia-drab.vercel.app` and include that exact origin in backend `CORS_ORIGINS`. Vercel preview origins are not automatically trusted. This setup sends OAuth users back to the canonical `FRONTEND_URL`; preview OAuth is not enabled unless you deliberately configure an appropriate separate backend/frontend environment.

## Important production prerequisites

- Add links to the actual Terms of Service and Privacy Policy before collecting consent. The repository does not contain approved legal policy pages, and this implementation cannot invent the operator's identity, contact details, or retention obligations.
- Email verification for password sign-ups, account deletion/data-retention workflows, and provider disconnection are not implemented. Existing accounts retain their existing sign-in method; new OAuth-only accounts can add a password through the reset-email flow.
- Add API-side or hosting-level rate limits for registration, login, and OAuth initiation before opening the service publicly. Password-reset email requests have a per-account cooldown, but the app does not include a distributed IP-based rate limiter.
- Existing bearer tokens are stored in browser local storage, following the app's pre-existing session architecture. Use a security review and a suitable XSS/CSRF session strategy before treating the current setup as a security certification.
- Configure provider credentials, SMTP, CORS, the public API URL, database migration, and production secrets before testing production sign-in. No production OAuth flow can be confirmed until real credentials are installed and tested.

## Verification

After configuring credentials, test locally using the local callbacks first. Then deploy the frontend and API, apply the migration, set production environment variables, and test both providers, profile completion, account linking, email reset, and existing dashboard features. A successful Vercel build alone does not verify OAuth or backend connectivity.
