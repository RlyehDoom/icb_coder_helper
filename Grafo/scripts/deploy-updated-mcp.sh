#!/bin/bash

###############################################################################
# Deploy Updated MCP Server Container
# Pulls latest image and restarts MCP server
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Deploy Updated MCP Server               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Find deployment directory
DEPLOYMENT_DIR="${GRAFO_DEPLOYMENT_DIR:-/home/sonata/grafo/deployment}"
LATEST_DEPLOYMENT=$(ls -td ${DEPLOYMENT_DIR}/grafo-prod-* 2>/dev/null | head -1)

if [ -z "$LATEST_DEPLOYMENT" ]; then
    echo -e "${YELLOW}⚠ No se encontró directorio de deployment${NC}"
    echo "Usando directorio actual..."
    LATEST_DEPLOYMENT=$(pwd)
fi

echo -e "${BLUE}▶ Directorio de deployment: ${LATEST_DEPLOYMENT}${NC}"
cd "$LATEST_DEPLOYMENT"

# Pull latest image
echo ""
echo -e "${BLUE}▶ Pulling latest image from DockerHub...${NC}"
docker pull rlyehdoom/grafo-mcp:latest

# Stop and remove old container
echo ""
echo -e "${BLUE}▶ Stopping MCP server...${NC}"
docker compose -f docker-compose.dockerhub.yml --env-file .env.production stop mcp-server

echo -e "${BLUE}▶ Removing old container...${NC}"
docker compose -f docker-compose.dockerhub.yml --env-file .env.production rm -f mcp-server

# Start new container
echo ""
echo -e "${BLUE}▶ Starting updated MCP server...${NC}"
docker compose -f docker-compose.dockerhub.yml --env-file .env.production up -d mcp-server

# Wait for startup
echo ""
echo -e "${BLUE}▶ Waiting for server to start...${NC}"
sleep 5

# Check status
echo ""
echo -e "${BLUE}▶ Checking container status...${NC}"
docker ps | grep mcp-server

# Test health endpoint
echo ""
echo -e "${BLUE}▶ Testing health endpoint...${NC}"
curl -f http://localhost:9083/health || echo -e "${YELLOW}⚠ Health check failed${NC}"

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "1. Monitor logs: docker logs grafo-mcp-server-prod-dh -f"
echo "2. Test in Cursor - tools should load instantly now"
echo "3. Look for these log messages:"
echo "   📨 [session_id] Mensaje: initialize"
echo "   ✅ [session_id] Sesión inicializada"
echo "   📋 [session_id] Listando N herramientas"
echo ""
