using DgpPass.Core;
using Npgsql;
using Xunit;

namespace DgpPass.Tests;

public class SecurityTests
{
    [Fact] public void PasswordsAreSaltedAndVerified()
    {
        const string password = "test-only-strong-password";
        var first = Passwords.Hash(password); var second = Passwords.Hash(password);
        Assert.NotEqual(first, second); Assert.True(Passwords.Verify(password, first));
        Assert.False(Passwords.Verify("wrong-password", first)); Assert.False(Passwords.Verify(password, "bad-hash"));
        Assert.DoesNotContain(password, first);
    }
    [Fact] public void NeonTlsCannotBeDowngradedByUrl()
    {
        var connection = ConnectionSettings.Parse("postgresql://user:p%40ss%3Aword@ep-example-pooler.region.aws.neon.tech/neondb?sslmode=disable&channel_binding=require");
        var settings = new NpgsqlConnectionStringBuilder(connection);
        Assert.Equal(SslMode.VerifyFull, settings.SslMode); Assert.Equal(ChannelBinding.Require, settings.ChannelBinding); Assert.Equal("p@ss:word", settings.Password); Assert.Equal(5, settings.MaxPoolSize);
    }
    [Fact] public void AccountValidationRejectsWeakAndInvalidAccounts()
    {
        Assert.Throws<AppException>(() => Passwords.Validate("bad-email", "Admin", "sufficiently-long-password"));
        Assert.Throws<AppException>(() => Passwords.Validate("admin@example.test", "Admin", "short"));
        Assert.Throws<AppException>(() => Passwords.Validate("admin@example.test", " ", "sufficiently-long-password"));
    }
}
