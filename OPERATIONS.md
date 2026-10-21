# Campaign-DP Operations Runbook

Operational procedures for the deployed Campaign-DP platform: services, configuration,
deployment, rollback, monitoring, incidents and the pilot launch.

Last verified: 2026-10-21 (production deployment `dpl_DLCzMnSs3XT2eSC3FsJiZKuJ3X3i`).

---

## 1. Services

| Service | Project | Root directory | Production URL |
|---|---|---|---|
| Frontend (SPA) | `deltaos-core/campaign-dp` | `.` (repo root) | https://campaign-dp.vercel.app |
| Backend API | `deltaos-core/deltadp-backend` | `backend` | https://deltadp-backend.vercel.app |

The frontend is a static Vite build served from `frontend/dist`. It calls the
backend directly through `VITE_API_URL` (cross-origin, credentials included) and
also proxies `/api/*` to the backend for same-origin requests.

Both deployments are produced from the same repository, so a single commit
produces a consistent frontend/backend pair.

## 2. Environment variables

Set with `vercel env add <NAME> <project>` (or the dashboard). Secrets must never
be committed, printed or included in the frontend bundle.

### Backend (`deltadp-backend`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes (secret) | PostgreSQL connection string. Must not be a local file. |
| `SUPABASE_URL` | yes | HTTPS origin of the Supabase project. |
| `SUPABASE_ANON_KEY` | yes (secret) | Public key, safe for the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (secret) | Server-only. Never exposed to the frontend. |
| `STORAGE_BUCKET` | yes | Bucket that holds uploads and generated assets. |
| `FRONTEND_URL` | yes | Exact frontend origin. Used for CORS and the CSRF origin check. |
| `CAMPAIGN_PACK_ID` | yes | Pack served to the public template endpoints. |
| `ADMIN_EMAILS` | yes | Comma separated platform administrator accounts. |
| `COOKIE_SECRET` | recommended | Signs the CSRF cookie. Minimum 32 characters. |
| `JWT_SECRET` | optional | Unused by Supabase auth, kept for compatibility. |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | for paid plans | Required before live payment processing. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | optional | Defaults: 100 requests per 60 s. |
| `UPLOAD_MAX_BYTES` / `UPLOAD_MAX_PIXELS` | optional | Defaults: 10 MB and 40 MP. |

### Frontend (`campaign-dp`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | yes | `https://deltadp-backend.vercel.app`. |

### Verifying configuration

```bash
cd backend
npm run check:config        # names and verdicts only, never values
```

The check fails when `NODE_ENV` is not `production`, when an origin is not HTTPS,
when `DATABASE_URL` points at a local database, or when a secret still contains a
placeholder value.

## 3. Deployment

```bash
# 1. Verify locally (tests, types, lint, production build)
npm test
npm run typecheck
npm run lint

# 2. Build the production bundles
npm run build:frontend
cd backend && npm run build:vercel

# 3. Deploy the backend (the repository root must be the deploy source because
#    the Vercel project has "backend" as its root directory)
npx vercel deploy --prod --yes --project deltadp-backend

# 4. Deploy the frontend
npx vercel deploy --prod --yes --project campaign-dp
```

Deploying from inside `backend/` uploads the wrong tree for the backend project
and fails the build. Always deploy from the repository root.

### Database migrations

The backend project builds with `prisma/schema.prod.prisma` (PostgreSQL). The
local development schema is `prisma/schema.prisma` (SQLite) and the two must
stay in sync; `schema.prod.prisma` is the dev schema with the PostgreSQL
provider.

Schema changes are applied with `prisma db push`, which is additive for the
current model set. Apply it from the Vercel build environment when the
`DATABASE_URL` secret cannot be read locally:

```json
"buildCommand": "prisma generate --schema=prisma/schema.prod.prisma && tsc -p tsconfig.build.json && prisma db push --schema=prisma/schema.prod.prisma"
```

Remove the `prisma db push` step once the migration has been applied, and deploy
again. Never run a destructive migration (dropping columns or tables) against
production without an explicit decision and a backup.

## 4. Rollback

Vercel keeps every deployment. To roll back:

```bash
# 1. List the deployments of each project
cd backend && npx vercel ls
npx vercel ls

# 2. Inspect a candidate deployment
npx vercel inspect <deployment-url>

# 3. Promote the previous good deployment to production
npx vercel promote <deployment-url> --project deltadp-backend
npx vercel promote <deployment-url> --project campaign-dp
```

