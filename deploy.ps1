# deploy.ps1
# PowerShell script to deploy your Jekyll blog

# --- CONFIGURATION ---
# Uses the SSH host profile 'nas' configured in your ~/.ssh/config
$SSH_PROFILE = "nas"
$NAS_SCRIPT = "/volume1/homes/buu/dev/0x50B.github.io/deploy.sh"
# ---------------------

Write-Host "1. Pushing local changes to GitHub..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to push changes to GitHub. Aborting deploy."
    exit 1
}

Write-Host "2. Triggering build and deploy script on Synology NAS via SSH..." -ForegroundColor Cyan
ssh $SSH_PROFILE "bash $NAS_SCRIPT"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to execute deploy script on NAS."
    exit 1
}

Write-Host "Deployment completed successfully!" -ForegroundColor Green
