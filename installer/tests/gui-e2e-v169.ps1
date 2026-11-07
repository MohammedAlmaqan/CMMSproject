#requires -version 5.1
<#
  UI automation driver for the CommandPulse CMMS setup wizard (v1.6.9).

  Drives installer/out/Setup_CommandPulse.exe through every wizard page with
  UI Automation - Welcome, Source Bundle, PostgreSQL, Application, Service &
  Prisma, Administrator, Ready, Installing, Finish - without operator input.
  Modal dialog boxes raised by the wizard (database classification prompt,
  upgrade confirmation) are answered from the same UIA session.

  Modes:
    -Mode Inspect  dump the UIA tree of each page reached, then Cancel
    -Mode Full     complete the install and wait for the Finish page

  The script must run in the interactive session (session 1). It launches the
  setup program with ShellExecute "runas"; on this host ConsentPromptBehaviorAdmin
  is 0, so the elevation is granted without a consent dialog.
#>
[CmdletBinding()]
param(
  [ValidateSet('Inspect', 'Full')]
  [string]$Mode = 'Inspect',
  [string]$ExePath = "",
  [string]$LogPath = "",
  [string]$ScreenshotDir = "",
  [string]$BundlePath = "",
  [string]$InstallRoot = "",
  [string]$PgHost = 'localhost',
  [string]$PgPort = '5432',
  [string]$PgUser = 'postgres',
  [string]$PgPassFile = "",
  [string]$DbName = 'cmms',
  [string]$ApiPort = '4000',
  [string]$BindHost = '127.0.0.1',
  [string]$SiteName = 'cmms.local',
  [string]$CorsOrigins = '',
  [string]$InstancePrefix = '',
  [string]$PrismaEngines = '',
  [string]$AdminUser = 'uatadmin',
  [string]$AdminFullName = 'UAT Installer Administrator',
  [string]$AdminEmail = 'uatadmin@example.com',
  [string]$AdminPass = '',
  [string]$AdminPassFile = '',
  [int]$PageTimeoutSec = 120,
  [int]$InstallTimeoutSec = 3600
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not ('CmmsWin32' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class CmmsWin32 {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  public static List<IntPtr> DialogHandles(uint processId) {
    var found = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (pid != processId || !IsWindowVisible(h)) return true;
      var name = new System.Text.StringBuilder(64);
      GetClassName(h, name, 64);
      if (name.ToString() == "#32770") found.Add(h);
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
}

$script:Stopped = $false

function Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
  Write-Host $line
  if ($LogPath) { Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8 }
}

function Save-Shot {
  param([string]$Name)
  if (-not $ScreenshotDir) { return }
  New-Item -ItemType Directory -Force -Path $ScreenshotDir | Out-Null
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $file = Join-Path $ScreenshotDir ("{0:00}-{1}.png" -f $script:ShotIndex, $Name)
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  $script:ShotIndex++
  Log "screenshot: $file"
}
$script:ShotIndex = 1

function Get-WizardWindow {
  # Inno Setup extracts itself to %TEMP%\is-*.tmp and re-executes that copy, so
  # the window belongs to Setup_CommandPulse.tmp, not to the process started
  # here. A leftover wizard from an earlier attempt answers to the same class
  # name, so the owner must be one of this run's setup processes: the bootstrap
  # pid recorded below, or any process named Setup_CommandPulse(.tmp) started
  # after it.
  param([int]$TimeoutSec = 60)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $cond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ClassNameProperty, 'TWizardForm')
    foreach ($win in [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
        [System.Windows.Automation.TreeScope]::Children, $cond)) {
      $pid_ = $win.Current.ProcessId
      if ($pid_ -eq $script:SetupPid) { return (Set-WizardOwner -Window $win) }
      $owner = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
      if ($owner -and $owner.ProcessName -like 'Setup_CommandPulse*' -and
          $owner.StartTime -ge $script:SetupStart) {
        return (Set-WizardOwner -Window $win)
      }
    }
    Start-Sleep -Milliseconds 400
  }
  return $null
}

function Set-WizardOwner {
  param($Window)
  $script:WizardPid = $Window.Current.ProcessId
  if ($script:WizardPid -ne $script:SetupPid) {
    Log "wizard window belongs to the extracted setup process $($script:WizardPid)"
  }
  return $Window
}

