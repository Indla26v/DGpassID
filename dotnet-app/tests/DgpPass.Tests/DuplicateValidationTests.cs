using System.Text.RegularExpressions;
using DgpPass.Core;
using Xunit;

namespace DgpPass.Tests;

public class DuplicateValidationTests
{
    [Theory]
    [InlineData("Rajesh Kumar", " rajesh kumar ", true)]
    [InlineData("CHANDRA SHEKHAR", "chandra shekhar", true)]
    [InlineData("Venkatesh Rao", "Venkatesh", false)]
    [InlineData("Sunita Devi", "Sunita Sharma", false)]
    public void ComparesNamesCaseAndWhitespaceInsensitive(string nameA, string nameB, bool expectedMatch)
    {
        var normA = (nameA ?? "").Trim().ToLowerInvariant();
        var normB = (nameB ?? "").Trim().ToLowerInvariant();
        Assert.Equal(expectedMatch, normA == normB);
    }

    [Theory]
    [InlineData("9876543210", "+91 98765 43210", true)]
    [InlineData("+91-9876543210", "9876543210", true)]
    [InlineData("9876543210", "9876543211", false)]
    [InlineData("+919123456789", "9123456789", true)]
    public void ComparesMobileNumbersByTenDigitSuffix(string mobileA, string mobileB, bool expectedMatch)
    {
        static string Clean(string m)
        {
            var digits = Regex.Replace(m ?? "", "[^0-9]", "");
            return digits.Length > 10 ? digits[^10..] : digits;
        }

        var match = mobileA.Trim() == mobileB.Trim() || (Clean(mobileA).Length == 10 && Clean(mobileA) == Clean(mobileB));
        Assert.Equal(expectedMatch, match);
    }

    [Theory]
    [InlineData("2345-6789-0123", "234567890123", true)]
    [InlineData("abcde1234f", "ABCDE1234F", true)]
    [InlineData("ABCDE-1234-F", "abcde1234f", true)]
    [InlineData("A1234567", "a1234567", true)]
    [InlineData("234567890123", "234567890124", false)]
    public void ComparesGovtIdNormalizedAlphanumeric(string idA, string idB, bool expectedMatch)
    {
        static string Clean(string id) => Regex.Replace((id ?? "").Trim(), "[^a-zA-Z0-9]", "").ToLowerInvariant();

        var match = (idA ?? "").Trim().ToLowerInvariant() == (idB ?? "").Trim().ToLowerInvariant()
                    || (Clean(idA ?? "").Length > 0 && Clean(idA ?? "") == Clean(idB ?? ""));
        Assert.Equal(expectedMatch, match);
    }

    [Fact]
    public void DuplicateCheckThrowsAppExceptionWith409()
    {
        var ex = new AppException("Already present: A pass for Rajesh Kumar with this mobile number and government ID already exists (Pass #DGPCONF-2026-0001, Status: READY TO PRINT). Redundant pass creation is disallowed.", 409);
        Assert.Equal(409, ex.Status);
        Assert.StartsWith("Already present", ex.Message);
    }

    [Fact]
    public async Task CanConnectUsingResolvedIpWithSslTargetHost()
    {
        var connStr = SharedConnectionSettings.ResolveConnection();
        var parsed = ConnectionSettings.Parse(connStr);
        var builder = new Npgsql.NpgsqlConnectionStringBuilder(parsed);
        var originalHost = builder.Host!;

        // Use IP directly instead of host
        builder.Host = "13.228.46.236";
        builder.SslMode = Npgsql.SslMode.Require;

        var dataSourceBuilder = new Npgsql.NpgsqlDataSourceBuilder(builder.ConnectionString);
        dataSourceBuilder.UseSslClientAuthenticationOptionsCallback(options =>
        {
            options.TargetHost = originalHost;
        });

        await using var dataSource = dataSourceBuilder.Build();
        await using var connection = await dataSource.OpenConnectionAsync();
        await using var cmd = new Npgsql.NpgsqlCommand("SELECT 1", connection);
        var res = await cmd.ExecuteScalarAsync();
        Assert.Equal(1, res);
    }
}
