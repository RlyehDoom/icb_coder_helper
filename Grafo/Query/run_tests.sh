#!/bin/bash
# Script para ejecutar los tests del servicio Query con datos REALES

set -e

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Tests para Grafo/Query (Datos Reales) ===${NC}\n"

# Crear y activar entorno virtual si no existe (necesario para Ubuntu 24.04+)
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creando entorno virtual...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✓ Entorno virtual creado${NC}\n"
fi

# Activar entorno virtual
source venv/bin/activate

# Verificar dependencias básicas primero
echo -e "${YELLOW}Verificando dependencias básicas...${NC}"
if ! python3 -c "import pymongo, dotenv" 2>/dev/null; then
    echo -e "${YELLOW}Instalando dependencias...${NC}"
    pip3 install -q pymongo python-dotenv
    echo -e "${GREEN}✓ Dependencias básicas instaladas${NC}\n"
fi

# Verificar conexión a MongoDB usando Python (funciona en todos los OS)
echo -e "${YELLOW}Verificando conexión a MongoDB...${NC}"
MONGO_CHECK=$(python3 -c "
import sys
try:
    from pymongo import MongoClient
    from dotenv import load_dotenv
    import os
    
    # Cargar .env si existe
    load_dotenv()
    
    # Obtener conexión string desde .env o usar default
    conn_str = os.getenv('MONGODB_CONNECTION_STRING', 'mongodb://localhost:27017/')
    
    # Intentar conectar con timeout corto
    client = MongoClient(conn_str, serverSelectionTimeoutMS=3000)
    client.server_info()  # Forzar conexión
    print('OK')
except Exception as e:
    print(f'ERROR: {str(e)}')
    sys.exit(1)
" 2>&1)

if [[ "$MONGO_CHECK" == *"ERROR"* ]]; then
    echo -e "${RED}Error: No se pudo conectar a MongoDB${NC}"
    echo -e "${RED}$MONGO_CHECK${NC}"
    echo ""
    echo "Verifica que:"
    echo "  1. MongoDB esté corriendo"
    echo "  2. Las credenciales en .env sean correctas"
    echo "  3. El puerto de MongoDB esté accesible"
    echo ""
    echo "Para iniciar MongoDB:"
    echo "  - Linux: sudo systemctl start mongod"
    echo "  - macOS: brew services start mongodb-community"
    echo "  - Windows: net start MongoDB (o inicia el servicio desde Servicios)"
    exit 1
elif [[ "$MONGO_CHECK" == "OK" ]]; then
    echo -e "${GREEN}✓ Conexión a MongoDB exitosa${NC}\n"
else
    echo -e "${YELLOW}⚠️  No se pudo verificar MongoDB, continuando de todos modos...${NC}\n"
fi

# Verificar dependencias de testing
echo -e "${YELLOW}Verificando dependencias de testing...${NC}"
if ! python3 -c "import pytest" 2>/dev/null; then
    echo -e "${YELLOW}Instalando dependencias de testing...${NC}"
    pip3 install -q -r requirements-test.txt
fi
echo -e "${GREEN}✓ Todas las dependencias instaladas${NC}\n"

# Verificar que existe el archivo .env
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Advertencia: No se encontró archivo .env${NC}"
    echo "Se usará la configuración por defecto de config.py"
    echo ""
fi

# Mostrar configuración (sin mostrar credenciales)
echo -e "${YELLOW}Configuración:${NC}"
if [ -f ".env" ]; then
    echo "  ✓ Usando configuración de .env"
else
    echo "  ℹ️  Usando configuración por defecto"
fi
echo ""

# Determinar qué tests ejecutar basado en argumentos
if [ "$1" == "quick" ]; then
    echo -e "${YELLOW}Ejecutando test rápido (solo workflow completo)...${NC}\n"
    python3 -m pytest tests/test_graph_service.py::TestGraphServiceChained::test_17_complete_workflow -v -s
elif [ "$1" == "chained" ]; then
    echo -e "${YELLOW}Ejecutando tests encadenados...${NC}\n"
    python3 -m pytest tests/test_graph_service.py::TestGraphServiceChained -v -s
elif [ "$1" == "individual" ]; then
    echo -e "${YELLOW}Ejecutando tests individuales...${NC}\n"
    python3 -m pytest tests/test_graph_service.py::TestGraphServiceIndividual -v -s
elif [ "$1" == "semantic" ]; then
    echo -e "${YELLOW}Ejecutando tests del Semantic Model...${NC}\n"
    python3 -m pytest tests/test_graph_service.py::TestSemanticModel -v -s
elif [ "$1" == "coverage" ]; then
    echo -e "${YELLOW}Ejecutando tests con reporte de cobertura...${NC}\n"
    python3 -m pytest tests/ --cov=src --cov-report=html --cov-report=term-missing -v
    echo -e "\n${GREEN}Reporte de cobertura generado en: htmlcov/index.html${NC}"
elif [ "$1" == "discover" ]; then
    echo -e "${YELLOW}Ejecutando solo el descubrimiento de datos...${NC}\n"
    python3 -m pytest tests/test_graph_service.py::TestGraphServiceChained::test_14_get_all_projects -v -s
else
    echo -e "${YELLOW}Ejecutando todos los tests...${NC}\n"
    python3 -m pytest tests/ -v -s
fi

# Verificar resultado
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}==================================${NC}"
    echo -e "${GREEN}✓ Todos los tests pasaron exitosamente${NC}"
    echo -e "${GREEN}==================================${NC}"
else
    echo -e "\n${RED}==================================${NC}"
    echo -e "${RED}✗ Algunos tests fallaron${NC}"
    echo -e "${RED}==================================${NC}"
    exit 1
fi
