#!/bin/bash

# Script de gestión Docker para Grafo MCP Server
# Compatible con Linux, macOS y Windows (Git Bash/WSL)

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

COMPOSE_FILE="docker-compose.mcp.yml"
DOCKERFILE="Dockerfile.mcp"
IMAGE_NAME="grafo-mcp-server"
CONTAINER_NAME="grafo-mcp-server"

# Funciones de ayuda
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_usage() {
    echo "Uso: $0 {build|start|stop|restart|logs|status|exec|clean|help}"
    echo ""
    echo "Comandos:"
    echo "  build       - Construye la imagen Docker del MCP Server"
    echo "  start       - Inicia el contenedor MCP Server"
    echo "  stop        - Detiene el contenedor MCP Server"
    echo "  restart     - Reinicia el contenedor MCP Server"
    echo "  logs        - Muestra logs del contenedor"
    echo "  status      - Muestra estado del contenedor"
    echo "  exec        - Ejecuta un comando dentro del contenedor"
    echo "  shell       - Abre un shell dentro del contenedor"
    echo "  test        - Ejecuta test_mcp.py dentro del contenedor"
    echo "  clean       - Limpia contenedores e imágenes"
    echo "  help        - Muestra esta ayuda"
}

# Verificar Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker no está instalado"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        print_error "Docker daemon no está corriendo"
        exit 1
    fi
}

# Build
do_build() {
    print_info "Construyendo imagen Docker..."
    docker build -f "$DOCKERFILE" -t "$IMAGE_NAME:latest" .
    print_success "Imagen construida: $IMAGE_NAME:latest"
}

# Start
do_start() {
    print_info "Iniciando MCP Server..."

    # Detener contenedor existente si está corriendo
    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        print_warning "Contenedor ya está corriendo, deteniéndolo primero..."
        do_stop
    fi

    # Remover contenedor detenido si existe
    if docker ps -aq -f name="$CONTAINER_NAME" | grep -q .; then
        print_info "Removiendo contenedor anterior..."
        docker rm "$CONTAINER_NAME" > /dev/null 2>&1
    fi

    # Iniciar con docker-compose
    docker-compose -f "$COMPOSE_FILE" up -d

    print_success "MCP Server iniciado"
    echo ""
    print_info "Usar desde Cursor/VSCode con esta configuración:"
    echo ""
    echo '  "mcpServers": {'
    echo '    "grafo-query": {'
    echo '      "command": "docker",'
    echo '      "args": ["exec", "-i", "grafo-mcp-server", "python", "start_mcp.py"]'
    echo '    }'
    echo '  }'
    echo ""
    print_info "Ver logs: $0 logs"
    print_info "Ver estado: $0 status"
}

# Stop
do_stop() {
    print_info "Deteniendo MCP Server..."
    docker-compose -f "$COMPOSE_FILE" stop
    print_success "MCP Server detenido"
}

# Restart
do_restart() {
    print_info "Reiniciando MCP Server..."
    do_stop
    sleep 2
    do_start
}

# Logs
do_logs() {
    print_info "Mostrando logs (Ctrl+C para salir)..."
    docker-compose -f "$COMPOSE_FILE" logs -f --tail=100
}

# Status
do_status() {
    print_info "Estado del MCP Server:"
    echo ""

    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        print_success "Contenedor está CORRIENDO"
        echo ""
        docker ps -f name="$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
        echo ""

        # Health check
        HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "no health check")
        if [ "$HEALTH" != "no health check" ]; then
            if [ "$HEALTH" = "healthy" ]; then
                print_success "Health: $HEALTH"
            else
                print_warning "Health: $HEALTH"
            fi
        fi
    else
        print_warning "Contenedor NO está corriendo"

        # Verificar si existe pero está detenido
        if docker ps -aq -f name="$CONTAINER_NAME" | grep -q .; then
            print_info "Contenedor existe pero está detenido"
            docker ps -a -f name="$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
        fi
    fi
}

# Exec
do_exec() {
    if [ -z "$1" ]; then
        print_error "Especifica un comando a ejecutar"
        echo "Ejemplo: $0 exec python test_mcp.py"
        exit 1
    fi

    print_info "Ejecutando: $@"
    docker exec -it "$CONTAINER_NAME" "$@"
}

# Shell
do_shell() {
    print_info "Abriendo shell en el contenedor..."
    docker exec -it "$CONTAINER_NAME" /bin/bash
}

# Test
do_test() {
    print_info "Ejecutando test_mcp.py..."
    docker exec -it "$CONTAINER_NAME" python test_mcp.py
}

# Clean
do_clean() {
    print_warning "Esta operación eliminará:"
    echo "  - Contenedor: $CONTAINER_NAME"
    echo "  - Imagen: $IMAGE_NAME"
    echo ""
    read -p "¿Continuar? (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Detener y remover contenedor
        print_info "Removiendo contenedor..."
        docker-compose -f "$COMPOSE_FILE" down 2>/dev/null || true
        docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

        # Remover imagen
        print_info "Removiendo imagen..."
        docker rmi "$IMAGE_NAME:latest" 2>/dev/null || true

        print_success "Limpieza completada"
    else
        print_info "Operación cancelada"
    fi
}

# Main
main() {
    check_docker

    case "${1:-help}" in
        build)
            do_build
            ;;
        start)
            do_start
            ;;
        stop)
            do_stop
            ;;
        restart)
            do_restart
            ;;
        logs)
            do_logs
            ;;
        status)
            do_status
            ;;
        exec)
            shift
            do_exec "$@"
            ;;
        shell)
            do_shell
            ;;
        test)
            do_test
            ;;
        clean)
            do_clean
            ;;
        help|--help|-h)
            print_usage
            ;;
        *)
            print_error "Comando desconocido: $1"
            echo ""
            print_usage
            exit 1
            ;;
    esac
}

main "$@"
