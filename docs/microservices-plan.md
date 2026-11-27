# Microservices plan — DGsP/IGsP Conference 2026 pass & bandobast platform

Status: proposal. Nothing here is deployed. The features in this release were built inside the existing
Next.js app (`web/`) but as service-shaped modules, so they can be lifted out one at a time.

## 1. Where we are today

| Piece | Today |
|---|---|
| Web UI + API | One Next.js 15 app (`web/`): React pages + `src/app/api/**` route handlers |
| Data | One PostgreSQL database, raw `pg` client, SQL migrations in `web/db/` and `dotnet-app/src/DgpPass.Core/` |
| Auth | Opaque session cookie `dgp_session`, sessions in `app_sessions`, roles `ADMIN`, `PRINT_TEAM`, `POLICE_PRINT`, `BANDOBAST_OFFICER` |
| Officer record | A row in `passes` with `pass_type = 'POLICE_FORCE'` (identity, rank, DOB, duty posting, print state all in one row) |
| Scheme | Zones/sectors/sub-sectors in `web/src/core/domain/police-zones.ts`; duty points in `bandobast-points.json` |

Pain points a split would address: one table carries identity, deployment and printing concerns;
any change redeploys everything; print bursts and personnel imports compete with the SP's screens for the same
process and DB pool.

## 2. Target services

| # | Service | Owns (data) | Main API | Notes |
|---|---|---|---|---|
| 1 | **Identity & Access** | `app_users`, `app_sessions`, `auth_login_attempts`, zone/sector scopes | login, logout, session, users, scopes | Issues short-lived signed service tokens (JWT, 5 min) from the session cookie at the gateway |
| 2 | **Personnel** | officers: identity, rank, district, DOB/age, photo, Aadhaar (encrypted) | personnel import, officer CRUD, search, `GET /officers?rank=&district=` | Rank groups (`ranks.ts`), personnel parser, age helpers move here |
| 3 | **Deployment** | scheme tree (zones → sectors → sub-sectors → points), `deployment_batches`, officer postings | `POST /selection`, `POST /allot`, `PATCH /points`, `GET /officers?zone=&sector=` | Already isolated in `web/src/modules/deployment/` (pure `selection.ts` + `deployment.repository.ts`) |
| 4 | **ID Card** | card templates, print jobs, print counts, authority signatures | render card, print queue, reprint, issue/hand-over | Reads officer + posting snapshot; rendering can run as a worker |
| 5 | **Verification** | verification tokens, gate scans | `POST /verify` (QR), scan log | Read-heavy, must stay up during the event: scale separately, cache postings |
| 6 | **Audit** | `audit_logs` (append-only) | write via events, query for the audit drawer | Consumes events from all services |
| 7 | **Reporting / Analytics** | read models only | dashboard stats, exports (CSV/XLSX/PDF) | Built from events; the existing `analytics/` app becomes this |

The **Next.js app stays as the gateway / BFF**: it serves the UI, checks the session, and forwards to services
with a service token. Browsers never call services directly.

## 3. Data split

1. **Step 1 – schema per service, same Postgres.** Move tables into schemas `identity`, `personnel`,
   `deployment`, `cards`, `audit`. Each service gets its own DB role with rights only on its schema.
   Cross-schema reads are replaced by API calls or replicated read models.
2. **Split `passes`.**
   - `personnel.officers` — identity, rank, district, DOB, photo, Aadhaar.
   - `deployment.postings` — officer_id, zone, sector, sub_sector, point_code, batch_id (today:
     `police_zone`, `police_sector_number`, `police_sector_name`, `police_point_code`, `deployment_batch_id`).
   - `cards.cards` — pass_number, verification token, status, print counts, signatures.
   A view `public.passes` keeps the old shape during migration so untouched code keeps working.
3. **Step 2 – separate databases** only for services that need independent scaling (Verification, Reporting).

## 4. Communication

- **Synchronous:** REST/JSON between gateway and services; service-to-service only for reads that must be fresh
  (e.g. Deployment asking Personnel for a selection pool).
- **Asynchronous:** transactional **outbox** table per service + a relay to a broker (start with Postgres
  `LISTEN/NOTIFY` or Redis Streams; RabbitMQ/NATS if volume grows). Events:
  - `OfficerImported`, `OfficerUpdated` (Personnel)
  - `OfficersAllotted {batchId, zone, sector, officerIds}`, `DutyPointAssigned {officerIds, point}` (Deployment)
  - `CardPrinted`, `CardIssued` (ID Card)
  - `GateVerified` (Verification)
- Consumers are idempotent (event id + processed-events table).

## 5. Security

- Session cookie stays HttpOnly/SameSite=Strict at the gateway; services accept only gateway-signed tokens
  (`sub`, `role`, `officeId`, `scope[]`, 5-minute expiry), verified with a shared public key.
- Zone/sector scope (`BANDOBAST_OFFICER`, `POLICE_PRINT`) is enforced **inside** Deployment and ID Card
  services, not only at the gateway — same rule as the current SQL `accessCondition`.
