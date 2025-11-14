#!/bin/bash

# makefile.sh - Script de gestión del Grafo Query Service
# Compatible con Linux, macOS y Windows (Git Bash/WSL)

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detectar Python (python3 en Linux/Mac, python en Windows)
PYTHON_CMD=""

function detect_python() {
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        echo -e "${RED}❌ Python no está instalado${NC}"
        echo "   Instalar Python 3.11+ desde https://www.python.org/"
        exit 1
    fi
}

# Detectar sistema operativo
OS_TYPE="unknown"
function detect_os() {
    case "$(uname -s)" in
        Linux*)     OS_TYPE="linux";;
        Darwin*)    OS_TYPE="mac";;
        CYGWIN*)    OS_TYPE="windows";;
        MINGW*)     OS_TYPE="windows";;
        MSYS*)      OS_TYPE="windows";;
        *)          OS_TYPE="unknown";;
    esac
}

# Activar entorno virtual según el OS
function activate_venv() {
    if [ -d "venv" ]; then
        if [ "$OS_TYPE" = "windows" ]; then
            # Windows: venv/Scripts/activate
            if [ -f "venv/Scripts/activate" ]; then
                source venv/Scripts/activate
            fi
        else
            # Linux/Mac: venv/bin/activate
            if [ -f "venv/bin/activate" ]; then
                source venv/bin/activate
            fi
        fi
    fi
}

function print_help() {
    # Determinar host según el sistema operativo
    if [ "$OS_TYPE" = "windows" ]; then
        HOST_INFO="localhost (Windows)"
    else
        HOST_INFO="0.0.0.0 (Linux/Mac)"
    fi
    
    echo ""
    echo "Grafo Query Service - Comandos disponibles:"
    echo ""
    echo -e "${GREEN}Desarrollo:${NC}"
    echo "  ./makefile.sh install        - Instalar dependencias"
    echo "  ./makefile.sh run            - Ejecutar servidor en producción"
    echo "  ./makefile.sh dev            - Ejecutar servidor en modo desarrollo"
    echo ""
    echo -e "${GREEN}Docker:${NC}"
    echo "  ./makefile.sh docker-build   - Construir imagen Docker"
    echo "  ./makefile.sh docker-run     - Ejecutar con Docker Compose"
    echo "  ./makefile.sh docker-stop    - Detener contenedores Docker"
    echo "  ./makefile.sh docker-logs    - Ver logs de contenedores"
    echo ""
    echo -e "${GREEN}Utilidad:${NC}"
    echo "  ./makefile.sh clean          - Limpiar archivos temporales"
    echo "  ./makefile.sh test           - Ejecutar pruebas"
    echo "  ./makefile.sh lint           - Verificar código con linters"
    echo "  ./makefile.sh help           - Mostrar esta ayuda"
    echo ""
    echo -e "${BLUE}Sistema: $OS_TYPE | Python: $PYTHON_CMD | Host: $HOST_INFO${NC}"
    echo ""
}

function install() {
    echo -e "${BLUE}📦 Instalando dependencias...${NC}"
    
    # Detectar Python
    detect_python
    echo -e "${GREEN}✅ Python encontrado: $PYTHON_CMD${NC}"
    
    # Verificar versión de Python
    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}')
    echo -e "${BLUE}   Versión: $PYTHON_VERSION${NC}"
    
    # Crear venv si no existe
    if [ ! -d "venv" ]; then
        echo -e "${YELLOW}🔧 Creando entorno virtual...${NC}"
        $PYTHON_CMD -m venv venv
    fi
    
    # Activar venv e instalar
    activate_venv
    
    # Actualizar pip
    echo -e "${YELLOW}📥 Actualizando pip...${NC}"
    $PYTHON_CMD -m pip install --upgrade pip --quiet
    
    # Instalar dependencias
    echo -e "${YELLOW}📥 Instalando dependencias...${NC}"
    pip install -r requirements.txt
    
    echo -e "${GREEN}✅ Dependencias instaladas${NC}"
}

function run() {
    echo -e "${BLUE}🚀 Iniciando servidor...${NC}"
    
    # Detectar Python
    detect_python
    
    # Verificar .env
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}⚠️  Archivo .env no encontrado, creando desde .env.example...${NC}"
        cp .env.example .env
    fi
    
    # Activar venv si existe
    activate_venv
    
    # Determinar host según el sistema operativo
    if [ "$OS_TYPE" = "windows" ]; then
        HOST="localhost"
    else
        HOST="0.0.0.0"
    fi
    
    echo -e "${GREEN}✅ Iniciando en http://$HOST:8081${NC}"
    $PYTHON_CMD -m uvicorn src.server:app --host $HOST --port 8081
}

