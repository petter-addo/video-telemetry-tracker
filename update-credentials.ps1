# PowerShell script to update New Relic credentials in index.html
# Usage: .\update-credentials.ps1

if (-not (Test-Path .env)) {
    Write-Error "Error: .env file not found. Please copy .env.example to .env and fill in your credentials."
    exit 1
}

# Load environment variables from .env
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2]
        Set-Variable -Name $name -Value $value
    }
}

# Read index.html
$content = Get-Content index.html -Raw

# Replace placeholders with actual values
$content = $content -replace 'accountID:"XXXXXXX"', "accountID:`"$VITE_NR_ACCOUNT_ID`""
$content = $content -replace 'trustKey:"XXXXXXX"', "trustKey:`"$VITE_NR_TRUST_KEY`""
$content = $content -replace 'agentID:"XXXXXXXXX"', "agentID:`"$VITE_NR_AGENT_ID`""
$content = $content -replace 'licenseKey:"NRBR-XXXXXXXXXXXXXXXXXXXX"', "licenseKey:`"$VITE_NR_LICENSE_KEY`""
$content = $content -replace 'applicationID:"XXXXXXXXX"', "applicationID:`"$VITE_NR_APPLICATION_ID`""

# Save updated content
$content | Set-Content index.html

Write-Host "✅ Updated index.html with credentials from .env" -ForegroundColor Green
Write-Host "⚠️  Remember: Never commit index.html with real credentials to version control!" -ForegroundColor Yellow