function Get-Descendants {
  param($Element)
  return $Element.FindAll([System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition)
}

function Get-PageTitle {
  param($Window)
  # Inno lays the page out as TNewNotebook > TNewNotebookPage > TPanel, and the
  # page header is the first TNewStaticText in that panel. UIA exposes these as
  # Pane elements, not as ControlType.Text, so the header is found by class and
  # by being the topmost static text on the page.
  $best = $null
  $bestTop = [double]::MaxValue
  foreach ($el in (Get-Descendants $Window)) {
    if ($el.Current.ClassName -ne 'TNewStaticText') { continue }
    if ($el.Current.IsOffscreen) { continue }
    if (-not $el.Current.Name) { continue }
    $r = $el.Current.BoundingRectangle
    if ($r.Width -le 0) { continue }
    if ($r.Top -lt $bestTop) { $bestTop = $r.Top; $best = $el.Current.Name }
  }
  if ($best) { return $best }
  return ''
}

function Get-VisibleEdits {
  param($Window)
  $found = @()
  foreach ($el in (Get-Descendants $Window)) {
    if ($el.Current.ControlType.ProgrammaticName -ne 'ControlType.Edit') { continue }
    if ($el.Current.IsOffscreen) { continue }
    $r = $el.Current.BoundingRectangle
    if ($r.Width -le 0 -or $r.Height -le 0) { continue }
    $found += [pscustomobject]@{ Element = $el; Top = $r.Top; Left = $r.Left }
  }
  return @($found | Sort-Object Top, Left)
}

function Set-EditValue {
  param($Element, [string]$Value)
  $pattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
    $pattern.SetValue($Value)
    return $true
  }
  return $false
}

function Get-Button {
  param($Window, [string]$NamePattern)
  foreach ($el in (Get-Descendants $Window)) {
    if ($el.Current.ControlType.ProgrammaticName -ne 'ControlType.Button') { continue }
    if ($el.Current.IsOffscreen) { continue }
    if ($el.Current.Name -match $NamePattern) { return $el }
  }
  return $null
}

function Invoke-Button {
  param($Button, [string]$Label)
  $pattern = $null
  if (-not $Button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
    throw "Button '$Label' has no Invoke pattern"
  }
  Log "click: $Label"
  $pattern.Invoke()
}

function Get-ModalDialog {
  # An Inno MsgBox is a native #32770 dialog owned by the wizard process. UIA
  # does not always list it among the desktop root's children (observed with the
  # database-confirmation prompt on this host), so the window handles are
  # enumerated with EnumWindows and wrapped with AutomationElement.FromHandle.
  param([int]$ProcessId)
  foreach ($hwnd in [CmmsWin32]::DialogHandles($ProcessId)) {
    $el = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
    if ($el) { return $el }
  }
  return $null
}

function Answer-Dialog {
  param($Dialog, [string]$Prefer)
  $text = @()
  foreach ($el in (Get-Descendants $Dialog)) {
    if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Text' -and $el.Current.Name) {
      $text += $el.Current.Name
    }
  }
  Log "dialog: $($Dialog.Current.Name) :: $($text -join ' | ')"
  $buttons = @()
  foreach ($el in (Get-Descendants $Dialog)) {
    if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Button') { $buttons += $el }
  }
  $names = @($buttons | ForEach-Object { $_.Current.Name })
  Log "dialog buttons: $($names -join ', ')"
  $target = $null
  foreach ($b in $buttons) {
    if ($b.Current.Name -match $Prefer) { $target = $b; break }
  }
  if (-not $target -and $buttons.Count -eq 1) { $target = $buttons[0] }
  if (-not $target) { throw "No dialog button matched '$Prefer' (have: $($names -join ', '))" }
  Invoke-Button -Button $target -Label $target.Current.Name
}

