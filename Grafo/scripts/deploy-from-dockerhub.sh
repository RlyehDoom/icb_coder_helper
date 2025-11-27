#!/bin/bash

###############################################################################
# Grafo Production Deployment - Docker Hub Images
#
# Este script despliega Query Service y MCP Server en producción
# usando las imágenes publicadas en Docker Hub.
#
# Requisitos:
# - Docker instalado
# - Docker Compose instalado
# - Certificado TLS en ./Certs/prod/client.pem
# - Acceso a MongoDB productivo (207.244.249.22:28101)
#
# Uso:
#   ./deploy-from-dockerhub.sh [--skip-pull] [--skip-cert-check]
#
# Opciones:
#   --skip-pull       No hacer pull de las imágenes (usar las locales)
#   --skip-cert-check No verificar el certificado TLS
###############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
DOCKER_REPO_QUERY="rlyehdoom/grafo-query"
DOCKER_REPO_MCP="rlyehdoom/grafo-mcp"
DOCKER_TAG="latest"
COMPOSE_FILE="docker-compose.dockerhub.yml"
CERT_PATH="./Certs/prod/client.pem"
ENV_FILE=".env.production"

# MongoDB Production Configuration
# Detect MongoDB container and its network
detect_mongodb_config() {
  # Try to find MongoDB container listening on port 28101
  local mongo_container=$(docker ps --filter "publish=28101" --format "{{.Names}}" 2>/dev/null | head -n 1)

  if [ -n "$mongo_container" ]; then
    # Found MongoDB container, get its network
    local mongo_network=$(docker inspect "$mongo_container" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -n 1)

    if [ -n "$mongo_network" ]; then
      echo "$mongo_container|$mongo_network"
      return 0
    fi
  fi

  # Fallback: no MongoDB container found
  echo "|"
  return 1
}

# These will be set after detecting MongoDB
MONGODB_HOST=""
MONGODB_PORT=""
MONGODB_CONTAINER=""
MONGODB_NETWORK=""
USE_MONGO_NETWORK=false
MONGODB_CONNECTION_STRING=""
MONGODB_DATABASE="GraphDB"
MONGODB_PROJECTS_COLLECTION="projects"

# Parse arguments
SKIP_PULL=false
SKIP_CERT_CHECK=false

for arg in "$@"; do
  case $arg in
    --skip-pull)
      SKIP_PULL=true
      shift
      ;;
    --skip-cert-check)
      SKIP_CERT_CHECK=true
      shift
      ;;
    *)
      # Unknown option
      ;;
  esac
done

