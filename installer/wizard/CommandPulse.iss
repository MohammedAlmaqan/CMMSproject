; CommandPulse CMMS Installer Wizard (Layer 2)
; Wraps the tested installer/install.ps1 engine
; Compiles to Setup_CommandPulse.exe (do NOT commit .exe)

#define MyAppName "CommandPulse CMMS"
#define MyAppVersion "1.6.6"
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
; First-Administrator helper (run from the installed backend by the engine)
Source: "..\admin\create-admin.cjs"; DestDir: "{app}\installer\admin"; Flags: ignoreversion
; Wizard orchestration script
Source: "scripts\Invoke-InstallerWizard.ps1"; DestDir: "{app}\installer\wizard\scripts"; Flags: ignoreversion
; Copies for the pre-install database probe. The database page is answered
; before [Files] is extracted, so the probe cannot use {app}\installer yet.
Source: "..\install.ps1"; DestDir: "{tmp}"; Flags: dontcopy
Source: "scripts\Invoke-InstallerWizard.ps1"; DestDir: "{tmp}"; Flags: dontcopy
; Bundle placeholder (IT will provide or use existing)
Source: ".gitkeep"; DestDir: "{app}\bundle"; Flags: ignoreversion
Source: ".gitkeep"; DestDir: "{app}\installer\wizard"; Flags: ignoreversion

[Dirs]
Name: "{app}\bundle"

[Code]
var
  PwFileToDelete: String;
  AdminFileToDelete: String;
  UpgradeExisting: Boolean;
  PageBundle: TInputQueryWizardPage;
  PageDB: TInputQueryWizardPage;
  PageApp: TInputQueryWizardPage;
  PagePM2: TInputQueryWizardPage;
  PageAdmin: TInputQueryWizardPage;

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
    'A new database is created if the name does not exist. An existing CommandPulse database can be upgraded after a confirmation; a database this installer does not own is refused.');
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

  // First Administrator page. A blank install has no users, and the
  // application only lets an existing Administrator create users, so this page
  // is what makes the finished install signable-into. The password is never
  // written to the install log and is never passed on a command line.
  PageAdmin := CreateInputQueryPage(PagePM2.ID,
    'Administrator Account', 'Create the first Administrator',
    'This account signs in at the login screen. The password is not written to the install log and cannot be recovered from it.');
  PageAdmin.Add('&Username:', False);
  PageAdmin.Add('&Full Name:', False);
  PageAdmin.Add('&Email:', False);
  PageAdmin.Add('&Password (at least 12 characters):', True);
  PageAdmin.Add('Confirm &Password:', True);
end;

function IsValidAdminUsername(S: String): Boolean;
var
  i: Integer;
  c: Char;
begin
  Result := False;
  if (Length(S) < 3) or (Length(S) > 32) then
    exit;
  for i := 1 to Length(S) do
  begin
    c := S[i];
    if not (((c >= 'A') and (c <= 'Z')) or ((c >= 'a') and (c <= 'z')) or
            ((c >= '0') and (c <= '9')) or (c = '.') or (c = '_') or (c = '-')) then
      exit;
  end;
  Result := True;
end;

function IsWeakAdminPassword(S: String): Boolean;
begin
  Result :=
    (CompareText(S, 'password') = 0) or
    (CompareText(S, 'password1') = 0) or
    (CompareText(S, 'password123') = 0) or
    (CompareText(S, 'changeme') = 0) or
    (CompareText(S, 'admin123') = 0) or
    (CompareText(S, 'administrator') = 0) or
    (CompareText(S, 'letmein') = 0) or
    (CompareText(S, 'welcome1') = 0) or
    (CompareText(S, 'cmms2026') = 0);
end;

// The Administrator details travel as a JSON file: username, full name, email
// and password in one ACL-restricted temp file. Building the JSON here means no
// user-typed value ever has to survive command-line quoting.
function JsonEscape(S: String): String;
var
  i: Integer;
  c: Char;
begin
  Result := '';
  for i := 1 to Length(S) do
  begin
    c := S[i];
    if c = '\' then
      Result := Result + '\\'
    else if c = '"' then
      Result := Result + '\"'
    else if Ord(c) < 32 then
      Result := Result + ' '
    else
      Result := Result + c;
  end;
