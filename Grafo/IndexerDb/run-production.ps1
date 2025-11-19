# ========================================
# Script para ejecutar IndexerDb en modo PRODUCCIÓN
# ========================================

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

# ========================================
# FUNCIONES HELPER
# ========================================

function Print-Header {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Blue
    Write-Host $Message -ForegroundColor Blue
    Write-Host "========================================`n" -ForegroundColor Blue
}

function Print-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Print-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Print-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

# ========================================
# CONFIGURAR ENTORNO
# ========================================

Print-Header "IndexerDb - Modo PRODUCCIÓN"

# Establecer variable de entorno
$env:DOTNET_ENVIRONMENT = "Production"

Print-Info "Environment: $env:DOTNET_ENVIRONMENT"
Print-Info "Configuración: appsettings.Production.json"
Print-Info "MongoDB: 207.244.249.22:28101 (TLS habilitado)"
Write-Host ""

# Verificar que existe el archivo de configuración
if (!(Test-Path "appsettings.Production.json")) {
    Print-Error "appsettings.Production.json no encontrado"
    exit 1
}

Print-Success "Archivo de configuración encontrado"
Write-Host ""

# ========================================
# EJECUTAR IndexerDb
# ========================================

Print-Warning "IMPORTANTE: Este modo se conectará a la base de datos de PRODUCCIÓN"
Write-Host ""

# Mostrar ayuda si no hay argumentos
if ($Arguments.Count -eq 0) {
    Print-Info "Uso:"
    Write-Host "  .\run-production.ps1 --all                # Procesar todos los archivos"
    Write-Host "  .\run-production.ps1 --interactive         # Modo query interactivo"
    Write-Host "  .\run-production.ps1 --file <path>         # Procesar archivo específico"
    Write-Host "  .\run-production.ps1 --all --interactive   # Procesar todo + modo interactivo"
    Write-Host ""
    Print-Info "Ejecutando con selección de archivos..."
    Write-Host ""
}

# Ejecutar dotnet run con los argumentos pasados
dotnet run -- $Arguments

if ($LASTEXITCODE -eq 0) {
    Print-Success "Ejecución completada"
} else {
    Print-Error "Ejecución falló con código: $LASTEXITCODE"
    exit $LASTEXITCODE
}
