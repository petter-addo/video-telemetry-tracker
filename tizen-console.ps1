# Tizen Console Logs Only
# Shows JavaScript console.log() output from your app

$env:PATH += ";C:\tizen-studio\tools;C:\tizen-studio\tools\sdb"

Write-Host "📋 Tizen JavaScript Console Logs" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor Yellow

# Filter for console messages only (your console.log statements)
sdb dlog ConsoleMessage:V