end;

// The probe writes one JSON object. Inno has no JSON parser, and the engine's
// key order and string shape are fixed, so the one value the wizard needs is
// read by name. A missing key yields '' and takes the "could not inspect" path.
function JsonStringField(Json, Key: String): String;
var
  p, q: Integer;
begin
  Result := '';
  p := Pos('"' + Key + '":"', Json);
  if p = 0 then
    exit;
  p := p + Length(Key) + 4;
  q := Pos('"', Copy(Json, p, Length(Json)));
  if q = 0 then
    exit;
  Result := Copy(Json, p, q - 1);
end;

function ProbeDatabase(Host, Port, User, Password, DbName: String): String;
var
  PwFile, JsonFile, WizardScript, EngineScript, Cmd: String;
  Code: Integer;
  Json: AnsiString;
begin
  Result := '';
  PwFile := ExpandConstant('{tmp}\cmms_probe_pw_' + GetDateTimeString('hhmmss', #0, #0) + '.tmp');
  JsonFile := ExpandConstant('{tmp}\cmms_probe_db_' + GetDateTimeString('hhmmss', #0, #0) + '.json');
  DeleteFile(JsonFile);
  SaveStringToFile(PwFile, Password, False);
  Exec(ExpandConstant('{sys}\icacls.exe'),
       '"' + PwFile + '" /inheritance:r /grant:r "' + GetUserNameString() + ':R"',
       '', SW_HIDE, ewWaitUntilTerminated, Code);
  try
    // The wizard answers the database page before [Files] is extracted, so the
    // probe uses temporary copies rather than the installed engine.
    ExtractTemporaryFile('install.ps1');
    ExtractTemporaryFile('Invoke-InstallerWizard.ps1');
    EngineScript := ExpandConstant('{tmp}\install.ps1');
    WizardScript := ExpandConstant('{tmp}\Invoke-InstallerWizard.ps1');
    Cmd := '/c powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + WizardScript + '"' +
           ' -ProbeOnly -ProbeOut "' + JsonFile + '"' +
           ' -DbName "' + DbName + '"' +
           ' -PgHost "' + Host + '" -PgPort "' + Port + '" -PgUser "' + User + '"' +
           ' -PgPassFile "' + PwFile + '"' +
           ' -EnginePath "' + EngineScript + '"';
    if Exec(ExpandConstant('{sys}\cmd.exe'), Cmd, '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0) then
    begin
      if LoadStringFromFile(JsonFile, Json) then
        Result := JsonStringField(Json, 'kind');
    end;
  finally
    DeleteFile(PwFile);
    DeleteFile(JsonFile);
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Kind: String;
  LiveNote: String;
begin
  Result := True;
  // Basic validation
  if CurPageID = PageDB.ID then
  begin
    UpgradeExisting := False;
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
    // The target is a fact, not a name. A fresh install is unaffected; an
    // existing CommandPulse database needs an explicit Yes before any file is
    // copied; a foreign database is never touched. The engine repeats the
    // classification and enforces it, so this is a courtesy, not the control.
    if Result then
    begin
      Kind := ProbeDatabase(PageDB.Values[0], PageDB.Values[1], PageDB.Values[2],
                            PageDB.Values[3], Trim(PageDB.Values[4]));
      if Kind = 'CommandPulse' then
      begin
        LiveNote := '';
        if CompareText(Trim(PageDB.Values[4]), 'cmms') = 0 then
          LiveNote := #13#10#13#10 + 'WARNING: "cmms" is the live production database name on this host.';
        if MsgBox('Database "' + Trim(PageDB.Values[4]) + '" already exists and is a CommandPulse CMMS database.' + #13#10#13#10 +
                  'Upgrading applies schema migrations and cannot be undone without a backup.' + LiveNote + #13#10#13#10 +
                  'Yes = upgrade this database.' + #13#10 +
                  'No  = go back and choose a new Database Name.', mbConfirmation, MB_YESNO) = IDYES then
          UpgradeExisting := True
        else
        begin
          MsgBox('Change the Database Name field to a new name, or Cancel to stop the installation.', mbInformation, MB_OK);
          Result := False;
        end;
      end
      else if Kind = 'Foreign' then
      begin
        MsgBox('Database "' + Trim(PageDB.Values[4]) + '" already exists and contains tables, but it is not a CommandPulse CMMS database.' + #13#10 +
               'This installer will not modify it. Choose a new Database Name.', mbError, MB_OK);
        Result := False;
      end
      else if Kind = '' then
      begin
        MsgBox('The installer could not inspect database "' + Trim(PageDB.Values[4]) + '".' + #13#10#13#10 +
               'The installation will continue, and the engine will refuse the target if it already exists.', mbInformation, MB_OK);
      end;
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
  if CurPageID = PageAdmin.ID then
  begin
    if not IsValidAdminUsername(Trim(PageAdmin.Values[0])) then
    begin
      MsgBox('Username must be 3-32 characters using only letters, digits, dot, underscore or hyphen.', mbError, MB_OK);
      Result := False;
    end
    else if Trim(PageAdmin.Values[1]) = '' then
    begin
      MsgBox('Full name is required.', mbError, MB_OK);
      Result := False;
    end
    else if (Pos('@', PageAdmin.Values[2]) < 2) or
            (Pos('.', Copy(PageAdmin.Values[2], Pos('@', PageAdmin.Values[2]) + 1, Length(PageAdmin.Values[2]))) < 2) or
            (Pos(' ', PageAdmin.Values[2]) > 0) then
    begin
      MsgBox('Email must be a single address such as name@example.com.', mbError, MB_OK);
      Result := False;
    end
    else if Length(PageAdmin.Values[3]) < 12 then
    begin
      MsgBox('Password must be at least 12 characters.', mbError, MB_OK);
      Result := False;
    end
    else if Trim(PageAdmin.Values[3]) <> PageAdmin.Values[3] then
    begin
      MsgBox('Password must not start or end with whitespace.', mbError, MB_OK);
      Result := False;
    end
    else if CompareText(PageAdmin.Values[3], PageAdmin.Values[0]) = 0 then
    begin
      MsgBox('Password must not be the same as the username.', mbError, MB_OK);
      Result := False;
    end
    else if IsWeakAdminPassword(PageAdmin.Values[3]) then
    begin
      MsgBox('That password is too common. Choose something unique.', mbError, MB_OK);
      Result := False;
    end
    else if PageAdmin.Values[3] <> PageAdmin.Values[4] then
    begin
      MsgBox('The two passwords do not match.', mbError, MB_OK);
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
  AdminFile: String;
  AdminJson: String;
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

    // Same transport for the Administrator details. The engine reads the file,
    // pipes the password to the helper on stdin and deletes the file; the
    // wizard deletes it again after the engine exits and on abort.
    AdminFile := ExpandConstant('{tmp}\cmms_admin_' + GetDateTimeString('hhmmss', #0, #0) + '.tmp');
    AdminFileToDelete := AdminFile;
    AdminJson := '{"username":"' + JsonEscape(Trim(PageAdmin.Values[0])) + '"' +
                 ',"fullName":"' + JsonEscape(Trim(PageAdmin.Values[1])) + '"' +
                 ',"email":"' + JsonEscape(Trim(PageAdmin.Values[2])) + '"' +
                 ',"password":"' + JsonEscape(PageAdmin.Values[3]) + '"}';
    SaveStringToFile(AdminFile, AdminJson, False);
    Exec(ExpandConstant('{sys}\icacls.exe'),
         '"' + AdminFile + '" /inheritance:r /grant:r "' + GetUserNameString() + ':R"',
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
           '-PrismaEnginesPath "' + PagePM2.Values[1] + '" ' +
           '-AdminFile "' + AdminFile + '"';

    // An existing CommandPulse database is upgraded only after the operator
    // answered Yes on the database page. The engine refuses it otherwise.
    if UpgradeExisting then
      Cmd := Cmd + ' -AllowExistingDatabase';
    
    Exec(ExpandConstant('{sys}\cmd.exe'), '/c ' + Cmd, '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
    
    DeleteFile(PwFile);
    DeleteFile(AdminFile);
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
  if AdminFileToDelete <> '' then
    DeleteFile(AdminFileToDelete);
end;
