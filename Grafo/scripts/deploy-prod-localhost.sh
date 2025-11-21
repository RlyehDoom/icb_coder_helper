#!/bin/bash
# ========================================
# Script de Deployment a Producción - MongoDB en LOCALHOST
# Grafo Query Service + MCP Server
# ========================================
# Autor: Claude Code
# Fecha: 2025-01-21
# Versión: 2.0.0 - Soporte para MongoDB en localhost (Ubuntu/Linux)
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
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ========================================
# FUNCIONES HELPER
# ========================================

print_header() {
    echo -e "${CYAN}"
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
COMPOSE_FILE="docker-compose.prod.localhost.yml"
ENV_FILE=".env.prod"

# ========================================
# BANNER
# ========================================

echo -e "${CYAN}"
cat << "EOF"
╔══════════════════════════════════════════════════════╗
║                                                      ║
║   ██████╗ ██████╗  █████╗ ███████╗ ██████╗          ║
║  ██╔════╝ ██╔══██╗██╔══██╗██╔════╝██╔═══██╗         ║
║  ██║  ███╗██████╔╝███████║█████╗  ██║   ██║         ║
║  ██║   ██║██╔══██╗██╔══██║██╔══╝  ██║   ██║         ║
║  ╚██████╔╝██║  ██║██║  ██║██║     ╚██████╔╝         ║
║   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝      ╚═════╝          ║
║                                                      ║
║        Production Deployment - Localhost MongoDB    ║
╚══════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo ""
echo -e "${YELLOW}📦 Deployment Configuration${NC}"
echo -e "   MongoDB: ${GREEN}localhost:28101${NC} (same server)"
echo -e "   Network Mode: ${GREEN}host${NC} (Linux native)"
echo -e "   Query Service: ${GREEN}localhost:9081${NC}"
echo -e "   MCP Server: ${GREEN}localhost:8082${NC}"
echo ""

# ========================================
# VERIFICACIONES PREVIAS
# ========================================

print_header "Verificaciones Previas"

# Verificar Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker no está instalado"
    exit 1
fi
print_success "Docker instalado ($(docker --version))"

# Verificar Docker Compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    print_success "Docker Compose V2 instalado ($(docker compose version))"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    print_success "Docker Compose V1 instalado ($(docker-compose --version))"
else
    print_error "Docker Compose no está instalado"
    exit 1
fi

# Verificar MongoDB en localhost
print_info "Verificando MongoDB en localhost:28101..."
if nc -z localhost 28101 2>/dev/null || timeout 2 bash -c "</dev/tcp/localhost/28101" 2>/dev/null; then
    print_success "MongoDB accesible en localhost:28101"
else
    print_warning "No se puede conectar a MongoDB en localhost:28101"
    echo ""
    echo -e "${YELLOW}Posibles causas:${NC}"
    echo "  1. MongoDB no está iniciado"
    echo "  2. MongoDB no está escuchando en el puerto 28101"
    echo "  3. Firewall bloqueando la conexión"
    echo ""
    read -p "¿Deseas continuar de todos modos? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Verificar certificado
if [ ! -f "$CERTS_SOURCE_DIR/$CERT_FILE" ]; then
    print_error "Certificado no encontrado: $CERTS_SOURCE_DIR/$CERT_FILE"
    exit 1
fi
print_success "Certificado encontrado"

# Verificar docker-compose.prod.localhost.yml
if [ ! -f "$PROJECT_DIR/$COMPOSE_FILE" ]; then
    print_error "Archivo $COMPOSE_FILE no encontrado"
    exit 1
fi
print_success "Archivo $COMPOSE_FILE encontrado"

# Crear .env.prod si no existe
if [ ! -f "$PROJECT_DIR/$ENV_FILE" ]; then
    print_warning "Archivo $ENV_FILE no encontrado, creando uno por defecto..."

    cat > "$PROJECT_DIR/$ENV_FILE" <<'ENVEOF'
# MongoDB Configuration - LOCALHOST
MONGODB_CONNECTION_STRING=mongodb://sonata:qwertY.!1982@localhost:28101/GraphDB?authSource=admin&tls=true&tlsInsecure=true
MONGODB_DATABASE=GraphDB
MONGODB_PROJECTS_COLLECTION=projects

# TLS Configuration
MONGODB_TLS_CERTIFICATE_KEY_FILE=/app/certs/client.pem
MONGODB_TLS_INSECURE=true

# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=9081

# Logging
LOG_LEVEL=INFO

# CORS
CORS_ORIGINS=*

# Environment
ENVIRONMENT=production
ENVEOF

    print_success "Archivo $ENV_FILE creado"
fi

# ========================================
# DETENER SERVICIOS EXISTENTES
# ========================================

print_header "Deteniendo Servicios Existentes"

cd "$PROJECT_DIR"

# Detener servicios con el compose file de localhost
if $DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --quiet 2>/dev/null | grep -q .; then
    print_info "Deteniendo servicios de producción localhost existentes..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down || true
    print_success "Servicios detenidos"
fi

# Detener servicios con otros compose files si existen
for compose in "docker-compose.prod.yml" "docker-compose.yml"; do
    if [ -f "$compose" ] && $DOCKER_COMPOSE -f "$compose" ps --quiet 2>/dev/null | grep -q .; then
        print_info "Deteniendo servicios de $compose..."
        $DOCKER_COMPOSE -f "$compose" down 2>/dev/null || true
    fi
done

# Verificar y eliminar contenedores huérfanos
for container in "grafo-query-service-prod" "grafo-mcp-server-prod"; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        print_info "Eliminando contenedor huérfano: ${container}"
        docker stop "${container}" 2>/dev/null || true
        docker rm "${container}" 2>/dev/null || true
    fi
done

print_success "Limpieza completada"

# ========================================
# CONSTRUIR IMÁGENES
# ========================================

print_header "Construyendo Imágenes Docker"

cd "$PROJECT_DIR"

print_info "Construyendo Query Service..."
$DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build query-service

print_info "Construyendo MCP Server..."
$DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build mcp-server

print_success "Imágenes construidas"

# ========================================
# INICIAR SERVICIOS
# ========================================

print_header "Iniciando Servicios en Producción"

cd "$PROJECT_DIR"

$DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

print_success "Servicios iniciados"

# ========================================
# VERIFICAR HEALTH
# ========================================

print_header "Verificando Health de Servicios"

# Esperar 15 segundos para que los servicios inicien
print_info "Esperando 15 segundos para que los servicios inicien..."
sleep 15

# Verificar Query Service
print_info "Verificando Query Service (puerto 9081)..."
RETRY_COUNT=0
MAX_RETRIES=5
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s http://localhost:9081/health > /dev/null 2>&1; then
        print_success "Query Service está saludable"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo -e "${YELLOW}   Reintentando ($RETRY_COUNT/$MAX_RETRIES)...${NC}"
            sleep 3
        else
            print_warning "Query Service no responde - verificar logs"
        fi
    fi
done

# Verificar MCP Server
print_info "Verificando MCP Server (puerto 8082)..."
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s http://localhost:8082/health > /dev/null 2>&1; then
        print_success "MCP Server está saludable"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo -e "${YELLOW}   Reintentando ($RETRY_COUNT/$MAX_RETRIES)...${NC}"
            sleep 3
        else
            print_warning "MCP Server no responde - verificar logs"
        fi
    fi
done

# ========================================
# MOSTRAR ESTADO
# ========================================

print_header "Estado de Servicios"

$DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

# ========================================
# INFORMACIÓN DE DEPLOYMENT
# ========================================

print_header "Deployment Completado"

echo -e "${GREEN}"
echo "✅ Servicios desplegados exitosamente en PRODUCCIÓN"
echo ""
echo "📡 Endpoints disponibles:"
echo "   Query Service:  http://localhost:9081"
echo "   Query Docs:     http://localhost:9081/docs"
echo "   Query Health:   http://localhost:9081/health"
echo "   MCP Server:     http://localhost:8082/sse"
echo "   MCP Health:     http://localhost:8082/health"
echo ""
echo "📊 MongoDB Configuración:"
echo "   Host:     localhost:28101"
echo "   Database: GraphDB"
echo "   TLS:      Habilitado (tlsInsecure=true)"
echo "   Cert:     /app/certs/client.pem"
echo ""
echo "🌐 Modo de Red:"
echo "   Network Mode: host (Linux native)"
echo "   Los contenedores comparten la red del host"
echo "   Acceso directo a localhost sin traducción"
echo ""
echo "📋 Comandos útiles:"
echo "   Ver logs:           $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE logs -f"
echo "   Ver logs Query:     $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE logs -f query-service"
echo "   Ver logs MCP:       $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE logs -f mcp-server"
echo "   Ver estado:         $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE ps"
echo "   Detener:            $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE down"
echo "   Reiniciar:          $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE restart"
echo "   Reiniciar Query:    $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE restart query-service"
echo "   Reiniciar MCP:      $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE restart mcp-server"
echo ""
echo "🧪 Pruebas:"
echo "   curl http://localhost:9081/health"
echo "   curl http://localhost:9081/api/projects/search -X POST -H \"Content-Type: application/json\" -d '{\"query\": \"Banking\"}'"
echo "   curl http://localhost:8082/health"
echo -e "${NC}"

# ========================================
# CONFIGURACIÓN DE NGINX (Opcional)
# ========================================

echo ""
read -p "¿Deseas generar la configuración de Nginx? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    NGINX_CONFIG_FILE="$PROJECT_DIR/nginx-grafo-localhost.conf"

    cat > "$NGINX_CONFIG_FILE" <<'NGINXEOF'
# ============================================================================
# Grafo Services - Nginx Configuration (Localhost MongoDB)
# ============================================================================
# Este archivo debe ser incluido en tu configuración principal de Nginx
#
# Agrégalo en tu bloque server {} principal con:
#   include /ruta/a/nginx-grafo-localhost.conf;
# ============================================================================

# ========================
# Grafo Query Service (REST API)
# ========================
location /api/grafo/query/ {
    # Remove /api/grafo/query prefix before forwarding
    rewrite ^/api/grafo/query/(.*)$ /$1 break;

    proxy_pass http://localhost:9081;
    proxy_http_version 1.1;

    # Headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # CORS
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range' always;

    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
        add_header 'Access-Control-Max-Age' 1728000;
        add_header 'Content-Type' 'text/plain; charset=utf-8';
        add_header 'Content-Length' 0;
        return 204;
    }
}