function dev() {
    echo -e "${BLUE}🔧 Iniciando servidor en modo desarrollo...${NC}"
    
    # Detectar Python
    detect_python
    
    # Verificar .env
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}⚠️  Archivo .env no encontrado, creando desde .env.example...${NC}"
        cp .env.example .env
    fi
    
    # Activar venv si existe
    activate_venv
    
    # Determinar host según el sistema operativo
    if [ "$OS_TYPE" = "windows" ]; then
        HOST="localhost"
    else
        HOST="0.0.0.0"
    fi
    
    echo -e "${GREEN}✅ Servidor iniciado en http://localhost:8081${NC}"
    echo -e "${BLUE}📚 Documentación: http://localhost:8081/docs${NC}"
    echo -e "${BLUE}🔍 Host configurado: $HOST (Sistema: $OS_TYPE)${NC}"
    echo -e "${YELLOW}💡 Presiona Ctrl+C para detener${NC}"
    echo ""
    
    $PYTHON_CMD -m uvicorn src.server:app --host $HOST --port 8081 --reload
}

function docker_build() {
    echo -e "${BLUE}🐳 Construyendo imagen Docker...${NC}"
    docker build -t grafo-query-service:latest .
    echo -e "${GREEN}✅ Imagen construida: grafo-query-service:latest${NC}"
}

function docker_run() {
    echo -e "${BLUE}🐳 Ejecutando con Docker Compose...${NC}"
    docker-compose up -d
    echo -e "${GREEN}✅ Servicio ejecutándose en http://localhost:8081${NC}"
    echo -e "${YELLOW}💡 Ver logs: ./makefile.sh docker-logs${NC}"
}

function docker_stop() {
    echo -e "${BLUE}🛑 Deteniendo contenedores...${NC}"
    docker-compose down
    echo -e "${GREEN}✅ Contenedores detenidos${NC}"
}

function docker_logs() {
    echo -e "${BLUE}📋 Mostrando logs...${NC}"
    docker-compose logs -f
}

function clean() {
    echo -e "${BLUE}🧹 Limpiando archivos temporales...${NC}"
    
    # Python cache
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type f -name "*.pyc" -delete 2>/dev/null || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
    
    # Build artifacts
    rm -rf build/ dist/ 2>/dev/null || true
    
    echo -e "${GREEN}✅ Limpieza completada${NC}"
}

function test() {
    echo -e "${BLUE}🧪 Ejecutando pruebas...${NC}"
    
    # Detectar Python
    detect_python
    
    # Activar venv si existe
    activate_venv
    
    # Verificar si pytest está instalado
    if command -v pytest &> /dev/null; then
        pytest tests/ -v
    else
        echo -e "${YELLOW}⚠️  pytest no está instalado${NC}"
        echo -e "${YELLOW}    Instalar con: pip install pytest${NC}"
        exit 1
    fi
}

function lint() {
    echo -e "${BLUE}🔍 Verificando código...${NC}"
    
    # Detectar Python
    detect_python
    
    # Activar venv si existe
    activate_venv
    
    local has_linter=false
    
    # Verificar con flake8 si está disponible
    if command -v flake8 &> /dev/null; then
        echo -e "${YELLOW}Ejecutando flake8...${NC}"
        flake8 src/ --max-line-length=120 || true
        has_linter=true
    fi
    
    # Verificar con black si está disponible
    if command -v black &> /dev/null; then
        echo -e "${YELLOW}Ejecutando black (check only)...${NC}"
        black --check src/ || true
        has_linter=true
    fi
    
    # Verificar con mypy si está disponible
    if command -v mypy &> /dev/null; then
        echo -e "${YELLOW}Ejecutando mypy...${NC}"
        mypy src/ --ignore-missing-imports || true
        has_linter=true
    fi
    
    if [ "$has_linter" = false ]; then
        echo -e "${YELLOW}⚠️  No se encontraron linters instalados${NC}"
        echo -e "${YELLOW}    Instalar con: pip install flake8 black mypy${NC}"
    else
        echo -e "${GREEN}✅ Verificación completada${NC}"
    fi
}

# Detectar sistema operativo al inicio
detect_os

# Main script
case "${1:-help}" in
    help)
        detect_python
        print_help
        ;;
    install)
        install
        ;;
    run)
        run
        ;;
    dev)
        dev
        ;;
    docker-build)
        docker_build
        ;;
    docker-run)
        docker_run
        ;;
    docker-stop)
        docker_stop
        ;;
    docker-logs)
        docker_logs
        ;;
    clean)
        clean
        ;;
    test)
        test
        ;;
    lint)
        lint
        ;;
    *)
        echo -e "${RED}❌ Comando desconocido: $1${NC}"
        detect_python
        print_help
        exit 1
        ;;
esac

