#!/bin/bash

###############################################################################
# Script de Verificación del MCP Server en Producción
# Verifica que el MCP Server esté configurado correctamente
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
║   Verificación MCP Server - Producción  ║
╚══════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo ""

# Variables
EXPECTED_MCP_PORT=9083
EXPECTED_QUERY_PORT=9081
CONTAINER_MCP="grafo-mcp-server-prod-dh"
CONTAINER_QUERY="grafo-query-service-prod-dh"

print_check() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_success() {
    echo -e "${GREEN}  ✓${NC} $1"
}

print_error() {
    echo -e "${RED}  ✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}  ⚠${NC} $1"
}

# Check 1: Docker containers running
print_check "Verificando contenedores Docker..."

QUERY_RUNNING=$(docker ps --filter "name=$CONTAINER_QUERY" --format "{{.Names}}" 2>/dev/null || echo "")
MCP_RUNNING=$(docker ps --filter "name=$CONTAINER_MCP" --format "{{.Names}}" 2>/dev/null || echo "")

if [ -n "$QUERY_RUNNING" ]; then
    print_success "Query Service container: $CONTAINER_QUERY"
else
    print_error "Query Service container NOT running"
fi

if [ -n "$MCP_RUNNING" ]; then
    print_success "MCP Server container: $CONTAINER_MCP"
else
    print_error "MCP Server container NOT running"
    echo ""
    echo -e "${RED}ERROR:${NC} El contenedor MCP Server no está corriendo."
    echo "Ejecuta: docker ps -a | grep grafo"
    echo "Para iniciarlo: docker start $CONTAINER_MCP"
    exit 1
fi

echo ""

# Check 2: Ports listening
print_check "Verificando puertos escuchando..."

if command -v netstat &> /dev/null; then
    MCP_PORT_LISTENING=$(sudo netstat -tlnp 2>/dev/null | grep ":$EXPECTED_MCP_PORT " || echo "")
    QUERY_PORT_LISTENING=$(sudo netstat -tlnp 2>/dev/null | grep ":$EXPECTED_QUERY_PORT " || echo "")

    if [ -n "$MCP_PORT_LISTENING" ]; then
        print_success "MCP Server escuchando en puerto $EXPECTED_MCP_PORT"
    else
        print_error "MCP Server NO escuchando en puerto $EXPECTED_MCP_PORT"
        print_warning "El servidor puede estar configurado en un puerto diferente"
    fi

    if [ -n "$QUERY_PORT_LISTENING" ]; then
        print_success "Query Service escuchando en puerto $EXPECTED_QUERY_PORT"
    else
        print_error "Query Service NO escuchando en puerto $EXPECTED_QUERY_PORT"
    fi
else
    print_warning "netstat no disponible, omitiendo verificación de puertos"
fi

echo ""

# Check 3: Health checks
print_check "Verificando health checks..."

# Query Service
if curl -f -s http://localhost:$EXPECTED_QUERY_PORT/health > /dev/null 2>&1; then
    print_success "Query Service health check: OK"
else
    print_error "Query Service health check: FAILED"
fi

