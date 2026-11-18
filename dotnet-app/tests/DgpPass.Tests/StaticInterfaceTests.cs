using System.Net;
using DgpPass.Server;
using Xunit;

namespace DgpPass.Tests;

public sealed class StaticInterfaceTests
{
    [Fact]
    public async Task InterfaceAndLogoLoadWhenAnOldCookieCannotReachTheDatabase()
    {
        var webRoot = Path.GetFullPath("../../../../../src/DgpPass.Server/wwwroot", AppContext.BaseDirectory);
        await using var app = ApiHost.Build("Host=127.0.0.1;Port=1;Username=unused;Password=unused;Database=unused", webRoot, "http://127.0.0.1:0");
        await app.StartAsync();
        try {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
            client.DefaultRequestHeaders.Add("Cookie", "dgp_session=" + new string('A', 64));
            using var response = await client.GetAsync("/");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Contains("/assets/", await response.Content.ReadAsStringAsync());
            using var logo = await client.GetAsync("/app-logo.svg");
            Assert.Equal(HttpStatusCode.OK, logo.StatusCode);
            Assert.Equal("image/svg+xml", logo.Content.Headers.ContentType?.MediaType);
        } finally { await app.StopAsync(); }
    }
}
