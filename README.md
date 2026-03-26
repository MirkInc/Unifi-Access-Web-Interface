# UniFi Access Web Interface

Self-hosted, multi-site UniFi Access management UI built with Next.js, MongoDB, and NextAuth.

This project gives you:
- A user-facing door dashboard
- Per-door control and visibility permissions
- A site-level admin portal
- Activity and door-status history with export
- UniFi webhook ingestion and event streaming

## What This App Does

### User experience
- Site Manager homepage listing consoles the user can access
- Console dashboard showing assigned doors and current state
- Door detail page with:
  - Live lock/position/controller state
  - Door controls (based on permissions)
  - Unlock schedule visualization
  - Activity chart + log with Excel export

### Admin experience
- Console/site management (add/edit/delete, sync doors)
- User management and per-door permissions
- Door admin settings (including first-person-in requirement)
- Schedule assignment visibility and updates
- Webhook registration/removal per console

### Data behavior
- Real-time-ish updates via:
  - UniFi webhook events
  - Server-Sent Events (SSE) fanout to clients
  - Controlled status refresh fallback
- Log retrieval strategy:
  - Historical days from DB cache
  - Current day fetched live from controller
  - Automatic catch-up caching for missed days

## Tech Stack

- Next.js 16 (App Router)
- React 18
- TypeScript
- MongoDB + Mongoose
- NextAuth (credentials)
- Tailwind + Radix UI
- Recharts
- xlsx export
- Resend (email flows)

## Requirements

- Node.js 18+
- MongoDB 6+ (Atlas or self-hosted)
- UniFi Access controller reachable from this app
- UniFi API token per console

## Quick Start

```bash
git clone <your-repo-url>
cd "Unifi Access Web Interface"
npm install
cp .env.local.example .env.local
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

If this is a fresh database, complete first-time setup at `/setup`.

## Environment Variables

Use `.env.local`:

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `NEXTAUTH_SECRET` | Yes | Session/JWT signing secret |
| `NEXTAUTH_URL` | Yes | Public base URL for auth callbacks |
| `INITIAL_ADMIN_EMAIL` | Yes (initial setup) | Email that can bootstrap admin setup |
| `RESEND_API_KEY` | Optional | Required for invite/reset emails |
| `RESEND_FROM_EMAIL` | Optional | Sender address for email flows |

Generate `NEXTAUTH_SECRET` (PowerShell):

```powershell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

## UniFi Controller Setup

For each console/site:
1. Create API token in UniFi Access.
2. Add site in Admin.
3. Run **Sync Doors**.
4. Register webhook URL from Admin so status events stream into this app.

Notes:
- App must be reachable from the controller for webhook delivery.
- Keep `NEXTAUTH_URL` aligned with your real host (not `localhost` in production).

## Access Model

Roles:
- `admin`: full access to admin portal and all doors
- `user`: restricted to explicitly assigned console/door permissions

Per-door permissions include:
- Unlock
- End schedule early
- Start lockdown/timed unlock
- End lockdown/rule
- View logs

## Runtime Architecture

- Client requests:
  - `GET /api/tenants/[id]/events` (SSE stream)
  - `GET /api/doors/[doorId]/status` (throttled state refresh)
  - `GET /api/logs` (activity)
- Webhook ingest:
  - `POST /api/webhooks/unifi/[tenantId]`
- Door page lazy sections:
  - Unlock schedule, chart, and log can be collapsed
  - Section state is persisted in `sessionStorage`
  - Data is fetched only when relevant sections are open

## API Highlights

- `GET /api/logs` - unified log fetch
- `GET /api/logs/export` - Excel export
- `GET /api/webhook-events` - normalized door-status events
- `GET /api/doors/[doorId]/status` - current door state
- `GET /api/doors/[doorId]/schedule` - lazy schedule load for door page
- `PUT /api/doors/[doorId]/unlock` - one-time unlock action
- `PUT /api/doors/[doorId]/lock-rule` - lockdown/timed rule actions
- `POST /api/tenants/[id]/sync` - sync doors from UniFi
- `POST/DELETE /api/tenants/[id]/webhook` - register/remove webhook

## Deployment

Production:

```bash
npm run build
npm start
```

Deploy anywhere Node/Next.js is supported (Vercel, Railway, Docker, VM).

Minimum production checklist:
- Set all required env vars
- Use a persistent MongoDB
- Ensure inbound webhook reachability from UniFi consoles
- Use HTTPS in production
- Set `NEXTAUTH_URL` to your public URL

## Security Notes

- Never commit `.env.local` or API keys.
- Rotate UniFi API tokens periodically.
- Restrict admin accounts and audit user door permissions.
- Keep dependencies updated.

## Troubleshooting

- "Controller unreachable": verify host/IP/port, token, and network reachability.
- Webhook events missing: verify webhook registration and route reachability from controller.
- Login redirects to wrong host: correct `NEXTAUTH_URL`.
- Empty dashboard for user: verify console assignment and per-door permissions.

## Project Structure

```text
app/
  admin/                     # admin pages (sites, users, logs, doors, schedules)
  api/                       # route handlers
  dashboard/                 # console dashboard
  door/[doorId]/             # door detail UI
components/                  # shared UI components
lib/                         # auth, db, unifi client, helpers
models/                      # mongoose schemas
types/                       # shared TS types
```

## License

MIT
