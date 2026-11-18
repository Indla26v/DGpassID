namespace DgpPass.Core;

public static class Offices
{
    public const string District = "district";
    public const string Unassigned = "unassigned";
    public const string DuplicateOutsideOffice = "A matching pass already exists outside your office. Contact the district administrator.";

    public static bool ManagesAccounts(SessionUser user) => user.Role == "ADMIN" && user.OfficeId is null or District;
    public static string? Scope(SessionUser user) => ManagesAccounts(user) ? null : user.OfficeId ?? Unassigned;
    public static bool CanAccess(SessionUser user, object? office) => Scope(user) is not string scope || scope == (office as string ?? Unassigned);

    public static string Validate(string office) => office is "chandragiri" or "renigunta" or "tirupati" or District
        ? office : throw new AppException("Choose a valid office.");

    public static string? ForNewPass(SessionUser user, string requested)
    {
        if (!ManagesAccounts(user)) return user.OfficeId;
        return requested.Length == 0 ? user.OfficeId : Validate(requested);
    }
}
