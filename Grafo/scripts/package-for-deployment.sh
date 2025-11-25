#!/bin/bash

###############################################################################
# Package Grafo for Production Deployment - Simple Version
# Creates a deployment package with essential files only
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Configuration
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PACKAGE_NAME="grafo-prod-${TIMESTAMP}"
PACKAGE_DIR="$PROJECT_ROOT/$PACKAGE_NAME"
OUTPUT_FILE="$PROJECT_ROOT/${PACKAGE_NAME}.tar.gz"

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Grafo Production Deployment Package    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Create package directory
echo -e "${BLUE}▶ Creating package directory...${NC}"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/Certs/prod"

# Copy certificate
echo -e "${BLUE}▶ Copying certificate...${NC}"
cp "$PROJECT_ROOT/Certs/prod/client.pem" "$PACKAGE_DIR/Certs/prod/"

# Copy deployment script
echo -e "${BLUE}▶ Copying deployment script...${NC}"
cp "$SCRIPT_DIR/deploy-from-dockerhub.sh" "$PACKAGE_DIR/"
chmod +x "$PACKAGE_DIR/deploy-from-dockerhub.sh"

# Copy diagnostic scripts
echo -e "${BLUE}▶ Copying diagnostic scripts...${NC}"
cp "$SCRIPT_DIR/deployment-templates/diagnose-mongodb.sh" "$PACKAGE_DIR/"
cp "$SCRIPT_DIR/deployment-templates/verify-mcp-server.sh" "$PACKAGE_DIR/"
cp "$SCRIPT_DIR/deployment-templates/fix-nginx-sse.sh" "$PACKAGE_DIR/"
chmod +x "$PACKAGE_DIR/diagnose-mongodb.sh"
chmod +x "$PACKAGE_DIR/verify-mcp-server.sh"
chmod +x "$PACKAGE_DIR/fix-nginx-sse.sh"

# Create simple README
echo -e "${BLUE}▶ Creating README...${NC}"
cat > "$PACKAGE_DIR/README.txt" <<'EOFREADME'
GRAFO PRODUCTION DEPLOYMENT
===========================

Contents:
- deploy-from-dockerhub.sh           : Automated deployment script
- diagnose-mongodb.sh                : MongoDB connection diagnostic tool
- verify-mcp-server.sh               : MCP Server configuration verification
- fix-nginx-sse.sh                   : Nginx SSE configuration fix tool
- MCP_PRODUCTION_TROUBLESHOOTING.md  : Complete troubleshooting guide
- Certs/prod/client.pem              : TLS certificate for MongoDB
- README.txt                         : This file

QUICK START:
1. chmod +x deploy-from-dockerhub.sh
2. ./deploy-from-dockerhub.sh

The script will:
- Verify Docker and Docker Compose are installed
- Download images from Docker Hub (rlyehdoom/grafo-query, rlyehdoom/grafo-mcp)
- Create configuration files
- Start services:
  * Query Service on port 9081
  * MCP Server on port 9083
- Generate Nginx configuration (grafo-nginx.conf)

IMPORTANT: After deployment, copy the Nginx configuration:
  sudo cp grafo-nginx.conf /etc/nginx/sites-available/grafo.conf
  sudo nginx -t
  sudo systemctl reload nginx

TROUBLESHOOTING:

1. MongoDB connection issues:
   chmod +x diagnose-mongodb.sh
   sudo ./diagnose-mongodb.sh

2. MCP Server not connecting (Cursor stuck on "Loading tools..."):
   chmod +x verify-mcp-server.sh
   sudo ./verify-mcp-server.sh

   This will check:
   - Container status
   - Port configuration (should be 9083)
   - Health checks
   - Nginx proxy configuration
   - SSE endpoint functionality

3. Nginx SSE configuration issues (proxy_buffering, proxy_cache):
   chmod +x fix-nginx-sse.sh
   sudo ./fix-nginx-sse.sh

   This will:
   - Detect Nginx configuration file for Grafo
   - Verify SSE-required directives (proxy_buffering off, proxy_cache off)
   - Offer to automatically fix configuration if issues found
   - Reload Nginx after fixing

4. Full troubleshooting guide:
   See MCP_PRODUCTION_TROUBLESHOOTING.md

CURSOR CONFIGURATION:

After deployment, configure Cursor with:

{
  "mcpServers": {
    "grafo-mcp-prod": {
      "url": "https://your-domain.com/api/grafo/mcp/sse?version=7.10.2",
      "transport": "sse"
    }
  }
}

Replace "your-domain.com" with your actual domain and "7.10.2" with your version.

For full documentation, see:
https://github.com/your-repo/Grafo/blob/main/PRODUCTION_DEPLOYMENT.md
EOFREADME

# Create tarball
echo -e "${BLUE}▶ Creating package...${NC}"
cd "$PROJECT_ROOT"
tar -czf "$OUTPUT_FILE" "$PACKAGE_NAME"

# Get file size
FILESIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')

# Cleanup
rm -rf "$PACKAGE_DIR"

# Success
echo ""
echo -e "${GREEN}✓ Package created successfully!${NC}"
echo ""
echo "File: $(basename $OUTPUT_FILE)"
echo "Size: $FILESIZE"
echo "Path: $OUTPUT_FILE"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo ""
echo "1. Transfer to server:"
echo "   scp $(basename $OUTPUT_FILE) user@server:~/ftp/"
echo ""
echo "2. On server (Ubuntu example):"
echo "   # Create deployment directory"
echo "   mkdir -p \$HOME/grafo/deployment"
echo ""
echo "   # Copy from FTP to deployment directory"
echo "   cp \$HOME/ftp/$(basename $OUTPUT_FILE) \$HOME/grafo/deployment/"
echo ""
echo "   # Navigate and extract"
echo "   cd \$HOME/grafo/deployment"
echo "   tar -xzf $(basename $OUTPUT_FILE)"
echo ""
echo "3. Run deployment:"
echo "   cd $PACKAGE_NAME"
echo "   ./deploy-from-dockerhub.sh"
echo ""
