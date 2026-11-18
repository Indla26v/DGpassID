# Public analytics security

The dashboard stays public. Visitors do not connect directly to PostgreSQL: browser → HTTPS aggregate API → restricted Neon reporting login. Database credentials are server-only Vercel Secrets, never NEXT_PUBLIC variables or client responses.

## Database boundary

- `dgp_analytics_reader`: SQL-created LOGIN with a random 384-bit password, no role memberships, no superuser/createdb/createrole/bypassrls privileges, and no table or column grants.
- It can execute only the application summary function `pass_analytics.snapshot(integer,text)` in the isolated reporting schema, alongside ordinary PostgreSQL public/system functions. It cannot select raw pass records, authentication tables, or audit logs.
- The function validates the finite filters again inside PostgreSQL. Its body uses fixed SQL without dynamic expressions or SQL strings, a pinned `pg_catalog, pg_temp` search path, and qualified table names. PUBLIC execute access is revoked in the same setup transaction.
- The function owner is a separate NOLOGIN role, `dgp_analytics_executor`, granted SELECT on only the eleven operational columns needed for summaries. It has no permission to select names, identifiers, phone numbers, photos, passwords, signatures or verification tokens. The reporting login is not a member of this owner role.
- The login defaults to read-only transactions, but permission denials remain effective after turning that setting off. Connections use TLS with certificate/hostname verification, 5-second statement and 1-second lock timeouts, 5-second idle transaction timeout, and a role connection limit of eight. Each application process pools at most two connections.
- SQL provisioning creates only the isolated reporting roles/schema/function and grants. It does not modify pass data or the desktop application's account permissions. Keep the admin credential out of this deployment.

## Application boundary

- Only 20 normalized filter combinations are accepted. Unknown, duplicate, oversized, malformed, or injection-style parameters are rejected before database access. Query parameters are bound, never interpolated into SQL.
- A shared Next.js data cache keeps aggregate snapshots for 30 seconds; concurrent matching requests are coalesced within a process.
- A bounded per-process limiter allows 60 API requests per IP per minute and returns HTTP 429. On Vercel it uses the ingress-provided x-real-ip header. It is **not** a distributed or global rate limit; multiple function instances can collectively exceed it. Vercel's default DDoS protections remain active; no custom WAF rules were enabled.
- CSP uses a fresh per-request script nonce with strict-dynamic. Other headers block framing, disable content sniffing, restrict device capabilities, require HTTPS, and avoid referrer disclosure. Inline CSS remains permitted for chart/UI styles. Cache-Control prevents reusing nonce-bearing HTML.
- React escapes database labels. No raw HTML rendering, database mutations, login routes, admin routes, uploads or raw-record exports are exposed. Errors do not return connection strings, SQL, or database messages. robots/noindex is an indexing preference, not access control.

## Verification

`npm run test:security` exercises all 20 summary combinations, filter rejection and per-process throttling. Real database tests assert that private and operational record reads, updates/deletes (zero-row probes), schema writes and role escalation are denied with SQLSTATE 42501, even after disabling default read-only mode. DDL probes run inside transactions and are rolled back. No production pass rows are changed.

## Operational limits

- Public aggregates can be copied and small counts may reveal operational activity. Public access does not provide confidentiality for these published counts.
- No system can be guaranteed immune from attacks. Dependency maintenance, credential rotation, account MFA, and traffic/error monitoring still matter.
- The database network endpoint remains internet-reachable with credential authentication and verified TLS. An IP allowlist/private network was not configured, because the existing desktop clients and serverless egress require a coordinated network plan.
- The first deployment used the existing database owner credential. Replacing a project environment variable does not remove credentials embedded in prior deployments. Retire that deployment and avoid rolling back to it. Rotating the existing owner's password must be coordinated with the desktop clients using that account.
- This change secures the analytics application's database access; it is not an audit of the full desktop application or other users of the shared Neon database.
