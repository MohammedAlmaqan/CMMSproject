; CommandPulse CMMS Installer Wizard (Layer 2)
; Wraps the tested installer/install.ps1 engine
; Compiles to Setup_CommandPulse.exe (do NOT commit .exe)

#define MyAppName "CommandPulse CMMS"
#define MyAppVersion "1.6.2"
#define BundleDir "CommandPulse-CMMS-v" + MyAppVersion
#define MyAppPublisher "CommandPulse"
#define MyAppURL "https://github.com/MohammedAlmaqan/CMMSproject"

[Setup]
AppId={{B8F3E9A2-7C42-4D81-9B26-8A1E7F42C956}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={pf}\CommandPulse\CMMS
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\out
OutputBaseFilename=Setup_CommandPulse
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Engine and supporting files
Source: "..\install.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "..\templates\*"; DestDir: "{app}\installer\templates"; Flags: ignoreversion recursesubdirs createallsubdirs
; Wizard orchestration script
Source: "scripts\Invoke-InstallerWizard.ps1"; DestDir: "{app}\installer\wizard\scripts"; Flags: ignoreversion
; Bundle placeholder (IT will provide or use existing)
Source: ".gitkeep"; DestDir: "{app}\bundle"; Flags: ignoreversion
Source: ".gitkeep"; DestDir: "{app}\installer\wizard"; Flags: ignoreversion

[Dirs]
Name: "{app}\bundle"

[Code]
var
  PwFileToDelete: String;
  PageBundle: TInputQueryWizardPage;
  PageDB: TInputQueryWizardPage;
  PageApp: TInputQueryWizardPage;
  PagePM2: TInputQueryWizardPage;

procedure InitializeWizard();
begin
  // Bundle page
  PageBundle := CreateInputQueryPage(wpWelcome,
    'Source Bundle', 'Select the CommandPulse CMMS bundle location',
    'Provide the full path to the extracted bundle containing SHA256SUMS.txt. The Setup program is distributed beside that folder or inside it.');
  PageBundle.Add('&Bundle Path:', False);
  PageBundle.Add('&Install Root:', False);
  if DirExists(ExpandConstant('{src}\{#BundleDir}')) then
    PageBundle.Values[0] := ExpandConstant('{src}\{#BundleDir}')
  else
    PageBundle.Values[0] := ExpandConstant('{src}');
  PageBundle.Values[1] := ExpandConstant('{pf}\CommandPulse\CMMS');

  // Database page
  PageDB := CreateInputQueryPage(PageBundle.ID,
    'PostgreSQL Configuration', 'Configure the database connection',
    'Use a new database name. This wizard refuses the live database name cmms.');
  PageDB.Add('&Host:', False);
  PageDB.Add('&Port:', False);
  PageDB.Add('&User:', False);
  PageDB.Add('&Password:', True);
  PageDB.Add('&Database Name:', False);
  PageDB.Values[0] := 'localhost';
  PageDB.Values[1] := '5432';
  PageDB.Values[2] := 'postgres';
  PageDB.Values[4] := 'cmms_install';

  // App page
  PageApp := CreateInputQueryPage(PageDB.ID,
    'Application Settings', 'Configure API and site settings',
    'BindHost should remain 127.0.0.1 for security.');
  PageApp.Add('API &Port:', False);
  PageApp.Add('&Bind Host:', False);
  PageApp.Add('Site &Name:', False);
  PageApp.Add('CORS &Origins (optional):', False);
  PageApp.Values[0] := '4000';
  PageApp.Values[1] := '127.0.0.1';
  PageApp.Values[2] := 'cmms.local';

  // PM2/Prisma page
  PagePM2 := CreateInputQueryPage(PageApp.ID,
    'PM2 & Prisma Settings', 'Advanced options for multi-instance or offline installs',
    'Use App Name Prefix if running alongside an existing CMMS instance on the same Windows user.');
  PagePM2.Add('PM2 App &Name Prefix (optional):', False);
  PagePM2.Add('Prisma Engines &Path (optional):', False);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  // Basic validation
  if CurPageID = PageDB.ID then
  begin
    if PageDB.Values[3] = '' then
    begin
      MsgBox('PostgreSQL password is required.', mbError, MB_OK);
      Result := False;
    end;
    if Trim(PageDB.Values[4]) = '' then
    begin
      MsgBox('Database name is required.', mbError, MB_OK);
      Result := False;
    end;
    if CompareText(Trim(PageDB.Values[4]), 'cmms') = 0 then
    begin
      MsgBox('The database name "cmms" is the live production database on the existing host and is not a blank-install target. Choose a new name.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = PageApp.ID then
  begin
    if (StrToIntDef(Trim(PageApp.Values[0]), 0) < 1) or (StrToIntDef(Trim(PageApp.Values[0]), 0) > 65535) then
    begin
      MsgBox('API port must be a number between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = PageBundle.ID then
  begin
    if PageBundle.Values[0] = '' then
    begin
      MsgBox('Source bundle path is required.', mbError, MB_OK);
      Result := False;
    end;
    if PageBundle.Values[1] = '' then
    begin
      MsgBox('Install root is required.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  TmpResult: Integer;
  Cmd: String;
  PwFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    // The password reaches the engine through a file because Inno cannot hand a
    // SecureString to a child process. The file is random-named, ACL-restricted
    // to the installing account, and deleted after the engine exits and again
    // in DeinitializeSetup if setup is aborted in between.
    PwFile := ExpandConstant('{tmp}\cmms_pgpass_' + GetDateTimeString('hhmmss', #0, #0) + '.tmp');
    PwFileToDelete := PwFile;
    SaveStringToFile(PwFile, PageDB.Values[3], False);
    Exec(ExpandConstant('{sys}\icacls.exe'),
         '"' + PwFile + '" /inheritance:r /grant:r "' + GetUserNameString() + ':R"',
         '', SW_HIDE, ewWaitUntilTerminated, TmpResult);
    
    Cmd := 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + 
           ExpandConstant('{app}\installer\wizard\scripts\Invoke-InstallerWizard.ps1') + '" ' +
           '-BundlePath "' + PageBundle.Values[0] + '" ' +
           '-InstallRoot "' + PageBundle.Values[1] + '" ' +
           '-PgHost "' + PageDB.Values[0] + '" ' +
           '-PgPort "' + PageDB.Values[1] + '" ' +
           '-PgUser "' + PageDB.Values[2] + '" ' +
           '-PgPassFile "' + PwFile + '" ' +
           '-DbName "' + PageDB.Values[4] + '" ' +
           '-ApiPort "' + PageApp.Values[0] + '" ' +
           '-BindHost "' + PageApp.Values[1] + '" ' +
           '-SiteName "' + PageApp.Values[2] + '" ' +
           '-CorsOrigins "' + PageApp.Values[3] + '" ' +
           '-AppNamePrefix "' + PagePM2.Values[0] + '" ' +
           '-PrismaEnginesPath "' + PagePM2.Values[1] + '"';
    
    Exec(ExpandConstant('{sys}\cmd.exe'), '/c ' + Cmd, '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
    
    DeleteFile(PwFile);
    // The engine reports failure with a non-zero exit code. Reporting that as a
    // successful install is the exact failure mode the engine logs showed nine
    // times, so the wizard stops instead of finishing.
    if ResultCode <> 0 then
    begin
      MsgBox('The installer engine failed with exit code ' + IntToStr(ResultCode) + '.' + #13#10 +
             'Review the logs in %ProgramData%\CommandPulse\logs and re-run the wizard.',
             mbError, MB_OK);
      Abort;
    end;
  end;
end;

procedure DeinitializeSetup();
begin
  if PwFileToDelete <> '' then
    DeleteFile(PwFileToDelete);
end;
