# Copyright 2026 >devcircus_ - www.dev-circus.com - by Patrick B. Stang
# Fetches Node.js for Windows (x64) into runtime\win32-x64 and checks its SHA-256.
# Kept ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without a BOM.
param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the progress bar makes downloads very slow in PowerShell 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ver = (Get-Content -Raw (Join-Path $Root 'launcher\NODE_VERSION')).Trim()
$file = "node-$ver-win-x64.zip"
$base = "https://nodejs.org/dist/$ver"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('claude-stick-node-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$file" -OutFile (Join-Path $tmp $file)
  $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
  $expect = $null
  foreach ($line in ($sums -split "`n")) {
    $parts = $line.Trim() -split '\s+'
    if ($parts.Length -eq 2 -and $parts[1] -eq $file) { $expect = $parts[0].ToLower() }
  }
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $tmp $file)).Hash.ToLower()
  if (-not $expect -or $expect -ne $actual) { throw 'Checksum does not match, download discarded.' }
  Expand-Archive -LiteralPath (Join-Path $tmp $file) -DestinationPath $tmp -Force
  $target = Join-Path $Root 'runtime\win32-x64'
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Copy-Item -Force (Join-Path $tmp "node-$ver-win-x64\node.exe") (Join-Path $target 'node.exe')
  Set-Content -Path (Join-Path $target 'VERSION') -Value $ver
} catch {
  Write-Host $_.Exception.Message
  exit 1
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
