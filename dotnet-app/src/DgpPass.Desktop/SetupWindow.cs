using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Net.Http;
using DgpPass.Core;
using Npgsql;

namespace DgpPass.Desktop;

public sealed class SetupWindow : Window
{
    private readonly ComboBox mode = new() { ItemsSource = new[] { "Neon database workstation", "Connect to hosted server" }, SelectedIndex = 0, Margin = new(0, 6, 0, 16), Padding = new(8) };
    private readonly PasswordBox databaseUrl = new() { Padding = new(8), Margin = new(0, 6, 0, 6) };
    private readonly TextBox serverUrl = new() { Padding = new(8), Margin = new(0, 6, 0, 6), Text = "https://" };
    private readonly TextBox email = new() { Padding = new(8), Margin = new(0, 6, 0, 12) };
    private readonly TextBox name = new() { Padding = new(8), Margin = new(0, 6, 0, 12), Text = "Administrator" };
    private readonly PasswordBox password = new() { Padding = new(8), Margin = new(0, 6, 0, 12) };
    private readonly CheckBox createAdmin = new() { Content = "Create the first administrator for a new database", IsChecked = true, Margin = new(0, 18, 0, 14) };
    private readonly TextBlock error = new() { Foreground = Brushes.Firebrick, TextWrapping = TextWrapping.Wrap, Margin = new(0, 12, 0, 12) };
    private readonly Button connect = new() {
        Content = "Connect & save",
        Padding = new(28, 10, 28, 10),
        HorizontalAlignment = HorizontalAlignment.Left,
        Background = new SolidColorBrush(Color.FromRgb(11, 37, 69)),
        Foreground = Brushes.White,
        FontWeight = FontWeights.SemiBold,
        Cursor = Cursors.Hand,
        Template = CreatePillButtonTemplate()
    };

