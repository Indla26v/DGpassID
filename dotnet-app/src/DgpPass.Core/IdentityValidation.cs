using System.Text.RegularExpressions;

namespace DgpPass.Core;

public static class IdentityValidation
{
    public static void Mobile(string? value)
    {
        if (value is null || !Regex.IsMatch(value, "^[6-9][0-9]{9}\\z")) throw new AppException("Mobile number must contain exactly 10 digits, start with 6–9, and contain no spaces, letters or country code.");
    }
    public static void GovernmentId(string? type, string? value)
    {
        var (pattern, message) = type switch {
            "Aadhaar" => ("^[2-9][0-9]{11}\\z", "Aadhaar must contain exactly 12 digits, start with 2–9, and contain no letters or spaces."),
            "PAN Card" => ("^[A-Z]{5}[0-9]{4}[A-Z]\\z", "PAN must contain 5 uppercase letters, 4 digits and 1 uppercase letter."),
            "Passport" => ("^[A-Z][0-9]{7}\\z", "Passport number must contain 1 uppercase letter followed by 7 digits."),
            "Voter ID" => ("^[A-Z]{3}[0-9]{7}\\z", "Voter ID must contain 3 uppercase letters followed by 7 digits."),
            "Driving License" => ("^[A-Z]{2}[0-9]{13,14}\\z", "Driving licence must contain a 2-letter state code followed by 13–14 digits, without separators."),
            "Institute ID" => ("^[A-Za-z0-9/-]{1,32}\\z", "Institute ID must contain 1–32 letters, digits, hyphens or slashes."),
            _ => ("(?!)", "Choose a supported government ID type.")
        };
        if (value is null || !Regex.IsMatch(value, pattern)) throw new AppException(message);
    }
}