# Functions
print_header() {
  echo -e "${CYAN}"
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║                                                      ║"
  echo "║   ██████╗ ██████╗  █████╗ ███████╗ ██████╗          ║"
  echo "║  ██╔════╝ ██╔══██╗██╔══██╗██╔════╝██╔═══██╗         ║"
  echo "║  ██║  ███╗██████╔╝███████║█████╗  ██║   ██║         ║"
  echo "║  ██║   ██║██╔══██╗██╔══██║██╔══╝  ██║   ██║         ║"
  echo "║  ╚██████╔╝██║  ██║██║  ██║██║     ╚██████╔╝         ║"
  echo "║   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝      ╚═════╝          ║"
  echo "║                                                      ║"
  echo "║        Production Deployment - Docker Hub           ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_step() {
  echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

check_command() {
  if ! command -v "$1" &> /dev/null; then
    print_error "$1 no está instalado"
    echo "Por favor, instala $1 antes de continuar"
    exit 1
  fi
  print_success "$1 está instalado"
}

# Main Script
print_header

# MongoDB configuration - use external IP with TLS certificate (like Compass)
echo -e "${BLUE}🔧 Configuración MongoDB con TLS${NC}"

# Use external IP (as Compass does) with TLS certificate
MONGODB_HOST="207.244.249.22"
MONGODB_PORT="28101"
MONGODB_TLS_CERT="/app/certs/client.pem"

echo -e "${GREEN}  ✓ Host: ${MONGODB_HOST}${NC}"
echo -e "${GREEN}  ✓ Puerto: ${MONGODB_PORT}${NC}"
echo -e "${GREEN}  ✓ Certificado TLS: ${MONGODB_TLS_CERT}${NC}"
echo -e "${YELLOW}  ℹ Usando IP externa + certificado TLS (como Compass)${NC}"
echo -e "${YELLOW}  ℹ Python usa tlsInsecure=true + certificado${NC}"
echo ""

# Python (pymongo/motor) requiere tlsInsecure=true + certificado
# El certificado se pasa como variable de entorno MONGODB_TLS_CERTIFICATE_KEY_FILE
MONGODB_CONNECTION_STRING="mongodb://user:pass@${MONGODB_HOST}:${MONGODB_PORT}/GraphDB?authSource=admin&tls=true&tlsInsecure=true"

echo ""
echo -e "${YELLOW}📦 Deployment de Grafo Production usando Docker Hub${NC}"
echo ""
echo "Imágenes:"
echo "  - Query Service: $DOCKER_REPO_QUERY:$DOCKER_TAG"
echo "  - MCP Server: $DOCKER_REPO_MCP:$DOCKER_TAG"
echo ""
echo "Puertos:"
echo "  - Query Service: 9081"
echo "  - MCP Server: 9083"
echo ""
echo "MongoDB:"
echo "  - Host: ${MONGODB_HOST}:${MONGODB_PORT}"
echo "  - Modo: network_mode: host (acceso directo)"
echo "  - Database: $MONGODB_DATABASE"
echo ""

# Step 1: Verificar requisitos
print_step "Paso 1/8: Verificando requisitos..."
check_command "docker"

# Check for docker compose (V2) or docker-compose (V1)
if docker compose version &> /dev/null; then
  DOCKER_COMPOSE="docker compose"
  print_success "docker compose está instalado"
elif command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
  print_success "docker-compose está instalado"
else
  print_error "Docker Compose no está instalado"
  echo "Por favor, instala Docker Compose antes de continuar"
  exit 1
fi

# Step 2: Verificar certificado TLS
if [ "$SKIP_CERT_CHECK" = false ]; then
  print_step "Paso 2/8: Verificando certificado TLS..."

  if [ ! -f "$CERT_PATH" ]; then
    print_error "Certificado no encontrado: $CERT_PATH"
    echo ""
    echo "Por favor, copia el certificado TLS a esta ubicación:"
    echo "  mkdir -p Certs/prod"
    echo "  cp /ruta/al/client.pem $CERT_PATH"
    exit 1
  fi

  # Verificar que el certificado sea válido
  if openssl x509 -in "$CERT_PATH" -text -noout &> /dev/null; then
    print_success "Certificado TLS válido: $CERT_PATH"
  else
    print_warning "No se pudo validar el certificado (puede ser normal si no es X.509)"
  fi
else
  print_warning "Paso 2/8: Verificación de certificado omitida (--skip-cert-check)"
fi

# Step 3: Pull de imágenes desde Docker Hub
if [ "$SKIP_PULL" = false ]; then
  print_step "Paso 3/8: Descargando imágenes desde Docker Hub..."

  echo -e "${CYAN}Descargando Query Service...${NC}"
  if docker pull "$DOCKER_REPO_QUERY:$DOCKER_TAG"; then
    print_success "Query Service descargado"
  else
    print_error "Error al descargar Query Service"
    echo "Si el repositorio es privado, ejecuta primero:"
    echo "  docker login"
    exit 1
  fi

  echo -e "${CYAN}Descargando MCP Server...${NC}"
  if docker pull "$DOCKER_REPO_MCP:$DOCKER_TAG"; then
    print_success "MCP Server descargado"
  else
    print_error "Error al descargar MCP Server"
    exit 1
  fi
else
  print_warning "Paso 3/8: Pull de imágenes omitido (--skip-pull)"
fi

# Step 4: Crear archivo .env.production
print_step "Paso 4/8: Creando archivo de configuración de producción..."

cat > "$ENV_FILE" <<EOF
# MongoDB Production Configuration
MONGODB_CONNECTION_STRING=$MONGODB_CONNECTION_STRING
MONGODB_DATABASE=$MONGODB_DATABASE
MONGODB_PROJECTS_COLLECTION=$MONGODB_PROJECTS_COLLECTION
MONGODB_STATES_COLLECTION=processing_states

# TLS Configuration
MONGODB_TLS_CERTIFICATE_KEY_FILE=/app/certs/client.pem
MONGODB_TLS_INSECURE=true

# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=9081
SERVER_RELOAD=false

# CORS
CORS_ORIGINS=*

# Authentication
QUERY_API_KEY=
ENABLE_AUTH=false

# Cache
ENABLE_CACHE=true
CACHE_TTL=300

# Logging
LOG_LEVEL=INFO

# Environment
ENVIRONMENT=production

# Docker Images
DOCKER_REPO_QUERY=$DOCKER_REPO_QUERY
DOCKER_REPO_MCP=$DOCKER_REPO_MCP
DOCKER_TAG=$DOCKER_TAG
EOF

print_success "Archivo de configuración creado: $ENV_FILE"

# Step 5: Crear docker-compose.dockerhub.yml
print_step "Paso 5/8: Creando docker-compose para Docker Hub..."

# Generate simple docker-compose with network_mode: host
cat > "$COMPOSE_FILE" <<'EOF'
# Docker Compose para Producción - Imágenes de Docker Hub
# Stack: grafo-prod-dockerhub
# Servicios: Query Service (9081), MCP Server (9083)
# MongoDB: Acceso directo vía localhost:28101 (network_mode: host)

version: '3.8'

services:
  # ========================
  # Query Service (REST API) - PRODUCCIÓN
  # ========================
  query-service:
    image: ${DOCKER_REPO_QUERY}:${DOCKER_TAG}
    container_name: grafo-query-service-prod-dh
    network_mode: host

    environment:
      # MongoDB Configuration - PRODUCCIÓN
      - MONGODB_CONNECTION_STRING=${MONGODB_CONNECTION_STRING}
      - MONGODB_DATABASE=${MONGODB_DATABASE}
      - MONGODB_PROJECTS_COLLECTION=${MONGODB_PROJECTS_COLLECTION}

      # TLS Configuration
      - MONGODB_TLS_CERTIFICATE_KEY_FILE=${MONGODB_TLS_CERTIFICATE_KEY_FILE}
      - MONGODB_TLS_INSECURE=${MONGODB_TLS_INSECURE}

      # Server Configuration
      - SERVER_HOST=${SERVER_HOST}
      - SERVER_PORT=${SERVER_PORT}

      # Logging - PRODUCCIÓN
      - LOG_LEVEL=${LOG_LEVEL}

      # CORS
      - CORS_ORIGINS=${CORS_ORIGINS}

      # Environment
      - ENVIRONMENT=${ENVIRONMENT}

    volumes:
      # Montar certificados MongoDB desde directorio compartido
      - ./Certs/prod:/app/certs:ro

    restart: unless-stopped

    labels:
      - "com.grafo.service=query-service"
      - "com.grafo.version=1.0.0"
      - "com.grafo.environment=production"
      - "com.grafo.source=dockerhub"
      - "com.grafo.description=REST API for querying C# code graph - PRODUCTION (Docker Hub)"

  # ========================
  # MCP Server (Model Context Protocol) - PRODUCCIÓN
  # ========================
  mcp-server:
    image: ${DOCKER_REPO_MCP}:${DOCKER_TAG}
    container_name: grafo-mcp-server-prod-dh
    network_mode: host

    environment:
      # MongoDB Configuration - PRODUCCIÓN
      - MONGODB_CONNECTION_STRING=${MONGODB_CONNECTION_STRING}
      - MONGODB_DATABASE=${MONGODB_DATABASE}
      - MONGODB_PROJECTS_COLLECTION=${MONGODB_PROJECTS_COLLECTION}

      # TLS Configuration
      - MONGODB_TLS_CERTIFICATE_KEY_FILE=${MONGODB_TLS_CERTIFICATE_KEY_FILE}
      - MONGODB_TLS_INSECURE=${MONGODB_TLS_INSECURE}

      # Server Configuration
      # IMPORTANTE: Con network_mode: host, este puerto se expone directamente en el host
      # Nginx está configurado para hacer proxy a localhost:9083
      # Nota: Puerto 8082 está tomado en el servidor de producción
      - SERVER_PORT=9083

      # Logging - PRODUCCIÓN
      - LOG_LEVEL=${LOG_LEVEL}

      # Python
      - PYTHONUNBUFFERED=1
      - PYTHONPATH=/app

      # Environment
      - ENVIRONMENT=${ENVIRONMENT}

    volumes:
      # Montar certificados MongoDB desde directorio compartido
      - ./Certs/prod:/app/certs:ro

    restart: unless-stopped

    healthcheck:
      # Con network_mode: host, usa localhost directamente en el puerto 9083
      test: ["CMD", "curl", "-f", "http://localhost:9083/health"]
      interval: 30s
      timeout: 10s
      start_period: 40s
      retries: 3

    labels:
      - "com.grafo.service=mcp-server"
      - "com.grafo.version=1.0.0"
      - "com.grafo.environment=production"
      - "com.grafo.source=dockerhub"
      - "com.grafo.description=Model Context Protocol Server - PRODUCTION (Docker Hub)"
EOF

print_success "Docker Compose creado: $COMPOSE_FILE"

# Step 6: Detener servicios existentes
print_step "Paso 6/8: Deteniendo servicios existentes..."

# Intentar detener servicios previos con docker-compose (pueden no existir, ignorar errores)
$DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down 2>/dev/null || true
$DOCKER_COMPOSE -f docker-compose.prod.yml --env-file .env.prod down 2>/dev/null || true

# Verificar y eliminar contenedores específicos si aún existen
CONTAINER_QUERY="grafo-query-service-prod-dh"
CONTAINER_MCP="grafo-mcp-server-prod-dh"

# Función para detener y eliminar contenedor si existe
remove_container_if_exists() {
  local container_name=$1
  if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
    echo -e "${CYAN}  Eliminando contenedor existente: ${container_name}${NC}"
    docker stop "${container_name}" 2>/dev/null || true
    docker rm "${container_name}" 2>/dev/null || true
  fi
}

# Eliminar contenedores si existen
remove_container_if_exists "$CONTAINER_QUERY"
remove_container_if_exists "$CONTAINER_MCP"

print_success "Servicios anteriores detenidos y eliminados"

# Step 7: Iniciar servicios
print_step "Paso 7/8: Iniciando servicios con Docker Compose..."

if $DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d; then
  print_success "Servicios iniciados exitosamente"
else
  print_error "Error al iniciar servicios"
  echo ""
  echo "Ver logs con:"
  echo "  $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE logs"
  exit 1
fi

# Esperar un momento para que los servicios inicien
sleep 5

# Step 8: Verificar servicios
print_step "Paso 8/8: Verificando servicios..."

# Verificar Query Service
echo -n "Query Service (9081): "
if curl -s -f http://localhost:9081/health > /dev/null 2>&1; then
  print_success "OK"
else
  print_warning "No responde (puede tardar unos segundos más)"
fi

# Verificar MCP Server
echo -n "MCP Server (9083): "
if curl -s -f http://localhost:9083/health > /dev/null 2>&1; then
  print_success "OK"
else
  print_warning "No responde (puede tardar unos segundos más)"
fi

# Mostrar estado de contenedores
echo ""
echo -e "${CYAN}Estado de contenedores:${NC}"
$DOCKER_COMPOSE -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

# Success message
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                        ║${NC}"
echo -e "${GREEN}║  ✓ Deployment completado exitosamente                 ║${NC}"
echo -e "${GREEN}║                                                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📡 Servicios disponibles:${NC}"
echo "  • Query Service (REST API): http://localhost:9081"
echo "  • Query Service Docs: http://localhost:9081/docs"
echo "  • MCP Server (SSE): http://localhost:9083/sse"
echo "  • MCP Server Health: http://localhost:9083/health"
echo ""
echo -e "${CYAN}📋 Comandos útiles:${NC}"
echo "  # Ver logs"
echo "  $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE logs -f"
echo ""
echo "  # Ver logs de un servicio específico"
echo "  $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE logs -f query-service"
echo "  $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE logs -f mcp-server"
echo ""
echo "  # Reiniciar servicios"
echo "  $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE restart"
echo ""
echo "  # Detener servicios"
echo "  $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE down"
echo ""
echo "  # Ver estado"
echo "  $DOCKER_COMPOSE -f $COMPOSE_FILE --env-file $ENV_FILE ps"
echo ""

# Generate Nginx configuration
print_step "Generando configuración de Nginx..."

NGINX_CONFIG_FILE="./grafo-nginx.conf"

cat > "$NGINX_CONFIG_FILE" <<'NGINX_EOF'
# ============================================================================
# Grafo Services - Nginx Configuration
# ============================================================================
# Este archivo debe ser incluido en tu configuración principal de Nginx
#
# Agrégalo en tu bloque server {} principal con:
#   include /ruta/a/grafo-nginx.conf;
# ============================================================================

# ========================
# Grafo Query Service (REST API)
# ========================
# Using ^~ modifier to prevent regex location processing
# This ensures /api/grafo/query/ is matched before generic /api/ regex locations
location ^~ /api/grafo/query/ {
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

    # CORS (si es necesario)
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range' always;

    # Handle OPTIONS for CORS preflight
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
# Using ^~ modifier to prevent regex location processing
# This ensures /api/grafo/mcp/ is matched before generic /api/ regex locations
location ^~ /api/grafo/mcp/ {
    # Remove /api/grafo/mcp prefix before forwarding
    rewrite ^/api/grafo/mcp/(.*)$ /$1 break;

    proxy_pass http://localhost:9083;
    proxy_http_version 1.1;

    # Headers for SSE (Server-Sent Events)
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection '';

    # SSE requires these settings
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;  # 24 hours
    proxy_send_timeout 86400s;  # 24 hours

    # Chunked transfer encoding
    chunked_transfer_encoding on;

    # CORS for SSE
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range' always;
    add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;

    # Handle OPTIONS for CORS preflight
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
# Rutas Directas (Opcional)
# ========================

# Query Service - Swagger UI
location /grafo/docs {
    proxy_pass http://localhost:9081/docs;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Query Service - Health Check
location /grafo/query/health {
    proxy_pass http://localhost:9081/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}

# MCP Server - Health Check
location /grafo/mcp/health {
    proxy_pass http://localhost:9083/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}

# MCP Server - Messages Endpoint (for hybrid SSE mode)
# Cursor posts messages to /messages/ directly when using hybrid mode
location /messages/ {
    proxy_pass http://localhost:9083/messages/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # CORS
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type' always;
}
NGINX_EOF

print_success "Configuración de Nginx generada: $NGINX_CONFIG_FILE"

echo ""
echo -e "${CYAN}🌐 Configuración de Nginx:${NC}"
echo ""
echo -e "${YELLOW}Archivo generado:${NC} $NGINX_CONFIG_FILE"
echo ""
echo -e "${YELLOW}Para agregar a tu Nginx existente:${NC}"
echo ""
echo "1. Copia el archivo a tu directorio de configuración de Nginx:"
echo "   sudo cp $NGINX_CONFIG_FILE /etc/nginx/conf.d/"
echo ""
echo "2. O inclúyelo en tu bloque server {} existente:"
echo "   # En /etc/nginx/sites-available/tu-sitio.conf"
echo "   server {"
echo "       listen 80;"
echo "       server_name tu-dominio.com;"
echo "       "
echo "       # Incluir configuración de Grafo"
echo "       include $(pwd)/$NGINX_CONFIG_FILE;"
echo "       "
echo "       # ... resto de tu configuración"
echo "   }"
echo ""
echo "3. Verificar configuración:"
echo "   sudo nginx -t"
echo ""
echo "4. Recargar Nginx:"
echo "   sudo systemctl reload nginx"
echo ""
echo -e "${YELLOW}URLs públicas (después de configurar Nginx):${NC}"
echo "  • Query API: https://tu-dominio.com/api/grafo/query/"
echo "  • MCP SSE: https://tu-dominio.com/api/grafo/mcp/sse"
echo "  • Swagger UI: https://tu-dominio.com/grafo/docs"
echo "  • Query Health: https://tu-dominio.com/grafo/query/health"
echo "  • MCP Health: https://tu-dominio.com/grafo/mcp/health"
echo ""
echo -e "${YELLOW}⚠️  Nota: Los servicios se conectan a MongoDB productivo en ${MONGODB_HOST}:${MONGODB_PORT}${NC}"
echo ""
