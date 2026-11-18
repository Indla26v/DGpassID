using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using DgpPass.Core;

namespace DgpPass.Server;

public sealed class SessionAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, Accounts accounts)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Loading the application shell and its images never requires a database session.
        if (!Request.Path.StartsWithSegments("/api")) return AuthenticateResult.NoResult();
        var user = await accounts.Session(Request.Cookies["dgp_session"]);
        if (user is null) return AuthenticateResult.NoResult();
        var identity = new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.Email),
            new Claim(ClaimTypes.Email, user.Email), new Claim("display_name", user.Name), new Claim(ClaimTypes.Role, user.Role)
        }, Scheme.Name);
        if (user.OfficeId is not null) identity.AddClaim(new Claim("office_id", user.OfficeId));
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name));
    }
    protected override Task HandleChallengeAsync(AuthenticationProperties properties) {
        Response.StatusCode = 401; return Response.WriteAsJsonAsync(new { error = "Sign in to continue." });
    }
    protected override Task HandleForbiddenAsync(AuthenticationProperties properties) {
        Response.StatusCode = 403; return Response.WriteAsJsonAsync(new { error = "Your account does not have permission for this action." });
    }
}
