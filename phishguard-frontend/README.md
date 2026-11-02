# PhishGuard Frontend (React + Vite)

User and admin dashboard for the PhishGuard backend. **This one I actually
built and ran** — `npm install` and `npm run build` both succeeded in my
sandbox before I packaged it, so you're getting a verified-working app, not
just written code (unlike the backend, where I don't have Maven Central
access to compile — see `phishguard-backend/README.md`).

## Run it

```bash
cd phishguard-frontend
cp .env.example .env      # points at http://localhost:8009 by default
npm install
npm run dev
```

Opens at http://localhost:5173. Requires the backend running at the URL in
`.env` (`VITE_API_BASE_URL`).

## What's here

- **Landing** (`/`) — marketing page
- **Login / Register** (`/login`, `/register`) — JWT auth against `/api/auth/*`
- **Dashboard** (`/dashboard`) — paste a URL, get its live score, reasons,
  and a raw score-breakdown panel
- **History** (`/history`) — your own paginated scan history
- **Admin Dashboard** (`/admin`, `ROLE_ADMIN` only) — total/safe/moderate/
  suspicious/dangerous counts, a doughnut chart of threat distribution,
  most-targeted domains, and the latest dangerous URLs caught

Dark, glassmorphism, cybersecurity-themed UI per the original spec. Auth
state lives in `AuthContext` (`src/context/AuthContext.jsx`) and the JWT is
attached to every request by an axios interceptor (`src/api/client.js`) —
a 401 anywhere logs the user out automatically.

## Admin login

Use the seeded default admin from the backend:
`admin@phishguard.local` / `ChangeMe123!`

## What's deliberately not built here

CSV/PDF export and the heatmap/country-analysis view from the original spec
aren't in this pass — the stats/chart infrastructure (`AdminDashboard.jsx`)
is there to extend, but I didn't want to hand you an "Export" button that
silently does nothing.
