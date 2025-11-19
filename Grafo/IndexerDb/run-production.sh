#!/bin/bash
# ========================================
# Script para ejecutar IndexerDb en modo PRODUCCIÓN
# ========================================

set -e

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "========================================"
    echo "$1"
    echo "========================================"
    echo -e "${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# ========================================
# Configurar entorno
# ========================================

print_header "IndexerDb - Modo PRODUCCIÓN"

# Establecer variable de entorno
export DOTNET_ENVIRONMENT=Production

print_info "Environment: $DOTNET_ENVIRONMENT"
print_info "Configuración: appsettings.Production.json"
print_info "MongoDB: 207.244.249.22:28101 (TLS habilitado)"
echo ""

# Verificar que existe el archivo de configuración
if [ ! -f "appsettings.Production.json" ]; then
    echo "❌ Error: appsettings.Production.json no encontrado"
    exit 1
fi

print_success "Archivo de configuración encontrado"
echo ""

# ========================================
# Ejecutar IndexerDb
# ========================================

print_warning "IMPORTANTE: Este modo se conectará a la base de datos de PRODUCCIÓN"
echo ""

# Parsear argumentos
if [ $# -eq 0 ]; then
    print_info "Uso:"
    echo "  ./run-production.sh --all                # Procesar todos los archivos"
    echo "  ./run-production.sh --interactive         # Modo query interactivo"
    echo "  ./run-production.sh --file <path>         # Procesar archivo específico"
    echo "  ./run-production.sh --all --interactive   # Procesar todo + modo interactivo"
    echo ""
    print_info "Ejecutando con selección de archivos..."
    echo ""
fi

# Ejecutar dotnet run con los argumentos pasados
dotnet run "$@"

print_success "Ejecución completada"
