# 61st All India DGPs / IGPs Conference – 2026
## Pass Management & Verification System Workspace

This workspace contains the official suite of applications for the 61st All India DGPs / IGPs Conference held at IISER Tirupati:

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
- **Personnel import:** Zone, Sector, Sub-sector, Point and Date of Birth / Age columns are optional. Rows without them import with no duty posting (and keep any existing posting on re-import); unrecognised values import the officer and show a warning.
- **Force, police station and gender:** optional import columns **Force** (Civil, AR, STF; any other value counts as Others), **Police Station** (or *Place of Working* / *PS*) and **Gender**. A blank Force comes from the rank (AR ranks = AR, otherwise Civil). A blank Gender also comes from the rank (WPC, WHC, WASI, WSI = Female, otherwise Male). A re-import with blank columns keeps the stored values. Officer Selection, Duty Points and Export each have a **Force** filter.
- **Exports (SP / zone officer):** Police Force → Export downloads Excel, CSV or PDF in the sector-wise "Final" format:
  - title rows, then the columns S. No., Rank, G.No., Name, Place of working, Mobile No., District
  - a heading for each Zone | Sector and Sub-sector (duty points are not listed)
  - officers numbered from 1 under each heading, senior ranks first
- **Dashboard (SP):** Police Force → Dashboard shows:
  - totals
  - rank-wise strength by zone, sector and sub-sector against the scheme requirement
  - district, force and gender charts, rank bars and a district × rank abstract
- **Duty instructions:**
  - **SP:** Police Force → Instructions creates a reporting instruction: heading, a table of Report Entities with Date, Time and Place, and a closing line. The default rows are Accommodation, Briefing, Spot Briefing, Rehearsal and Final Duty, and every part can be edited. The SP sends it to all zones, chosen zones, or sectors of one zone. A sent instruction can be edited (zone logins see it marked **Updated**, with the SP's note) or withdrawn.
  - **Zone / sector logins:** they see instructions for their area under **Instructions** and can print each one as a PDF.
- **Duty passports:** the SP adds the duty dates and hours, place of duty, batch and signatory to a duty instruction. **Duty passports** on that instruction prints one A4 page per allotted officer, filtered by zone, sector, sub-sector or officer. Each page has:
  - the officer's name, rank, G.No., zone, sector and duty point
  - the duty ID card QR code
  - the instruction's reporting table
  - Sector Incharge: the officer allotted under **Incharges**, otherwise the first officer of the most senior rank posted in the sector; below it, the first officer of each of the next 3 ranks, with phone numbers (ranks down to SI only)
  - the SP's saved signature
  Zone / sector logins print passports for their own area only. Passports always carry the SP's saved name and signature; only the SP can change the "Signed by" text.
- **Passport back side:** each instruction has an editable **Brief Instructions** back page (a title and up to 20 numbered points, pre-filled with standard points). Each officer's back page follows the front page, so print the PDF double-sided (flip on long edge). Remove all points for a one-sided passport.
- **Incharges:** under Police Force → **Incharges**, the SP allots up to 3 officers, in order, for each sub-sector (1st = Sub-sector Incharge) and for each sector that has no sub-sectors (1st = Sector Incharge), from the officers posted there; the next two print below. **Auto select top 3** in the picker, or **Auto allot empty sub-sectors**, picks the first officer of each of the top 3 ranks (SI and above); existing choices are kept. Without an allotment, passports use the same top 3. The Sector Incharge is always the senior-most officer (SI and above) posted in the sector. Officers in a sub-sector get a Sub-sector Incharge line on their passport. Zone / sector logins cannot allot.
- **Sub-sectors:** an instruction can be sent to whole zones, sectors, or chosen sub-sectors of one sector; passports are then printed only for officers posted in those sub-sectors.
- **Instructions by zone logins:** zone, sector and sub-sector logins can create duty instructions (and print passports from them) for their own area only, and edit or withdraw only the ones they created.
- **Scan & Issue:** zone / sector logins, the SP and police print operators scan the QR code on a duty ID card or duty passport (camera, or a handheld scanner that types the code) to mark that ID card as issued. The card must have been printed first, and only officers in the login's own area can be issued. The camera needs HTTPS or localhost; over plain HTTP, use a handheld scanner.
- **Officer Selection (SP):** Police Force → Officer Selection. Pick a rank, districts and a count; Auto-select picks officers at random (ASI/HC: ASI 20% · WASI 5% · HC 70% · WHC 5%, 40% old / 60% young, old = aged 45+ by default). Adjust the ticks and allot them to a zone and sector.
- **Duty Points:** create a **Zone / sector officer** under Team with the zones, sectors or sub-sectors they manage (a sub-sector login sees only the officers posted in its sub-sector). They sign in to **Duty Points** and place allotted officers on sub-sectors and duty points (seeded from the zonal scheme in `web/src/core/domain/bandobast-points.json`).
- See [docs/microservices-plan.md](docs/microservices-plan.md) for the plan to split the app into services.

In the web workspace, open **Team**, create a **Police print operator**, and add the zones or individual sectors served by that operator. Multiple sectors can be assigned to one account. Use **Edit assignments** to change them later.

Operators sign in to **Police Force**, filter by zone or sector, and use **Bulk print filtered badges**. By default it loads badges ready to print. Selecting **Printed** loads matching badges for reprinting. Operators can work through large selections in batches of up to 100 badges, with up to four badges per A4 sheet. After the physical handover, use **Issue** on the printed record. Collection desk is optional.

---

### Design & Architecture Highlights
- **SOLID Principles**: Clean separation of Domain entities, Repositories, Services, and Route Handlers.
- **Security & RBAC**: PBKDF2-SHA512 password hashing (210,000 iterations), HttpOnly SameSite Strict session cookies, role policies, and login throttling.
- **Physical Card Standard**: Strict 80mm × 120mm (8cm × 12cm) isolated badge printing and 4-per-page A4 sheet printing.
- **UI Compliance**: Rounded corners, pill-shaped buttons, dynamic modern design, and zero emojis.
