# DGP Pass Analytics

Public, read-only Next.js dashboard connected to the existing Neon `passes` table. No login or mutations. Personal details and audit records are never selected or returned.

Run `npm install`, configure `DATABASE_URL` in `.env.local`, and run `npm run dev` (port 3100). Validate with `npm run build`.

For local development, a loopback PostgreSQL instance can use the restricted reporting login without TLS. Deployed connections use certificate and hostname verification.

The creation-period and institution filters apply to all metrics. Printed means a unique pass with a recorded print count or a PRINTED/ISSUED status, including subsequent status changes. Print runs count recorded copies; reprints count copies after the first. Creation trends use Asia/Kolkata calendar dates and exclude deleted passes. Zone counts can overlap. This is a current registry snapshot, not historical audit reporting.

`GET /api/analytics?days=0&institution=ALL` accepts days 0, 7, 30, 90 and institutions ALL, IISER, IIT, ICI, OTHER (with ICU supported for backwards compatibility). The database enforces access through a single aggregate-only function. Invalid/duplicate/unknown filters return 400; connection failures return 503 with a generic message. The browser refreshes every 60 seconds, backed by a 30-second server data cache. CSV exports contain aggregate counts only.

Deploy this directory as a Next.js Vercel project on Node 24 with a server-only encrypted `DATABASE_URL`. Deployment protection is disabled as requested. Do not add a NEXT_PUBLIC database connection variable. On an existing deployment, apply the shared office migration first, then rerun `db/analytics-security.sql` as the database owner in one transaction. The office breakdown and CSV include all four offices and Unassigned, with the same filters as the rest of the dashboard.

See SECURITY.md for the reporting role setup, verified permission boundaries, and remaining operational limitations. Run `npm run test:security` after configuring the restricted connection. The one-time provisioning script and SQL are administrative tools and should be excluded from deployment packages.
