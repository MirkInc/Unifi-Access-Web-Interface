# Access Portal — Setup Guide

## Prerequisites
- Node.js 18+ (download from https://nodejs.org)
- MongoDB Atlas account (free at https://mongodb.com/atlas)
- Resend account for emails (https://resend.com)

---

## 1. Install Node.js
Download and install Node.js LTS from https://nodejs.org, then restart your terminal.

## 2. Install Dependencies
```bash
cd "F:\Unifi Access Web Interface"
npm install
```

## 3. MongoDB Atlas Setup
1. Create a free cluster at https://mongodb.com/atlas
2. Create a database user with read/write access
3. Get your connection string: **Cluster → Connect → Drivers → Node.js**
   - It looks like: `mongodb+srv://user:pass@cluster.mongodb.net/`
   - Add `/unifi-access` at the end for the database name

## 4. Resend Setup (Email)
1. Sign up at https://resend.com
2. Go to API Keys → Create API Key
3. Add a "From" domain (or use the free `onboarding@resend.dev` for testing)

## 5. Configure Environment Variables
```bash
cp .env.local.example .env.local
```
Then edit `.env.local` and fill in:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/unifi-access?retryWrites=true&w=majority
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

Generate a secret:
```bash
# On Windows PowerShell:
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
# Or use: https://generate-secret.vercel.app/32
```

## 6. Run the App
```bash
npm run dev
```
Open http://localhost:3000

## 7. First-Time Setup
1. Go to http://localhost:3000/setup
2. Create your admin account
3. Log in at http://localhost:3000/login

---

## 8. Add Your First Site
1. Log in as admin → Management Portal → Sites
2. Click **Add Site**
3. Enter:
   - Site Name (e.g., "Main Office")
   - Controller URL: `192.168.1.1:12445` (your UniFi console IP + port 12445)
   - API Key: generate from UniFi Access → Settings → General → Advanced → API Token
4. Click **Sync Doors** to pull doors from the controller

## 9. Create Users
1. Go to **Users → Create User**
2. Choose to send an invite email OR set a password manually
3. Click **Manage Access** to assign which doors the user can control

## 10. Deploy to Vercel
```bash
npm install -g vercel
vercel
```
Then set the same environment variables in the Vercel dashboard under **Settings → Environment Variables**.

Change `NEXTAUTH_URL` to your Vercel deployment URL (e.g., `https://your-app.vercel.app`).

---

## UniFi Access API Notes
- The API runs on port 12445 of your UniFi console (UDM Pro, UCK G2, etc.)
- The controller uses a self-signed HTTPS certificate — this app handles that automatically
- API keys are created under: UniFi Access → Settings → General → Advanced → API Token
- Required permission scopes: `view:space`, `edit:space`, `view:system_log`

## Project Structure
```
app/
  login/          Login page
  setup/          First-time admin setup
  dashboard/      Tenant user door dashboard
  door/[doorId]/  Individual door detail + controls
  admin/
    tenants/      Manage sites/controllers
    users/        Manage users
    users/[id]/   Configure user door permissions
    logs/         Activity log viewer
  api/            REST API routes
components/       Shared UI components
lib/              MongoDB, UniFi client, utilities
models/           Mongoose data models
```