# MCP Server
if curl -f -s http://localhost:$EXPECTED_MCP_PORT/health > /dev/null 2>&1; then
    print_success "MCP Server health check: OK"
    MCP_HEALTH=$(curl -s http://localhost:$EXPECTED_MCP_PORT/health)
    echo -e "${CYAN}    Response:${NC} $MCP_HEALTH"
else
    print_error "MCP Server health check: FAILED"
    echo -e "${RED}    El MCP Server no responde en http://localhost:$EXPECTED_MCP_PORT/health${NC}"
fi

echo ""

# Check 4: Environment variables in container
print_check "Verificando variables de entorno del MCP Server..."

SERVER_PORT=$(docker exec $CONTAINER_MCP printenv SERVER_PORT 2>/dev/null || echo "")
MONGODB_CONN=$(docker exec $CONTAINER_MCP printenv MONGODB_CONNECTION_STRING 2>/dev/null || echo "")

if [ -n "$SERVER_PORT" ]; then
    if [ "$SERVER_PORT" == "$EXPECTED_MCP_PORT" ]; then
        print_success "SERVER_PORT configurado correctamente: $SERVER_PORT"
    else
        print_error "SERVER_PORT incorrecto: $SERVER_PORT (esperado: $EXPECTED_MCP_PORT)"
        echo ""
        echo -e "${RED}PROBLEMA DETECTADO:${NC}"
        echo "El MCP Server está configurado para escuchar en el puerto $SERVER_PORT"
        echo "pero Nginx está configurado para hacer proxy a $EXPECTED_MCP_PORT"
        echo ""
        echo -e "${YELLOW}SOLUCIÓN:${NC}"
        echo "1. Detener el contenedor: docker stop $CONTAINER_MCP"
        echo "2. Editar docker-compose.dockerhub.yml y agregar:"
        echo "   environment:"
        echo "     - SERVER_PORT=$EXPECTED_MCP_PORT"
        echo "3. Reiniciar: docker compose -f docker-compose.dockerhub.yml --env-file .env.production up -d"
    fi
else
    print_warning "SERVER_PORT no configurado (usando default: 8082)"
    echo ""
    echo -e "${YELLOW}PROBLEMA DETECTADO:${NC}"
    echo "El MCP Server no tiene SERVER_PORT configurado, usará el default (8082)"
    echo "pero Nginx está configurado para hacer proxy a $EXPECTED_MCP_PORT"
    echo ""
    echo -e "${YELLOW}SOLUCIÓN:${NC}"
    echo "1. Detener el contenedor: docker stop $CONTAINER_MCP"
    echo "2. Editar docker-compose.dockerhub.yml y agregar:"
    echo "   environment:"
    echo "     - SERVER_PORT=$EXPECTED_MCP_PORT"
    echo "3. Reiniciar: docker compose -f docker-compose.dockerhub.yml --env-file .env.production up -d"
fi

if [ -n "$MONGODB_CONN" ]; then
    print_success "MONGODB_CONNECTION_STRING: configurado"
else
    print_error "MONGODB_CONNECTION_STRING: NO configurado"
fi

echo ""

# Check 5: Recent logs
print_check "Verificando logs recientes del MCP Server..."

LOGS=$(docker logs $CONTAINER_MCP --tail=20 2>&1)

if echo "$LOGS" | grep -q "MCP Server listo"; then
    print_success "MCP Server se inició correctamente"
else
    print_warning "No se encuentra mensaje de inicio en logs"
fi

if echo "$LOGS" | grep -q "ERROR\|Error\|error\|FAILED\|Failed"; then
    print_error "Se encontraron errores en los logs:"
    echo -e "${RED}$(echo "$LOGS" | grep -i "error\|failed" | tail -5)${NC}"
else
    print_success "No se encontraron errores en logs recientes"
fi

echo ""

# Check 6: Test SSE endpoint (timeout after 3 seconds)
print_check "Probando endpoint SSE..."

SSE_TEST=$(timeout 3 curl -s -v http://localhost:$EXPECTED_MCP_PORT/sse 2>&1 || echo "timeout")

if echo "$SSE_TEST" | grep -q "Connection"; then
    print_success "SSE endpoint responde y mantiene conexión"
else
    print_error "SSE endpoint no responde correctamente"
fi

echo ""

# Check 7: Nginx configuration (if nginx is installed)
if command -v nginx &> /dev/null; then
    print_check "Verificando configuración de Nginx..."

    NGINX_CONFIG=$(sudo nginx -T 2>/dev/null | grep -A 5 "location /api/grafo/mcp/" || echo "")

    if [ -n "$NGINX_CONFIG" ]; then
        if echo "$NGINX_CONFIG" | grep -q "proxy_pass.*localhost:$EXPECTED_MCP_PORT"; then
            print_success "Nginx configurado para hacer proxy a localhost:$EXPECTED_MCP_PORT"
        elif echo "$NGINX_CONFIG" | grep -q "proxy_pass.*localhost:"; then
            WRONG_PORT=$(echo "$NGINX_CONFIG" | grep "proxy_pass" | sed 's/.*localhost:\([0-9]*\).*/\1/')
            print_error "Nginx configurado con puerto incorrecto: $WRONG_PORT (esperado: $EXPECTED_MCP_PORT)"
            echo ""
            echo -e "${YELLOW}SOLUCIÓN:${NC}"
            echo "1. Editar archivo de configuración de Nginx"
            echo "2. Cambiar proxy_pass a: http://localhost:$EXPECTED_MCP_PORT"
            echo "3. Verificar: sudo nginx -t"
            echo "4. Recargar: sudo systemctl reload nginx"
        else
            print_warning "Configuración de Nginx no encontrada o formato no reconocido"
        fi

        # Check SSE-specific settings
        if echo "$NGINX_CONFIG" | grep -q "proxy_buffering off"; then
            print_success "Nginx: proxy_buffering off (requerido para SSE)"
        else
            print_error "Nginx: proxy_buffering NO está en off (requerido para SSE)"
        fi

        if echo "$NGINX_CONFIG" | grep -q "proxy_cache off"; then
            print_success "Nginx: proxy_cache off (requerido para SSE)"
        else
            print_warning "Nginx: proxy_cache no está explícitamente en off"
        fi
    else
        print_warning "No se pudo verificar configuración de Nginx"
    fi
else
    print_warning "Nginx no está instalado o no es accesible"
fi

echo ""

# Summary
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║            RESUMEN                       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Determine overall status
ALL_OK=true

if [ -z "$MCP_RUNNING" ]; then
    ALL_OK=false
    echo -e "${RED}✗ Contenedor MCP Server no está corriendo${NC}"
fi

if [ -n "$SERVER_PORT" ] && [ "$SERVER_PORT" != "$EXPECTED_MCP_PORT" ]; then
    ALL_OK=false
    echo -e "${RED}✗ Puerto configurado incorrectamente: $SERVER_PORT != $EXPECTED_MCP_PORT${NC}"
fi

if ! curl -f -s http://localhost:$EXPECTED_MCP_PORT/health > /dev/null 2>&1; then
    ALL_OK=false
    echo -e "${RED}✗ Health check no responde${NC}"
fi

if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}✓ Todos los checks pasaron correctamente${NC}"
    echo ""
    echo -e "${CYAN}El MCP Server está configurado correctamente.${NC}"
    echo ""
    echo "Prueba conectar desde Cursor con:"
    echo ""
    echo -e "${BLUE}{"
    echo '  "mcpServers": {'
    echo '    "grafo-mcp-prod": {'
    echo '      "url": "https://joseluisyr.com/api/grafo/mcp/sse?version=7.10.2",'
    echo '      "transport": "sse"'
    echo '    }'
    echo '  }'
    echo -e "}${NC}"
else
    echo -e "${RED}✗ Se encontraron problemas de configuración${NC}"
    echo ""
    echo "Revisa los detalles arriba y aplica las soluciones recomendadas."
    echo ""
    echo "Para más información, consulta:"
    echo "  ./MCP_PRODUCTION_TROUBLESHOOTING.md"
fi

echo ""
echo -e "${CYAN}Para ver logs en tiempo real:${NC}"
echo "  docker logs $CONTAINER_MCP -f"
echo ""
