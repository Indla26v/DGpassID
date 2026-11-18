using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.AspNetCore.Builder;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using DgpPass.Server;
using DgpPass.Core;

namespace DgpPass.Desktop;

public static class Program
{
    private static WebApplication? host;
    [STAThread]
    public static void Main(string[] args)
    {
        var installIndex = Array.IndexOf(args, "--install-defaults");
        if (installIndex >= 0 && installIndex + 1 < args.Length) { InstallDefaults(args[installIndex + 1]); return; }
        if (args.Contains("--check-bundled-defaults")) { CheckBundledDefaults(); return; }
        if (args.Contains("--configure-neon")) { ConfigureNeon().GetAwaiter().GetResult(); return; }
        if (args.Contains("--check-installation")) { CheckInstallation().GetAwaiter().GetResult(); return; }
        if (args.Contains("--create-portal-accounts") || args.Contains("--connection-info")) {
            try { Settings.Load(); } catch { }
            DgpPass.Server.Program.Main(args).GetAwaiter().GetResult();
            return;
        }
        var application = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        application.DispatcherUnhandledException += (_, eventArgs) => { MessageBox.Show("The application encountered an unexpected error. Restart it and check the connection settings.", "Conference Pass Management"); eventArgs.Handled = true; };
        application.Startup += async (_, _) => {
            try {
                WorkstationSettings? settings = null;
                try { settings = Settings.Load(); } catch (Exception ex) {
                    WriteStartupLog($"Settings.Load failed: {ex.Message}");
                    MessageBox.Show("Saved settings could not be opened for this Windows account. Please reconnect.", "Conference Pass Management");
                }
                WriteStartupLog(settings is null ? "No saved connection found." : $"Loaded {settings.Mode} connection. Admin setup needed: {settings.NeedsAdminSetup}.");
                if (settings is null || settings.NeedsAdminSetup || args.Contains("--configure")) { var setup = new SetupWindow(settings); if (setup.ShowDialog() != true) { application.Shutdown(); return; } settings = setup.Result!; }
                string origin;
                if (settings.Mode == "remote") origin = settings.ServerUrl;
                else {
                    host = ApiHost.Build(settings.DatabaseUrl, Path.Combine(AppContext.BaseDirectory, "wwwroot"), "http://127.0.0.1:0");
                    await host.StartAsync(); origin = host.Urls.Single().TrimEnd('/');
                }
                var window = DesktopWindow.CreateMain();
                var browser = new WebView2(); window.Content = browser; application.MainWindow = window; window.Show();
                window.Closed += async (_, _) => { browser.Dispose(); if (host is not null) { await host.StopAsync(); await host.DisposeAsync(); host = null; } application.Shutdown(); };
                try {
                    var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Settings.DirectoryPath, "WebView2"));
                    await browser.EnsureCoreWebView2Async(environment);
                } catch {
                    MessageBox.Show("Microsoft Edge WebView2 Runtime is required. Install the Evergreen Runtime from https://developer.microsoft.com/microsoft-edge/webview2 and reopen this app.", "WebView2 required"); window.Close(); return;
                }
                browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
                browser.CoreWebView2.Settings.AreHostObjectsAllowed = false;
                browser.CoreWebView2.Settings.IsWebMessageEnabled = false;
                browser.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
                browser.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
                browser.CoreWebView2.NewWindowRequested += (_, eventArgs) => { eventArgs.Handled = true; };
                browser.CoreWebView2.NavigationStarting += (_, eventArgs) => {
                    if (!Uri.TryCreate(eventArgs.Uri, UriKind.Absolute, out var target) || target.GetLeftPart(UriPartial.Authority) != origin) eventArgs.Cancel = true;
                };
                browser.CoreWebView2.PermissionRequested += (_, eventArgs) => {
                    // Photo capture is the only web permission this application uses.
                    if (eventArgs.PermissionKind != CoreWebView2PermissionKind.Camera || !eventArgs.Uri.StartsWith(origin + "/", StringComparison.Ordinal)) eventArgs.State = CoreWebView2PermissionState.Deny;
                };
                browser.Source = new Uri(origin);
                WriteStartupLog("Opened the sign-in workspace.");
            } catch (Exception ex) {
                WriteStartupLog($"Startup failed: {ex}");
                MessageBox.Show("Unable to start the application. Use DgpPass.exe --configure to check your connection settings.", "Conference Pass Management");
                if (host is not null) await host.DisposeAsync();
                application.Shutdown(1);
            }
        };
        application.Run();
    }
    private static void InstallDefaults(string defaultsFile)
    {
        try {
            if (!File.Exists(defaultsFile)) throw new AppException($"Installer connection defaults are missing at: {defaultsFile}");
            var supplied = JsonSerializer.Deserialize<WorkstationSettings>(File.ReadAllText(defaultsFile)) ?? throw new AppException("Installer connection defaults are missing.");
            var target = new Npgsql.NpgsqlConnectionStringBuilder(ConnectionSettings.Parse(supplied.DatabaseUrl));
            if (supplied.Mode != "local" || !ConnectionSettings.IsNeon(target.Host ?? "")) throw new AppException("The installer requires a valid Neon connection profile.");
            var installed = supplied with { NeedsAdminSetup = false };
            Settings.Save(installed);
            try { File.WriteAllBytes(Settings.InstalledDefaultPath, File.ReadAllBytes(SharedConnectionSettings.FilePath)); } catch { }
            try {
                if (!File.Exists(Settings.InstalledDefaultJsonPath))
                {
                    File.Copy(defaultsFile, Settings.InstalledDefaultJsonPath, true);
                }
            } catch { }
            WriteStartupLog("Installer configured the Neon connection for sign-in.");
        } catch (Exception ex) {
            WriteStartupLog($"InstallDefaults failed: {ex.Message}");
            Console.Error.WriteLine("Connection installation failed. Run Setup again for this Windows account.");
            Environment.ExitCode = 1;
        }
    }
    private static void CheckBundledDefaults()
    {
        try {
            var settings = Settings.LoadBundledDefault() ?? throw new AppException("The Neon profile is not bundled in this executable.");
            Console.WriteLine($"Bundled Neon profile: {settings.Mode}, admin setup: {settings.NeedsAdminSetup}, pooled: {new Npgsql.NpgsqlConnectionStringBuilder(ConnectionSettings.Parse(settings.DatabaseUrl)).Host?.Contains("-pooler.") == true}.");
        } catch { Console.Error.WriteLine("The bundled Neon profile is missing or invalid."); Environment.ExitCode = 1; }
    }
    private static void WriteStartupLog(string message)
    {
        try { Directory.CreateDirectory(Settings.DirectoryPath); File.AppendAllText(Path.Combine(Settings.DirectoryPath, "startup.log"), $"{DateTimeOffset.UtcNow:O} {message}{Environment.NewLine}"); } catch { }
    }
    private static async Task ConfigureNeon()
    {
        var connection = SharedConnectionSettings.ResolveConnection();
        var parsed = new Npgsql.NpgsqlConnectionStringBuilder(ConnectionSettings.Parse(connection));
        if (!ConnectionSettings.IsNeon(parsed.Host ?? "")) throw new AppException("A Neon PostgreSQL connection is required.");
        await using var database = new Database(connection);
        await database.Initialize();
        var needsAdmin = (await database.Query("SELECT id FROM app_users LIMIT 1")).Count == 0;
        Settings.Save(new("local", connection, "", needsAdmin));
        Console.WriteLine("Neon TLS connection verified. Schema initialized. Connection encrypted for this Windows account.");
        Console.WriteLine(needsAdmin ? "Launch DgpPass.exe to create the first administrator." : "Launch DgpPass.exe and sign in with an existing account.");
    }
    private static async Task CheckInstallation()
    {
        try {
            var settings = Settings.Load() ?? throw new AppException("Connection setup is required.");
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            if (settings.Mode == "remote") {
                using var health = await client.GetAsync(settings.ServerUrl + "/api/health"); health.EnsureSuccessStatusCode();
            } else {
                await using var database = new Database(settings.DatabaseUrl);
                await database.Query("SELECT 1");
                var root = Path.Combine(AppContext.BaseDirectory, "wwwroot");
                if (!File.Exists(Path.Combine(root, "index.html"))) throw new AppException("The wwwroot folder is missing.");
                await using var app = ApiHost.Build(settings.DatabaseUrl, root, "http://127.0.0.1:0");
                await app.StartAsync(); var origin = app.Urls.Single();
                try {
                    using var health = await client.GetAsync(origin + "/api/health"); health.EnsureSuccessStatusCode();
                    var html = await client.GetStringAsync(origin + "/");
                    if (!html.Contains("/assets/")) throw new AppException("Interface assets are unavailable.");
                    using var protectedApi = await client.GetAsync(origin + "/api/passes");
                    if (protectedApi.StatusCode != HttpStatusCode.Unauthorized) throw new AppException("API authorization check failed.");
                } finally { await app.StopAsync(); }
            }
            Console.WriteLine("Installation check passed: database connection, packaged backend, interface assets and API protection.");
        } catch { Console.Error.WriteLine("Installation check failed. Check the connection settings, internet access and wwwroot folder."); Environment.ExitCode = 1; }
    }
}
