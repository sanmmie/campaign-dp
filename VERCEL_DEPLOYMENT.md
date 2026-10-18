# Vercel Deployment Guide for Multi-Service App

This is a monorepo with two services that must be deployed as **separate Vercel projects**:

## 1. Frontend Project (Vercel Project 1)
- **Root Directory**: `frontend/`
- **Framework Preset**: Vite
- **Build Command**: `npm run build:vercel` (or `npm run build`)
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Environment Variables (Frontend)
```
VITE_API_URL=https://your-backend-project.vercel.app
```

---

## 2. Backend Project (Vercel Project 2)
- **Root Directory**: `backend/`
- **Framework Preset**: Other
- **Build Command**: `npm run build:vercel` (or `npm run build`)
- **Output Directory**: `dist`
- **Main Entry**: `dist/vercel.js`
- **Install Command**: `npm install`

### Environment Variables (Backend)
```
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STORAGE_BUCKET=campaign-assets
STORAGE_REGION=us-east-1
JWT_SECRET=your-jwt-secret-min-32-chars
ADMIN_EMAILS=admin@example.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
UPLOAD_MAX_BYTES=10485760
UPLOAD_MAX_PIXELS=40000000
CAMPAIGN_PACK_ID=renewed-hope-2027
CAMPAIGN_AUTHORIZED_BY=
CAMPAIGN_DISCLAIMER="User-generated campaign material. Not an official communication."
FRONTEND_URL=https://your-frontend-project.vercel.app
REDIS_URL=redis://localhost:6379
```

---

## Deployment Steps

### Option A: Two Separate Projects (Recommended)
1. Import the GitHub repo in Vercel
2. Create **Project 1**: Select `frontend/` as root directory
3. Create **Project 2**: Select `backend/` as root directory
4. Configure environment variables for each
5. Update `VITE_API_URL` in frontend to point to backend URL

### Option B: Monorepo (Single Project)
1. Import the GitHub repo in Vercel
2. Root directory: `/` (repository root)
3. Uses root `vercel.json` with API functions in `api/`
4. Requires `npm run build:vercel` at root to build both

---

## Required: Database Setup

The backend requires a **PostgreSQL database** (not SQLite). Use:
- **Supabase** (recommended - provides PostgreSQL + Auth + Storage)
- **Neon** (serverless PostgreSQL)
- **Railway** / **Render** / **AWS RDS**

Run migrations after setting DATABASE_URL:
```bash
npx prisma db push
npx prisma db seed
```

---

## Required: Supabase Setup

1. Create Supabase project
2. Enable Email/Password auth
3. Create storage bucket: `campaign-assets`
4. Set CORS policies for your frontend domain
5. Copy credentials to Vercel environment variables

---

## Troubleshooting

### "JSON.parse: unexpected character" errors
- API returning HTML instead of JSON
- Check: API routes are correctly deployed
- Check: Environment variables are set
- Check: CORS configuration

### 500 errors on auth endpoints
- Missing Supabase credentials
- Database connection failed
- Check Vercel function logs

### CORS errors
- Ensure `FRONTEND_URL` in backend matches your frontend Vercel URL exactly
- Include protocol (https://) and no trailing slash

### Favicon 404
Add `public/favicon.ico` to frontend or disable in browser

---
## Phase 8 — Organization management, onboarding & white-label

### New API endpoints (backend)

All endpoints are under `/api/organizations/:organizationId` and require
authentication plus organization membership (`requireOrganizationAccess`) or
an admin role within the organization (`requireOrganizationRole`).

| Endpoint | Method | Required role | Purpose |
|---|---|---|---|
| `/:organizationId/settings` | PATCH | org_admin / platform_admin | Update white-label + Nigerian structure settings |
| `/:organizationId/branding` | PATCH | org_admin / platform_admin | Update configurable organization branding |
| `/:organizationId/status` | PATCH | org_admin / platform_admin | Suspend / reactivate / cancel (offboard) |
| `/:organizationId/members/:userId` | PATCH | org_admin / platform_admin | Update coordinator role |
| `/:organizationId/members` | GET/POST/DELETE | org_admin / platform_admin | List / add / remove members |

### Organization model additions

New fields on `Organization` (backward-compatible, nullable):
- `brandPrimary`, `brandSecondary`, `brandAccent` — hex color values
- `brandLockupId` — reference to a `PackAsset` used as the org brand lockup
- `defaultHeadline`, `defaultSubhead` — default campaign copy
- `state`, `lga`, `ward` — Nigerian organizational structure
- `settings` (JSON) — white-label config: `customDomain`, `contactEmail`, `appName`, `supportEmail`

`status` accepts `active`, `suspended`, `cancelled`.

### Onboarding procedure
1. Authenticated user calls `POST /api/organizations` with `name` and `slug`.
2. The creator becomes the organization `owner` and an `org_admin` membership is created.
3. Organization is created with `status: "active"` and `plan: "supporter"`.
4. Optional: configure branding via `PATCH /:organizationId/branding`.
5. Optional: configure structure (`state`/`lga`/`ward`) and white-label settings via `PATCH /:organizationId/settings`.
6. Add coordinators via `POST /:organizationId/members` and assign roles.

### Offboarding procedure
1. `PATCH /:organizationId/status` with `status: "suspended"` to temporarily disable.
2. `PATCH /:organizationId/status` with `status: "cancelled"` to offboard (retains data for audit).
3. Remove members via `DELETE /:organizationId/members/:userId` before or after cancellation.
4. Reactivate a suspended organization with `status: "active"`.

### White-label configuration strategy
Stored in `Organization.settings` (JSON):
- `customDomain` — supporter-facing custom domain (DNS configured by customer)
- `contactEmail` — organization contact address
- `appName` — application identity shown in UI
- `supportEmail` — support contact address

Branding (colors, lockup asset, default headline/subhead) is stored in dedicated columns for efficient querying and template rendering.

### Tenant isolation
All organization-scoped resources (`Campaign`, `CampaignPack`, `Template`, `Project`, `GenerationRecord`, `Subscription`) carry `organizationId` with a foreign key to `Organization` and `onDelete: Cascade`. Every organization-scoped route verifies membership via `requireOrganizationAccess`/`requireOrganizationRole` and filters Prisma queries by `organizationId`, preventing cross-organization access.
