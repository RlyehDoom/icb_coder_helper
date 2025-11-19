#!/bin/bash

###############################################################################
# MongoDB Connection Diagnostics Tool
# Diagnoses MongoDB connectivity issues without modifying the MongoDB container
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CERT_PATH="$SCRIPT_DIR/Certs/prod/client.pem"

# MongoDB credentials
MONGO_USER="sonata"
MONGO_PASS="qwertY.!1982"
MONGO_DB="GraphDB"
MONGO_AUTH_DB="admin"

print_header() {
  echo -e "${CYAN}"
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║                                                        ║"
  echo "║        MongoDB Connection Diagnostics Tool            ║"
  echo "║                                                        ║"
  echo "╚════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_section() {
  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_test() {
  echo -e "${YELLOW}▶ $1${NC}"
}

print_success() {
  echo -e "${GREEN}  ✓ $1${NC}"
}

print_fail() {
  echo -e "${RED}  ✗ $1${NC}"
}

print_info() {
  echo -e "${CYAN}  ℹ $1${NC}"
}

# Main
print_header

# ============================================================================
# STEP 1: Detect MongoDB Container
# ============================================================================
print_section "1. Detectando Contenedor MongoDB"

MONGO_CONTAINER=$(docker ps --filter "publish=28101" --format "{{.Names}}" 2>/dev/null | head -n 1)

if [ -z "$MONGO_CONTAINER" ]; then
  print_fail "No se encontró contenedor MongoDB en puerto 28101"
  echo ""
  echo "Contenedores corriendo:"
  docker ps --format "table {{.Names}}\t{{.Ports}}"
  exit 1
fi

print_success "Contenedor encontrado: $MONGO_CONTAINER"

# Get container details
MONGO_IP=$(docker inspect "$MONGO_CONTAINER" | grep '"IPAddress"' | head -1 | awk -F'"' '{print $4}')
MONGO_NETWORK=$(docker inspect "$MONGO_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -n 1)

print_info "IP interna: $MONGO_IP"
print_info "Red: $MONGO_NETWORK"
print_info "Puerto externo: 28101"
print_info "Puerto interno: 27017"

# ============================================================================
# STEP 2: Check MongoDB Configuration
# ============================================================================
print_section "2. Configuración de MongoDB"

print_test "Obteniendo configuración de red..."
docker exec "$MONGO_CONTAINER" mongosh admin --quiet --eval "
  var netConfig = db.adminCommand({getCmdLineOpts: 1}).parsed.net;
  print('bindIp:', netConfig.bindIp || 'N/A');
  print('port:', netConfig.port || '27017');
  print('tls.mode:', netConfig.tls ? netConfig.tls.mode : 'N/A');
  print('tls.certificateKeyFile:', netConfig.tls ? netConfig.tls.certificateKeyFile : 'N/A');
" 2>&1 | while read line; do
  print_info "$line"
done

# ============================================================================
# STEP 3: Test Connectivity from Host
# ============================================================================
print_section "3. Probando Conectividad desde Host"

print_test "Probando puerto 28101 (telnet)..."
timeout 3 bash -c "echo > /dev/tcp/localhost/28101 2>/dev/null" && print_success "Puerto 28101 accesible" || print_fail "Puerto 28101 no accesible"

print_test "Probando puerto 28101 (netstat/ss)..."
if netstat -tlnp 2>/dev/null | grep -q ":28101" || ss -tlnp 2>/dev/null | grep -q ":28101"; then
  print_success "Puerto 28101 está escuchando"
else
  print_fail "Puerto 28101 no está escuchando"
fi

# ============================================================================
# STEP 4: Test MongoDB Connections with Different Parameters
# ============================================================================
print_section "4. Probando Conexiones MongoDB"

# Test 1: Internal IP + Internal Port + TLS with tlsInsecure (Python style)
print_test "Test 1: IP Interna ($MONGO_IP:27017) + TLS tlsInsecure=true (Python)"
docker run --rm --network bridge mongo:latest mongosh \
  "mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_IP}:27017/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
  --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
  print_success "FUNCIONA" || print_fail "FALLA"

# Test 2: Internal IP + Internal Port + TLS with tlsAllowInvalidCertificates (.NET style)
print_test "Test 2: IP Interna ($MONGO_IP:27017) + TLS tlsAllowInvalidCertificates=true (.NET)"
docker run --rm --network bridge mongo:latest mongosh \
  "mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_IP}:27017/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsAllowInvalidCertificates=true&tlsAllowInvalidHostnames=true" \
  --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
  print_success "FUNCIONA" || print_fail "FALLA"

# Test 3: External IP + External Port + TLS tlsInsecure
print_test "Test 3: IP Externa (207.244.249.22:28101) + TLS tlsInsecure=true"
docker run --rm --network host mongo:latest mongosh \
  "mongodb://${MONGO_USER}:${MONGO_PASS}@207.244.249.22:28101/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
  --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
  print_success "FUNCIONA" || print_fail "FALLA"

# Test 4: localhost + External Port + TLS tlsInsecure (network_mode: host)
print_test "Test 4: localhost:28101 + TLS tlsInsecure=true (network_mode: host)"
docker run --rm --network host mongo:latest mongosh \
  "mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:28101/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
  --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
  print_success "FUNCIONA" || print_fail "FALLA"

# Test 5: Internal IP + Internal Port + TLS with client certificate
if [ -f "$CERT_PATH" ]; then
  print_test "Test 5: IP Interna + TLS con certificado client.pem"
  docker run --rm --network bridge -v "$CERT_PATH:/cert.pem:ro" mongo:latest mongosh \
    "mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_IP}:27017/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsCertificateKeyFile=/cert.pem&tlsAllowInvalidHostnames=true" \
    --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
    print_success "FUNCIONA" || print_fail "FALLA"
else
  print_test "Test 5: IP Interna + TLS con certificado client.pem"
  print_fail "Certificado no encontrado: $CERT_PATH"
fi

# Test 6: Container network (share network with MongoDB)
print_test "Test 6: Compartiendo red con MongoDB (network: container:$MONGO_CONTAINER)"
docker run --rm --network "container:$MONGO_CONTAINER" mongo:latest mongosh \
  "mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
  --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
  print_success "FUNCIONA" || print_fail "FALLA"

# Test 7: Hostname + External Port + TLS tlsInsecure (like Compass)
print_test "Test 7: Hostname (joseluisyr.com:28101) + TLS tlsInsecure=true (como Compass)"
docker run --rm --network host mongo:latest mongosh \
  "mongodb://${MONGO_USER}:${MONGO_PASS}@joseluisyr.com:28101/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
  --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
  print_success "FUNCIONA" || print_fail "FALLA"

# Test 8: Hostname + External Port + TLS tlsAllowInvalidCertificates (.NET style)
print_test "Test 8: Hostname (joseluisyr.com:28101) + TLS tlsAllowInvalidCertificates=true"
docker run --rm --network host mongo:latest mongosh \
  "mongodb://${MONGO_USER}:${MONGO_PASS}@joseluisyr.com:28101/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsAllowInvalidCertificates=true&tlsAllowInvalidHostnames=true" \
  --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
  print_success "FUNCIONA" || print_fail "FALLA"

# Test 9: Internal IP + Hostname resolution
print_test "Test 9: IP Interna + TLS con hostname en certificado"
docker run --rm --network bridge --add-host="joseluisyr.com:${MONGO_IP}" mongo:latest mongosh \
  "mongodb://${MONGO_USER}:${MONGO_PASS}@joseluisyr.com:27017/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
  --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
  print_success "FUNCIONA" || print_fail "FALLA"

# Test 10: External IP + TLS with client certificate (like Compass)
if [ -f "$CERT_PATH" ]; then
  print_test "Test 10: IP Externa (207.244.249.22:28101) + TLS con certificado client.pem (como Compass)"
  docker run --rm --network host -v "$CERT_PATH:/cert.pem:ro" mongo:latest mongosh \
    "mongodb://${MONGO_USER}:${MONGO_PASS}@207.244.249.22:28101/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
    --tls --tlsCertificateKeyFile /cert.pem --quiet --eval 'db.runCommand({ping: 1})' 2>&1 | grep -q "ok.*1" && \
    print_success "FUNCIONA" || print_fail "FALLA"
else
  print_test "Test 10: IP Externa + TLS con certificado client.pem"
  print_fail "Certificado no encontrado: $CERT_PATH"
fi

# ============================================================================
# STEP 5: Test Python Motor/Pymongo Connection
# ============================================================================
print_section "5. Probando con Python (pymongo/motor)"

if command -v python3 &> /dev/null; then
  print_test "Test con pymongo (si está instalado)..."

  python3 << 'PYTHON_SCRIPT'
import sys
try:
    from pymongo import MongoClient

    # Test 1: Internal IP with tlsInsecure
    try:
        client = MongoClient(
            'mongodb://sonata:qwertY.!1982@MONGO_IP:27017/GraphDB?authSource=admin',
            tls=True,
            tlsInsecure=True,
            serverSelectionTimeoutMS=3000
        )
        client.admin.command('ping')
        print('✓ Python pymongo: IP Interna con tls=True, tlsInsecure=True - FUNCIONA')
    except Exception as e:
        print(f'✗ Python pymongo: IP Interna - FALLA: {str(e)[:100]}')

    # Test 2: External IP
    try:
        client = MongoClient(
            'mongodb://sonata:qwertY.!1982@207.244.249.22:28101/GraphDB?authSource=admin',
            tls=True,
            tlsInsecure=True,
            serverSelectionTimeoutMS=3000
        )
        client.admin.command('ping')
        print('✓ Python pymongo: IP Externa - FUNCIONA')
    except Exception as e:
        print(f'✗ Python pymongo: IP Externa - FALLA: {str(e)[:100]}')

except ImportError:
    print('ℹ pymongo no instalado (opcional)')
except Exception as e:
    print(f'✗ Error en prueba Python: {e}')
PYTHON_SCRIPT

  # Replace MONGO_IP in the script
  sed -i "s/MONGO_IP/$MONGO_IP/g" /tmp/test_pymongo.py 2>/dev/null || true
else
  print_info "Python3 no disponible"
fi

# ============================================================================
# STEP 6: Recommendations
# ============================================================================
print_section "6. Recomendaciones"

echo ""
echo -e "${CYAN}Basado en los tests anteriores:${NC}"
echo ""
echo -e "${GREEN}✓ Tests que FUNCIONARON:${NC} Usa esa configuración en el deployment"
echo -e "${RED}✗ Tests que FALLARON:${NC} Evita esa configuración"
echo ""
echo -e "${YELLOW}Para deployment de Query/MCP (Python):${NC}"
echo "  Usa la configuración del test que funcionó"
echo ""
echo -e "${YELLOW}Connection strings típicos:${NC}"
echo ""
echo "  # Python (pymongo/motor):"
echo "  mongodb://user:pass@$MONGO_IP:27017/GraphDB?authSource=admin&tls=true&tlsInsecure=true"
echo ""
echo "  # .NET (C#):"
echo "  mongodb://user:pass@207.244.249.22:28101/GraphDB?authSource=admin&tls=true&tlsAllowInvalidCertificates=true&tlsAllowInvalidHostnames=true"
echo ""

# ============================================================================
# STEP 7: Docker Compose Suggestion
# ============================================================================
print_section "7. Sugerencia de Docker Compose"

echo ""
echo -e "${CYAN}Según los resultados, tu docker-compose.yml debería usar:${NC}"
echo ""
echo "services:"
echo "  query-service:"
echo "    network_mode: host  # O bridge si test 1/2 funcionaron"
echo "    environment:"
echo "      # Usa el connection string del test exitoso"
echo "      - MONGODB_CONNECTION_STRING=mongodb://..."
echo ""

print_section "Diagnóstico Completo"
echo ""
echo -e "${GREEN}✓ Diagnóstico completado${NC}"
echo ""
echo "Revisa los resultados arriba para determinar la configuración correcta."
echo ""