function Wait-DialogsAndPage {
  # After a Next click the probe can raise dialogs before the page changes.
  param($Window, [string]$ExpectPage, [string]$PreferAnswer, [int]$TimeoutSec)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $dialog = Get-ModalDialog -ProcessId $script:WizardPid
    if ($dialog) {
      Save-Shot -Name ('dialog-' + ($dialog.Current.Name -replace '[^A-Za-z0-9]+', '-'))
      try { Answer-Dialog -Dialog $dialog -Prefer $PreferAnswer }
      catch { Log "dialog handling failed (will retry): $($_.Exception.Message)" }
      Start-Sleep -Milliseconds 800
      continue
    }
    if ($ExpectPage) {
      $title = Get-PageTitle -Window $Window
      if ($title -like "*$ExpectPage*") { return $true }
    }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Wait-PageChange {
  # Returns the new page header once it differs from the one left behind, or ''
  # on timeout. Dialog boxes raised on the way are answered from here.
  param($Window, [string]$From, [int]$TimeoutSec)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $dialog = Get-ModalDialog -ProcessId $script:WizardPid
    if ($dialog) {
      Save-Shot -Name ('dialog-' + ($dialog.Current.Name -replace '[^A-Za-z0-9]+', '-'))
      try { Answer-Dialog -Dialog $dialog -Prefer '^&?OK' } catch { Log "dialog handling failed (will retry): $($_.Exception.Message)" }
      Start-Sleep -Milliseconds 800
      continue
    }
    $title = Get-PageTitle -Window $Window
    if ($title -and $title -ne $From) { return $title }
    Start-Sleep -Milliseconds 400
  }
  return ''
}

function Fill-Page {
  param($Window, [string[]]$Values, [string]$Name)
  $edits = Get-VisibleEdits -Window $Window
  Log "page '$Name': $($edits.Count) visible edit(s), filling $($Values.Count)"
  if ($edits.Count -ne $Values.Count) {
    throw "Page '$Name' exposes $($edits.Count) edits but $($Values.Count) values were supplied"
  }
  for ($i = 0; $i -lt $Values.Count; $i++) {
    if ($null -eq $Values[$i]) { continue }
    if (-not (Set-EditValue -Element $edits[$i].Element -Value $Values[$i])) {
      throw "Page '$Name' edit $($i + 1) has no Value pattern"
    }
  }
}

function Click-Next {
  param($Window)
  $btn = Get-Button -Window $Window -NamePattern '^&?Next'
  if (-not $btn) { throw 'Next button not found' }
  Invoke-Button -Button $btn -Label $btn.Current.Name
}

