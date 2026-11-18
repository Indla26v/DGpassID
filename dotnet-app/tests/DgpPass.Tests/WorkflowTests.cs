using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DgpPass.Core;
using DgpPass.Server;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace DgpPass.Tests;

public sealed class WorkflowTests
{
    [Fact]
    public async Task RolesApprovalPrintingAndSessionRevocationAreEnforced()
    {
        var configured = Environment.GetEnvironmentVariable("TEST_DATABASE_URL");
        if (string.IsNullOrWhiteSpace(configured)) return; // Skipped unless TEST_DATABASE_URL is explicitly provided
        var settings = new NpgsqlConnectionStringBuilder(ConnectionSettings.Parse(configured!));
        Assert.True(settings.Host is "localhost" or "127.0.0.1" or "::1", "Integration tests only run against a local PostgreSQL server.");
        var name = "dgp_dotnet_test_" + Guid.NewGuid().ToString("N");
        await using var maintenance = NpgsqlDataSource.Create(settings.ConnectionString);
        await using (var create = maintenance.CreateCommand($"CREATE DATABASE \"{name}\"")) await create.ExecuteNonQueryAsync();
        WebApplication? app = null;
        WebApplication? printStationBackend = null;
        try {
            settings.Database = name;
            app = ApiHost.Build(settings.ConnectionString, Path.GetFullPath("../../../../../src/DgpPass.Server/wwwroot", AppContext.BaseDirectory), "http://127.0.0.1:0");
            var database = app.Services.GetRequiredService<Database>();
            await database.Initialize(); await database.Initialize(); // Repeat migration must preserve existing data.
            var accounts = app.Services.GetRequiredService<Accounts>();
            await accounts.Bootstrap("admin@example.test", "Test Administrator", "admin-only-test-password");
            await Assert.ThrowsAsync<AppException>(() => accounts.Bootstrap("intruder@example.test", "Intruder", "another-test-password"));
            await app.StartAsync(); var origin = app.Urls.Single();
            // A second backend represents another station using the same pooled database.
            printStationBackend = ApiHost.Build(settings.ConnectionString, Path.GetFullPath("../../../../../src/DgpPass.Server/wwwroot", AppContext.BaseDirectory), "http://127.0.0.1:0");
            await printStationBackend.StartAsync();
            using var anon = Client(origin); using var admin = Client(origin); using var printer = Client(printStationBackend.Urls.Single());
            foreach (var path in new[] { "/api/passes", "/api/print-queue", "/api/stats", "/api/departments", "/api/audit-logs", "/api/config/authority-signature", "/api/users" }) Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/auth/login", new { email = "admin@example.test", password = "wrong-password" })).StatusCode);
            using var crossSite = Client(origin); crossSite.DefaultRequestHeaders.Remove("Origin"); crossSite.DefaultRequestHeaders.Add("Origin", "https://attacker.example");
            Assert.Equal(HttpStatusCode.Forbidden, (await crossSite.PostAsJsonAsync("/api/auth/login", new { email = "admin@example.test", password = "admin-only-test-password" })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/auth/login", new { email = "ADMIN@example.test", password = "admin-only-test-password" })).StatusCode);
            var createdUser = await Json(await admin.PostAsJsonAsync("/api/users", new { email = "printer@example.test", name = "Print Operator", role = "PRINT_TEAM", password = "printer-only-test-password" }), HttpStatusCode.Created);
            var printerId = createdUser.GetProperty("user").GetProperty("id").GetString();
            Assert.Equal(HttpStatusCode.OK, (await printer.PostAsJsonAsync("/api/auth/login", new { email = "printer@example.test", password = "printer-only-test-password" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.GetAsync("/api/passes")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.GetAsync("/api/users")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.GetAsync("/api/audit-logs")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PostAsJsonAsync("/api/departments", new { name = "Unauthorized department" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PostAsJsonAsync("/api/config/authority-signature", new { signatureUrl = "data:image/png;base64,AAAA" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PostAsJsonAsync("/api/users", new { email = "x@example.test", name = "X", role = "ADMIN", password = "fake-admin-test-password" })).StatusCode);
            var pass = await Json(await printer.PostAsJsonAsync("/api/passes", new { full_name = "Integration Test Person", father_or_spouse_name = "Test Parent", department = "Police department", institution = "Other", category = "External Agency", mobile_number = "9999999999", govt_id_number = "234567890123", status = "READY_TO_PRINT", approved_by = "forged-admin", authority_signature_url = "forged-signature", operatorName = "spoofed-operator" }), HttpStatusCode.Created);
            var id = pass.GetProperty("id").GetString();
            Assert.Equal(HttpStatusCode.BadRequest, (await printer.PutAsJsonAsync($"/api/passes/{id}", new { mobile_number = "999999999X" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await printer.PutAsJsonAsync($"/api/passes/{id}", new { govt_id_number = "23456789012X" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await printer.PutAsJsonAsync($"/api/passes/{id}", new { govt_id_type = "PAN Card" })).StatusCode);
            Assert.Equal("PENDING_APPROVAL", pass.GetProperty("status").GetString()); Assert.Equal(JsonValueKind.Null, pass.GetProperty("approved_by").ValueKind); Assert.Equal(JsonValueKind.Null, pass.GetProperty("authority_signature_url").ValueKind);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PostAsJsonAsync("/api/print-queue", new { id })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PatchAsJsonAsync($"/api/passes/{id}/status", new { status = "READY_TO_PRINT" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.DeleteAsync($"/api/passes/{id}")).StatusCode);
            var edited = await Json(await printer.PutAsJsonAsync($"/api/passes/{id}", new { full_name = "Corrected Person", status = "READY_TO_PRINT", authority_signature_url = "forged" }), HttpStatusCode.OK);
            Assert.Equal("PENDING_APPROVAL", edited.GetProperty("status").GetString());
            await Json(await admin.PatchAsJsonAsync($"/api/passes/{id}/status", new { status = "READY_TO_PRINT", operatorName = "forged" }), HttpStatusCode.OK);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PutAsJsonAsync($"/api/passes/{id}", new { full_name = "Tampered" })).StatusCode);
            var printed = await Json(await printer.PostAsJsonAsync("/api/print-queue", new { id, operatorName = "spoofed-operator" }), HttpStatusCode.OK);
            Assert.Equal("printer@example.test", printed.GetProperty("last_printed_by").GetString()); Assert.Equal(1, printed.GetProperty("printed_count").GetInt32());
            var reprinted = await Json(await printer.PostAsJsonAsync($"/api/passes/{id}/reprint", new { reason = "Damaged card replacement" }), HttpStatusCode.OK); Assert.Equal(2, reprinted.GetProperty("printed_count").GetInt32());
            var queued = await Json(await printer.GetAsync("/api/print-queue?search=Corrected"), HttpStatusCode.OK); Assert.Equal(1, queued.GetProperty("total").GetInt32());
            var adminDraft = await Json(await admin.PostAsJsonAsync("/api/passes", new { full_name = "Admin handoff test", department = "Police department", mobile_number = "9999999997", govt_id_number = "234567890123", status = "DRAFT" }), HttpStatusCode.Created);
            var handoffId = adminDraft.GetProperty("id").GetString();
            var handoffNumber = adminDraft.GetProperty("pass_number").GetString();
            var beforeHandoff = await Json(await printer.GetAsync($"/api/print-queue?status=READY_TO_PRINT&search={handoffNumber}"), HttpStatusCode.OK); Assert.Equal(0, beforeHandoff.GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PostAsync($"/api/passes/{handoffId}/send-to-print", null)).StatusCode);
            var sent = await Json(await admin.PostAsync($"/api/passes/{handoffId}/send-to-print", null), HttpStatusCode.OK); Assert.Equal("READY_TO_PRINT", sent.GetProperty("status").GetString());
            var afterHandoff = await Json(await printer.GetAsync($"/api/print-queue?status=READY_TO_PRINT&search={handoffNumber}"), HttpStatusCode.OK); Assert.Equal(1, afterHandoff.GetProperty("total").GetInt32());
            await Json(await admin.PostAsync($"/api/passes/{handoffId}/send-to-print", null), HttpStatusCode.OK);
            var sentAudit = await database.Query("SELECT action FROM audit_logs WHERE pass_id = $1 AND action = 'PASS_SENT_TO_PRINT_TEAM'", Guid.Parse(handoffId!)); Assert.Single(sentAudit);
            await Json(await printer.PostAsJsonAsync("/api/print-queue", new { id = handoffId }), HttpStatusCode.OK);
            Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsync($"/api/passes/{handoffId}/send-to-print", null)).StatusCode);
            var directAdminPass = await Json(await admin.PostAsJsonAsync("/api/passes", new { full_name = "Admin direct queue test", department = "Police department", mobile_number = "9999999996", govt_id_number = "234567890123" }), HttpStatusCode.Created);
            Assert.Equal("READY_TO_PRINT", directAdminPass.GetProperty("status").GetString());
            var directQueue = await Json(await printer.GetAsync($"/api/print-queue?status=READY_TO_PRINT&search={directAdminPass.GetProperty("pass_number").GetString()}"), HttpStatusCode.OK); Assert.Equal(1, directQueue.GetProperty("total").GetInt32());
            var pending = await Json(await printer.PostAsJsonAsync("/api/passes", new { full_name = "Pending batch member", department = "Police department", mobile_number = "9999999998", govt_id_number = "234567890123" }), HttpStatusCode.Created);
            var pendingId = pending.GetProperty("id").GetString();
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PostAsJsonAsync("/api/print-queue", new { ids = new[] { id, pendingId } })).StatusCode);
            var afterFailedBatch = await Json(await printer.GetAsync($"/api/passes/{id}"), HttpStatusCode.OK); Assert.Equal(2, afterFailedBatch.GetProperty("printed_count").GetInt32());
            await Json(await admin.PatchAsJsonAsync($"/api/passes/{pendingId}/status", new { status = "READY_TO_PRINT" }), HttpStatusCode.OK);
            var batch = await Json(await printer.PostAsJsonAsync("/api/print-queue", new { ids = new[] { id, pendingId } }), HttpStatusCode.OK); Assert.Equal(2, batch.GetProperty("successCount").GetInt32());
            await Json(await admin.PatchAsJsonAsync($"/api/passes/{id}/status", new { status = "REVOKED" }), HttpStatusCode.OK);
            Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsync($"/api/passes/{id}/send-to-print", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PostAsJsonAsync("/api/print-queue", new { ids = new[] { id } })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await printer.PostAsJsonAsync($"/api/passes/{id}/reprint", new { reason = "Try revoked card" })).StatusCode);
            var audit = await Json(await admin.GetAsync("/api/audit-logs"), HttpStatusCode.OK); Assert.DoesNotContain("spoofed-operator", audit.ToString()); Assert.Contains("printer@example.test", audit.ToString());
            await Json(await admin.PatchAsJsonAsync("/api/users", new { id = printerId, is_active = false }), HttpStatusCode.OK);
            Assert.Equal(HttpStatusCode.Unauthorized, (await printer.GetAsync("/api/auth/session")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await printer.PostAsJsonAsync("/api/auth/login", new { email = "printer@example.test", password = "printer-only-test-password" })).StatusCode);
            var sessions = await database.Query("SELECT token_hash FROM app_sessions"); Assert.All(sessions, row => Assert.Matches("^[0-9A-F]{64}$", (string)row["token_hash"]!));
            for (var attempt = 0; attempt < 10; attempt++) Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/auth/login", new { email = "unknown@example.test", password = "wrong-password" })).StatusCode);
            Assert.Equal(HttpStatusCode.TooManyRequests, (await anon.PostAsJsonAsync("/api/auth/login", new { email = "unknown@example.test", password = "wrong-password" })).StatusCode);
            await Json(await admin.PostAsync("/api/auth/logout", null), HttpStatusCode.OK); Assert.Equal(HttpStatusCode.Unauthorized, (await admin.GetAsync("/api/auth/session")).StatusCode);
            var portalAccounts = await accounts.CreatePortalAccounts();
            Assert.Equal(2, portalAccounts.Length);
            Assert.NotEqual(portalAccounts[0].Password, portalAccounts[1].Password);
            await Assert.ThrowsAsync<AppException>(() => accounts.CreatePortalAccounts());
            using var simpleAdmin = Client(origin); using var simplePrint = Client(printStationBackend.Urls.Single());
            await Json(await simpleAdmin.PostAsJsonAsync("/api/auth/login", new { email = "admin", password = portalAccounts[0].Password }), HttpStatusCode.OK);
            await Json(await simplePrint.PostAsJsonAsync("/api/auth/login", new { email = "print", password = portalAccounts[1].Password }), HttpStatusCode.OK);
            Assert.Equal(HttpStatusCode.OK, (await simpleAdmin.GetAsync("/api/users")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await simplePrint.GetAsync("/api/users")).StatusCode);
        } finally {
            if (printStationBackend is not null) { await printStationBackend.StopAsync(); await printStationBackend.DisposeAsync(); }
            if (app is not null) { await app.StopAsync(); await app.DisposeAsync(); }
            NpgsqlConnection.ClearAllPools();
            await using var drop = maintenance.CreateCommand($"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)"); await drop.ExecuteNonQueryAsync();
        }
    }
    private static HttpClient Client(string origin) { var client = new HttpClient(new HttpClientHandler { CookieContainer = new CookieContainer() }) { BaseAddress = new Uri(origin) }; client.DefaultRequestHeaders.Add("Origin", origin); return client; }
    private static async Task<JsonElement> Json(HttpResponseMessage response, HttpStatusCode expected) { var body = await response.Content.ReadAsStringAsync(); Assert.True(response.StatusCode == expected, $"Expected {(int)expected}, got {(int)response.StatusCode}: {body}"); using var document = JsonDocument.Parse(body); return document.RootElement.Clone(); }
}
