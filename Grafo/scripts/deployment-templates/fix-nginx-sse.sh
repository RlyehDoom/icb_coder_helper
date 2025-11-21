#!/bin/bash

###############################################################################
# Script para Verificar y Corregir Configuración SSE de Nginx
# Detecta el archivo grafo-nginx.conf y verifica/corrige las directivas SSE
###############################################################################

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Banner
echo -e "${CYAN}"
cat << "EOF"
╔══════════════════════════════════════════╗
║   Fix Nginx SSE Configuration           ║
╚══════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo ""

# Funciones
print_success() {
    echo -e "${GREEN}  ✓${NC} $1"
}

print_error() {
    echo -e "${RED}  ✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}  ⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Buscar archivo de configuración de Nginx para Grafo
print_info "Buscando archivo de configuración de Nginx..."

NGINX_CONF=""

# Ubicaciones posibles
POSSIBLE_LOCATIONS=(
    "/home/sonata/1q1/grafo/grafo-nginx.conf"
    "/etc/nginx/sites-available/grafo.conf"
    "/etc/nginx/sites-enabled/grafo.conf"
    "/etc/nginx/conf.d/grafo.conf"
    "$(pwd)/grafo-nginx.conf"
)

for location in "${POSSIBLE_LOCATIONS[@]}"; do
    if [ -f "$location" ]; then
        NGINX_CONF="$location"
        print_success "Encontrado: $NGINX_CONF"
        break
    fi
done

if [ -z "$NGINX_CONF" ]; then
    print_error "No se encontró archivo de configuración de Nginx para Grafo"
    echo ""
    echo "Ubicaciones verificadas:"
    for location in "${POSSIBLE_LOCATIONS[@]}"; do
        echo "  - $location"
    done
    echo ""
    echo "Por favor, especifica la ubicación manualmente:"
    echo "  sudo $0 /ruta/a/grafo-nginx.conf"
    exit 1
fi

echo ""

# Si se proporcionó argumento, usar ese archivo
if [ -n "$1" ]; then
    NGINX_CONF="$1"
    print_info "Usando archivo especificado: $NGINX_CONF"
fi

# Verificar que el archivo existe
if [ ! -f "$NGINX_CONF" ]; then
    print_error "El archivo no existe: $NGINX_CONF"
    exit 1
fi

echo ""
print_info "Verificando directivas SSE en: $NGINX_CONF"
echo ""

# Verificar directivas SSE
HAS_PROXY_BUFFERING=$(grep -c "proxy_buffering off" "$NGINX_CONF" || echo "0")
HAS_PROXY_CACHE=$(grep -c "proxy_cache off" "$NGINX_CONF" || echo "0")
HAS_READ_TIMEOUT=$(grep -c "proxy_read_timeout" "$NGINX_CONF" || echo "0")
HAS_CHUNKED=$(grep -c "chunked_transfer_encoding on" "$NGINX_CONF" || echo "0")

ALL_OK=true

if [ "$HAS_PROXY_BUFFERING" -gt 0 ]; then
    print_success "proxy_buffering off: Encontrado"
else
    print_error "proxy_buffering off: NO encontrado"
    ALL_OK=false
fi

if [ "$HAS_PROXY_CACHE" -gt 0 ]; then
    print_success "proxy_cache off: Encontrado"
else
    print_error "proxy_cache off: NO encontrado"
    ALL_OK=false
fi

if [ "$HAS_READ_TIMEOUT" -gt 0 ]; then
    print_success "proxy_read_timeout: Encontrado"
else
    print_warning "proxy_read_timeout: NO encontrado (recomendado para SSE)"
fi

if [ "$HAS_CHUNKED" -gt 0 ]; then
    print_success "chunked_transfer_encoding on: Encontrado"
else
    print_warning "chunked_transfer_encoding on: NO encontrado (recomendado para SSE)"
fi

echo ""

if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}✓ Todas las directivas SSE críticas están presentes${NC}"
    echo ""
    print_info "Verificando si Nginx está usando esta configuración..."

    # Verificar si nginx tiene esta configuración cargada
    if sudo nginx -T 2>/dev/null | grep -q "proxy_buffering off"; then
        print_success "Nginx tiene proxy_buffering off cargado"
    else
        print_error "Nginx NO tiene proxy_buffering off cargado"
        echo ""
        echo -e "${YELLOW}SOLUCIÓN:${NC}"
        echo "1. Verificar que el archivo está incluido en la configuración principal de Nginx"
        echo "2. Recargar Nginx: sudo systemctl reload nginx"
    fi
else
    echo -e "${RED}✗ Faltan directivas SSE críticas${NC}"
    echo ""
    echo -e "${YELLOW}OPCIONES DE SOLUCIÓN:${NC}"
    echo ""
    echo "OPCIÓN 1: Copiar configuración desde el deployment más reciente"
    echo ""
    LATEST_DEPLOYMENT=$(ls -td /home/sonata/grafo/deployment/grafo-prod-* 2>/dev/null | head -1)
    if [ -n "$LATEST_DEPLOYMENT" ] && [ -f "$LATEST_DEPLOYMENT/grafo-nginx.conf" ]; then
        echo "  Deployment más reciente: $LATEST_DEPLOYMENT"
        echo ""
        echo "  sudo cp $LATEST_DEPLOYMENT/grafo-nginx.conf $NGINX_CONF"
        echo "  sudo nginx -t"
        echo "  sudo systemctl reload nginx"
        echo ""

        # Ofrecer hacer el fix automático
        read -p "¿Quieres que copie la configuración automáticamente? (y/N): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Creando backup del archivo actual..."
            sudo cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d-%H%M%S)"
            print_success "Backup creado"

            print_info "Copiando nueva configuración..."
            sudo cp "$LATEST_DEPLOYMENT/grafo-nginx.conf" "$NGINX_CONF"
            print_success "Configuración copiada"

            print_info "Verificando sintaxis de Nginx..."
            if sudo nginx -t; then
                print_success "Sintaxis correcta"

                print_info "Recargando Nginx..."
                sudo systemctl reload nginx
                print_success "Nginx recargado"

                echo ""
                echo -e "${GREEN}✓ Configuración actualizada exitosamente${NC}"
            else
                print_error "Error en sintaxis de Nginx"
                print_info "Restaurando backup..."
                sudo cp "${NGINX_CONF}.backup.$(date +%Y%m%d-%H%M%S)" "$NGINX_CONF"
                exit 1
            fi
        fi
    else
        echo "  No se encontró deployment reciente en /home/sonata/grafo/deployment/"
    fi

    echo ""
    echo "OPCIÓN 2: Agregar directivas manualmente"
    echo ""
    echo "  Editar el archivo: sudo nano $NGINX_CONF"
    echo ""
    echo "  Dentro de 'location /api/grafo/mcp/ {', agregar:"
    echo ""
    echo "    # SSE requires these settings"
    echo "    proxy_buffering off;"
    echo "    proxy_cache off;"
    echo "    proxy_read_timeout 86400s;  # 24 hours"
    echo "    proxy_send_timeout 86400s;  # 24 hours"
    echo ""
    echo "    # Chunked transfer encoding"
    echo "    chunked_transfer_encoding on;"
    echo ""
    echo "  Luego:"
    echo "    sudo nginx -t"
    echo "    sudo systemctl reload nginx"
fi

echo ""
print_info "Ubicación del archivo: $NGINX_CONF"
echo ""
