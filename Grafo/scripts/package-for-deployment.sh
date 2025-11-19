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

# Copy diagnostic script
echo -e "${BLUE}▶ Copying diagnostic script...${NC}"
cp "$SCRIPT_DIR/deployment-templates/diagnose-mongodb.sh" "$PACKAGE_DIR/"
chmod +x "$PACKAGE_DIR/diagnose-mongodb.sh"

# Create simple README
echo -e "${BLUE}▶ Creating README...${NC}"
cat > "$PACKAGE_DIR/README.txt" <<'EOFREADME'
GRAFO PRODUCTION DEPLOYMENT
===========================

Contents:
- deploy-from-dockerhub.sh : Automated deployment script
- diagnose-mongodb.sh      : MongoDB connection diagnostic tool
- Certs/prod/client.pem    : TLS certificate for MongoDB
- README.txt               : This file

QUICK START:
1. chmod +x deploy-from-dockerhub.sh
2. ./deploy-from-dockerhub.sh

The script will:
- Verify Docker and Docker Compose are installed
- Download images from Docker Hub (rlyehdoom/grafo-query, rlyehdoom/grafo-mcp)
- Create configuration files
- Start services on ports 8081 (Query) and 8083 (MCP)

TROUBLESHOOTING:
If the deployment fails with MongoDB connection errors, run:

  chmod +x diagnose-mongodb.sh
  sudo ./diagnose-mongodb.sh

This will test all possible connection methods and show which one works.
Use the working configuration in deploy-from-dockerhub.sh

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
echo "   mkdir -p /home/sonata/grafo/deployment"
echo ""
echo "   # Copy from FTP to deployment directory"
echo "   cp /home/sonata/ftp/$(basename $OUTPUT_FILE) /home/sonata/grafo/deployment/"
echo ""
echo "   # Navigate and extract"
echo "   cd /home/sonata/grafo/deployment"
echo "   tar -xzf $(basename $OUTPUT_FILE)"
echo ""
echo "3. Run deployment:"
echo "   cd $PACKAGE_NAME"
echo "   ./deploy-from-dockerhub.sh"
echo ""
