#ifndef PublishDir
  #error PublishDir is required
#endif
#ifndef SetupFileName
  #define SetupFileName "DgpPass-Setup-x64"
#endif
#ifndef DefaultsFile
  #error DefaultsFile is required
#endif
#ifndef WebViewBootstrapper
  #error WebViewBootstrapper is required
#endif

[Setup]
AppId={{47A45451-763C-449E-94B6-A3DD569DD5E0}
AppName=Conference Pass Management
AppVersion=1.2.4
AppPublisher=Conference Pass Management
DefaultDirName={localappdata}\Programs\DgpPass
DefaultGroupName=Conference Pass Management
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
OutputDir=..\artifacts\installer
OutputBaseFilename={#SetupFileName}
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\DgpPass.exe
SetupIconFile=..\src\DgpPass.Desktop\Assets\app.ico
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "connection.default.dat,*.xml"
Source: "{#DefaultsFile}"; DestDir: "{app}"; DestName: "connection.default.json"; Flags: ignoreversion
Source: "{#WebViewBootstrapper}"; DestName: "MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\Conference Pass Management"; Filename: "{app}\DgpPass.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Conference Pass Management"; Filename: "{app}\DgpPass.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\DgpPass.exe"; Description: "Open Conference Pass Management and sign in"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\connection.default.dat"
Type: files; Name: "{app}\connection.default.json"

[Code]
function WebViewInstalled(): Boolean;
var
  Version: String;
  Key: String;
begin
  Key := 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := (RegQueryStringValue(HKCU, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKLM32, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if not WebViewInstalled() then begin
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      Result := 'Microsoft Edge WebView2 could not be installed. Check your internet connection and retry Setup.'
    else if not WebViewInstalled() then
      Result := 'Microsoft Edge WebView2 installation did not complete. Restart Windows and run Setup again.';
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
  DefaultsPath: String;
begin
  if CurStep = ssPostInstall then begin
    DefaultsPath := ExpandConstant('{app}\connection.default.json');
    if FileExists(DefaultsPath) then begin
      Exec(ExpandConstant('{app}\DgpPass.exe'), '--install-defaults "' + DefaultsPath + '"', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ExitCode);
    end;
  end;
end;
