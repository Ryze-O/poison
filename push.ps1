# Poison Quick Push Script für Windows/VSCode
# Verwendung: .\push.ps1 "Commit message"
# Oder ohne Message: .\push.ps1 (dann wird eine generische Message verwendet)

param(
    [string]$Message = ""
)

# In das Projektverzeichnis wechseln
Set-Location $PSScriptRoot

# Status prüfen
$status = git status --porcelain
if (-not $status) {
    Write-Host "Keine Änderungen zum Committen." -ForegroundColor Yellow
    exit 0
}

# Änderungen anzeigen
Write-Host "=== Änderungen ===" -ForegroundColor Cyan
git status --short
Write-Host ""

# Commit Message
if (-not $Message) {
    $Message = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

# Git Add, Commit, Push
Write-Host "=== Committing: $Message ===" -ForegroundColor Green
git add -A
git commit -m $Message

Write-Host ""
Write-Host "=== Pushing to origin/main ===" -ForegroundColor Green
git push origin main

Write-Host ""
Write-Host "Fertig! Jetzt auf Server: ./deploy.sh" -ForegroundColor Cyan