function Dump-Tree {
  param($Window, [string]$Tag)
  Log "--- UIA tree: $Tag ---"
  $depth = 0
  foreach ($el in (Get-Descendants $Window)) {
    $r = $el.Current.BoundingRectangle
    $line = "  [{0}] name='{1}' class='{2}' id='{3}' offscreen={4} rect={5},{6},{7},{8}" -f `
      $el.Current.ControlType.ProgrammaticName, $el.Current.Name, $el.Current.ClassName,
      $el.Current.AutomationId, $el.Current.IsOffscreen,
      [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height
    if ($LogPath) { Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8 }
    Write-Host $line
    $depth++
    if ($depth -gt 400) { break }
  }
}

# ---------------------------------------------------------------- start up ---
if (-not $ExePath) { throw '-ExePath is required' }
if (-not (Test-Path -LiteralPath $ExePath)) { throw "Setup program not found: $ExePath" }
if ($Mode -eq 'Full') {
  if (-not $PgPassFile -or -not (Test-Path -LiteralPath $PgPassFile)) { throw '-PgPassFile is required in Full mode' }
  if ($AdminPassFile -and (Test-Path -LiteralPath $AdminPassFile)) {
    $AdminPass = (Get-Content -LiteralPath $AdminPassFile -Raw).Trim()
  }
  if (-not $AdminPass) { throw '-AdminPass or -AdminPassFile is required in Full mode' }
}

Log "mode: $Mode"
Log "setup: $ExePath"

# A wizard left open by an earlier attempt is a different top-level window with
# the same title; it would take the clicks and the real run would hang. Inno
# runs the wizard from an extracted copy, so both names have to go.
$leftovers = @(Get-Process -Name 'Setup_CommandPulse','Setup_CommandPulse.tmp' -ErrorAction SilentlyContinue)
if ($leftovers.Count -gt 0) {
  Log "closing $($leftovers.Count) leftover setup process(es): $($leftovers.Id -join ', ')"
  $leftovers | Stop-Process -Force
  Start-Sleep -Seconds 2
}

$script:SetupStart = Get-Date
$proc = Start-Process -FilePath $ExePath -Verb RunAs -PassThru
$script:SetupPid = $proc.Id
$script:WizardPid = $proc.Id
Log "setup pid: $($script:SetupPid)"

$win = Get-WizardWindow -TimeoutSec 90
if (-not $win) { throw 'The wizard window did not appear' }
Log "window: '$($win.Current.Name)' class=$($win.Current.ClassName)"
Start-Sleep -Milliseconds 800
$firstPage = Get-PageTitle -Window $win
Log "first page: '$firstPage'"
Save-Shot -Name 'welcome'
if ($Mode -eq 'Inspect') { Dump-Tree -Window $win -Tag 'welcome' }

if ($Mode -eq 'Inspect') {
  $pages = @(
    @{ Expect = 'Source Bundle'; Shot = 'bundle' },
    @{ Expect = 'PostgreSQL'; Shot = 'database' },
    @{ Expect = 'Application Settings'; Shot = 'application' },
    @{ Expect = 'Service'; Shot = 'service' }
  )
  foreach ($p in $pages) {
    Click-Next -Window $win
    $ok = Wait-DialogsAndPage -Window $win -ExpectPage $p.Expect -PreferAnswer '^&?OK' -TimeoutSec $PageTimeoutSec
    Log "reached '$($p.Expect)': $ok"
    Start-Sleep -Milliseconds 700
    Save-Shot -Name $p.Shot
    Dump-Tree -Window $win -Tag $p.Expect
    $edits = Get-VisibleEdits -Window $win
    Log "  edits: $($edits.Count) at $((@($edits | ForEach-Object { "$([int]$_.Top)" })) -join ',')"
    $buttons = @()
    foreach ($el in (Get-Descendants $win)) {
      if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Button' -and -not $el.Current.IsOffscreen) {
        $buttons += $el.Current.Name
      }
    }
    Log "  buttons: $($buttons -join ' | ')"
  }
  $cancel = Get-Button -Window $win -NamePattern '^&?Cancel'
  if ($cancel) { Invoke-Button -Button $cancel -Label 'Cancel' }
  Start-Sleep -Seconds 2
  $d = Get-ModalDialog -ProcessId $script:WizardPid
  if ($d) { Answer-Dialog -Dialog $d -Prefer '^&?Yes' }
  Start-Sleep -Seconds 2
  Log 'inspect run finished'
  exit 0
}

# ------------------------------------------------------------------- full ---
$password = (Get-Content -LiteralPath $PgPassFile -Raw).Trim()
if (-not $firstPage) { throw "The first page header could not be read" }
if ($firstPage -notlike '*Welcome*') { throw "The wizard did not open on the Welcome page (header: '$firstPage')" }

# Welcome -> Source Bundle
Click-Next -Window $win
if (-not (Wait-DialogsAndPage -Window $win -ExpectPage 'Source Bundle' -PreferAnswer '^&?OK' -TimeoutSec $PageTimeoutSec)) {
  throw "Did not reach the Source Bundle page (title now: '$(Get-PageTitle -Window $win)')"
}
Start-Sleep -Milliseconds 600
Save-Shot -Name 'bundle'
Fill-Page -Window $win -Name 'Source Bundle' -Values @($BundlePath, $InstallRoot)

# -> PostgreSQL
Click-Next -Window $win
if (-not (Wait-DialogsAndPage -Window $win -ExpectPage 'PostgreSQL' -PreferAnswer '^&?OK' -TimeoutSec $PageTimeoutSec)) {
  throw "Did not reach the PostgreSQL page (title now: '$(Get-PageTitle -Window $win)')"
}
Start-Sleep -Milliseconds 600
Save-Shot -Name 'database'
Fill-Page -Window $win -Name 'PostgreSQL' -Values @($PgHost, $PgPort, $PgUser, $password, $DbName)

# -> Application (the probe runs here; an existing CommandPulse database asks
#    for a Yes before the page turns)
Click-Next -Window $win
if (-not (Wait-DialogsAndPage -Window $win -ExpectPage 'Application Settings' -PreferAnswer '^&?Yes' -TimeoutSec $PageTimeoutSec)) {
  throw "Did not reach the Application page (title now: '$(Get-PageTitle -Window $win)')"
}
Start-Sleep -Milliseconds 600
Save-Shot -Name 'application'
Fill-Page -Window $win -Name 'Application' -Values @($ApiPort, $BindHost, $SiteName, $CorsOrigins)

# -> Service & Prisma
Click-Next -Window $win
if (-not (Wait-DialogsAndPage -Window $win -ExpectPage 'Service' -PreferAnswer '^&?OK' -TimeoutSec $PageTimeoutSec)) {
  throw "Did not reach the Service page (title now: '$(Get-PageTitle -Window $win)')"
}
Start-Sleep -Milliseconds 600
Save-Shot -Name 'service'
Fill-Page -Window $win -Name 'Service & Prisma' -Values @($InstancePrefix, $PrismaEngines)

# -> Administrator
Click-Next -Window $win
if (-not (Wait-DialogsAndPage -Window $win -ExpectPage 'Administrator' -PreferAnswer '^&?OK' -TimeoutSec $PageTimeoutSec)) {
  throw "Did not reach the Administrator page (title now: '$(Get-PageTitle -Window $win)')"
}
Start-Sleep -Milliseconds 600
Save-Shot -Name 'administrator'
Fill-Page -Window $win -Name 'Administrator' -Values @($AdminUser, $AdminFullName, $AdminEmail, $AdminPass, $AdminPass)

# -> Ready to Install. The wizard also carries Inno's own "Select Destination
#    Location" page for the installer payload ({app}), which is left at its
#    default; any further standard page is accepted the same way.
$title = Get-PageTitle -Window $win
Click-Next -Window $win
$title = Wait-PageChange -Window $win -From $title -TimeoutSec $PageTimeoutSec
if (-not $title) { throw "The wizard did not leave the Administrator page" }
$guard = 0
while ($title -notlike '*Ready to Install*') {
  if ($guard++ -ge 6) { throw "Stopped at an unexpected page: '$title'" }
  Log "page: $title"
  Save-Shot -Name ('page-' + ($title -replace '[^A-Za-z0-9]+', '-'))
  $from = $title
  Click-Next -Window $win
  $title = Wait-PageChange -Window $win -From $from -TimeoutSec $PageTimeoutSec
  if (-not $title) { throw "The wizard did not leave the page '$from'" }
}
Log "page: $title"
Start-Sleep -Milliseconds 600
Save-Shot -Name 'ready'
$install = Get-Button -Window $win -NamePattern '^&?Install'
if (-not $install) { throw 'Install button not found' }
Log 'starting the engine (this takes minutes)'
Invoke-Button -Button $install -Label $install.Current.Name

# The engine runs in a visible console. Wait for the Finish page; the wizard
# reports a non-zero engine exit as a modal error and aborts instead.
$deadline = (Get-Date).AddSeconds($InstallTimeoutSec)
$lastTitle = ''
$finished = $false
$failed = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  $dialog = Get-ModalDialog -ProcessId $script:WizardPid
  if ($dialog) {
    $text = @()
    foreach ($el in (Get-Descendants $dialog)) {
      if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Text' -and $el.Current.Name) { $text += $el.Current.Name }
    }
    Log "modal during install: $($text -join ' | ')"
    Save-Shot -Name 'install-error'
    try { Answer-Dialog -Dialog $dialog -Prefer '^&?OK' } catch { Log "dialog handling failed: $($_.Exception.Message)" }
    $failed = ($text -join ' | ')
    break
  }
  $title = Get-PageTitle -Window $win
  if ($title -and $title -ne $lastTitle) {
    Log "page: $title"
    $lastTitle = $title
  }
  if ($title -like '*Finish*' -or $title -like '*Completing*') { $finished = $true; break }
  if (-not $proc.HasExited) { $proc.Refresh() }
  if ($proc.HasExited) { break }
}
Save-Shot -Name 'after-install'
if (-not $finished) {
  Log "install did not reach Finish. last page: '$lastTitle' failed: '$failed'"
  exit 2
}

$finish = Get-Button -Window $win -NamePattern '^&?Finish'
if (-not $finish) { throw 'Finish button not found' }
Invoke-Button -Button $finish -Label $finish.Current.Name
Start-Sleep -Seconds 3
Save-Shot -Name 'finished'
$proc.Refresh()
Log "finish clicked; setup exited: $($proc.HasExited)"
Log 'full run finished'
exit 0
