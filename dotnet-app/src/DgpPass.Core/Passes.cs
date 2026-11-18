using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;

namespace DgpPass.Core;

public sealed class Passes(Database db)
{
    private static readonly HashSet<string> Editable = ["full_name", "father_or_spouse_name", "personnel_type", "institution", "institution_other", "category", "category_other", "department", "designation_or_trade", "dept_hostel_quarter", "mobile_number", "govt_id_type", "govt_id_number", "zone_a", "gate_zone_a", "zone_b", "gate_zone_b", "zone_c", "gate_zone_c", "valid_from", "valid_to", "photo_url", "cardholder_signature_url"];
    private static readonly HashSet<string> AdminFields = ["has_hologram", "has_official_seal"];
    public static readonly HashSet<string> Statuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "READY_TO_PRINT", "PRINTED", "ISSUED", "REVOKED"];
    public static string Text(JsonElement body, string key, string fallback = "") => body.TryGetProperty(key, out var val) && val.ValueKind == JsonValueKind.String ? val.GetString() ?? fallback : fallback;
    public static bool Flag(JsonElement body, string key, bool fallback = false) => body.TryGetProperty(key, out var val) && val.ValueKind is JsonValueKind.True or JsonValueKind.False ? val.GetBoolean() : fallback;
    public static Guid Id(string value) => Guid.TryParse(value, out var id) ? id : throw new AppException("Invalid record ID.");
    private static Dictionary<string, object?> Input(JsonElement body, bool admin)
    {
        if (body.ValueKind != JsonValueKind.Object) throw new AppException("Pass details must be an object.");
        Dictionary<string, object?> input = [];
        foreach (var field in body.EnumerateObject())
        {
            if (!Editable.Contains(field.Name) && !(admin && AdminFields.Contains(field.Name))) continue;
            object? value = field.Value.ValueKind switch { JsonValueKind.String => field.Value.GetString(), JsonValueKind.True => true, JsonValueKind.False => false, JsonValueKind.Null => null, _ => throw new AppException($"Invalid value for {field.Name}.") };
            var booleanField = field.Name is "zone_a" or "zone_b" or "zone_c" or "has_hologram" or "has_official_seal";
            if (booleanField && value is not bool) throw new AppException($"{field.Name} must be true or false.");
            if (!booleanField && value is not null and not string) throw new AppException($"{field.Name} must be text.");
            if (field.Name is "valid_from" or "valid_to" && value is string date && !DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) throw new AppException("Use a valid YYYY-MM-DD date.");
            if (value is string s && s.Length > (field.Name.EndsWith("_url") ? 3_000_000 : 255)) throw new AppException($"{field.Name} is too long.");
            if (field.Name.EndsWith("_url") && value is string image && image.Length > 0 && !image.StartsWith("data:image/png;base64,", StringComparison.OrdinalIgnoreCase) && !image.StartsWith("data:image/jpeg;base64,", StringComparison.OrdinalIgnoreCase) && !image.StartsWith("data:image/webp;base64,", StringComparison.OrdinalIgnoreCase) && !(Uri.TryCreate(image, UriKind.Absolute, out var imageUri) && imageUri.Scheme == "https")) throw new AppException("Images must be PNG, JPEG, WebP or an HTTPS URL.");
            input[field.Name] = value;
        }
        return input;
    }
    public async Task<object> List(Dictionary<string, string> filter, bool queue, SessionUser actor)
    {
        List<string> where = []; List<object?> args = [];
        void Add(string sql, object value) { args.Add(value); where.Add(sql.Replace("?", "$" + args.Count)); }
        args.Add(Offices.Scope(actor));
        where.Add("pass_office_visible($1, office_id)");
        if (filter.TryGetValue("office_id", out var office) && office.Length > 0)
            Add("COALESCE(office_id, 'unassigned') = ?", office);
        if (filter.TryGetValue("status", out var status) && status != "ALL" && status.Length > 0) {
            if (!Statuses.Contains(status)) throw new AppException("Invalid pass status.");
            Add("status = ?", status);
        } else if (queue && !filter.ContainsKey("status")) where.Add("status IN ('READY_TO_PRINT', 'PRINTED')");
        if (filter.TryGetValue("institution", out var instVal) && instVal.Length > 0)
        {
            if (instVal is "ICI" or "ICU") where.Add("institution IN ('ICI', 'ICU')");
            else Add("institution = ?", instVal);
        }
        if (filter.TryGetValue("category", out var catVal) && catVal.Length > 0) Add("category = ?", catVal);
        if (filter.TryGetValue("zone", out var zone) && zone is "A" or "B" or "C") where.Add("zone_" + zone.ToLowerInvariant() + " = true");
        if (filter.TryGetValue("search", out var search) && search.Length > 0) Add("(full_name ILIKE ? OR pass_number ILIKE ? OR department ILIKE ? OR mobile_number ILIKE ?)", "%" + search + "%");
        var clause = where.Count == 0 ? "" : " WHERE " + string.Join(" AND ", where);
        var count = await db.Query("SELECT COUNT(*) AS total FROM passes" + clause, args.ToArray());
        var limit = filter.TryGetValue("limit", out var lim) && int.TryParse(lim, out var n) ? Math.Clamp(n, 1, 500) : 50;
        var offset = filter.TryGetValue("offset", out var off) && int.TryParse(off, out var o) ? Math.Max(o, 0) : 0;
        args.Add(limit); args.Add(offset);
        var rows = await db.Query($"SELECT * FROM passes{clause} ORDER BY created_at DESC LIMIT ${args.Count - 1} OFFSET ${args.Count}", args.ToArray());
        return new { passes = rows, total = count[0]["total"] };
    }
    public async Task<Dictionary<string, object?>> Find(Guid id, SessionUser actor) => (await db.Query("SELECT * FROM passes WHERE id = $1 AND pass_office_visible($2, office_id)", id, Offices.Scope(actor))).FirstOrDefault() ?? throw new AppException("Pass not found.", 404);
    public async Task<Dictionary<string, object?>?> FindDuplicate(string fullName, string mobileNumber, string govtIdNumber, Guid? excludeId = null)
    {
        return await db.Transaction(async (c, t) => await FindDuplicate(c, t, fullName, mobileNumber, govtIdNumber, excludeId));
    }
    public static async Task<Dictionary<string, object?>?> FindDuplicate(NpgsqlConnection c, NpgsqlTransaction t, string fullName, string mobileNumber, string govtIdNumber, Guid? excludeId = null)
    {
        var cleanMobile = Regex.Replace(mobileNumber ?? "", "[^0-9]", "");
        if (cleanMobile.Length > 10) cleanMobile = cleanMobile[^10..];
        var cleanGovtId = Regex.Replace((govtIdNumber ?? "").Trim(), "[^a-zA-Z0-9]", "").ToLowerInvariant();

        var sql = """
            SELECT id, pass_number, full_name, mobile_number, govt_id_type, govt_id_number, status, printed_count, created_at, office_id
            FROM passes
            WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1))
              AND (
                TRIM(mobile_number) = TRIM($2)
                OR (LENGTH($3) = 10 AND RIGHT(REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g'), 10) = $3)
              )
              AND (
                LOWER(TRIM(govt_id_number)) = LOWER(TRIM($4))
                OR (LENGTH($5) > 0 AND LOWER(REGEXP_REPLACE(govt_id_number, '[^a-zA-Z0-9]', '', 'g')) = $5)
              )
              AND status != 'REVOKED'
            """;
        List<object?> args = [(fullName ?? "").Trim(), (mobileNumber ?? "").Trim(), cleanMobile, (govtIdNumber ?? "").Trim(), cleanGovtId];
        if (excludeId.HasValue)
        {
            sql += " AND id != $" + (args.Count + 1);
            args.Add(excludeId.Value);
        }
        sql += " ORDER BY created_at DESC LIMIT 1";
        var rows = await Database.Query(c, t, sql, args.ToArray());
        return rows.FirstOrDefault();
    }
    public async Task<object> Create(JsonElement body, SessionUser actor)
    {
        var input = Input(body, actor.Role == "ADMIN");
        IdentityValidation.Mobile(input.GetValueOrDefault("mobile_number") as string);
        IdentityValidation.GovernmentId(input.GetValueOrDefault("govt_id_type") as string ?? "Aadhaar", input.GetValueOrDefault("govt_id_number") as string);
        foreach (var key in new[] { "full_name", "mobile_number", "govt_id_number", "department" }) if (!input.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value as string)) throw new AppException($"{key.Replace('_', ' ')} is required.");
        input.TryAdd("father_or_spouse_name", ""); input.TryAdd("institution", "IISER"); input.TryAdd("category", "Other");
        var status = actor.Role == "PRINT_TEAM" ? "PENDING_APPROVAL" : Text(body, "status", "READY_TO_PRINT");
        if (!Statuses.Contains(status) || status is "PRINTED" or "ISSUED") throw new AppException("Invalid status for a new pass.");
        input["status"] = status;
        input["office_id"] = Offices.ForNewPass(actor, Text(body, "office_id"));
        input["approved_by"] = status is "READY_TO_PRINT" or "APPROVED" ? actor.Email : null;
        input["approved_at"] = status is "READY_TO_PRINT" or "APPROVED" ? DateTime.UtcNow : null;
        return await db.Transaction(async (c, t) => {
            await Database.Query(c, t, "SELECT pg_advisory_xact_lock(6102028)");
            var fullName = (input["full_name"] as string)?.Trim() ?? "";
            var mobileNumber = (input["mobile_number"] as string)?.Trim() ?? "";
            var govtIdNumber = (input["govt_id_number"] as string)?.Trim() ?? "";
            var duplicate = await FindDuplicate(c, t, fullName, mobileNumber, govtIdNumber, null);
            if (duplicate is not null)
            {
                if (!Offices.CanAccess(actor, duplicate["office_id"])) throw new AppException(Offices.DuplicateOutsideOffice, 409);
                var dupPassNo = duplicate["pass_number"] as string ?? "";
                var existingStatus = duplicate["status"] as string ?? "";
                throw new AppException($"Already present: A pass for {fullName} with this mobile number and government ID already exists (Pass #{dupPassNo}, Status: {existingStatus.Replace('_', ' ')}). Redundant pass creation is disallowed.", 409);
            }
            var passNo = actor.Role == "ADMIN" ? Text(body, "pass_number").Trim() : "";
            if (passNo.Length == 0) {
                var next = await Database.Query(c, t, "SELECT COALESCE(MAX(substring(pass_number from '^DGPCONF-2026-([0-9]{1,9})$')::bigint),150)+1 AS n FROM passes");
                passNo = $"DGPCONF-2026-{(long)next[0]["n"]!:D4}";
            }
            if (passNo.Length > 64 || passNo.Any(ch => !(char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_'))) throw new AppException("Pass numbers may contain letters, numbers, hyphens and underscores (up to 64 characters).");
            input["pass_number"] = passNo;
            input["verification_token"] = "PV-2026-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(20)) + "-AP";
            input["qr_payload"] = Payload(input);
            if (input["office_id"] is null) {
                var signature = await Database.Query(c, t, "SELECT value FROM conference_configs WHERE key = 'authority_signature_url'");
                input["authority_signature_url"] = signature.FirstOrDefault()?["value"];
            }
            var columns = input.Keys.ToArray();
            var rows = await Database.Query(c, t, $"INSERT INTO passes ({string.Join(',', columns)}) VALUES ({string.Join(',', Enumerable.Range(1, columns.Length).Select(i => "$" + i))}) RETURNING *", input.Values.ToArray());
            await Accounts.Audit(c, t, actor, actor.Role == "PRINT_TEAM" ? "PASS_SUBMITTED_FOR_APPROVAL" : "PASS_CREATED", $"Created pass for {input["full_name"]}. Status: {status}.", (Guid)rows[0]["id"]!, passNo);
            if (status == "READY_TO_PRINT") await Accounts.Audit(c, t, actor, "PASS_SENT_TO_PRINT_TEAM", "Admin-created pass released to its print queue.", (Guid)rows[0]["id"]!, passNo);
            return rows[0];
        });
    }
    private static string Payload(Dictionary<string, object?> p)
    {
        var zones = new[] { "a", "b", "c" }.Where(z => p.TryGetValue("zone_" + z, out var value) && value is true).Select(z => "Z-" + z.ToUpperInvariant());
        return $"{p.GetValueOrDefault("pass_number")}|{p.GetValueOrDefault("verification_token")}|{p.GetValueOrDefault("full_name")}|{p.GetValueOrDefault("category")}|{p.GetValueOrDefault("institution")}|{string.Join(',', zones)}";
    }
    public async Task<object> Update(Guid id, JsonElement body, SessionUser actor)
    {
        var input = Input(body, actor.Role == "ADMIN");
        foreach (var key in new[] { "full_name", "mobile_number", "govt_id_number", "department" }) if (input.TryGetValue(key, out var value) && string.IsNullOrWhiteSpace(value as string)) throw new AppException($"{key.Replace('_', ' ')} is required.");
        return await db.Transaction(async (c, t) => {
            await Database.Query(c, t, "SELECT pg_advisory_xact_lock(6102028)");
            var rows = await Database.Query(c, t, "SELECT * FROM passes WHERE id = $1 AND pass_office_visible($2, office_id) FOR UPDATE", id, Offices.Scope(actor));
            if (rows.Count == 0) throw new AppException("Pass not found.", 404);
            var existing = rows[0];
            if (body.TryGetProperty("office_id", out _))
            {
                var office = Offices.Validate(Text(body, "office_id"));
                if (!Offices.ManagesAccounts(actor) || existing["office_id"] is not null ||
                    existing["status"] is not ("DRAFT" or "PENDING_APPROVAL") || existing["approved_by"] is not null)
                    throw new AppException("Only unapproved, unassigned passes can be assigned by a district administrator.", 403);
                input["office_id"] = office;
                input["authority_signature_url"] = null;
            }
            if (input.ContainsKey("mobile_number")) IdentityValidation.Mobile(input["mobile_number"] as string);
            if (input.ContainsKey("govt_id_type") || input.ContainsKey("govt_id_number")) IdentityValidation.GovernmentId(input.GetValueOrDefault("govt_id_type", existing["govt_id_type"]) as string, input.GetValueOrDefault("govt_id_number", existing["govt_id_number"]) as string);
            if (actor.Role == "PRINT_TEAM" && (string)existing["status"]! != "PENDING_APPROVAL") throw new AppException("Print operators can edit only passes awaiting approval.", 403);
            var checkName = (input.GetValueOrDefault("full_name", existing["full_name"]) as string)?.Trim() ?? "";
            var checkMobile = (input.GetValueOrDefault("mobile_number", existing["mobile_number"]) as string)?.Trim() ?? "";
            var checkGovtId = (input.GetValueOrDefault("govt_id_number", existing["govt_id_number"]) as string)?.Trim() ?? "";
            var duplicate = await FindDuplicate(c, t, checkName, checkMobile, checkGovtId, id);
            if (duplicate is not null)
            {
                if (!Offices.CanAccess(actor, duplicate["office_id"])) throw new AppException(Offices.DuplicateOutsideOffice, 409);
                var passNo = duplicate["pass_number"] as string ?? "";
                var existingStatus = duplicate["status"] as string ?? "";
                throw new AppException($"Already present: A pass for {checkName} with this mobile number and government ID already exists (Pass #{passNo}, Status: {existingStatus.Replace('_', ' ')}).", 409);
            }
            var requestedStatus = Text(body, "status");
            if (actor.Role == "ADMIN" && requestedStatus.Length > 0 && requestedStatus != existing["status"] as string)
            {
                if (!Statuses.Contains(requestedStatus)) throw new AppException("Invalid pass status.");
                input["status"] = requestedStatus;
                if (requestedStatus is "APPROVED" or "READY_TO_PRINT" && existing["status"] is not ("APPROVED" or "READY_TO_PRINT"))
                {
                    input["approved_by"] = actor.Email;
                    input["approved_at"] = DateTime.UtcNow;
                }
            }
            foreach (var item in input) existing[item.Key] = item.Value;
            input["qr_payload"] = Payload(existing);
            var args = input.Values.ToList(); args.Add(id);
            var fields = input.Keys.Select((key, i) => $"{key} = ${i + 1}");
            var updated = await Database.Query(c, t, $"UPDATE passes SET {string.Join(',', fields)}, updated_at = NOW() WHERE id = ${args.Count} RETURNING *", args.ToArray());
            await Accounts.Audit(c, t, actor, "PASS_UPDATED", $"Updated {existing["full_name"]}.", id, (string)existing["pass_number"]!);
            if (input.TryGetValue("office_id", out var assignedOffice))
                await Accounts.Audit(c, t, actor, "PASS_OFFICE_ASSIGNED", $"Assigned office: {assignedOffice}.", id, (string)existing["pass_number"]!);
            return updated[0];
        });
    }
    public async Task<object> SetStatus(Guid id, string status, SessionUser actor)
    {
        if (!Statuses.Contains(status)) throw new AppException("Invalid status.");
        return await db.Transaction(async (c, t) => {
            var rows = await Database.Query(c, t, """
                UPDATE passes SET status = $2, updated_at = NOW(),
                  approved_by = CASE WHEN $2 IN ('READY_TO_PRINT','APPROVED') AND status NOT IN ('READY_TO_PRINT','APPROVED') THEN $3 ELSE approved_by END,
                  approved_at = CASE WHEN $2 IN ('READY_TO_PRINT','APPROVED') AND status NOT IN ('READY_TO_PRINT','APPROVED') THEN NOW() ELSE approved_at END
                WHERE id = $1 AND pass_office_visible($4, office_id) RETURNING *
                """, id, status, actor.Email, Offices.Scope(actor));
            if (rows.Count == 0) throw new AppException("Pass not found.", 404);
            await Accounts.Audit(c, t, actor, "STATUS_CHANGE_TO_" + status, $"Status changed to {status}.", id, (string)rows[0]["pass_number"]!);
            return rows[0];
        });
    }
    public async Task Delete(Guid id, SessionUser actor)
    {
        await db.Transaction(async (c, t) => {
            var rows = await Database.Query(c, t, "DELETE FROM passes WHERE id = $1 AND pass_office_visible($2, office_id) RETURNING pass_number, office_id", id, Offices.Scope(actor));
            if (rows.Count == 0) throw new AppException("Pass not found.", 404);
            await Accounts.Audit(c, t, actor, "PASS_DELETED", "Pass permanently deleted.", null, (string)rows[0]["pass_number"]!, rows[0]["office_id"] as string);
            return true;
        });
    }
    public async Task<object> SendToPrintTeam(Guid id, SessionUser actor)
    {
        return await db.Transaction(async (c, t) => {
            var rows = await Database.Query(c, t, "SELECT * FROM passes WHERE id = $1 AND pass_office_visible($2, office_id) FOR UPDATE", id, Offices.Scope(actor));
            if (rows.Count == 0) throw new AppException("Pass not found.", 404);
            var status = (string)rows[0]["status"]!;
            if (status == "READY_TO_PRINT") return rows[0];
            if (status is not ("DRAFT" or "APPROVED" or "PENDING_APPROVAL")) throw new AppException("Only draft, approved or pending passes can be sent to the print team. Printed cards use the reprint workflow; revoked passes require security review.", 403);
            var updated = await Database.Query(c, t, "UPDATE passes SET status = 'READY_TO_PRINT', approved_by = CASE WHEN status = 'APPROVED' THEN approved_by ELSE $2 END, approved_at = CASE WHEN status = 'APPROVED' THEN approved_at ELSE NOW() END, updated_at = NOW() WHERE id = $1 RETURNING *", id, actor.Email);
            await Accounts.Audit(c, t, actor, "PASS_SENT_TO_PRINT_TEAM", "Approved and released to its print queue.", id, (string)updated[0]["pass_number"]!);
            return updated[0];
        });
    }
    public async Task<object> Print(Guid[] ids, SessionUser actor, string? reason = null, bool preview = false)
    {
        ids = ids.Distinct().ToArray();
        if (ids.Length is 0 or > 500) throw new AppException("Select 1–500 passes.");
        return await db.Transaction(async (c, t) => {
            var rows = await Database.Query(c, t, "SELECT * FROM passes WHERE id = ANY($1) AND pass_office_visible($2, office_id) ORDER BY id FOR UPDATE", ids, Offices.Scope(actor));
            if (rows.Count != ids.Length) throw new AppException("One or more passes were not found.", 404);
            if (rows.Any(row => (string)row["status"]! is not ("READY_TO_PRINT" or "PRINTED"))) throw new AppException("Only approved cards in Ready to Print or Printed status may be printed.", 403);
            if (preview) return new { successCount = rows.Count };
            var updated = await Database.Query(c, t, "UPDATE passes SET status = 'PRINTED', printed_count = printed_count + 1, last_printed_at = NOW(), last_printed_by = $2, updated_at = NOW() WHERE id = ANY($1) RETURNING *", ids, actor.Email);
            foreach (var row in updated) await Accounts.Audit(c, t, actor, reason is null ? "PASS_PRINT_REQUESTED" : "REPRINT_REQUESTED", reason ?? "Authorized print request recorded; physical output must be confirmed at the station.", (Guid)row["id"]!, (string)row["pass_number"]!);
            return ids.Length == 1 ? (object)updated[0] : new { successCount = updated.Count };
        });
    }
    public async Task<object> Statistics(SessionUser actor)
    {
        var scope = Offices.Scope(actor);
        var (rows, offices) = await db.Transaction(async (c, t) => {
            await Database.Query(c, t, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
            var grouped = await Database.Query(c, t, "SELECT status, institution, category, COUNT(*) AS n FROM passes WHERE pass_office_visible($1, office_id) GROUP BY status, institution, category", scope);
            var perOffice = await Database.Query(c, t, "SELECT * FROM pass_office_statistics($1)", scope);
            return (grouped, perOffice);
        });
        long Count(string key, string value) => rows.Where(r => (string)r[key]! == value).Sum(r => (long)r["n"]!);
        var total = rows.Sum(r => (long)r["n"]!);
        return new { total, offices, draft = Count("status", "DRAFT"), pendingApproval = Count("status", "PENDING_APPROVAL"), approved = Count("status", "APPROVED"), readyToPrint = Count("status", "READY_TO_PRINT"), printed = Count("status", "PRINTED"), issued = Count("status", "ISSUED"), revoked = Count("status", "REVOKED"),
            byInstitution = new { IISER = Count("institution", "IISER"), IIT = Count("institution", "IIT"), ICI = Count("institution", "ICI") + Count("institution", "ICU"), ICU = Count("institution", "ICI") + Count("institution", "ICU"), Other = total - Count("institution", "IISER") - Count("institution", "IIT") - Count("institution", "ICI") - Count("institution", "ICU") },
            byCategory = new { Student = Count("category", "Student"), Faculty = Count("category", "Faculty/Staff"), Worker = Count("category", "Worker"), Other = total - Count("category", "Student") - Count("category", "Faculty/Staff") - Count("category", "Worker") } };
    }
}
