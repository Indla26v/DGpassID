using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace DgpPass.Core;

public record SessionUser(Guid Id, string Email, string Name, string Role, string? OfficeId = null);
public record PortalCredentials(string Username, string Password, string Role);
public static class Passwords
{
    public static void Validate(string? email, string? name, string? password)
    {
        if (email is null || email.Length > 254 || !Regex.IsMatch(email, @"^[^\s@]+@[^\s@]+\.[^\s@]+$")) throw new AppException("Enter a valid email address.");
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 100) throw new AppException("Enter a name of 1–100 characters.");
        if (password is null || password.Length < 12 || password.Length > 128) throw new AppException("Use a password of 12–128 characters.");
    }
    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 210000, HashAlgorithmName.SHA512, 64);
        return $"pbkdf2-sha512$210000${Convert.ToHexString(salt)}${Convert.ToHexString(hash)}";
    }
    public static bool Verify(string password, string encoded)
    {
        try {
            var parts = encoded.Split('$');
            if (parts.Length != 4 || parts[0] != "pbkdf2-sha512" || parts[1] != "210000") return false;
            var salt = Convert.FromHexString(parts[2]); var expected = Convert.FromHexString(parts[3]);
            if (salt.Length != 16 || expected.Length != 64) return false;
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, 210000, HashAlgorithmName.SHA512, 64);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        } catch (FormatException) { return false; }
    }
    public static string TokenHash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

