using DgpPass.Core;
using Xunit;

namespace DgpPass.Tests;

public sealed class ConnectionDefaultsTests
{
    [Fact]
    public void PooledDeploymentSecretOverridesDirectUrlAndLocalProfile()
    {
        var values = new Dictionary<string, string?> { ["DATABASE_URL_POOLED"] = " pooled-deployment-url ", ["DATABASE_URL"] = "direct-deployment-url" };
        var connection = SharedConnectionSettings.ResolveConnection(key => values.GetValueOrDefault(key), () => throw new InvalidOperationException("The saved profile must not be read when a deployment secret is supplied."));
        Assert.Equal("pooled-deployment-url", connection);
    }
    [Fact]
    public void DirectEnvironmentVariableRemainsAnExplicitOverride()
    {
        var connection = SharedConnectionSettings.ResolveConnection(key => key == "DATABASE_URL" ? "direct-deployment-url" : " ", () => throw new InvalidOperationException("The profile should not be read."));
        Assert.Equal("direct-deployment-url", connection);
    }
    [Fact]
    public void StandaloneBackendUsesTheExistingDesktopProfileByDefault()
    {
        var profile = new WorkstationSettings("local", "saved-pooled-neon-url", "", true);
        Assert.Equal(profile.DatabaseUrl, SharedConnectionSettings.ResolveConnection(_ => null, () => profile));
    }
    [Fact]
    public void RemoteStationProfileCannotBeMistakenForABackendDatabase()
    {
        var profile = new WorkstationSettings("remote", "", "https://passes.example.test");
        Assert.Throws<AppException>(() => SharedConnectionSettings.ResolveConnection(_ => null, () => profile));
    }
    [Fact]
    public void MissingConfigurationDoesNotConnectToAnUnintendedDatabase()
    {
        Assert.Throws<AppException>(() => SharedConnectionSettings.ResolveConnection(_ => " ", () => null));
    }
    [Theory]
    [InlineData("ep-test.neon.tech", true)]
    [InlineData("ep-test-pooler.ap-southeast-1.aws.neon.tech", true)]
    [InlineData("localhost", false)]
    [InlineData("example.com", false)]
    public void IsNeonDetectsNeonHosts(string host, bool expected)
    {
        Assert.Equal(expected, ConnectionSettings.IsNeon(host));
    }
}
