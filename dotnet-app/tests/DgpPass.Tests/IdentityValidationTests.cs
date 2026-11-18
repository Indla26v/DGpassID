using DgpPass.Core;
using Xunit;
namespace DgpPass.Tests;
public class IdentityValidationTests
{
    [Theory]
    [InlineData("9876543210")]
    [InlineData("6000000001")]
    public void AcceptsTenDigitMobile(string value) => IdentityValidation.Mobile(value);
    [Theory]
    [InlineData("987654321a")]
    [InlineData("+919876543210")]
    [InlineData("98765 43210")]
    [InlineData("1234567890")]
    [InlineData("987654321")]
    [InlineData("9876543210\n")]
    [InlineData("९८७६५४३२१०")]
    public void RejectsInvalidMobile(string value) => Assert.Throws<AppException>(() => IdentityValidation.Mobile(value));
    [Theory]
    [InlineData("Aadhaar", "234567890123")]
    [InlineData("PAN Card", "ABCDE1234F")]
    [InlineData("Passport", "A1234567")]
    [InlineData("Voter ID", "ABC1234567")]
    public void AcceptsIdFormats(string type, string value) => IdentityValidation.GovernmentId(type, value);
    [Theory]
    [InlineData("Aadhaar", "23456789012X")]
    [InlineData("Aadhaar", "123456789012")]
    [InlineData("Aadhaar", "2345 6789 0123")]
    [InlineData("Aadhaar", "23456789012")]
    [InlineData("Aadhaar", "234567890123\n")]
    [InlineData("PAN Card", "1234567890")]
    [InlineData("Unknown", "123")]
    public void RejectsIdFormats(string type, string value) => Assert.Throws<AppException>(() => IdentityValidation.GovernmentId(type, value));
}
