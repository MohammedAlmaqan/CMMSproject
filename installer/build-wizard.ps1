#requires -version 5.1
<#
.SYNOPSIS
  Compiles installer/wizard/CommandPulse.iss to installer/out/Setup_CommandPulse.exe.

.DESCRIPTION
  Finds ISCC.exe on PATH, in Program Files, or in the per-user Inno Setup 6
  install, then compiles. The output directory is installer/out, which is
  gitignored: the compiled .exe is never committed. It is published at the root
  of the release bundle and listed in that bundle's SHA256SUMS.txt.

  The compile is a release step, so it refuses to run on a tree that cannot be
  rebuilt from its tag:

  - uncommitted or untracked changes under installer/ are refused unless
    -AllowDirty is passed. A setup program built from a dirty tree has no commit
    that reproduces it, which is exactly how v1.6.9 shipped an executable its
    tag could not rebuild.
  - a payload file whose line endings are not LF is refused. ISCC embeds the
    payload byte for byte, so CRLF and LF copies of the same file compile to
    different executables. installer/.gitattributes pins eol=lf; a checkout made
    before that file existed still holds CRLF and must be re-materialised.

  The compile itself runs against a staged copy of the payload, not against the
  working tree. ISCC records each source file's last-write time in the setup
  data, so a compile of identical bytes from two checkouts differs purely by
  checkout time: the same tree built in place and built from a fresh extraction
  produced 2,327,324 and 2,327,289 bytes. The staged copy has every file
  stamped with one fixed date, and only the files the [Files] section names are
  copied, so a stray file in a glob cannot travel with the build either.

  The commit, the ISCC version and the payload digest are printed, so a build
  can be compared with another one without guessing which tree produced it.

.PARAMETER OutputDir
  Where Setup_CommandPulse.exe is written. Defaults to installer/out.

.PARAMETER IsccPath
  Explicit path to ISCC.exe. Otherwise PATH, the per-user Inno Setup 6 install
  and Program Files are searched.

.PARAMETER AllowDirty
  Compile from a tree with uncommitted changes. The output is then not
  rebuildable from any commit; do not publish it.