`vercel promote` re-points the production alias without a rebuild, so a rollback
takes effect in seconds.

Rollback rules:

- Roll back the backend and the frontend together. A frontend that expects a
  newer API contract can break the supporter journey.
- If the rollback crosses a database migration, the migration must be
  backwards compatible with the previous code. Migrations in this project are
  additive (new tables and nullable columns) so the older code keeps working.
- Verify after rollback: `npm run check:uptime` in `backend` and a manual
  supporter journey.

## 5. Monitoring and uptime

| Signal | Where |
|---|---|
| Health | `GET https://deltadp-backend.vercel.app/api/health` |
| Uptime probe | `cd backend && npm run check:uptime` (add `--base <url>` for another deployment) |
| Scheduled probe | Vercel cron on `deltadp-backend` hits `/api/health` daily at 06:00 UTC; failures appear in the project observability tab |
| Request logs | `npx vercel logs <deployment-url>` from the project directory |
| Error tracking | Vercel deployment observability (function errors, latency percentiles) |
| Usage events | `POST /api/analytics` events and the admin analytics endpoints |

The health endpoint answers with HTTP 200 and reports `status`, `database`,
`environment` and `uptimeSeconds`. `status` is `degraded` when the database is
unreachable, which is what a probe should alert on.

Cron frequency is limited by the Vercel plan (daily on Hobby). For continuous
monitoring, run `npm run check:uptime` from an external scheduler (GitHub
Actions, cron on a small VM) every few minutes.

Logs never contain session cookies, bearer tokens or CSRF tokens: the server
redacts `authorization`, `cookie`, `x-csrf-token` and `set-cookie`
(`backend/src/lib/logger.ts`). Uploaded photographs and request bodies are not
written to the log.

## 6. Incident response

Severity:

- **SEV1** — the supporter journey is broken (templates, upload, generation or
  download fail) or the API is returning 5xx for most requests.
- **SEV2** — a campaign organization cannot manage templates or members, or
  payments fail.
- **SEV3** — a non-critical defect, degraded performance or a cosmetic issue.

SEV1 and SEV2 response:

1. Check `GET /api/health` and `npx vercel logs` for the failing route.
2. If a recent deployment is the cause, roll it back (section 4).
3. If the database is unreachable, check the provider status and the
   `DATABASE_URL` secret; the health endpoint reports `database: "error"`.
4. If a quota or rate limit is the cause, check `RATE_LIMIT_MAX` and the
   `RateLimitBucket` table; expired buckets are pruned with
   `POST /api/admin/rate-limit/cleanup`.
5. Record the timeline (UTC), the affected endpoints and the remediation. A
   post-incident summary belongs in the repository.

## 7. Pilot launch

A pilot runs with one authorized campaign organization.

### Before the pilot

- [ ] `npm test`, `npm run typecheck`, `npm run lint` are green.
- [ ] `npm run check:config` passes against the production environment.
- [ ] `npm run check:uptime` passes for the production backend.
- [ ] The pilot organization exists with the `campaign_manager` or `org_admin`
      role, and its campaign and packs are published.
- [ ] The public campaign page loads on a mid-range Android phone over a slow
      connection and the generated image downloads.

### During the pilot

- [ ] Watch `npx vercel logs` and the Vercel observability tab for 5xx spikes.
- [ ] Review generation success, latency and error counts daily.
- [ ] Collect consent-based feedback and record it with the date and the
      organization.
- [ ] Fix SEV1 defects before inviting the next organization.

### After the pilot

- [ ] Compare the observed generation success rate, latency and support volume
      with the release targets.
- [ ] Record the actual operating cost per generated asset.
- [ ] Adjust features and pricing based on the observed behaviour rather than
      on the original hypothesis.

## 8. Known limitations

- The backend runs as a Vercel serverless function: cold starts add roughly
  0.5–3 s to the first request after an idle period. Read-only endpoints load
  `sharp` on demand to keep the cold start short.
- Scheduled uptime checks run daily on the current Vercel plan.
- Production deployments are protected by Vercel authentication for the team
  account; the public aliases remain reachable by supporters.
- There is no separate staging environment. Preview deployments inherit the
  production configuration only where the plan allows preview environment
  variables; a preview deployment without `DATABASE_URL` cannot serve data.
