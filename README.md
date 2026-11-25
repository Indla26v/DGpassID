# 61st All India DGsP / IGPs Conference – 2026
## Pass Management & Verification System Workspace

This workspace contains the official suite of applications for the 61st All India DGsP / IGPs Conference held at IISER Tirupati:

### Directory Structure

| Folder | Technology | Purpose |
| --- | --- | --- |
| `web/` | Next.js 15, React 19, TypeScript, Tailwind CSS, PostgreSQL | Full-stack web application implementing all duty access pass management, admin portal, team management, ID print team queue, real-time duplicate checking, single & batch badge printing, and gate verification. |
| `dotnet-app/` | .NET 10, C#, WPF, ASP.NET Core, WebView2 | Native Windows desktop and server deployment package for workstations, portable ZIP, and Inno Setup installer. |
| `analytics/` | Next.js, TypeScript | Analytics portal and reporting dashboard. |

---

### Running the Web Application (`web/`)

```bash
cd web
npm install
npm run dev
# Or for production:
npm run build
npm start
```

Default credentials:
- Administrator: `admin` (or `admin@dgp.local`)
- ID Print Team: `print` (or `print@dgp.local`)

### Upgrade for office accounts

1. With the deployment database owner's connection, run [offices.sql](dotnet-app/src/DgpPass.Core/offices.sql) as one transaction on the existing pass database. On a fresh database, apply [schema.sql](dotnet-app/src/DgpPass.Core/schema.sql) first. The .NET server's `--initialize` command applies both files together.
2. Apply [analytics-security.sql](analytics/db/analytics-security.sql) in a transaction using the database owner. This can be rerun after the analytics roles are provisioned and keeps the existing reader's credentials and aggregate-only access.
3. Upgrade the Next.js app, the .NET hosted server, all Windows installations with embedded backends, and Pass Analytics. Take older pass-management backends out of service before provisioning office accounts. Older backends do not enforce office assignment.
4. Provision SP Tirupati through the existing system administrator’s authenticated account-creation API (`POST /api/users` with `name`, `email`, `password`, `role: "ADMIN"`, and `officeId: "district"`). Sign in as SP and use **Team → Add a team member** to create the three DSP accounts with separate passwords and their respective offices. Both apps use the same accounts when connected to the same database.

| Account display name | Office |
| --- | --- |
| Chandragiri DSP | Chandragiri Subdivision |
| Renigunta DSP | Renigunta Subdivision |
| Tirupati DSP | Tirupati Subdivision |
| SP Tirupati | District Head Office |

Each officer signs in and sets the official image under **Authority Signature**. SP can select the issuing office when creating a pass. When SP approves a subdivision pass, that subdivision's saved signature is used. The legacy Print Team continues to process unassigned passes.

For a local rollout check, run both backends against the same disposable PostgreSQL database, apply the schema, and bootstrap a test system administrator. Set `TEST_OFFICE_ADMIN_EMAIL` and `TEST_OFFICE_ADMIN_PASSWORD` and run `node web/scripts/test-office-workflow.mjs http://127.0.0.1:3000 http://127.0.0.1:5080` against that database. The test expects a fresh office configuration and creates test accounts and passes.

### Regional police printing

After the shared schema and office migration, apply [police-force-passes.sql](web/db/police-force-passes.sql), [police-print-operators.sql](web/db/police-print-operators.sql), [apply-authority-signature.sql](web/db/apply-authority-signature.sql), [pass-authority-details.sql](web/db/pass-authority-details.sql), [police-direct-print.sql](web/db/police-direct-print.sql), and [bandobast-deployment.sql](web/db/bandobast-deployment.sql) in that order before running the Next.js app.

### Bandobast deployment

- **Ranks:** ASI, WASI, HC and WHC are stored separately and shown as **ASI/HC**. AR component ranks: RI, RSI, ARSI, ARHC, ARPC.
- **Roster import:** Zone, Sector, Sub-sector, Point and Date of Birth / Age columns are optional. Rows without them import with no duty posting (and keep any existing posting on re-import); unrecognised values import the officer and show a warning.
- **Officer Selection (SP):** Police Force → Officer Selection. Pick a rank, districts and a count; Auto-select picks officers at random (ASI/HC: ASI 20% · WASI 5% · HC 70% · WHC 5%, 40% old / 60% young, old = aged 45+ by default). Adjust the ticks and allot them to a zone and sector.
- **Duty Points:** create a **Zone / sector officer** under Team with the zones or sectors they manage. They sign in to **Duty Points** and place allotted officers on sub-sectors and duty points (seeded from the zonal scheme in `web/src/core/domain/bandobast-points.json`).
- See [docs/microservices-plan.md](docs/microservices-plan.md) for the plan to split the app into services.

In the web workspace, open **Team**, create a **Police print operator**, and add the zones or individual sectors served by that operator. Multiple sectors can be assigned to one account. Use **Edit assignments** to change them later.

Operators sign in to **Police Force**, filter by zone or sector, and use **Bulk print filtered badges**. By default it loads badges ready to print. Selecting **Printed** loads matching badges for reprinting. Operators can work through large selections in batches of up to 100 badges, with up to four badges per A4 sheet. After the physical handover, use **Issue** on the printed record. Collection desk is optional.

---

### Design & Architecture Highlights
- **SOLID Principles**: Clean separation of Domain entities, Repositories, Services, and Route Handlers.
- **Security & RBAC**: PBKDF2-SHA512 password hashing (210,000 iterations), HttpOnly SameSite Strict session cookies, role policies, and login throttling.
- **Physical Card Standard**: Strict 80mm × 120mm (8cm × 12cm) isolated badge printing and 4-per-page A4 sheet printing.
- **UI Compliance**: Rounded corners, pill-shaped buttons, dynamic modern design, and zero emojis.
