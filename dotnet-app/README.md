# Conference Pass Management — .NET Windows application

This is a separate implementation of the existing application. The original Next.js application remains in the parent folder. The desktop executable hosts an ASP.NET Core backend in process, with Neon PostgreSQL persistence. WPF and Microsoft Edge WebView2 display the adapted React interface and preserve the badge artwork. All authentication, authorization, database access and business rules run in C#. No Node.js installation is needed to run the published software.

## Folder structure

| Folder | Purpose |
| --- | --- |
| `src/DgpPass.Desktop` | Native WPF window, WebView2, first-run setup, Windows DPAPI encrypted settings |
| `src/DgpPass.Server` | ASP.NET Core APIs, authentication middleware, server-enforced role policies |
| `src/DgpPass.Core` | Npgsql repositories and business rules, accounts, password hashing, transactional audits, embedded SQL migration |
| `web/src/components/admin` | Admin registry, approval, signature, audit and team screens |
| `web/src/components/print` | Print submission, pending edits, approved queue, single and batch printing |
| `web/src/auth` | Login and session handling |
| `tests/DgpPass.Tests` | Password/TLS checks and PostgreSQL-backed HTTP workflow tests |
| `scripts` | Reproducible builds and local test runner |
| `artifacts` | Published Windows executable and portable ZIP |

## Run

Run **`artifacts/installer/DgpPass-Setup-x64.exe`** for normal installation. Setup installs to `%LOCALAPPDATA%\Programs\DgpPass`, creates desktop and Start menu shortcuts, installs Microsoft Edge WebView2 if it is missing, and configures the Neon connection automatically for the installing Windows user. Finish Setup to open **Sign in to your workspace**, then use **admin** or **print** and the supplied password. There is no database setup form in this installation flow. Windows Settings → Installed apps provides the uninstaller.

The preconfigured installer contains the supplied Neon connection as a deployment payload for trusted workstations. It should be distributed only to those workstations. During installation the connection is converted into Windows DPAPI encrypted profiles, and the temporary plaintext installation payload is removed. The installed directory has an encrypted recovery profile so the app can restore its connection if the user's main profile is missing. A desktop installer containing database access is not an authorization boundary against the Windows account owner; hosted-server mode remains the choice when database secrets must stay off client machines. Portal account passwords are not included in the installer.

For portable use, extract `artifacts/DgpPass-Windows-x64.zip` and open `DgpPass.exe`, keeping its `wwwroot` folder beside it. The current verified release files are under `artifacts/win-x64-1.2.1`. The x64 .NET runtime is bundled. Windows 10/11 x64 with Microsoft Edge WebView2 Evergreen Runtime is required. The application does not require elevated Windows permissions. Internet access is required for Neon.