#>
[CmdletBinding()]
param(
  [string]$OutputDir = "",
  [string]$IsccPath = "",
  [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"

$installerDir = $PSScriptRoot
$wizardDir = Join-Path $installerDir "wizard"
$iss = Join-Path $wizardDir "CommandPulse.iss"
if (-not (Test-Path -LiteralPath $iss)) { throw "Wizard source not found: $iss" }

if (-not $OutputDir) { $OutputDir = Join-Path $installerDir "out" }

# Every file the [Files] section names is stamped with this date. It is part of
# the artifact, like the payload bytes are, so it is a constant rather than
# "now". Changing it changes every compiled setup program.
$payloadTimestamp = [datetime]"2020-01-01 00:00:00"

# ── Provenance ────────────────────────────────────────────────────────────────
# Native commands write to stderr when they fail, and $ErrorActionPreference is
# Stop, so git is called with the preference relaxed and its exit code checked.
function Invoke-Git {
  param([string[]]$Arguments)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & git -C $installerDir @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return @($output)
  } catch {
    return $null
  } finally {
    $ErrorActionPreference = $previous
  }
}

$commit = ""
if (Get-Command git.exe -ErrorAction SilentlyContinue) {
  $head = Invoke-Git @("rev-parse", "HEAD")
  if ($head) { $commit = ($head -join "").Trim() }
}

if (-not $commit) {
  Write-Host "Commit  : unknown (not a git work tree)" -ForegroundColor Yellow
  Write-Host "          The compiled program cannot be tied to a commit." -ForegroundColor Yellow
} else {
  Write-Host "Commit  : $commit"
  $dirty = Invoke-Git @("status", "--porcelain", "--untracked-files=all", "--", ".")
  $dirty = @($dirty | Where-Object { $_ -and $_.Trim() })
  if ($dirty.Count -gt 0) {
    if (-not $AllowDirty) {
      $list = ($dirty | Select-Object -First 10) -join [Environment]::NewLine
      throw @"
Refusing to compile from a tree with uncommitted changes under installer/:

$list

A setup program built from this tree has no commit that reproduces it, so it
cannot be rebuilt from its tag. Commit the change and build from that commit, or
pass -AllowDirty for a local build you will not publish.
"@
    }
    Write-Host "Tree    : DIRTY ($($dirty.Count) path(s)) - -AllowDirty, do not publish this build" -ForegroundColor Yellow
  } else {
    Write-Host "Tree    : clean"
  }
}

# ── Payload ───────────────────────────────────────────────────────────────────
# The [Files] section is the authority on what ISCC embeds, so the same list is
# read here and nothing else is staged.
$issText = [IO.File]::ReadAllText($iss)
$sourcePattern = [regex]'(?m)^\s*Source:\s*"([^"]+)"'
$payload = New-Object System.Collections.Generic.List[string]
foreach ($match in $sourcePattern.Matches($issText)) {
  $relative = $match.Groups[1].Value
  $full = Join-Path $wizardDir $relative
  if ($relative -match '[*?]') {
    foreach ($item in @(Get-ChildItem -Path $full -File -Force -Recurse -ErrorAction SilentlyContinue)) {
      $payload.Add($item.FullName)
    }
  } elseif (Test-Path -LiteralPath $full) {
    $payload.Add((Resolve-Path -LiteralPath $full).Path)
  } else {
    throw "The [Files] section names a missing file: $relative (resolved to $full)"
  }
}
if ($payload.Count -eq 0) { throw "The [Files] section names no payload files." }

$binaryExtensions = @(".exe", ".dll", ".png", ".jpg", ".ico", ".zip", ".gz")
$offenders = New-Object System.Collections.Generic.List[string]
foreach ($file in ($payload | Sort-Object -Unique)) {
  if ($binaryExtensions -contains [IO.Path]::GetExtension($file).ToLowerInvariant()) { continue }
  $bytes = [IO.File]::ReadAllBytes($file)
  for ($i = 1; $i -lt $bytes.Length; $i++) {
    if ($bytes[$i] -eq 10 -and $bytes[$i - 1] -eq 13) {
      $offenders.Add($file.Substring($installerDir.Length + 1))
      break
    }
  }
}
if ($offenders.Count -gt 0) {
  throw @"
The wizard payload is not LF, so this build would not reproduce another one:

$($offenders -join [Environment]::NewLine)

installer/.gitattributes pins eol=lf, but a checkout made before it existed
still holds CRLF. Re-materialise the tree (this discards uncommitted changes):

  git rm --cached -r .
  git reset --hard

or delete the folder and clone it again. Then re-run this script.
"@
}

# One digest over the payload, so two builds of the same commit can be compared
# on the input alone. Ordinal sort keeps it stable.
$digestInput = New-Object System.Text.StringBuilder
foreach ($file in ($payload | Sort-Object -Unique -CaseSensitive)) {
  $relative = $file.Substring($installerDir.Length + 1).Replace("\", "/")
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
  [void]$digestInput.Append($relative).Append(":").Append($hash).Append("`n")
}
$sha = [Security.Cryptography.SHA256]::Create()
try {
  $payloadDigest = [BitConverter]::ToString(
    $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($digestInput.ToString()))
  ).Replace("-", "").ToLowerInvariant()
} finally {
  $sha.Dispose()
}
Write-Host "Payload : $payloadDigest ($($payload.Count) entries, LF, mtime $($payloadTimestamp.ToString('yyyy-MM-dd HH:mm:ss')))"

# ── Stage ─────────────────────────────────────────────────────────────────────
# Copy exactly those files into a scratch tree with the same layout the .iss
# expects, then stamp them. Copy-Item preserves the source time, so the stamp
# must come after the copy.
$stage = Join-Path $OutputDir ".stage"
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
$stagedInstaller = Join-Path $stage "installer"
New-Item -ItemType Directory -Force -Path $stagedInstaller | Out-Null

foreach ($file in ($payload | Sort-Object -Unique)) {
  $relative = $file.Substring($installerDir.Length + 1)
  $target = Join-Path $stagedInstaller $relative
  $parent = Split-Path -Parent $target
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Copy-Item -LiteralPath $file -Destination $target -Force
}
$stagedIss = Join-Path $stagedInstaller "wizard\CommandPulse.iss"
Copy-Item -LiteralPath $iss -Destination $stagedIss -Force

foreach ($item in @(Get-ChildItem -LiteralPath $stagedInstaller -Recurse -File -Force)) {
  $item.LastWriteTime = $payloadTimestamp
}

# The staged bytes are what gets compiled, so re-hash them rather than trust the
# copy.
$stagedDigestInput = New-Object System.Text.StringBuilder
foreach ($file in @(Get-ChildItem -LiteralPath $stagedInstaller -Recurse -File -Force |
    Where-Object { $_.FullName -ne $stagedIss } |
    Sort-Object { $_.FullName.Substring($stagedInstaller.Length + 1) } -CaseSensitive)) {
  $relative = $file.FullName.Substring($stagedInstaller.Length + 1).Replace("\", "/")
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
  [void]$stagedDigestInput.Append($relative).Append(":").Append($hash).Append("`n")
}
$sha = [Security.Cryptography.SHA256]::Create()
try {
  $stagedDigest = [BitConverter]::ToString(
    $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($stagedDigestInput.ToString()))
  ).Replace("-", "").ToLowerInvariant()
} finally {
  $sha.Dispose()
}
if ($stagedDigest -ne $payloadDigest) {
  throw "The staged payload digest $stagedDigest does not match $payloadDigest; the copy is not faithful."
}
Write-Host "Staged  : $stagedInstaller"

# ── Compile ───────────────────────────────────────────────────────────────────
if (-not $IsccPath) {
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd) { $IsccPath = $cmd.Source }
}
if (-not $IsccPath) {
  foreach ($candidate in @(
      (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
      "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
      "C:\Program Files\Inno Setup 6\ISCC.exe")) {
    if (Test-Path -LiteralPath $candidate) { $IsccPath = $candidate; break }
  }
}
if (-not $IsccPath) {
  throw "ISCC.exe not found. Install Inno Setup 6 and re-run, or pass -IsccPath."
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Write-Host "ISCC    : $IsccPath"
Write-Host "Source  : $stagedIss"
Write-Host "Output  : $OutputDir"

# The compiler prints its own version ("Compiler engine version: Inno Setup
# 6.7.3") but ISCC.exe carries an empty version resource, so the line is read
# from the log rather than from the file.
$compileLog = & $IsccPath "/O$OutputDir" $stagedIss 2>&1
$compileExit = $LASTEXITCODE
$compileLog | ForEach-Object { Write-Host $_ }
$versionMatch = $compileLog | Select-String 'Compiler engine version:\s*(.+?)\s*$' | Select-Object -First 1
if ($versionMatch) { Write-Host "Version : $($versionMatch.Matches[0].Groups[1].Value)" }
if ($compileExit -ne 0) { throw "ISCC failed with exit code $compileExit" }

$exe = Join-Path $OutputDir "Setup_CommandPulse.exe"
if (-not (Test-Path -LiteralPath $exe)) {
  throw "ISCC reported success but $exe is missing."
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $exe).Hash
Write-Host "Compiled: $exe"
Write-Host "SHA256  : $hash"
