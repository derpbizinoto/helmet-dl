# empacotar.ps1 - gera o .zip de distribuicao do Helmet DL
#
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File .\empacotar.ps1
#
# Resultado: dist\HelmetDL-<versao>.zip com
#   premiere-helmet-dl\  instalar.bat  Add Keys.reg  README.md  CHANGELOG.md
# Ficam de fora: .debug, testes, auditoria, .git, temporarios.
# Para com erro se:
#   - a versao do manifest, do painel e do host nao forem iguais;
#   - encontrar certificado, chave, cookies ou .debug no que seria empacotado.
# (Assinatura .zxp: pendente - ver README.)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$ext = Join-Path $root "premiere-helmet-dl"

# --- versao: manifest, painel e host precisam bater --------------------------
[xml]$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $ext "CSXS\manifest.xml")
$version = $manifest.ExtensionManifest.ExtensionBundleVersion
if (-not $version) { throw "Nao achei ExtensionBundleVersion no manifest.xml" }

$clientText = (Get-ChildItem (Join-Path $ext "client\js") -Filter *.js | ForEach-Object { Get-Content -Raw -Encoding UTF8 $_.FullName }) -join "`n"
$hostText = Get-Content -Raw -Encoding UTF8 (Join-Path $ext "host\index.jsx")
$clientMatch = [regex]::Match($clientText, 'CLIENT_VERSION\s*[:=]\s*"([^"]+)"')
$hostMatch = [regex]::Match($hostText, 'HDL_HOST_VERSION\s*=\s*"([^"]+)"')
if (-not $clientMatch.Success) { throw "Nao achei CLIENT_VERSION em client\js" }
if (-not $hostMatch.Success) { throw "Nao achei HDL_HOST_VERSION em host\index.jsx" }
$clientVersion = $clientMatch.Groups[1].Value
$hostVersion = $hostMatch.Groups[1].Value
if ($clientVersion -ne $version -or $hostVersion -ne $version) {
    throw "Versoes diferentes: manifest $version, painel $clientVersion, host $hostVersion. Acerte antes de empacotar."
}

# --- copia so o necessario ---------------------------------------------------
$dist = Join-Path $root "dist"
$stage = Join-Path $dist "HelmetDL-$version"
$zip = Join-Path $dist "HelmetDL-$version.zip"

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
if (Test-Path $zip) { Remove-Item -Force $zip }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item -Recurse $ext $stage
foreach ($f in @("instalar.bat", "Add Keys.reg", "README.md", "CHANGELOG.md")) {
    $src = Join-Path $root $f
    if (Test-Path $src) { Copy-Item $src $stage }
}

# lixo de desenvolvimento que nunca deve ir junto (o .debug abre uma porta de depuracao)
$junk = @(".debug", "*.tmp", "*.log", "*.download", "*.part", "Thumbs.db", "desktop.ini", ".DS_Store")
Get-ChildItem -Recurse -Force $stage -Include $junk | Remove-Item -Recurse -Force

# seguranca: nenhum certificado, chave, cookie ou .debug no pacote
$secrets = Get-ChildItem -Recurse -Force $stage -Include @("*.p12", "*.pfx", "*.key", "*.pem", "*.crt", "*.cer", "*cookies*", ".debug")
if ($secrets) {
    Remove-Item -Recurse -Force $stage
    throw ("Encontrei arquivo proibido no pacote (nada foi gerado): " + ($secrets.FullName -join ", "))
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
Remove-Item -Recurse -Force $stage

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Pronto: $zip ($size MB)"
