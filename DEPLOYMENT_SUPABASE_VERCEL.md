# Sanchay Production Deployment Guide: Supabase & Vercel

This guide provides the complete, step-by-step instructions to deploy **Sanchay (Public Asset Intelligence)** to **Supabase** (PostgreSQL database & Storage) and **Vercel** (Next.js serverless application hosting), matching the exact production architecture used by EasyLife.

---

## Architecture Overview

```
                      ┌───────────────────────────────────────────────┐
                      │              Vercel (Next.js 16)              │
                      │  Region: bom1 (Mumbai, India)                │
                      │                                               │
                      │  • Serverless API Route Handlers (Node.js)    │
                      │  • Security Middleware (proxy.ts + CSP)       │
                      │  • Client-side UI & MapLibre Web Workers      │
                      │  • Vercel Crons (/api/cloud/sync-jobs/process)│
                      └──────┬────────────────────────────────┬───────┘
                             │                                │
            Transaction      │                                │  Storage API
            Pooler (6543)    │                                │  (Service Role)
                             ▼                                ▼
              ┌─────────────────────────────┐  ┌─────────────────────────────┐
              │    Supabase PostgreSQL      │  │      Supabase Storage       │
              │  Region: ap-south-1         │  │                             │
              │                             │  │  Bucket: "sanchay-files"    │
              │  • Prisma ORM Schema        │  │  • Private bucket           │
              │  • Exclusion Constraints    │  │  • 5-min signed URLs        │
              │  • Append-Only Audit Trigger│  │  • PUC, insurance, photos   │
              │  • RLS Enabled (Deny-All)   │  └─────────────────────────────┘
              └─────────────────────────────┘
```

---

## Step 1: Create and Configure Supabase Project

