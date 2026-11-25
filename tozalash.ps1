# Zavodlar ilovasi: boshqa loyihadan qolgan bo'sh papka va fayllarni tozalash.
# Ishga tushirish (PowerShell, zavodlar-app papkasida):
#   powershell -ExecutionPolicy Bypass -File .\tozalash.ps1
# Xavfsizlik: faqat BO'SH papkalar va 0 baytli fayllar o'chiriladi. Ichida biror narsa bo'lsa, o'tkazib yuboriladi.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location -LiteralPath $root

function Remove-EmptyDir([string]$rel) {
  $p = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $p)) { return }
  $files = @(Get-ChildItem -LiteralPath $p -Recurse -Force -File)
  if ($files.Count -gt 0) { Write-Host "O'TKAZILDI (ichida fayl bor): $rel" -ForegroundColor Yellow; return }
  Remove-Item -LiteralPath $p -Recurse -Force
  Write-Host "o'chirildi: $rel"
}
function Remove-EmptyFile([string]$rel) {
  $p = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $p)) { return }
  if ((Get-Item -LiteralPath $p -Force).Length -gt 0) { Write-Host "O'TKAZILDI (fayl bo'sh emas): $rel" -ForegroundColor Yellow; return }
  Remove-Item -LiteralPath $p -Force
  Write-Host "o'chirildi: $rel"
}

# 1) Frontend: kurslar/darslar loyihasidan qolgan bo'sh papkalar
@("frontend\app\[locale]", "frontend\app\api", "frontend\components\features", "frontend\components\layouts",
  "frontend\components\shared", "frontend\components\ui", "frontend\config", "frontend\constants",
  "frontend\contexts", "frontend\hooks", "frontend\providers", "frontend\services", "frontend\types",
  "frontend\utils", "frontend\-c", "frontend\.exe",
  "frontend\git config --local --get remote.origin.url") | ForEach-Object { Remove-EmptyDir $_ }

# 2) Backend: xato buyruqlardan paydo bo'lgan papkalar
@("backend\-c", "backend\.exe", "backend\taskkill") | ForEach-Object { Remove-EmptyDir $_ }

# 3) Backend: bo'sh .ts fayllar (boshqa loyiha shabloni)
Get-ChildItem -LiteralPath (Join-Path $root "backend\src") -Recurse -Force -File -Filter *.ts |
  ForEach-Object { Remove-EmptyFile ($_.FullName.Substring($root.Length + 1)) }
@("backend\src\config", "backend\src\controllers", "backend\src\models", "backend\src\middlewares",
  "backend\src\services", "backend\src\utils", "backend\src\types") | ForEach-Object { Remove-EmptyDir $_ }
@("backend\tsconfig.json", "backend\nodemon.json") | ForEach-Object { Remove-EmptyFile $_ }

# 4) Ildizdagi tasodifiy fayllar
Remove-EmptyFile "docker-comp"
$junk = Join-Path $root "and employee management"
if (Test-Path -LiteralPath $junk) {
  $keep = Join-Path $root "_eski_nusxa_axlat"
  New-Item -ItemType Directory -Force -Path $keep | Out-Null
  Move-Item -LiteralPath $junk -Destination $keep -Force
  Write-Host "ko'chirildi: and employee management -> _eski_nusxa_axlat\"
}

# 5) Eski zaxira JSON backend ichida turmasin (git'ga tushmaydigan papkaga ko'chiriladi)
$old = Join-Path $root "backend\pto-backup-2026-09-30-08-56.json"
if (Test-Path -LiteralPath $old) {
  $keep = Join-Path $root "_eski_nusxa_backup_json"
  New-Item -ItemType Directory -Force -Path $keep | Out-Null
  Move-Item -LiteralPath $old -Destination $keep -Force
  Write-Host "ko'chirildi: backend\pto-backup-2026-09-30-08-56.json -> _eski_nusxa_backup_json\"
}

Write-Host ""
Write-Host "Tayyor. _eski_nusxa_* papkalariga tegilmadi." -ForegroundColor Green
