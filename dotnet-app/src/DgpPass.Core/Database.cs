using System.Data;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

namespace DgpPass.Core;

public sealed class AppException(string message, int status = 400) : Exception(message) { public int Status { get; } = status; }

public sealed class Database : IAsyncDisposable
{
    private readonly string _connectionString;
    private NpgsqlDataSource _source;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public NpgsqlDataSource Source => _source;

    public Database(string connectionString)
    {
        _connectionString = connectionString;
        _source = CreateDataSource(connectionString, null);
    }

    public static NpgsqlDataSource CreateDataSource(string connectionString, string? overrideIp = null)
    {
        var parsed = ConnectionSettings.Parse(connectionString);
        var builder = new NpgsqlConnectionStringBuilder(parsed);
        var targetHost = builder.Host ?? "";

        if (overrideIp != null)
        {
            builder.Host = overrideIp;
            builder.SslMode = SslMode.Require;
            var dsBuilder = new NpgsqlDataSourceBuilder(builder.ConnectionString);
            dsBuilder.UseSslClientAuthenticationOptionsCallback(options =>
            {
                options.TargetHost = targetHost;
            });
            return dsBuilder.Build();
        }

        // Check if OS DNS works for the host
        if (!string.IsNullOrWhiteSpace(targetHost) && !IPAddress.TryParse(targetHost, out _))
        {
            var isDnsOk = false;
            try
            {
                var ips = Dns.GetHostAddresses(targetHost);
                if (ips.Length > 0) isDnsOk = true;
            }
            catch (SocketException)
            {
                isDnsOk = false;
            }

            if (!isDnsOk)
            {
                var dohIp = ResolveDnsOverHttps(targetHost);
                if (!string.IsNullOrEmpty(dohIp))
                {
                    builder.Host = dohIp;
                    builder.SslMode = SslMode.Require;
                    var dsBuilder = new NpgsqlDataSourceBuilder(builder.ConnectionString);
                    dsBuilder.UseSslClientAuthenticationOptionsCallback(options =>
                    {
                        options.TargetHost = targetHost;
                    });
                    return dsBuilder.Build();
                }
            }
        }

        return NpgsqlDataSource.Create(builder.ConnectionString);
    }

