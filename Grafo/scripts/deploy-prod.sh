#!/bin/bash
# ========================================
# Script de Deployment a Producción
# Grafo Query Service + MCP Server
# ========================================
# Autor: Claude Code
# Fecha: 2025-01-18
# Versión: 1.0.0
# ========================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# ========================================
# COLORES PARA OUTPUT
# ========================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ========================================
# FUNCIONES HELPER
# ========================================

print_header() {
    echo -e "${BLUE}"
    echo "========================================"
    echo "$1"
    echo "========================================"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# ========================================
# VARIABLES
# ========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CERTS_SOURCE_DIR="$PROJECT_DIR/Certs/prod"
CERT_FILE="client.pem"
VOLUME_NAME="mongodb-certs"

# ========================================
# VERIFICACIONES PREVIAS
# ========================================

print_header "Verificaciones Previas"

# Verificar Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker no está instalado"
    exit 1
fi
print_success "Docker instalado"

# Verificar Docker Compose
if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose no está instalado"
    exit 1
fi
print_success "Docker Compose instalado"

# Verificar certificado
if [ ! -f "$CERTS_SOURCE_DIR/$CERT_FILE" ]; then
    print_error "Certificado no encontrado: $CERTS_SOURCE_DIR/$CERT_FILE"
    exit 1
fi
print_success "Certificado encontrado"

# Verificar archivo .env.prod
if [ ! -f "$PROJECT_DIR/.env.prod" ]; then
    print_error "Archivo .env.prod no encontrado"
    exit 1
fi
print_success "Archivo .env.prod encontrado"

# Verificar archivo docker-compose.prod.yml
if [ ! -f "$PROJECT_DIR/docker-compose.prod.yml" ]; then
    print_error "Archivo docker-compose.prod.yml no encontrado"
    exit 1
fi
print_success "Archivo docker-compose.prod.yml encontrado"

# ========================================
# PREPARAR VOLUMEN DE CERTIFICADOS
# ========================================

print_header "Preparando Volumen de Certificados"

# Verificar si el volumen existe
if docker volume inspect $VOLUME_NAME &> /dev/null; then
    print_info "Volumen $VOLUME_NAME ya existe"

    # Preguntar si desea recrearlo
    read -p "¿Desea recrear el volumen? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Eliminando volumen existente..."
        docker volume rm $VOLUME_NAME || true
        print_success "Volumen eliminado"
    fi
fi

# Crear volumen si no existe
if ! docker volume inspect $VOLUME_NAME &> /dev/null; then
    print_info "Creando volumen $VOLUME_NAME..."
    docker volume create $VOLUME_NAME
    print_success "Volumen creado"
fi

# Copiar certificado al volumen
print_info "Copiando certificado al volumen..."
docker run --rm \
    -v "$VOLUME_NAME:/certs" \
    -v "$CERTS_SOURCE_DIR:/source:ro" \
    alpine \
    sh -c "cp /source/$CERT_FILE /certs/ && chmod 644 /certs/$CERT_FILE"

print_success "Certificado copiado al volumen"

# Verificar certificado en volumen
print_info "Verificando certificado en volumen..."
docker run --rm \
    -v "$VOLUME_NAME:/certs:ro" \
    alpine \
    ls -lh /certs/$CERT_FILE

# ========================================
# DETENER SERVICIOS EXISTENTES
# ========================================

print_header "Deteniendo Servicios Existentes"

cd "$PROJECT_DIR"

# Detener servicios de desarrollo si están corriendo
if [ -f "docker-compose.yml" ]; then
    print_info "Deteniendo servicios de desarrollo..."
    docker compose -f docker-compose.yml down || true
    print_success "Servicios de desarrollo detenidos"
fi

# Detener servicios de producción si están corriendo
if docker ps -a --format '{{.Names}}' | grep -q 'grafo.*-prod'; then
    print_info "Deteniendo servicios de producción existentes..."
    docker compose -f docker-compose.prod.yml --env-file .env.prod down || true
    print_success "Servicios de producción detenidos"
fi

# ========================================
# CONSTRUIR IMÁGENES
# ========================================

print_header "Construyendo Imágenes Docker"

cd "$PROJECT_DIR"

print_info "Construyendo Query Service..."
docker compose -f docker-compose.prod.yml --env-file .env.prod build query-service

print_info "Construyendo MCP Server..."
docker compose -f docker-compose.prod.yml --env-file .env.prod build mcp-server

print_success "Imágenes construidas"

# ========================================
# INICIAR SERVICIOS
# ========================================

print_header "Iniciando Servicios en Producción"

cd "$PROJECT_DIR"

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

print_success "Servicios iniciados"

# ========================================
# VERIFICAR HEALTH
# ========================================

print_header "Verificando Health de Servicios"

# Esperar 10 segundos para que los servicios inicien
print_info "Esperando 10 segundos para que los servicios inicien..."
sleep 10

# Verificar Query Service
print_info "Verificando Query Service (puerto 8081)..."
if curl -f -s http://localhost:8081/health > /dev/null 2>&1; then
    print_success "Query Service está saludable"
else
    print_warning "Query Service no responde - verificar logs"
fi

# Verificar MCP Server
print_info "Verificando MCP Server (puerto 8083)..."
if curl -f -s http://localhost:8083/health > /dev/null 2>&1; then
    print_success "MCP Server está saludable"
else
    print_warning "MCP Server no responde - verificar logs"
fi

# ========================================
# MOSTRAR ESTADO
# ========================================

print_header "Estado de Servicios"

docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# ========================================
# INFORMACIÓN DE DEPLOYMENT
# ========================================

print_header "Deployment Completado"

echo -e "${GREEN}"
echo "✅ Servicios desplegados exitosamente en PRODUCCIÓN"
echo ""
echo "📡 Endpoints disponibles:"
echo "   Query Service: http://localhost:8081"
echo "   MCP Server:    http://localhost:8083/sse"
echo "   Health Check:  http://localhost:8081/health"
echo ""
echo "📊 MongoDB Configuración:"
echo "   Host:     207.244.249.22:28101"
echo "   Database: GraphDB"
echo "   TLS:      Habilitado"
echo "   Cert:     /app/certs/client.pem"
echo ""
echo "📋 Comandos útiles:"
echo "   Ver logs:      docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f"
echo "   Ver estado:    docker compose -f docker-compose.prod.yml --env-file .env.prod ps"
echo "   Detener:       docker compose -f docker-compose.prod.yml --env-file .env.prod down"
echo "   Reiniciar:     docker compose -f docker-compose.prod.yml --env-file .env.prod restart"
echo -e "${NC}"

# ========================================
# MOSTRAR LOGS EN TIEMPO REAL (OPCIONAL)
# ========================================

read -p "¿Desea ver los logs en tiempo real? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
fi