# ========================
# Grafo MCP Server (SSE)
# ========================
location /api/grafo/mcp/ {
    # Remove /api/grafo/mcp prefix before forwarding
    rewrite ^/api/grafo/mcp/(.*)$ /$1 break;

    proxy_pass http://localhost:8082;
    proxy_http_version 1.1;

    # Headers for SSE
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection '';

    # SSE settings
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    chunked_transfer_encoding on;

    # CORS for SSE
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range' always;
}

# Query Service - Swagger UI
location /grafo/docs {
    proxy_pass http://localhost:9081/docs;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}

# Health Checks
location /grafo/query/health {
    proxy_pass http://localhost:9081/health;
}

location /grafo/mcp/health {
    proxy_pass http://localhost:8082/health;
}
NGINXEOF

    print_success "Configuración de Nginx generada: $(basename $NGINX_CONFIG_FILE)"
    echo ""
    echo -e "${CYAN}Para configurar Nginx:${NC}"
    echo "  sudo cp $NGINX_CONFIG_FILE /etc/nginx/conf.d/"
    echo "  sudo nginx -t"
    echo "  sudo systemctl reload nginx"
    echo ""
fi

# ========================================
# MOSTRAR LOGS EN TIEMPO REAL (OPCIONAL)
# ========================================

echo ""
read -p "¿Desea ver los logs en tiempo real? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f
fi
