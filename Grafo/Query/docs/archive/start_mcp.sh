#!/bin/bash

# Script para iniciar el MCP Server del Query Service
# Compatible con Linux, macOS y Windows (Git Bash/WSL)

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Iniciando MCP Server para Grafo Query Service${NC}\n"

# Verificar que estamos en el directorio correcto
if [ ! -f "start_mcp.py" ]; then
    echo -e "${RED}❌ Error: Este script debe ejecutarse desde el directorio Grafo/Query${NC}"
    exit 1
fi

# Verificar Python
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo -e "${RED}❌ Error: Python no encontrado${NC}"
    echo "Por favor instala Python 3.11 o superior"
    exit 1
fi

echo -e "${GREEN}✓${NC} Python encontrado: $($PYTHON --version)"

# Verificar entorno virtual
if [ -d "venv" ]; then
    echo -e "${GREEN}✓${NC} Entorno virtual encontrado"

    # Activar venv según el sistema
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        # Windows (Git Bash)
        source venv/Scripts/activate
    else
        # Linux/Mac
        source venv/bin/activate
    fi

    echo -e "${GREEN}✓${NC} Entorno virtual activado"
else
    echo -e "${YELLOW}⚠${NC}  Entorno virtual no encontrado"
    echo "Recomendado: Crear venv con 'python -m venv venv' e instalar dependencias"
    echo "Continuando con Python del sistema..."
fi

# Verificar MongoDB
echo -e "\n${BLUE}Verificando MongoDB...${NC}"
if $PYTHON -c "from pymongo import MongoClient; MongoClient('mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/', serverSelectionTimeoutMS=2000).server_info()" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} MongoDB conectado"
else
    echo -e "${YELLOW}⚠${NC}  MongoDB no disponible o credenciales incorrectas"
    echo "El servidor intentará conectarse al iniciar..."
fi

# Verificar dependencias
echo -e "\n${BLUE}Verificando dependencias...${NC}"
if $PYTHON -c "import mcp" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Paquete 'mcp' instalado"
else
    echo -e "${RED}❌ Error: Paquete 'mcp' no instalado${NC}"
    echo "Instala dependencias con: pip install -r requirements.txt"
    exit 1
fi

# Iniciar servidor
echo -e "\n${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🌐 Iniciando MCP Server...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

# Ejecutar
$PYTHON start_mcp.py