### 1.1 Create the Project
1. Log in to [Supabase](https://supabase.com).
2. Click **New project**.
3. Choose your organization, set the project name to `sanchay` (or your preferred name).
4. Set a strong **Database Password** (store this safely).
5. Set **Region** to `ap-south-1` (Mumbai, India) to ensure lowest latency with Vercel's `bom1` Mumbai region.
6. Click **Create new project** and wait ~2 minutes for provisioning.

---

### 1.2 Retrieve Connection Strings & API Keys

Go to **Project Settings** in the Supabase dashboard:

#### Database Connection Strings (Project Settings → Database)
Scroll down to **Connection string**:
1. **Transaction Pooler (Port 6543)** — Select **Mode: Transaction**:
   ```
   postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
   ```
   *This becomes your `DATABASE_URL` on Vercel.*

2. **Session / Direct Connection (Port 5432)** — Select **Mode: Session** (or Direct):
   ```
   postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```
   *This becomes your `DIRECT_URL` (used for `prisma db push` schema migrations).*

#### API Keys (Project Settings → API)
1. **Project URL**: `https://[YOUR-PROJECT-REF].supabase.co` (`NEXT_PUBLIC_SUPABASE_URL`)
2. **Project API Keys**:
   - `anon` `public` key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - `service_role` `secret` key (`SUPABASE_SERVICE_ROLE_KEY`) — *Never expose to client*

---

### 1.3 Create Storage Bucket

1. In the Supabase left sidebar, click **Storage**.
2. Click **New bucket**.
3. Bucket Name: `sanchay-files`
4. Toggle **Public bucket**: **OFF** (Keep it Private; Sanchay issues authenticated short-lived HMAC / Supabase signed URLs for secure document access).
5. Click **Save**.

---

## Step 2: Push Database Schema, Constraints, RLS & Seed

You can apply the database schema, constraints, and demo data directly from your local environment to Supabase before deploying to Vercel.

### 2.1 Set Temporary Local Environment Variables
Create or update `.env.local` in your project root with your live Supabase credentials:

```env
DATABASE_URL="postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
SANCHAY_AUTH_SECRET="e6642061ef15c41eae041ba684f660aa4fd5950792d81d93455f8ba5273106f1"
SANCHAY_ADMIN_USERNAME="admin"
SANCHAY_ADMIN_PASSWORD="Sanchay@Demo1"
```

### 2.2 Run Schema Synchronization & DB Constraints
Run the synchronized schema migration script:
```bash
npm run db:push
```
This performs two critical operations:
1. `prisma db push`: Pushes all 30 models from `prisma/schema.prisma` directly to Supabase Postgres.
2. `prisma db execute --file prisma/post-push.sql`: Applies low-level database constraints that Prisma cannot express:
   - `btree_gist` extension
   - Overlap exclusion constraint on `Allocation` (preventing double-booking race conditions)
   - Append-only audit trigger on `AuditLog`
   - Strict domain CHECK constraints (eligibility states, period validity, coordinates)

### 2.3 Enforce Row-Level Security (RLS)
Sanchay routes all database queries through the secure server-side Prisma client. To prevent any unauthorized read/write access via Supabase's auto-generated PostgREST client, lock down all 30 tables:
```bash
npm run db:rls
```
*Output: `RLS configuration complete. All tables are shielded from public PostgREST access.`*

### 2.4 Seed Gwalior Demo Fleet & Operator Accounts
Seed the deterministic Gwalior demo dataset (vehicles, stations, telemetry, departments, and maintenance records):
```bash
npm run db:seed -- --force
```

---

## Step 3: Deploy to Vercel

### 3.1 Import the Repository
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Import `sillypari/SanchayNew` (or your GitHub repo).
4. Project Configuration:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build` (Default)
   - **Output Directory**: `.next` (Default)
   - **Install Command**: `npm install` (Default)

---

### 3.2 Configure Environment Variables in Vercel

In the Vercel **Environment Variables** section, add the following keys for **Production**, **Preview**, and **Development**:

| Variable Name | Required | Example / Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | **Yes** | `postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | **Yes** | `postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres` |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | `https://[ref].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | `eyJhbGciOi...` (Supabase Anon Key) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | `eyJhbGciOi...` (Supabase Service Role Key) |
| `SUPABASE_STORAGE_BUCKET` | **Yes** | `sanchay-files` |
| `SANCHAY_AUTH_SECRET` | **Yes** | 64-character random hex string (`openssl rand -hex 32`) |
| `SANCHAY_ADMIN_USERNAME` | **Yes** | `admin` |
| `SANCHAY_ADMIN_PASSWORD` | **Yes** | Strong password (e.g. `Sanchay@Demo1`) |
| `SANCHAY_IOT_INGEST_TOKEN` | **Yes** | 64-character random hex string for GPS/IoT telemetry ingest |
| `CRON_SECRET` | **Yes** | 32-character random string (used for Vercel Cron authentication) |

#### Optional AI & Telemetry Configuration

| Variable Name | Default / Example | Notes |
| :--- | :--- | :--- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `AIzaSy...` | Enables Google Gemini Document OCR & Assistant |
| `GEMINI_CHAT_MODEL` | `gemini-3.8-flash` | Gemini model name |
| `NVIDIA_API_KEY` | `nvapi-...` | Optional NVIDIA NIM reasoning key |
| `NVIDIA_CHAT_MODEL` | `nvidia/nemotron-3.5-super-vl-120b-a12b` | NIM model |
| `OPENROUTER_API_KEY` | `sk-or-...` | Optional OpenRouter multi-model fallback |
| `NEXT_PUBLIC_MAP_STYLE_LIGHT` | `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json` | Vector light basemap style |
| `NEXT_PUBLIC_MAP_STYLE_DARK` | `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` | Vector dark basemap style |

---

### 3.3 Deploy
Click **Deploy**.
Vercel will:
1. Run `postinstall` (`prisma generate && node scripts/copy-maplibre-worker.mjs`).
2. Run `build` (`next build`).
3. Deploy serverless routes to the `bom1` (Mumbai) region.
4. Automatically register the Vercel Cron for `/api/cloud/sync-jobs/process` configured in `vercel.json`.

---

## Step 4: Verification & Smoke Test

Once deployed, verify the live production URL:

1. **Login**:
   - Navigate to `https://your-app.vercel.app/login`.
   - Log in with `admin` / your configured `SANCHAY_ADMIN_PASSWORD`.
   - Verify redirection to `/dashboard`.

2. **Fleet Registry & View Toggles**:
   - Visit `/vehicles` and test Table view vs Card view.
   - Visit `/vehicles/discover` and test searching and requesting vehicles.
   - Visit `/vehicles/map` and verify MapLibre vector tiles load with live Gwalior telemetry.

3. **Database Health & Seed Action**:
   - Go to `/settings` → **Database & Operations**.
   - Verify all connection indicators show green.
   - If needed, the **"Reset database to seed fleet"** button can be used by the admin directly from the UI.

4. **Verify Vercel Cron**:
   - In the Vercel Dashboard, go to your project → **Cron Jobs**.
   - Verify that `/api/cloud/sync-jobs/process` is active and scheduled for `*/10 * * * *`.

---

## Demo Operator Logins Reference

When using the seeded Gwalior dataset, the following test operators are available (password for all demo accounts: `Sanchay@Demo1`):

| Username | Role | Organization / Station | Responsibilities |
| :--- | :--- | :--- | :--- |
| `admin` | `ADMIN` | Platform Wide | Full access, settings, seed reset, user management |
| `org_admin_pol` | `ORG_ADMIN` | Gwalior Police Org | Fleet management for police department |
| `dept_off_adm` | `DEPT_OFFICER` | District Administration | Requisition approval & vehicle escalation |
| `stat_off_kot` | `STATION_OFFICER` | Kotwali Police Station | Station fleet dispatch, maintenance & handover |
| `field_p1` | `FIELD_STAFF` | Maharajpura Station | Trip logs, vehicle inspection & returns |
| `auditor_gwal` | `AUDITOR` | District Audit Cell | Read-only compliance, audit log review & export |

---

## Production Gotchas & Best Practices

1. **Prisma Connection Pooling in Serverless**:
   Always include `?pgbouncer=true&connection_limit=1` in your production `DATABASE_URL` pointing to Supabase Port 6543. Because serverless functions scale dynamically, this prevents exhausting PostgreSQL client connections.

2. **Never Run `db:push` or Migrations on Port 6543**:
   Prisma migrations require session-level locks that pgBouncer/Supavisor transaction poolers do not support. Always use `DIRECT_URL` (Port 5432) for running migrations.

3. **Content Security Policy (CSP)**:
   The built-in reverse proxy in [proxy.ts](file:///c:/Users/Parikshit/Desktop/Hackathons/SanchayNew/proxy.ts) automatically includes CSP headers allowing CARTO basemaps, Google Fonts, and your Supabase Storage URL. If using custom tile servers, set `NEXT_PUBLIC_MAP_STYLE_LIGHT` to your style URL.