    private static ControlTemplate CreatePillButtonTemplate()
    {
        var template = new ControlTemplate(typeof(Button));
        var factory = new FrameworkElementFactory(typeof(Border));
        factory.Name = "border";
        factory.SetValue(Border.CornerRadiusProperty, new CornerRadius(20));
        factory.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Button.BackgroundProperty));
        factory.SetValue(Border.PaddingProperty, new TemplateBindingExtension(Button.PaddingProperty));
        factory.SetValue(Border.SnapsToDevicePixelsProperty, true);
        var presenter = new FrameworkElementFactory(typeof(ContentPresenter));
        presenter.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        presenter.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        factory.AppendChild(presenter);
        template.VisualTree = factory;
        return template;
    }
    public WorkstationSettings? Result { get; private set; }
    public SetupWindow(WorkstationSettings? existing = null)
    {
        Title = "Conference Pass Management — Connection setup"; Icon = DesktopWindow.Logo(); DesktopWindow.FitToScreen(this, 610, 780, 520, 540); Background = new SolidColorBrush(Color.FromRgb(248, 250, 252)); FontFamily = new("Segoe UI");
        var panel = new StackPanel { Margin = new(32) };
        Content = new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        panel.Children.Add(new TextBlock { Text = "Set up your workstation", FontSize = 26, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush(Color.FromRgb(11, 37, 69)) });
        panel.Children.Add(new TextBlock { Text = "Connect to Neon, or use your organization's hosted server. Connection settings are encrypted for your Windows account.", TextWrapping = TextWrapping.Wrap, Foreground = Brushes.SlateGray, Margin = new(0, 10, 0, 22) });
        panel.Children.Add(new TextBlock { Text = "Connection mode", FontWeight = FontWeights.SemiBold }); panel.Children.Add(mode);
        var local = new StackPanel(); var remote = new StackPanel();
        panel.Children.Add(local); panel.Children.Add(remote);
        local.Children.Add(new TextBlock { Text = "Neon PostgreSQL connection URL", FontWeight = FontWeights.SemiBold }); local.Children.Add(databaseUrl);
        local.Children.Add(new TextBlock { Text = "Copy the pooled URL from Neon → Connect. A verified TLS connection is required.", TextWrapping = TextWrapping.Wrap, Foreground = Brushes.SlateGray, FontSize = 12 });
        local.Children.Add(createAdmin);
        var admin = new StackPanel(); local.Children.Add(admin);
        admin.Children.Add(new TextBlock { Text = "Administrator name" }); admin.Children.Add(name);
        admin.Children.Add(new TextBlock { Text = "Administrator email" }); admin.Children.Add(email);
        admin.Children.Add(new TextBlock { Text = "Administrator password (12–128 characters)" }); admin.Children.Add(password);
        remote.Children.Add(new TextBlock { Text = "Hosted server URL", FontWeight = FontWeights.SemiBold }); remote.Children.Add(serverUrl);
        remote.Children.Add(new TextBlock { Text = "Recommended for print stations: connect to the HTTPS backend provided by your administrator. Database credentials stay on the server.", TextWrapping = TextWrapping.Wrap, Foreground = Brushes.SlateGray, Margin = new(0, 8, 0, 20) });
        panel.Children.Add(error); panel.Children.Add(connect);
        void Update() { local.Visibility = mode.SelectedIndex == 0 ? Visibility.Visible : Visibility.Collapsed; remote.Visibility = mode.SelectedIndex == 1 ? Visibility.Visible : Visibility.Collapsed; admin.Visibility = createAdmin.IsChecked == true ? Visibility.Visible : Visibility.Collapsed; }
        mode.SelectionChanged += (_, _) => Update(); createAdmin.Checked += (_, _) => Update(); createAdmin.Unchecked += (_, _) => Update();
        if (existing is not null) { mode.SelectedIndex = existing.Mode == "remote" ? 1 : 0; databaseUrl.Password = existing.DatabaseUrl; serverUrl.Text = existing.ServerUrl.Length > 0 ? existing.ServerUrl : "https://"; createAdmin.IsChecked = existing.NeedsAdminSetup; }
        Update(); connect.Click += async (_, _) => await Connect();
    }
    private async Task Connect()
    {
        connect.IsEnabled = false; error.Text = "Connecting…"; error.Foreground = Brushes.SlateGray;
        try {
            WorkstationSettings settings;
            if (mode.SelectedIndex == 1) {
                if (!Uri.TryCreate(serverUrl.Text.Trim().TrimEnd('/'), UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.UserInfo.Length > 0 || uri.AbsolutePath != "/" || uri.Query.Length > 0 || uri.Fragment.Length > 0) throw new AppException("Enter the HTTPS origin of your hosted server, for example https://passes.example.org.");
                using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
                using var response = await client.GetAsync(new Uri(uri, "/api/health")); response.EnsureSuccessStatusCode();
                settings = new("remote", "", uri.GetLeftPart(UriPartial.Authority));
            } else {
                var connection = databaseUrl.Password.Trim();
                var parsed = new NpgsqlConnectionStringBuilder(ConnectionSettings.Parse(connection));
                if (!ConnectionSettings.IsNeon(parsed.Host ?? "")) throw new AppException("Use your Neon connection URL ending in .neon.tech.");
                await using var db = new Database(connection); await db.Initialize();
                if (createAdmin.IsChecked == true) await new Accounts(db).Bootstrap(email.Text.Trim(), name.Text.Trim(), password.Password);
                else if ((await db.Query("SELECT id FROM app_users LIMIT 1")).Count == 0) throw new AppException("This database has no accounts. Select 'Create the first administrator'.");
                settings = new("local", connection, "");
            }
            Settings.Save(settings); Result = settings; password.Clear(); databaseUrl.Clear(); DialogResult = true;
        } catch (AppException exception) { error.Foreground = Brushes.Firebrick; error.Text = exception.Message; }
        catch { error.Foreground = Brushes.Firebrick; error.Text = "Connection failed. Check the URL, database credentials, internet connection and database permissions. Existing accounts are never replaced."; }
        finally { connect.IsEnabled = true; }
    }
}