The pooled Neon connection supplied for this installation is saved using Windows DPAPI for the current Windows account. It is not in source or the portable ZIP; the preconfigured installer carries the deployment connection as described above. This installation has the **admin** and **print** portal accounts provisioned and opens directly at sign-in. For a new empty database, portable setup can create the first administrator with a password of 12–128 characters. The database can have only one first-admin bootstrap; existing users cannot be overwritten by setup. SP Tirupati can create office administrators and print operators under **Team**. See the [office-account upgrade](../README.md#upgrade-for-office-accounts) for the initial SP account setup.

The standalone backend automatically uses that same saved Neon connection by default, without setting an environment variable for each launch. Connection priority is `DATABASE_URL_POOLED`, then `DATABASE_URL`, then the encrypted workstation profile. Blank environment values are ignored. A supplied deployment secret takes precedence; an unreadable profile produces a configuration error instead of selecting another database.

The two portal accounts use the simple usernames **admin** and **print**. Each has a separate randomly generated password, delivered separately; passwords are stored only as salted hashes in Neon. These aliases also accept their full account identifiers, `admin@dgp.local` and `print@dgp.local`. The first account opens the admin workspace, and the second opens print production. Ordinary email-based accounts continue to work.

For a new database, the trusted setup command `DgpPass.exe --create-portal-accounts` creates both accounts atomically and displays the generated credentials once. It refuses to replace either existing account. This command is a local administration operation; there is no unauthenticated provisioning API.

Admin and print stations share one database: passes, approvals, account permissions, audit logs and sessions are visible across connected stations. Each backend process owns one Npgsql data source and reuses its connection pool for both roles (maximum five local connections per process); the supplied Neon `-pooler` endpoint provides server-side pooling. The pool closes when its backend shuts down.

On another Windows account/computer, run the preconfigured installer, or configure the portable app with the pooled Neon URL or hosted server origin. Uncheck **Create the first administrator** in portable setup when connecting to a database that already has accounts. The encrypted settings file is `%LOCALAPPDATA%\DgpPass\connection.dat`; copying it to a different user does not grant access. Administrators can run `DgpPass.exe --configure` to change the connection.

The application opens at a size that fits the usable screen area, including display scaling and the taskbar, and retains the standard Windows title bar for dragging, minimizing, maximizing, restoring and closing. The custom logo appears in the application icon, shortcuts, installer and login screen. The native reload/connection/status toolbar is not displayed.

`DgpPass.exe --check-installation` performs a noninteractive connection and packaged-server check. It creates no accounts or passes, and returns exit code 0 on success or 1 on failure.

### Deployment modes

**Database workstation:** the executable binds its embedded server to a random port on `127.0.0.1` and connects to Neon over certificate-validated TLS. The secret is encrypted at rest for the local Windows account. This mode is for managed, trusted workstations; that Windows user can access the database connection through the running application.

**Hosted server:** deploy `DgpPass.Server` once behind HTTPS and connect desktop print stations to it. The desktop stores only the backend origin. This keeps database credentials off operator workstations and provides a centralized authorization boundary. This mode is recommended when operators should not have direct database access. Public hosting and certificates must be supplied by your organization; this task does not publish a server.

```powershell
# On this configured Windows account, no database environment variable is needed:
dotnet run --project src/DgpPass.Server -- --check-connection
dotnet run --project src/DgpPass.Server

# Server environment, supplied through your deployment's secret store:
$env:DATABASE_URL_POOLED = '<Neon pooled connection URL>'
$env:APP_URL = 'http://127.0.0.1:5080'
$env:APP_ORIGIN = 'https://passes.example.org'
dotnet run --project src/DgpPass.Server -- --initialize
```

For initial server bootstrap, supply `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` as environment variables and add `--bootstrap` once. Remove these bootstrap variables afterwards. The backend does not expose a public setup API. It uses the same database accounts as desktop mode. Do not expose the unencrypted HTTP listener directly to the network; terminate HTTPS at the reverse proxy. A deployed proxy must preserve Host and request cookies. The browser sends Origin for mutations and it must match `APP_ORIGIN`.

For multiple print stations, run one hosted backend and set each desktop to **Connect to hosted server** using that same HTTPS origin. Additional Windows users, service accounts or machines must receive the deployment's `DATABASE_URL_POOLED` secret or be configured separately; DPAPI credentials cannot be copied across Windows accounts.

## Authentication and permissions

| Capability | Administrator | Print team |
| --- | --- | --- |
| Sign in / sign out | Yes | Yes |
| Registry and audit logs | Yes | No |
| Create, enable or disable accounts | Yes | No |
| Manage departments, roles, authority signature | Yes | No |
| Submit new pass | Yes | Yes; server forces pending approval |
| Edit pass | Yes | Pending passes only |
| Approve, revoke or delete pass | Yes | No |
| Print queue, approved badge printing, reprints | Yes | Yes |

The backend evaluates permissions on every API request. Print submissions cannot set approval metadata, authority signatures or status. Pending edits run under a row lock and cannot race an approval. Pending and revoked cards cannot be printed or reprinted; mixed batches fail atomically. Operator names in request bodies are ignored; audit identity comes from the authenticated session. Verification requires an admin account and checks the stored random token, status, dates and gate zone, with no pass-number fallback.

Passwords use PBKDF2-SHA512 with 210,000 iterations and random salts. Session tokens have 256 bits of randomness, are hashed in PostgreSQL, expire after eight hours, and use HttpOnly/SameSite Strict cookies (Secure with HTTPS). Disabling an account immediately deletes its sessions, and every request checks active account status. Login attempts are throttled per account in PostgreSQL. Mutations require a matching Origin header. Browser navigation is restricted to the configured application origin; native host objects, password saving and web message access are disabled. These controls govern application users; database owners and workstation administrators remain privileged.

Schema initialization is additive and idempotent. It preserves existing passes, departments and users, adds the authentication tables, and seeds only department/staff options. It does not transfer the original local PostgreSQL records to Neon or seed sample identity records. Core mutations and audit entries commit in the same transaction. Existing legacy QR tokens remain usable; newly issued passes use cryptographically random verification tokens.

## Printing

Mobile and government ID entries are validated on create and edit, including API and CSV imports. Mobile numbers must be 10 ASCII digits starting with 6–9; Aadhaar must be 12 ASCII digits starting with 2–9. These two fields reject letters and separators. PAN, passport, voter ID and driving licence use type-specific format and length checks; institute IDs allow 1–32 characters because institutions use different numbering systems. Inputs have consistent numeric field height. These checks validate format and length only; they do not verify ownership, Aadhaar checksum or registration with an issuing authority. Physical badge dimensions remain 90 × 120 mm.

Admin users select **Create & send to ID Print Team** when creating a pass. Its Ready to Print status is committed to the shared database with a `PASS_SENT_TO_PRINT_TEAM` audit entry, so it is available in the print team's queue. Existing draft or approved records have a **Send to ID Team** action; pending submissions use **Approve & send**. The print queue updates every 15 seconds and when the app regains focus, retaining valid card selections. Sending an already queued pass is idempotent, while revoked and already printed/issued cards cannot use this handoff endpoint. Print accounts cannot send or approve passes themselves.

Single-card output is **90 × 120 mm**. Batch output uses **A4 sheets**, two columns and two rows per page. The app creates an isolated print document, waits for images and fonts, and checks server authorization before opening the print dialog. Choose actual size/100% scale and enable background graphics. Counts and audit entries record authorized print requests; a canceled print dialog or printer hardware failure cannot be detected reliably by WebView2's browser print interface. Operators must verify physical output.

## Build and test

Build prerequisites: .NET 10 SDK, Node.js 22.12+ (or 24+) for interface compilation only, internet access for initial NuGet/npm restore, Windows x64.

```powershell
./scripts/Publish-Windows.ps1
# Outputs artifacts/win-x64/DgpPass.exe, portable ZIP and SHA256SUMS.txt.

# Build the preconfigured Setup executable (Inno Setup 6 required):
./scripts/Build-Installer.ps1 -SkipPublish
# Reads DATABASE_URL_POOLED / DATABASE_URL or the encrypted local profile.
# Verifies the Microsoft signature on the packaged WebView2 bootstrapper.

# Development interface (proxies /api to the local .NET server):
cd web
npm ci
npm run dev
```

For the Vite development proxy, set the backend's `APP_ORIGIN` to the Vite origin (normally `http://localhost:5173`). Run the backend on `http://localhost:5080` to match `vite.config.ts`.

```powershell
$env:TEST_DATABASE_URL = '<local PostgreSQL maintenance connection>'
./scripts/Test-Local.ps1
```

Integration tests explicitly reject non-local database hosts. They create a uniquely named temporary database, run migrations twice, exercise the HTTP approval/printing workflow and authorization failures, then drop only that test database. They do not modify Neon or the original application database. Checks cover spoofed audit identities, CSRF, immutable bootstrap, password checks, verified Neon TLS, and session revocation.

The portable executable and Setup installer are unsigned. Authenticode signing, centralized hosting, organization-specific identity/SSO and a database least-privilege deployment are not included. The current renderer is WebView2, not WinUI 3; the native window and complete backend are .NET.