- Aadhaar numbers and photos only in Personnel; other services get masked Aadhaar and a photo URL.
- Audit events for every write (already the case in the monolith).

## 6. Migration order (strangler)

1. **Done in this release:** Deployment logic isolated in `web/src/modules/deployment/`; rank and age logic
   in `core/domain/ranks.ts` and `lib/officer-age.ts`; new routes under `/api/deployment/*`.
2. Add the outbox table and emit events from the monolith for allotment, point assignment, print and issue.
3. Extract **Audit** (consumer only, lowest risk).
4. Extract **Deployment**: move `modules/deployment` into its own Node service; gateway proxies
   `/api/deployment/*`; postings table moves to the `deployment` schema.
5. Extract **Verification** with a read model of active cards + postings (needed for gate scale on event days).
6. Extract **Personnel** (personnel import, officer CRUD) and **ID Card** (print queue, rendering worker).
7. Retire the `passes` compatibility view.

Each step ships behind the gateway with the same URLs, so the UI does not change.

## 7. Runtime and deployment

- Containers (Docker) per service, one `docker-compose.yml` for local runs (Postgres + services + gateway).
- Health and readiness endpoints per service (`/health`, as the app already has).
- Central logs with a request id propagated from the gateway; metrics per service.
- Local-first: everything runs on a single machine with `docker compose up`; no cloud dependency required.

## 8. Option: Police Force as one service with its own database

**Yes — this is the best first split.** Everything under the Police Force menu (Officer Selection,
Import, Duty Points, Bandobast Force directory, police ID card print/issue) already works only on
`pass_type = 'POLICE_FORCE'` rows plus its own tables, and the code is mostly isolated
(`modules/deployment`, `components/police`, `components/deployment`, `/api/deployment/*`,
`/api/police-force/*`, `lib/police-personnel-import.ts`, `core/domain/{ranks,police-zones,scheme-requirements}.ts`).
One service ("Police Force service") is better than splitting it further into Personnel and Deployment now:
the screens always use officers and postings together, and one team owns it.

**Its own database (`police_force` DB):**

| Table | Holds | Comes from today |
|---|---|---|
| `officers` | name, rank, district/unit, DOB/age, mobile, Aadhaar (encrypted), photo | police rows of `passes` |
| `postings` | officer_id, zone, sector, sub-sector, point code, batch_id, status | `police_zone` / `police_sector_*` / `police_point_*` columns |
| `deployment_batches` | SP selection batches | same table |
| `police_cards` | card number, verification token, print count, issue/hand-over | card columns of `passes` |
| `personnel_imports` | import history | `audit_logs` entries |
| `settings` | age cutoff, authority name/title/signature copy | `conference_configs`, `pass_offices` |
| `outbox` | events to publish | new |

Scheme data (zones, sectors, points, rank requirements) stays as versioned code/JSON inside the service.

**What it still needs from the rest of the system — and how:**

| Shared today | After the split |
|---|---|
| Login / sessions / roles (`app_users`) | Gateway validates the session and passes a signed token (role, office, zone/sector scope). The service never reads `app_users`. |
| Pass number sequence (`DGPCONF-2026-0001…` shared with campus passes) | Give police cards their own series (e.g. `DGPPOL-2026-0001`) so the service allocates numbers alone. Existing numbers are kept. |
| Authority signature / name (`pass_offices`, `conference_configs`) | Copied into the service's `settings` when changed (event `AuthoritySignatureUpdated`) or fetched once per print batch. |
| Audit log | Service writes its own audit table and publishes `OfficerAllotted`, `DutyPointAssigned`, `CardPrinted`, `CardIssued` to the central Audit consumer. |
| Dashboard totals (`/api/stats`) | Dashboard calls the service's `GET /stats` (or reads a reporting replica). |
| Gate QR verification | Verification reads a cache of active police cards fed by `CardPrinted` / `CardRevoked` events. |

**Migration steps (no downtime):**
1. Create the `police_force` database and service (Node + `pg`, reuse the existing repository code).
2. One-time copy: police rows of `passes` → `officers`, `postings`, `police_cards`; verify counts and a checksum per table.
3. Switch the gateway: `/api/police-force/*` and `/api/deployment/*` proxy to the service; police pass routes inside `/api/passes` forward when `pass_type = POLICE_FORCE`.
4. Run read-only in the old tables for a week (or until after the event), then drop the police columns from `passes`.

**Trade-offs:** independent deploys, scaling for print/import bursts and a smaller blast radius, at the cost of
one more database to back up, cross-service reporting via API/events, and a short dual-write/cut-over window.
Recommendation stands: do the split **after the conference**; until then keep it a module in the monolith.

## 9. Risks and timing

- **Conference timeline:** do not start steps 3–7 before the 2026 event. Run this release as the modular
  monolith for the event; begin extraction after.
- **Data consistency:** posting changes and card reprints must stay consistent; the outbox + idempotent consumers
  handle this, and the ID Card service re-reads the posting snapshot at print time.
- **Operational load:** more moving parts for a small team; extract only services with a clear scaling or
  ownership reason (Verification, Deployment) first.