    public static string? ResolveDnsOverHttps(string host)
    {
        if (string.IsNullOrWhiteSpace(host) || IPAddress.TryParse(host, out _)) return host;
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
            var response = client.GetStringAsync($"https://dns.google/resolve?name={Uri.EscapeDataString(host)}&type=A").GetAwaiter().GetResult();
            using var doc = JsonDocument.Parse(response);
            if (doc.RootElement.TryGetProperty("Answer", out var answer) && answer.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in answer.EnumerateArray())
                {
                    if (item.TryGetProperty("type", out var type) && type.GetInt32() == 1 &&
                        item.TryGetProperty("data", out var data))
                    {
                        var ip = data.GetString();
                        if (!string.IsNullOrWhiteSpace(ip) && IPAddress.TryParse(ip, out _))
                            return ip;
                    }
                }
            }
        }
        catch
        {
            try
            {
                using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
                using var req = new HttpRequestMessage(HttpMethod.Get, $"https://1.1.1.1/dns-query?name={Uri.EscapeDataString(host)}&type=A");
                req.Headers.Add("Accept", "application/dns-json");
                using var res = client.Send(req);
                if (res.IsSuccessStatusCode)
                {
                    var content = res.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    using var doc = JsonDocument.Parse(content);
                    if (doc.RootElement.TryGetProperty("Answer", out var answer) && answer.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in answer.EnumerateArray())
                        {
                            if (item.TryGetProperty("type", out var type) && type.GetInt32() == 1 &&
                                item.TryGetProperty("data", out var data))
                            {
                                var ip = data.GetString();
                                if (!string.IsNullOrWhiteSpace(ip) && IPAddress.TryParse(ip, out _))
                                    return ip;
                            }
                        }
                    }
                }
            }
            catch { }
        }
        return null;
    }

    public async Task<NpgsqlConnection> OpenConnectionWithRetryAsync()
    {
        const int maxAttempts = 3;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await _source.OpenConnectionAsync();
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                // If it's a DNS failure that happened after construction, switch to DoH
                if (ex.InnerException is SocketException { SocketErrorCode: SocketError.HostNotFound or SocketError.NoData } ||
                    ex is SocketException { SocketErrorCode: SocketError.HostNotFound or SocketError.NoData })
                {
                    await _lock.WaitAsync();
                    try
                    {
                        var dohIp = ResolveDnsOverHttps(new NpgsqlConnectionStringBuilder(ConnectionSettings.Parse(_connectionString)).Host ?? "");
                        if (!string.IsNullOrEmpty(dohIp))
                        {
                            await _source.DisposeAsync();
                            _source = CreateDataSource(_connectionString, dohIp);
                        }
                    }
                    finally
                    {
                        _lock.Release();
                    }
                }
                // Back off briefly for cold starts / network latency
                await Task.Delay(1200 * attempt);
            }
        }
    }

    public async Task<List<Dictionary<string, object?>>> Query(string sql, params object?[] args)
    {
        await using var connection = await OpenConnectionWithRetryAsync();
        return await Query(connection, null, sql, args);
    }

    public static async Task<List<Dictionary<string, object?>>> Query(NpgsqlConnection connection, NpgsqlTransaction? transaction, string sql, params object?[] args)
    {
        await using var cmd = new NpgsqlCommand(sql, connection, transaction);
        foreach (var arg in args) cmd.Parameters.Add(new NpgsqlParameter { Value = arg ?? DBNull.Value });
        await using var reader = await cmd.ExecuteReaderAsync();
        List<Dictionary<string, object?>> rows = [];
        while (await reader.ReadAsync())
        {
            Dictionary<string, object?> row = [];
            for (var i = 0; i < reader.FieldCount; i++) row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            rows.Add(row);
        }
        return rows;
    }

    public async Task<T> Transaction<T>(Func<NpgsqlConnection, NpgsqlTransaction, Task<T>> action)
    {
        await using var connection = await OpenConnectionWithRetryAsync();
        await using var tx = await connection.BeginTransactionAsync();
        var result = await action(connection, tx);
        await tx.CommitAsync();
        return result;
    }

    public async Task Initialize()
    {
        var assembly = typeof(Database).Assembly;
        await Transaction(async (c, t) => {
            await Query(c, t, "SELECT pg_advisory_xact_lock(6102026)");
            foreach (var resource in new[] { "schema.sql", "offices.sql" }) {
                using var reader = new StreamReader(assembly.GetManifestResourceStream($"DgpPass.Core.{resource}")!);
                await Query(c, t, await reader.ReadToEndAsync());
            }
            return true;
        });
    }

    public async ValueTask DisposeAsync()
    {
        _lock.Dispose();
        await _source.DisposeAsync();
    }
}

public static class ConnectionSettings
{
    public static bool IsNeon(string host) => host.EndsWith(".neon.tech", StringComparison.OrdinalIgnoreCase);
    public static string Parse(string value)
    {
        NpgsqlConnectionStringBuilder builder;
        if (value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) || value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(value);
            var user = uri.UserInfo.Split(':', 2);
            if (user.Length != 2 || string.IsNullOrEmpty(uri.AbsolutePath.Trim('/'))) throw new AppException("Enter the complete PostgreSQL connection URL.");
            builder = new() { Host = uri.Host, Port = uri.Port > 0 ? uri.Port : 5432, Username = Uri.UnescapeDataString(user[0]), Password = Uri.UnescapeDataString(user[1]), Database = Uri.UnescapeDataString(uri.AbsolutePath.Trim('/')) };
            var sslModeSpecified = false;
            foreach (var part in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var pair = part.Split('=', 2);
                if (pair.Length == 2 && pair[0].Equals("sslmode", StringComparison.OrdinalIgnoreCase) && Enum.TryParse<SslMode>(pair[1].Replace("-", ""), true, out var ssl)) {
                    builder.SslMode = ssl;
                    sslModeSpecified = true;
                }
                if (pair.Length == 2 && pair[0].Equals("channel_binding", StringComparison.OrdinalIgnoreCase) && Enum.TryParse<ChannelBinding>(pair[1], true, out var binding)) builder.ChannelBinding = binding;
            }
            if (!sslModeSpecified && IsNeon(builder.Host ?? "")) builder.SslMode = SslMode.Require;
        }
        else builder = new(value);

        if (IsNeon(builder.Host ?? "")) builder.SslMode = SslMode.VerifyFull;

        builder.Pooling = true;
        builder.MaxPoolSize = 5;
        builder.Timeout = 45;
        builder.CommandTimeout = 60;
        builder.KeepAlive = 15;
        builder.IncludeErrorDetail = false;
        builder.ApplicationName = "DGP .NET Pass Management";
        return builder.ConnectionString;
    }
}
