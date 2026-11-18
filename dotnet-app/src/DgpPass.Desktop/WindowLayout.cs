namespace DgpPass.Desktop;

internal readonly record struct WindowBounds(double Left, double Top, double Width, double Height, double MinWidth, double MinHeight);
internal static class WindowLayout
{
    public static WindowBounds Fit(double left, double top, double workWidth, double workHeight,
        double desiredWidth = 1440, double desiredHeight = 960, double minWidth = 1000, double minHeight = 700)
    {
        // Work-area coordinates are WPF device-independent units, including display scaling.
        var width = Math.Min(desiredWidth, Math.Max(1, workWidth - 48));
        var height = Math.Min(desiredHeight, Math.Max(1, workHeight - 48));
        return new(left + (workWidth - width) / 2, top + (workHeight - height) / 2,
            width, height, Math.Min(minWidth, width), Math.Min(minHeight, height));
    }
}
