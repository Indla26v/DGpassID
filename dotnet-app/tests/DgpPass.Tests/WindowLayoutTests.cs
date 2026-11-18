using DgpPass.Desktop;
using Xunit;

namespace DgpPass.Tests;

public class WindowLayoutTests
{
    [Theory]
    [InlineData(1920, 1040)]
    [InlineData(1366, 728)]
    [InlineData(1092.8, 582.4)] // 1366px display at 125% scaling.
    [InlineData(800, 560)]
    public void TitleBarAndBottomEdgeFitInsideTheUsableScreen(double width, double height)
    {
        var bounds = WindowLayout.Fit(0, 0, width, height);
        Assert.True(bounds.Top >= 0 && bounds.Left >= 0);
        Assert.True(bounds.Left + bounds.Width <= width);
        Assert.True(bounds.Top + bounds.Height <= height);
        Assert.True(bounds.MinHeight <= bounds.Height && bounds.MinWidth <= bounds.Width);
    }
    [Theory]
    [InlineData(80, 40)] // Taskbar or desktop toolbar on the left/top.
    [InlineData(-1920, 0)] // Work area at a negative monitor coordinate.
    public void WorkAreaOriginIsIncluded(double left, double top)
    {
        var bounds = WindowLayout.Fit(left, top, 1280, 720);
        Assert.Equal(left + 24, bounds.Left);
        Assert.Equal(top + 24, bounds.Top);
    }
}
