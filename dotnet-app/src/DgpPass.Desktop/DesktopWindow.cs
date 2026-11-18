using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace DgpPass.Desktop;

internal static class DesktopWindow
{
    public static ImageSource Logo() => BitmapFrame.Create(new Uri("pack://application:,,,/Assets/app-logo.png"));
    public static Window CreateMain()
    {
        var window = new Window {
            Title = "Conference Pass Management", Background = Brushes.White,
            WindowStyle = WindowStyle.SingleBorderWindow, ResizeMode = ResizeMode.CanResize,
            ShowInTaskbar = true, WindowState = WindowState.Normal, Icon = Logo()
        };
        FitToScreen(window);
        return window;
    }
    public static void FitToScreen(Window window, double width = 1440, double height = 960, double minWidth = 1000, double minHeight = 700)
    {
        var work = SystemParameters.WorkArea;
        var bounds = WindowLayout.Fit(work.Left, work.Top, work.Width, work.Height, width, height, minWidth, minHeight);
        window.WindowStartupLocation = WindowStartupLocation.Manual;
        window.MinWidth = bounds.MinWidth; window.MinHeight = bounds.MinHeight;
        window.Width = bounds.Width; window.Height = bounds.Height;
        window.Left = bounds.Left; window.Top = bounds.Top;
    }
}
