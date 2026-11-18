using DgpPass.Core;

namespace DgpPass.Server;

public static class Program
{
    public static async Task Main(string[] args)
    {
        var connection = SharedConnectionSettings.ResolveConnection();
        if (args.Contains("--connection-info")) {
            var target = new Npgsql.NpgsqlConnectionStringBuilder(ConnectionSettings.Parse(connection));
            Console.WriteLine($"Database host: {target.Host}; port: {target.Port}; TLS: {target.SslMode}; channel binding: {target.ChannelBinding}; pooling: {target.Pooling}");
            try {
                var addresses = await System.Net.Dns.GetHostAddressesAsync(target.Host!);
                Console.WriteLine($"Database DNS addresses resolved via OS: {addresses.Length}");
            } catch {
                var doh = Database.ResolveDnsOverHttps(target.Host!);
                Console.WriteLine($"Database DNS resolved via fallback HTTPS: {doh}");
            }
            return;
        }
        if (args.Contains("--create-portal-accounts")) {
            await using var database = new Database(connection);
            await database.Initialize();
            var credentials = await new Accounts(database).CreatePortalAccounts();
            var saved = SharedConnectionSettings.Load();
            if (saved?.Mode == "local" && ConnectionSettings.Parse(saved.DatabaseUrl) == ConnectionSettings.Parse(connection)) SharedConnectionSettings.Save(saved with { NeedsAdminSetup = false });
            Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(credentials, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
            return;
        }
        if (args.Contains("--check-connection")) {
            await using var database = new Database(connection);
            await database.Query("SELECT 1");
            Console.WriteLine("Shared pooled PostgreSQL connection verified using the backend's default connection settings.");
            return;
        }
        var root = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        var app = ApiHost.Build(connection, root, Environment.GetEnvironmentVariable("APP_URL") ?? "http://127.0.0.1:5080");
        if (args.Contains("--initialize")) await app.Services.GetRequiredService<Database>().Initialize();
        if (args.Contains("--bootstrap")) {
            var email = Environment.GetEnvironmentVariable("ADMIN_EMAIL") ?? "";
            var name = Environment.GetEnvironmentVariable("ADMIN_NAME") ?? "Administrator";
            var password = Environment.GetEnvironmentVariable("ADMIN_PASSWORD") ?? "";
            await app.Services.GetRequiredService<Accounts>().Bootstrap(email, name, password);
            Console.WriteLine("Administrator created.");
        }
        await app.RunAsync();
    }
}
