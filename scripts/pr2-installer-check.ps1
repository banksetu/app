$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run only in the disposable Windows CI runner.' }
$installer = (Get-ChildItem desktop-release/BankSetu-Setup-*-x64.exe | Select-Object -First 1).FullName
$destination = Join-Path $env:RUNNER_TEMP 'BankSetuPR2Acceptance'
function Install-App($file) {
  $process = Start-Process -FilePath $file -ArgumentList @('/S', "/D=$destination") -PassThru
  if (-not $process.WaitForExit(120000)) { $process.Kill(); throw 'Installer timed out.' }
  if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
  Get-Process 'Bank Setu' -ErrorAction SilentlyContinue | Stop-Process -Force
}
function Check-Bridge {
  node scripts/pr2-installed-check.cjs "$destination/resources/pr2"
  if ($LASTEXITCODE -ne 0) { throw 'Installed Bridge validation failed.' }
}
function Uninstall-App {
  $uninstaller = Join-Path $destination 'Uninstall Bank Setu.exe'
  if (-not (Test-Path $uninstaller)) { throw 'Uninstaller missing.' }
  $process=Start-Process -FilePath $uninstaller -ArgumentList @('/S', "_?=$destination") -PassThru
  if (-not $process.WaitForExit(120000)) { $process.Kill(); throw 'Uninstaller timed out.' }
  if ($process.ExitCode -ne 0) { throw "Uninstall failed: $($process.ExitCode)" }
  if (Test-Path "$destination/resources/pr2/BankSetu.Pr2Bridge.exe") { throw 'Bridge orphaned after uninstall.' }
}
Install-App $installer
Check-Bridge
Write-Host 'Fresh EXE installation: passed.'
Uninstall-App
$legacy = Join-Path $env:RUNNER_TEMP 'BankSetu-Setup-1.0.103-x64.exe'
gh release download v1.0.103 --repo banksetu/app --pattern BankSetu-Setup-1.0.103-x64.exe --dir $env:RUNNER_TEMP
if ($LASTEXITCODE -ne 0) { throw 'Cannot retrieve the existing production installer for upgrade acceptance.' }
if ((Get-FileHash $legacy -Algorithm SHA256).Hash.ToLower() -ne 'af45f31988d92ef7b6396d90fd67ee12069ee02f364ec459a8cc21ee47a6f444') { throw 'Production installer checksum mismatch.' }
Install-App $legacy
if (Test-Path "$destination/resources/pr2/BankSetu.Pr2Bridge.exe") { throw 'Legacy installation unexpectedly contains this Bridge.' }
$userData = Join-Path $env:APPDATA 'app'
New-Item -ItemType Directory -Force $userData | Out-Null
$sentinel = Join-Path $userData 'pr2-upgrade-synthetic-preservation.txt'
Set-Content $sentinel 'synthetic upgrade preservation marker'
Install-App $installer
Check-Bridge
if ((Get-Content $sentinel) -ne 'synthetic upgrade preservation marker') { throw 'Upgrade changed the user data sentinel.' }
Write-Host 'Upgrade from released 1.0.103 without Bridge: passed.'
Install-App $installer
Check-Bridge
Write-Host 'Repair/reinstallation: passed.'
Uninstall-App
if (-not (Test-Path $sentinel)) { throw 'Uninstall removed retained app data.' }
Write-Host 'Uninstallation removes Bridge and retains app data: passed.'
