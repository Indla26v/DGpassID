using System.Security.Cryptography;
using System.Text.Json;

namespace DgpPass.Core;

// The JSON shape is unchanged from the original desktop profile.
public sealed record WorkstationSettings(string Mode, string DatabaseUrl, string ServerUrl, bool NeedsAdminSetup = false);

public static class SharedConnectionSettings
{
    public static string DirectoryPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DgpPass");
    public static string FilePath => Path.Combine(DirectoryPath, "connection.dat");

    public static WorkstationSettings? Load() => LoadFrom(FilePath);

    public static WorkstationSettings? LoadFrom(string filePath)
    {
        if (!OperatingSystem.IsWindows() || !File.Exists(filePath)) return null;
        try {
            var json = ProtectedData.Unprotect(File.ReadAllBytes(filePath), null, DataProtectionScope.CurrentUser);
            return JsonSerializer.Deserialize<WorkstationSettings>(json)
                ?? throw new AppException("The saved connection profile is empty. Run DgpPass.exe --configure.");
        } catch (Exception exception) when (exception is CryptographicException or JsonException or IOException or UnauthorizedAccessException) {
            throw new AppException("The saved connection could not be opened for this Windows account. Run DgpPass.exe --configure or set DATABASE_URL_POOLED.");
        }
    }

    public static void Save(WorkstationSettings settings)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Encrypted workstation profiles require Windows. Use DATABASE_URL_POOLED on other platforms.");
        Directory.CreateDirectory(DirectoryPath);
        var encrypted = ProtectedData.Protect(JsonSerializer.SerializeToUtf8Bytes(settings), null, DataProtectionScope.CurrentUser);
        var temporary = FilePath + ".tmp";
        File.WriteAllBytes(temporary, encrypted);
        File.Move(temporary, FilePath, true);
    }

    public static string ResolveConnection() => ResolveConnection(Environment.GetEnvironmentVariable, Load);

    public static string ResolveConnection(Func<string, string?> readEnvironment, Func<WorkstationSettings?> readSavedProfile)
    {
        foreach (var key in new[] { "DATABASE_URL_POOLED", "DATABASE_URL" }) {
            var value = readEnvironment(key);
            if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
        }
        var saved = readSavedProfile();
        if (saved?.Mode == "local" && !string.IsNullOrWhiteSpace(saved.DatabaseUrl)) return saved.DatabaseUrl.Trim();
        throw new AppException("No backend database connection is configured. Use the saved Neon workstation connection or set DATABASE_URL_POOLED.");
    }
}