public sealed class Accounts(Database db)
{
    private static readonly Lazy<string> DummyHash = new(() => Passwords.Hash(Convert.ToHexString(RandomNumberGenerator.GetBytes(32))));
    public async Task Bootstrap(string email, string name, string password)
    {
        Passwords.Validate(email, name, password);
        var hash = Passwords.Hash(password);
        await db.Transaction(async (c, t) => {
            await Database.Query(c, t, "SELECT pg_advisory_xact_lock(6102027)");
            var users = await Database.Query(c, t, "SELECT id FROM app_users LIMIT 1");
            if (users.Count > 0) throw new AppException("This database already has accounts. Sign in with an existing account; bootstrap cannot replace an administrator.", 409);
            await Database.Query(c, t, "INSERT INTO app_users (email, name, role, password_hash) VALUES ($1, $2, 'ADMIN', $3)", email.Trim().ToLowerInvariant(), name.Trim(), hash);
            await Database.Query(c, t, "INSERT INTO audit_logs (action, performed_by, user_role, details) VALUES ('INITIAL_ADMIN_CREATED', $1, 'ADMIN', 'First administrator created from workstation setup.')", email.Trim().ToLowerInvariant());
            return true;
        });
    }
    public async Task<(SessionUser User, string Token)> Login(string email, string password)
    {
        email = email.Trim().ToLowerInvariant();
        email = email switch { "admin" => "admin@dgp.local", "print" => "print@dgp.local", _ => email };
        if (email.Length > 254 || password.Length > 128 || email.Length == 0) throw new AppException("Email or password is incorrect.", 401);
        var attempt = await db.Query("""
            INSERT INTO auth_login_attempts (email, attempts, window_start) VALUES ($1, 1, NOW())
            ON CONFLICT (email) DO UPDATE SET
              attempts = CASE WHEN auth_login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN 1 ELSE auth_login_attempts.attempts + 1 END,
              window_start = CASE WHEN auth_login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE auth_login_attempts.window_start END
            RETURNING attempts
            """, email);
        if ((int)attempt[0]["attempts"]! > 10) throw new AppException("Too many attempts. Try again after 15 minutes.", 429);
        var rows = await db.Query("SELECT id, email, name, role, office_id, password_hash, is_active FROM app_users WHERE email = $1", email);
        var row = rows.FirstOrDefault();
        var valid = Passwords.Verify(password, row?["password_hash"] as string ?? DummyHash.Value);
        if (row is null || !valid || !(bool)row["is_active"]!) throw new AppException("Email or password is incorrect.", 401);
        var user = new SessionUser((Guid)row["id"]!, (string)row["email"]!, (string)row["name"]!, (string)row["role"]!, row["office_id"] as string);
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        await db.Transaction(async (c, t) => {
            await Database.Query(c, t, "DELETE FROM app_sessions WHERE expires_at <= NOW()");
            await Database.Query(c, t, "DELETE FROM auth_login_attempts WHERE email = $1", email);
            await Database.Query(c, t, "INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '8 hours')", Passwords.TokenHash(token), user.Id);
            await Audit(c, t, user, "USER_SIGNED_IN", "Account signed in.");
            return true;
        });
        return (user, token);
    }
    public async Task<SessionUser?> Session(string? token)
    {
        if (token is null || token.Length != 64 || !token.All(Uri.IsHexDigit)) return null;
        var rows = await db.Query("""
            SELECT u.id, u.email, u.name, u.role, u.office_id FROM app_sessions s JOIN app_users u ON u.id = s.user_id
            WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = true
            """, Passwords.TokenHash(token));
        return rows.Count == 0 ? null : new((Guid)rows[0]["id"]!, (string)rows[0]["email"]!, (string)rows[0]["name"]!, (string)rows[0]["role"]!, rows[0]["office_id"] as string);
    }
    public Task Logout(string token) => db.Query("DELETE FROM app_sessions WHERE token_hash = $1", Passwords.TokenHash(token));
    public async Task<PortalCredentials[]> CreatePortalAccounts()
    {
        PortalCredentials[] credentials = [
            new("admin", "Admin!" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)), "ADMIN"),
            new("print", "Print!" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)), "PRINT_TEAM")
        ];
        await db.Transaction(async (c, t) => {
            await Database.Query(c, t, "SELECT pg_advisory_xact_lock(6102027)");
            var existing = await Database.Query(c, t, "SELECT id FROM app_users WHERE email IN ('admin@dgp.local', 'print@dgp.local')");
            if (existing.Count > 0) throw new AppException("An admin or print portal account already exists. Existing credentials were not replaced.", 409);
            foreach (var account in credentials) {
                var email = account.Username + "@dgp.local";
                await Database.Query(c, t, "INSERT INTO app_users (email, name, role, password_hash) VALUES ($1, $2, $3, $4)", email, account.Role == "ADMIN" ? "Portal Administrator" : "ID Print Team", account.Role, Passwords.Hash(account.Password));
                await Database.Query(c, t, "INSERT INTO audit_logs (action, performed_by, user_role, details) VALUES ('PORTAL_ACCOUNT_CREATED', 'Workstation provisioning', 'ADMIN', $1)", $"Created {account.Role} portal account {email}.");
            }
            return true;
        });
        return credentials;
    }
    public Task<List<Dictionary<string, object?>>> List() => db.Query("SELECT id, email, name, role, office_id, is_active, created_at FROM app_users ORDER BY created_at");
    public async Task<object> Create(SessionUser actor, string email, string name, string password, string role, string requestedOffice = "")
    {
        var office = requestedOffice.Length == 0 ? null : Offices.Validate(requestedOffice);
        if (office is not null && role != "ADMIN") throw new AppException("Only administrators can be assigned to an office.");
        if (actor.OfficeId == Offices.District && role == "ADMIN" && office is null) throw new AppException("Only a system administrator can create another system administrator.", 403);
        Passwords.Validate(email, name, password);
        if (role is not ("ADMIN" or "PRINT_TEAM")) throw new AppException("Choose Admin or Print Team.");
        var hash = Passwords.Hash(password);
        return await db.Transaction(async (c, t) => {
            var rows = await Database.Query(c, t, "INSERT INTO app_users (email, name, role, password_hash, office_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role, office_id, is_active", email.Trim().ToLowerInvariant(), name.Trim(), role, hash, office);
            await Audit(c, t, actor, "USER_CREATED", $"Created {role} account {email}.");
            return rows[0];
        });
    }
    public async Task SetActive(SessionUser actor, Guid id, bool active)
    {
        if (actor.Id == id) throw new AppException("You cannot disable your own account.");
        await db.Transaction(async (c, t) => {
            var rows = await Database.Query(c, t, "UPDATE app_users SET is_active = $2 WHERE id = $1 AND (NOT $3 OR role <> 'ADMIN' OR office_id IS NOT NULL) RETURNING email", id, active, actor.OfficeId == Offices.District);
            if (rows.Count == 0) throw new AppException("Account not found.", 404);
            await Database.Query(c, t, "DELETE FROM app_sessions WHERE user_id = $1", id);
            await Audit(c, t, actor, "USER_ACCESS_CHANGED", $"{rows[0]["email"]}: {(active ? "enabled" : "disabled")}");
            return true;
        });
    }
    public static Task Audit(Npgsql.NpgsqlConnection c, Npgsql.NpgsqlTransaction t, SessionUser actor, string action, string details, Guid? passId = null, string? passNumber = null, string? office = null)
        => Database.Query(c, t, "INSERT INTO audit_logs (action, performed_by, user_role, details, pass_id, pass_number, office_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", action, actor.Email, actor.Role, details, passId, passNumber, office);
}
