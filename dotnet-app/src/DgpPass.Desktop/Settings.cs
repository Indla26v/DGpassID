using DgpPass.Core;
using System.IO;
using System.Reflection;
using System.Text.Json;

namespace DgpPass.Desktop;

public static class Settings
{
    public static string DirectoryPath => SharedConnectionSettings.DirectoryPath;
    public static string InstalledDefaultPath => Path.Combine(AppContext.BaseDirectory, "connection.default.dat");
    public static string InstalledDefaultJsonPath => Path.Combine(AppContext.BaseDirectory, "connection.default.json");

    public static WorkstationSettings? Load()
    {
        // 1. Try loading user's saved profile from %LOCALAPPDATA%\DgpPass\connection.dat
        WorkstationSettings? saved = null;
        try {
            saved = SharedConnectionSettings.Load();
            if (saved is not null && !saved.NeedsAdminSetup) return saved;
        } catch (AppException) { /* Fall through to defaults */ }

        // 2. Try loading embedded Neon default compiled into this executable
        WorkstationSettings? bundled = null;
        try { bundled = LoadBundledDefault(); }
        catch (AppException) { }

        if (bundled is not null)
        {
            try { SharedConnectionSettings.Save(bundled); } catch { }
            try { File.WriteAllBytes(InstalledDefaultPath, File.ReadAllBytes(SharedConnectionSettings.FilePath)); } catch { }
            return bundled;
        }

        // 3. Try loading installation default json placed beside DgpPass.exe
        WorkstationSettings? installed = null;
        try {
            if (File.Exists(InstalledDefaultJsonPath))
            {
                var json = File.ReadAllText(InstalledDefaultJsonPath);
                var parsed = JsonSerializer.Deserialize<WorkstationSettings>(json);
                if (parsed is not null && parsed.Mode == "local")
                {
                    var target = new Npgsql.NpgsqlConnectionStringBuilder(ConnectionSettings.Parse(parsed.DatabaseUrl));
                    if (ConnectionSettings.IsNeon(target.Host ?? ""))
                    {
                        installed = parsed with { NeedsAdminSetup = false };
                    }
                }
            }
        } catch { }

        // 4. Try loading DPAPI default dat
        if (installed is null)
        {
            try { installed = SharedConnectionSettings.LoadFrom(InstalledDefaultPath); }
            catch (AppException) { }
        }

        if (installed is not null)
        {
            try { SharedConnectionSettings.Save(installed); } catch { }
            return installed;
        }

        return saved;
    }
    public static void Save(WorkstationSettings settings) => SharedConnectionSettings.Save(settings);

    public static WorkstationSettings? LoadBundledDefault()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("DgpPass.NeonDefaults.json");
        if (stream is null) return null;
        var settings = JsonSerializer.Deserialize<WorkstationSettings>(stream) ?? throw new AppException("The bundled Neon profile is empty.");
        var parsed = new Npgsql.NpgsqlConnectionStringBuilder(ConnectionSettings.Parse(settings.DatabaseUrl));
        if (settings.Mode != "local" || !ConnectionSettings.IsNeon(parsed.Host ?? "")) throw new AppException("The bundled Neon profile is invalid.");
        return settings with { NeedsAdminSetup = false };
    }
}
