using System.Security.Claims;
using System.Text.Json;
using DgpPass.Core;
using Microsoft.AspNetCore.Authentication;
using Npgsql;

namespace DgpPass.Server;

public static class ApiHost
{
    public static SessionUser Actor(HttpContext context) => new(Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!), context.User.FindFirstValue(ClaimTypes.Email)!, context.User.FindFirstValue("display_name")!, context.User.FindFirstValue(ClaimTypes.Role)!, context.User.FindFirstValue("office_id"));
    public static WebApplication Build(string connection, string webRoot, string url)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = [], ContentRootPath = AppContext.BaseDirectory, WebRootPath = webRoot });
        builder.WebHost.UseUrls(url);
        builder.WebHost.ConfigureKestrel(options => { options.Limits.MaxRequestBodySize = 32 * 1024 * 1024; options.AddServerHeader = false; });
        // One owned data source/pool serves both roles and is disposed with the host.
        builder.Services.AddSingleton(_ => new Database(connection));
        builder.Services.AddSingleton<Accounts>(); builder.Services.AddSingleton<Passes>();
        builder.Services.AddAuthentication("Session").AddScheme<AuthenticationSchemeOptions, SessionAuthentication>("Session", null);
        builder.Services.AddAuthorization(options => {
            options.AddPolicy("Admin", policy => policy.RequireAuthenticatedUser().RequireRole("ADMIN"));
            options.AddPolicy("DistrictAdmin", policy => policy.RequireAuthenticatedUser().RequireRole("ADMIN").RequireAssertion(c => c.User.FindFirstValue("office_id") is null or Offices.District));
            options.AddPolicy("Workspace", policy => policy.RequireAuthenticatedUser().RequireRole("ADMIN", "PRINT_TEAM"));
        });
        var app = builder.Build();
        app.Use(async (context, next) => {
            try {
                context.Response.Headers["X-Content-Type-Options"] = "nosniff";
                context.Response.Headers["Referrer-Policy"] = "no-referrer";
                context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
                context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
                if (context.Request.Path.StartsWithSegments("/api")) {
                    context.Response.Headers.CacheControl = "no-store";
                    if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method)) {
                        var expected = Environment.GetEnvironmentVariable("APP_ORIGIN") ?? app.Urls.First().TrimEnd('/');
                        if (context.Request.Headers.Origin != expected) { context.Response.StatusCode = 403; await context.Response.WriteAsJsonAsync(new { error = "Request origin is not allowed." }); return; }
                    }
                }
                await next();
            } catch (AppException error) {
                context.Response.StatusCode = error.Status;
                if (error.Status == 429) context.Response.Headers.RetryAfter = "900";
                await context.Response.WriteAsJsonAsync(new { error = error.Message });
            } catch (PostgresException error) when (error.SqlState == "P6101") {
                context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { error = error.MessageText });
            } catch (PostgresException error) when (error.SqlState == "23505") {
                context.Response.StatusCode = 409; await context.Response.WriteAsJsonAsync(new { error = "This email, department or pass number already exists." });
            } catch (Exception error) when (error is JsonException or BadHttpRequestException or FormatException) {
                context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { error = "Invalid request. Check the supplied values." });
            } catch (Exception error) {
                // Never log SQL parameters, connection strings, personal records or passwords.
                app.Logger.LogError("Request failed with {ErrorType}.", error.GetType().Name);
                context.Response.StatusCode = 503; await context.Response.WriteAsJsonAsync(new { error = "Service unavailable. Check the database connection and retry." });
            }
        });
        app.UseAuthentication(); app.UseAuthorization();
        MapAuth(app); MapPasses(app); MapConfiguration(app);
        app.MapGet("/api/health", () => Results.Ok(new { status = "ready", backend = ".NET" }));
        app.Map("/api/{**path}", () => Results.NotFound(new { error = "API endpoint not found." }));
        app.UseDefaultFiles(); app.UseStaticFiles(); app.MapFallbackToFile("index.html");
        return app;
    }
    private static void MapAuth(WebApplication app)
    {
        app.MapPost("/api/auth/login", async (HttpContext context, Accounts accounts, JsonElement body) => {
            var (user, token) = await accounts.Login(Passes.Text(body, "email"), Passes.Text(body, "password"));
            context.Response.Cookies.Append("dgp_session", token, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = context.Request.IsHttps, Path = "/", MaxAge = TimeSpan.FromHours(8), IsEssential = true });
            return Results.Ok(new { user });
        }).AllowAnonymous();
        app.MapGet("/api/auth/session", (HttpContext context) => Results.Ok(new { user = Actor(context) })).RequireAuthorization("Workspace");
        app.MapPost("/api/auth/logout", async (HttpContext context, Accounts accounts) => {
            if (context.Request.Cookies["dgp_session"] is string token) await accounts.Logout(token);
            context.Response.Cookies.Delete("dgp_session", new CookieOptions { Path = "/" }); return Results.Ok(new { success = true });
        }).AllowAnonymous();
        app.MapGet("/api/users", async (Accounts accounts) => Results.Ok(new { users = await accounts.List() })).RequireAuthorization("DistrictAdmin");
        app.MapPost("/api/users", async (HttpContext context, Accounts accounts, JsonElement body) => Results.Json(new { user = await accounts.Create(Actor(context), Passes.Text(body, "email"), Passes.Text(body, "name"), Passes.Text(body, "password"), Passes.Text(body, "role"), Passes.Text(body, "officeId")) }, statusCode: 201)).RequireAuthorization("DistrictAdmin");
        app.MapPatch("/api/users", async (HttpContext context, Accounts accounts, JsonElement body) => {
            if (!body.TryGetProperty("is_active", out var active) || active.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw new AppException("Account status is required.");
            await accounts.SetActive(Actor(context), Passes.Id(Passes.Text(body, "id")), active.GetBoolean()); return Results.Ok(new { success = true });
        }).RequireAuthorization("DistrictAdmin");
    }
    private static void MapPasses(WebApplication app)
    {
        app.MapGet("/api/passes", async (HttpContext context, Passes passes) => Results.Ok(await passes.List(context.Request.Query.ToDictionary(q => q.Key, q => q.Value.ToString()), false, Actor(context)))).RequireAuthorization("Admin");
        app.MapGet("/api/passes/check-duplicate", async (HttpContext context, Passes passes) => {
            var name = context.Request.Query["full_name"].ToString().Trim();
            var mobile = context.Request.Query["mobile_number"].ToString().Trim();
            var govtId = context.Request.Query["govt_id_number"].ToString().Trim();
            Guid? excludeId = Guid.TryParse(context.Request.Query["exclude_id"].ToString(), out var parsed) ? parsed : null;
            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(mobile) || string.IsNullOrWhiteSpace(govtId))
            {
                return Results.Ok(new { isDuplicate = false });
            }
            var duplicate = await passes.FindDuplicate(name, mobile, govtId, excludeId);
            if (duplicate is not null)
            {
                if (!Offices.CanAccess(Actor(context), duplicate["office_id"]))
                    return Results.Ok(new { isDuplicate = true, message = Offices.DuplicateOutsideOffice });
                var passNumber = duplicate["pass_number"]?.ToString() ?? "";
                var status = duplicate["status"]?.ToString() ?? "";
                var cardholder = duplicate["full_name"]?.ToString() ?? name;
                return Results.Ok(new {
                    isDuplicate = true,
                    passNumber,
                    status,
                    fullName = cardholder,
                    printedCount = duplicate["printed_count"],
                    message = $"Already present: A pass for {cardholder} with this mobile number and government ID is already saved or printed (Pass #{passNumber}, Status: {status.Replace('_', ' ')})."
                });
            }
            return Results.Ok(new { isDuplicate = false });
        }).RequireAuthorization("Workspace");
        app.MapGet("/api/print-queue", async (HttpContext context, Passes passes) => Results.Ok(await passes.List(context.Request.Query.ToDictionary(q => q.Key, q => q.Value.ToString()), true, Actor(context)))).RequireAuthorization("Workspace");
        app.MapGet("/api/passes/{id:guid}", async (Guid id, HttpContext context, Passes passes) => Results.Ok(await passes.Find(id, Actor(context)))).RequireAuthorization("Workspace");
        app.MapPost("/api/passes", async (HttpContext context, Passes passes, JsonElement body) => {
            var actor = Actor(context);
            if (body.TryGetProperty("records", out var records)) {
                if (actor.Role != "ADMIN") return Results.Json(new { error = "Only administrators may import passes." }, statusCode: 403);
                if (records.ValueKind != JsonValueKind.Array || records.GetArrayLength() > 500) throw new AppException("Import at most 500 records at once.");
                var created = 0; List<string> errors = []; var i = 0;
                foreach (var record in records.EnumerateArray()) {
                    i++;
                    try { await passes.Create(record, actor); created++; }
                    catch (AppException error) { errors.Add($"Row {i}: {error.Message}"); }
                    catch (PostgresException error) when (error.SqlState == "P6101") { errors.Add($"Row {i}: {error.MessageText}"); }
                    catch (PostgresException) { errors.Add($"Row {i}: invalid or duplicate record."); }
                }
                return Results.Json(new { created, errors }, statusCode: 201);
            }
            return Results.Json(await passes.Create(body, actor), statusCode: 201);
        }).RequireAuthorization("Workspace");
        app.MapPut("/api/passes/{id:guid}", async (Guid id, HttpContext context, Passes passes, JsonElement body) => Results.Ok(await passes.Update(id, body, Actor(context)))).RequireAuthorization("Workspace");
        app.MapDelete("/api/passes/{id:guid}", async (Guid id, HttpContext context, Passes passes) => { await passes.Delete(id, Actor(context)); return Results.Ok(new { success = true }); }).RequireAuthorization("Admin");
        app.MapPatch("/api/passes/{id:guid}/status", async (Guid id, HttpContext context, Passes passes, JsonElement body) => Results.Ok(await passes.SetStatus(id, Passes.Text(body, "status"), Actor(context)))).RequireAuthorization("Admin");
        app.MapPost("/api/passes/{id:guid}/send-to-print", async (Guid id, HttpContext context, Passes passes) => Results.Ok(await passes.SendToPrintTeam(id, Actor(context)))).RequireAuthorization("Admin");
        app.MapPost("/api/print-queue", async (HttpContext context, Passes passes, JsonElement body) => {
            var single = Passes.Text(body, "id");
            Guid[] ids = single.Length > 0 ? [Passes.Id(single)] : body.TryGetProperty("ids", out var list) && list.ValueKind == JsonValueKind.Array ? list.EnumerateArray().Select(e => Passes.Id(e.GetString() ?? "")).ToArray() : [];
            var result = await passes.Print(ids, Actor(context), preview: Passes.Flag(body, "preview"));
            return Results.Ok(single.Length > 0 ? result : new { successCount = ids.Distinct().Count() });
        }).RequireAuthorization("Workspace");
        app.MapPost("/api/passes/{id:guid}/reprint", async (Guid id, HttpContext context, Passes passes, JsonElement body) => {
            var reason = Passes.Text(body, "reason").Trim();
            if (reason.Length is < 3 or > 500) throw new AppException("Enter a reprint reason of 3–500 characters.");
            return Results.Ok(await passes.Print([id], Actor(context), reason));
        }).RequireAuthorization("Workspace");
        app.MapGet("/api/stats", async (HttpContext context, Passes passes) => Results.Ok(await passes.Statistics(Actor(context)))).RequireAuthorization("Workspace");
        app.MapGet("/api/audit-logs", async (HttpContext context, Database db) => {
            var passId = context.Request.Query["passId"].ToString();
            var scope = Offices.Scope(Actor(context));
            const string scopedLogs = "SELECT a.* FROM audit_logs a LEFT JOIN passes p ON p.id = a.pass_id WHERE pass_office_visible($1, COALESCE(a.office_id, p.office_id))";
            if (passId.Length > 0) return Results.Ok(await db.Query(scopedLogs + " AND a.pass_id = $2 ORDER BY a.created_at DESC LIMIT 500", scope, Passes.Id(passId)));
            var limit = int.TryParse(context.Request.Query["limit"], out var value) ? Math.Clamp(value, 1, 500) : 30;
            return Results.Ok(await db.Query(scopedLogs + " ORDER BY a.created_at DESC LIMIT $2", scope, limit));
        }).RequireAuthorization("Admin");
    }
    private static void MapConfiguration(WebApplication app)
    {
        app.MapGet("/api/departments", async (Database db) => {
            var external = await db.Query("SELECT name FROM departments WHERE is_active = true AND department_type = 'EXTERNAL' ORDER BY name");
            var roles = await db.Query("SELECT name FROM staff_roles WHERE is_active = true ORDER BY id");
            return Results.Ok(new { externalDepartments = external.Select(r => r["name"]), internalStaffRoles = roles.Select(r => r["name"]) });
        }).RequireAuthorization("Workspace");
        app.MapPost("/api/departments", async (HttpContext context, Database db, JsonElement body) => {
            var name = Passes.Text(body, "name").Trim(); if (name.Length is 0 or > 255) throw new AppException("Enter a department or role name.");
            var external = Passes.Text(body, "type", "EXTERNAL") == "EXTERNAL";
            return await db.Transaction(async (c, t) => {
                var sql = external ? "INSERT INTO departments (name, created_by) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET is_active = true RETURNING *" : "INSERT INTO staff_roles (name, created_by) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET is_active = true RETURNING *";
                var rows = await Database.Query(c, t, sql, name, Actor(context).Email);
                await Accounts.Audit(c, t, Actor(context), "DEPARTMENT_ADDED", $"Added {(external ? "department" : "staff role")}: {name}.");
                return Results.Json(rows[0], statusCode: 201);
            });
        }).RequireAuthorization("DistrictAdmin");
        app.MapGet("/api/config/authority-signature", async (HttpContext context, Database db) => {
            var actor = Actor(context);
            if (actor.OfficeId is string office) {
                var row = (await db.Query("SELECT signature_url, authority_name, authority_title, name FROM pass_offices WHERE id = $1", office))[0];
                return Results.Ok(new { signatureUrl = row["signature_url"], name = row["authority_name"] ?? actor.Name, title = row["authority_title"] ?? row["name"] });
            }
            var rows = await db.Query("SELECT key, value FROM conference_configs"); var map = rows.ToDictionary(r => (string)r["key"]!, r => r["value"]);
            return Results.Ok(new { signatureUrl = map.GetValueOrDefault("authority_signature_url"), name = map.GetValueOrDefault("issuing_authority_name") ?? "R. Rao / SP", title = map.GetValueOrDefault("issuing_authority_title") ?? "SP / Security Nodal Officer, Tirupati" });
        }).RequireAuthorization("Workspace");
        app.MapDelete("/api/config/authority-signature", async (HttpContext context, Database db) => {
            var actor = Actor(context);
            return await db.Transaction(async (c, t) => {
                if (actor.OfficeId is string office)
                    await Database.Query(c, t, "UPDATE pass_offices SET signature_url = NULL WHERE id = $1", office);
                else
                    await Database.Query(c, t, "DELETE FROM conference_configs WHERE key = 'authority_signature_url'");
                await Accounts.Audit(c, t, actor, "AUTHORITY_SIGNATURE_REMOVED", "Removed the saved authority signature for future approvals.", office: actor.OfficeId);
                return Results.Ok(new { success = true });
            });
        }).RequireAuthorization("Admin");
        app.MapPost("/api/config/authority-signature", async (HttpContext context, Database db, JsonElement body) => {
            var actor = Actor(context);
            var signature = Passes.Text(body, "signatureUrl");
            var name = Passes.Text(body, "name", actor.Name).Trim();
            var title = Passes.Text(body, "title").Trim();
            if (name.Length > 255 || title.Length > 255) throw new AppException("Authority name and title must each be at most 255 characters.");
            if (signature.Length is 0 or > 3_000_000 || !(signature.StartsWith("data:image/png;base64,") || signature.StartsWith("data:image/jpeg;base64,"))) throw new AppException("Upload or draw a PNG or JPEG signature.");
            return await db.Transaction(async (c, t) => {
                if (actor.OfficeId is string office)
                    await Database.Query(c, t, "UPDATE pass_offices SET signature_url = $1, authority_name = $2, authority_title = $3 WHERE id = $4", signature, name, title, office);
                else
                    foreach (var (key, value) in new[] { ("authority_signature_url", signature), ("issuing_authority_name", name), ("issuing_authority_title", title) })
                        await Database.Query(c, t, "INSERT INTO conference_configs (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", key, value);
                await Accounts.Audit(c, t, actor, "AUTHORITY_SIGNATURE_UPDATED", "Signature updated for future passes.", office: actor.OfficeId);
                return Results.Ok(new { success = true, name, title });
            });
        }).RequireAuthorization("Admin");
        app.MapPost("/api/verify", async (HttpContext context, Database db, JsonElement body) => {
            var token = Passes.Text(body, "token", Passes.Text(body, "qrPayload"));
            var parts = token.Split('|'); if (parts.Length > 1) token = parts[1];
            var rows = await db.Query("SELECT * FROM passes WHERE verification_token = $1 AND pass_office_visible($2, office_id)", token.Trim().ToUpperInvariant(), Offices.Scope(Actor(context)));
            if (rows.Count == 0) return Results.Ok(new { isValid = false, status = "NOT_FOUND", message = "Verification token was not found." });
            var pass = rows[0]; var status = (string)pass["status"]!;
            var valid = status is "APPROVED" or "READY_TO_PRINT" or "PRINTED" or "ISSUED";
            TimeZoneInfo istZone;
            try { istZone = TimeZoneInfo.FindSystemTimeZoneById("India Standard Time"); }
            catch {
                try { istZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata"); }
                catch { istZone = TimeZoneInfo.CreateCustomTimeZone("IST", TimeSpan.FromHours(5.5), "India Standard Time", "India Standard Time"); }
            }
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, istZone));
            if (!DateOnly.TryParse((string)pass["valid_from"]!, out var from) || !DateOnly.TryParse((string)pass["valid_to"]!, out var to) || today < from || today > to) { valid = false; status = "OUTSIDE_VALIDITY"; }
            var gate = Passes.Text(body, "gateId").ToUpperInvariant();
            if (gate.Length > 0) {
                string? column = gate is "Z-A" or "ZONE-A" || gate.Contains("HOSTEL") || gate.Contains("RESIDENTIAL") ? "zone_a" : gate is "Z-B" or "ZONE-B" || gate.Contains("ACADEMIC") || gate.Contains("ADMIN") ? "zone_b" : gate is "Z-C" or "ZONE-C" || gate.Contains("SERVICE") || gate.Contains("UTILITY") ? "zone_c" : null;
                if (column is null || pass[column] is not true) { valid = false; status = "ZONE_RESTRICTED"; }
            }
            await db.Transaction(async (c, t) => { await Accounts.Audit(c, t, Actor(context), valid ? "GATE_VERIFIED_ALLOW" : "GATE_VERIFIED_DENY", $"Gate {gate}: {status}.", (Guid)pass["id"]!, (string)pass["pass_number"]!); return true; });
            return Results.Ok(new { isValid = valid, status = valid ? "VALID" : status, message = valid ? "Access authorized." : "Access denied.", pass, gateMatch = valid });
        }).RequireAuthorization("Admin");
    }
}
