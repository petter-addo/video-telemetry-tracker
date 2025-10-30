# Tizen Log Reader Script
# View logs from connected Tizen device/emulator

# Add Tizen tools to PATH (adjust path if your Tizen Studio is elsewhere)
$env:PATH += ";C:\tizen-studio\tools;C:\tizen-studio\tools\sdb"

Write-Host "🔍 Checking for connected Tizen devices..." -ForegroundColor Cyan
sdb devices

Write-Host "`n📱 Starting log stream (Ctrl+C to stop)..." -ForegroundColor Green
Write-Host "Filtering for: JavaScript console logs, errors, and warnings`n" -ForegroundColor Yellow

# Stream logs with filters
# Format: sdb dlog <tag>:<priority>
# Priorities: V=Verbose, D=Debug, I=Info, W=Warning, E=Error, F=Fatal
sdb dlog ConsoleMessage:V JS:V WebCore:W *:E
