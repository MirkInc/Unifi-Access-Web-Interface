# UniFi Access Web Interface

A self-hosted web application for managing and monitoring [UniFi Access](https://ui.com/door-access) door controllers. Built with Next.js 14, MongoDB, and the UniFi Access Developer API.

## Features

- **Multi-tenant / multi-site** — manage multiple UniFi Access sites from a single dashboard
- **Door control** — unlock doors, set temporary unlock timers, keep-unlock schedules, and lock-early overrides
- **Live status** — real-time door lock/unlock state via UniFi WebSocket
- **Access logs** — paginated, filterable activity log with granted/denied breakdown, export to Excel
- **Activity chart** — hourly (1D) and daily (1W / 1M / 3M / custom) bar charts per door
- **Webhook events** — Door Status tab showing open/close, lock/unlock, schedule, temp-unlock, and emergency events via UniFi webhooks
- **Smart log caching** — timezone-aware per-day MongoDB cache reduces UniFi API calls from seconds to ~400 ms
- **Role-based access control** — admin and per-door permissions (`canUnlock`, `canViewLogs`, `canSetLockRule`)
- **User management** — invite users by email (via Resend), password reset flow, email confirmation
- **Admin panel** — manage sites, sync doors, register/remove webhooks

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | MongoDB + Mongoose |
| Auth | NextAuth.js (credentials) |
| UI | Tailwind CSS, Radix UI, Recharts |
| Email | Resend |
| UniFi API | Custom client (REST + WebSocket) |

## Requirements

- Node.js 18+
- MongoDB 6+ (local or Atlas)
- UniFi Access controller (firmware 2.2.10+ for webhook support)
- UniFi Access API token (Access → Settings → General → Advanced → API Token)
- (Optional) [Resend](https://resend.com) account for email

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd unifi-access-web
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/unifi-access

# NextAuth
NEXTAUTH_SECRET=your-random-secret-here
NEXTAUTH_URL=http://localhost:3000

# Resend (optional — for invite/password-reset emails)
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM=noreply@yourdomain.com
```

Generate a `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first run you will be redirected to `/setup` to create the initial admin account.

### 4. Add your first site

1. Log in as admin and go to **Admin → Sites**
2. Click **Add Site** and enter your UniFi Access host (e.g. `10.0.1.1:12445`) and API token
3. Click **Sync Doors** to import all doors from the controller
4. (Optional) Click **Register Webhook** and enter the base URL where your app is reachable from the UniFi controller (e.g. `http://10.0.2.230:3000`)

## Production Deployment

```bash
npm run build
npm start
```

Or deploy to any platform that supports Next.js (Vercel, Railway, Docker, etc.).

### Docker (example)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Webhook Setup

Webhooks enable the **Door Status** tab (open/close events, lock state changes, schedules, emergencies). UniFi Access requires the webhook endpoint to be reachable over HTTPS or HTTP from the controller's network.

1. In the admin panel, go to **Sites** and expand a site
2. Enter the base URL your app is reachable at from the controller (e.g. `http://10.0.2.230:3000`)
3. Click **Register Webhook** — the app registers 7 event types with your UniFi controller and stores the HMAC secret automatically
4. Events appear in the **Door Status** tab on each door's detail page

To remove a webhook, click **Remove** — this also deregisters it from the UniFi controller.

## API Overview

All API routes require authentication (session cookie) except the webhook receiver.

| Route | Method | Description |
|---|---|---|
| `/api/logs` | GET | Fetch access logs (with smart cache) |
| `/api/logs/export` | GET | Export logs to Excel |
| `/api/webhook-events` | GET | Fetch door status events from webhooks |
| `/api/webhooks/unifi/[tenantId]` | POST | Public webhook receiver (HMAC-verified) |
| `/api/doors/[doorId]/unlock` | PUT | Unlock a door |
| `/api/doors/[doorId]/lock-rule` | PUT | Set lock rule (temp/keep/schedule) |
| `/api/doors/[doorId]/status` | GET | Live door status (SSE) |
| `/api/tenants/[id]/sync` | POST | Sync doors from UniFi controller |
| `/api/tenants/[id]/webhook` | POST/DELETE | Register / remove webhook |

## Log Cache

To minimize latency and UniFi API load, the app maintains a per-door, per-day MongoDB cache:

- **Fast path** (< 500 ms): fully cached past days + today-only live fetch
- **Backfill**: triggered automatically on first load or after a sync — fetches up to 5,000 historical events
- Cache keys are stored in the **tenant's local timezone** (e.g. America/Chicago), so day boundaries always align with local midnight

## Project Structure

```
app/
  admin/          # Admin-only pages (sites, users, logs)
  dashboard/      # Main door dashboard
  door/[doorId]/  # Door detail page (control + logs + chart)
  api/            # All API routes
components/       # Shared UI components
lib/              # Auth, MongoDB, UniFi client, cache utilities
models/           # Mongoose schemas
```

## License

MIT
