#!/usr/bin/env bash

# Build script for RoslynIndexer
# Cross-platform compatible script to replace Makefile

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
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

# Load environment variables from .env file if it exists
load_env_vars() {
    if [ -f ".env" ]; then
        set -o allexport
        source .env
        set +o allexport
        print_info "Variables de entorno cargadas desde .env"
    fi
}

# Discover repositories in Grafo/Repo/Cloned/ (only direct directories)
discover_repositories() {
    local repo_base_dir="../Repo/Cloned"
    
    if [ ! -d "$repo_base_dir" ]; then
        print_warning "Directorio de repositorios no encontrado: $repo_base_dir"
        return 1
    fi
    
    print_info "Buscando repositorios en $repo_base_dir..."
    
    local found_repos=false
    # Find only direct directories in Repo/
    for repo_dir in "$repo_base_dir"/*/; do
        if [ -d "$repo_dir" ]; then
            # Remove trailing slash
            repo_dir="${repo_dir%/}"
            local repo_name=$(basename "$repo_dir")
            print_info "  Encontrado: $repo_name"
            echo "$repo_dir"
            found_repos=true
        fi
    done
    
    if [ "$found_repos" = false ]; then
        print_warning "No se encontraron repositorios en $repo_base_dir"
        return 1
    fi
    
    return 0
}

# Find .sln files in a specific repository (root and first subdirectory level)
find_solutions_in_repo() {
    local repo_dir="$1"
    local repo_name=$(basename "$repo_dir")
    
    if [ ! -d "$repo_dir" ]; then
        print_error "Repositorio no encontrado: $repo_dir"
        return 1
    fi
    
    print_info "Buscando archivos .sln en $repo_name..."
    
    local found_solutions=false
    
    # Look for .sln files in the repository root directory
    for sln_file in "$repo_dir"/*.sln; do
        if [ -f "$sln_file" ]; then
            local sln_name=$(basename "$sln_file")
            print_info "  Encontrado: $sln_name"
            echo "$sln_file|$sln_name"
            found_solutions=true
        fi
    done
    
    # Look for .sln files in first-level subdirectories
    for subdir in "$repo_dir"/*/; do
        if [ -d "$subdir" ]; then
            local subdir_name=$(basename "${subdir%/}")
            for sln_file in "$subdir"/*.sln; do
                if [ -f "$sln_file" ]; then
                    local sln_name=$(basename "$sln_file")
                    print_info "  Encontrado: $subdir_name/$sln_name"
                    echo "$sln_file|$subdir_name/$sln_name"
                    found_solutions=true
                fi
            done
        fi
    done
    
    if [ "$found_solutions" = false ]; then
        print_warning "No se encontraron archivos .sln en $repo_name"
        return 1
    fi
    
    return 0
}

# Find .sln files in all repositories (for list-solutions command)
find_all_solution_files() {
    print_info "Buscando archivos .sln en repositorios..."
    
    # Read repositories from stdin
    while IFS= read -r repo_dir; do
        local repo_name=$(basename "$repo_dir")
        
        # Look for .sln files in the repository root directory
        for sln_file in "$repo_dir"/*.sln; do
            if [ -f "$sln_file" ]; then
                local sln_name=$(basename "$sln_file")
                local display_name="$repo_name: $sln_name"
                echo "$sln_file|$display_name"
            fi
        done
        
        # Look for .sln files in first-level subdirectories
        for subdir in "$repo_dir"/*/; do
            if [ -d "$subdir" ]; then
                local subdir_name=$(basename "${subdir%/}")
                for sln_file in "$subdir"/*.sln; do
                    if [ -f "$sln_file" ]; then
                        local sln_name=$(basename "$sln_file")
                        local display_name="$repo_name: $subdir_name/$sln_name"
                        echo "$sln_file|$display_name"
                    fi
                done
            fi
        done
    done
    
    return 0
}

# Interactive repository selection
select_repository_interactive() {
    local repositories=("$@")
    
    if [ ${#repositories[@]} -eq 0 ]; then
        print_error "No hay repositorios disponibles para seleccionar"
        return 1
    fi
    
    print_info "Repositorios disponibles:"
    echo ""
    
    local i=1
    local repo_names=()
    
    for repo_dir in "${repositories[@]}"; do
        local repo_name=$(basename "$repo_dir")
        repo_names+=("$repo_name")
        printf "  %2d) %s\n" "$i" "$repo_name"
        ((i++))
    done
    
    echo ""
    while true; do
        printf "Seleccione un repositorio (1-%d) o 'q' para salir: " "${#repositories[@]}"
        read -r choice
        
        if [ "$choice" = "q" ] || [ "$choice" = "Q" ]; then
            print_info "Selección cancelada"
            return 1
        fi
        
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#repositories[@]}" ]; then
            local selected_index=$((choice - 1))
            local selected_repo="${repositories[$selected_index]}"
            local selected_name="${repo_names[$selected_index]}"
            
            print_success "Seleccionado repositorio: $selected_name"
            echo "$selected_repo"
            return 0
        else
            print_warning "Selección inválida. Ingrese un número entre 1 y ${#repositories[@]}, o 'q' para salir."
        fi
    done
}

# Interactive solution selection
select_solution_interactive() {
    local solutions=("$@")
    
    if [ ${#solutions[@]} -eq 0 ]; then
        print_error "No hay soluciones disponibles para seleccionar"
        return 1
    fi
    
    print_info "Archivos .sln encontrados:"
    echo ""
    
    local i=1
    local display_options=()
    local solution_paths=()
    
    for solution in "${solutions[@]}"; do
        IFS='|' read -r path display <<< "$solution"
        display_options+=("$display")
        solution_paths+=("$path")
        printf "  %2d) %s\n" "$i" "$display"
        ((i++))
    done
    
    echo ""
    while true; do
        printf "Seleccione una solución (1-%d) o 'q' para salir: " "${#solutions[@]}"
        read -r choice
        
        if [ "$choice" = "q" ] || [ "$choice" = "Q" ]; then
            print_info "Selección cancelada"
            return 1
        fi
        
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#solutions[@]}" ]; then
            local selected_index=$((choice - 1))
            local selected_path="${solution_paths[$selected_index]}"
            local selected_display="${display_options[$selected_index]}"
            
            print_success "Seleccionado: $selected_display"
            echo "$selected_path"
            return 0
        else
            print_warning "Selección inválida. Ingrese un número entre 1 y ${#solutions[@]}, o 'q' para salir."
        fi
    done
}

# Auto-discover and select solution (two-step process)
auto_discover_solution() {
    print_info "Auto-descubriendo repositorios y soluciones..."
    
    # Step 1: Discover repositories
    local repositories=()
    while IFS= read -r repo; do
        if [ -n "$repo" ]; then
            repositories+=("$repo")
        fi
    done < <(discover_repositories)
    
    if [ ${#repositories[@]} -eq 0 ]; then
        print_warning "No se encontraron repositorios"
        return 1
    fi
    
    # Step 2: Select repository
    local selected_repo
    if [ ${#repositories[@]} -eq 1 ]; then
        selected_repo="${repositories[0]}"
        local repo_name=$(basename "$selected_repo")
        print_success "Único repositorio encontrado: $repo_name"
    else
        print_info "Múltiples repositorios encontrados"
        if ! selected_repo=$(select_repository_interactive "${repositories[@]}"); then
            return 1
        fi
    fi
    
    # Step 3: Find solutions in selected repository
    local solutions=()
    while IFS= read -r solution; do
        if [ -n "$solution" ]; then
            solutions+=("$solution")
        fi
    done < <(find_solutions_in_repo "$selected_repo")
    
    if [ ${#solutions[@]} -eq 0 ]; then
        print_warning "No se encontraron soluciones en el repositorio seleccionado"
        return 1
    fi
    
    # Step 4: Select solution
    if [ ${#solutions[@]} -eq 1 ]; then
        IFS='|' read -r path display <<< "${solutions[0]}"
        print_success "Única solución encontrada: $display"
        echo "$path"
        return 0
    else
        print_info "Múltiples soluciones encontradas"
        select_solution_interactive "${solutions[@]}"
    fi
}

# Variables (can be overridden by .env file)
init_variables() {
    load_env_vars
    
    PROJECT_NAME="${PROJECT_NAME:-RoslynIndexer}"
    DOCKER_IMAGE="${DOCKER_IMAGE_NAME:-roslyn-indexer}"
    VERSION="${VERSION:-1.0.0}"
    BUILD_CONFIG="${BUILD_CONFIG:-Release}"
    
    # Default analysis settings from .env
    DEFAULT_SOLUTION="${DEFAULT_SOLUTION_PATH:-}"
    DEFAULT_OUTPUT="${DEFAULT_OUTPUT_DIR:-./analysis-output}"
    DEFAULT_FORMAT="${DEFAULT_OUTPUT_FORMAT:-json}"
}

# Help function
show_help() {
    echo "RoslynIndexer - C# Code Analysis Tool"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Available commands:"
    echo "  help           - Show this help message"
    echo "  build          - Build the application"
    echo "  clean          - Clean build artifacts"
    echo "  run            - Run the application"
    echo "  test           - Run tests"
    echo "  docker-build   - Build Docker image"
    echo "  docker-run     - Run in Docker container"
    echo "  package        - Create release package"
    echo "  install        - Install to local tools"
    echo "  sample-config  - Generate sample configuration files"
    echo "  dev-setup      - Setup development environment"
    echo "  dev-clean      - Clean development artifacts"
    echo "  quick-test     - Run quick test with sample data"
    echo "  analyze        - Analyze a solution (auto-discover if no default set)"
    echo "  list-solutions - List available solutions in Grafo/Repo/Cloned/"
    echo "  all            - Build, test and package everything"
    echo "  ci-build       - CI build (clean, build, test)"
    echo "  ci-package     - CI package (ci-build + package + docker-build)"
    echo ""
    echo "Examples:"
    echo "  $0 build"
    echo "  $0 list-solutions             # Show available solutions"
    echo "  $0 analyze                    # Auto-discover or use .env defaults"  
    echo "  $0 run -s ../solution.sln -o output.json -v"
    echo "  $0 docker-run --volume-src /path/to/code --volume-out /path/to/output -- -s /input/solution.sln -o /output/result.json"
    echo ""
    echo "Environment Configuration:"
    echo "  Copy .env.example to .env and customize settings for analyze command"
    echo "  If no DEFAULT_SOLUTION_PATH is set, will auto-discover from Grafo/Repo/Cloned/"
    echo ""
    echo "Docker run options:"
    echo "  --volume-src   - Source code volume path"
    echo "  --volume-out   - Output volume path"
    echo "  --volume-config - Config volume path (optional)"
    echo "  --             - Separator for application arguments"
}

# Build function
build() {
    print_info "Building $PROJECT_NAME..."
    dotnet build -c "$BUILD_CONFIG"
    print_success "Build completed successfully"
}

# Clean function
clean() {
    print_info "Cleaning build artifacts..."
    dotnet clean
    rm -rf bin obj output
    print_success "Clean completed successfully"
}

# Run function
run() {
    print_info "Running $PROJECT_NAME..."
    build
    dotnet run --project . -- "$@"
}

# Test function
test() {
    print_info "Running tests..."
    if [ -d "tests" ]; then
        dotnet test tests/
        print_success "Tests completed successfully"
    else
        print_warning "No tests directory found. Tests will be implemented later."
    fi
}

# Docker build function
docker_build() {
    print_info "Building Docker image $DOCKER_IMAGE:$VERSION..."
    docker build -t "$DOCKER_IMAGE:$VERSION" -t "$DOCKER_IMAGE:latest" .
    print_success "Docker image built successfully"
}

# Docker run function
docker_run() {
    local volume_src=""
    local volume_out=""
    local volume_config=""
    local app_args=()
    local parsing_args=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --volume-src)
                volume_src="$2"
                shift 2
                ;;
            --volume-out)
                volume_out="$2"
                shift 2
                ;;
            --volume-config)
                volume_config="$2"
                shift 2
                ;;
            --)
                parsing_args=true
                shift
                ;;
            *)
                if [ "$parsing_args" = true ]; then
                    app_args+=("$1")
                else
                    print_error "Unknown option: $1"
                    echo "Use -- to separate application arguments"
                    return 1
                fi
                shift
                ;;
        esac
    done
    
    # Validate required arguments
    if [ -z "$volume_src" ] || [ -z "$volume_out" ]; then
        print_error "VOLUME_SRC and VOLUME_OUT must be specified"
        echo "Usage: $0 docker-run --volume-src /path/to/source --volume-out /path/to/output -- [app-args]"
        return 1
    fi
    
    print_info "Running $DOCKER_IMAGE in Docker..."
    
    # Build docker command
    local docker_cmd=(docker run --rm)
    docker_cmd+=(-v "$volume_src:/input")
    docker_cmd+=(-v "$volume_out:/output")
    
    if [ -n "$volume_config" ]; then
        docker_cmd+=(-v "$volume_config:/config")
    fi
    
    docker_cmd+=("$DOCKER_IMAGE:latest")
    docker_cmd+=("${app_args[@]}")
    
    "${docker_cmd[@]}"
    print_success "Docker run completed successfully"
}

# Package function
package() {
    print_info "Creating release package..."
    build
    
    dotnet publish -c "$BUILD_CONFIG" -o "release/$PROJECT_NAME-$VERSION"
    
    # Create archive based on available tools
    cd release
    if command -v tar >/dev/null 2>&1; then
        tar -czf "$PROJECT_NAME-$VERSION.tar.gz" "$PROJECT_NAME-$VERSION/"
        print_success "Package created: release/$PROJECT_NAME-$VERSION.tar.gz"
    elif command -v zip >/dev/null 2>&1; then
        zip -r "$PROJECT_NAME-$VERSION.zip" "$PROJECT_NAME-$VERSION/"
        print_success "Package created: release/$PROJECT_NAME-$VERSION.zip"
    else
        print_success "Package created in: release/$PROJECT_NAME-$VERSION/"
    fi
    cd ..
}

# Install function
install() {
    print_info "Installing $PROJECT_NAME as local tool..."
    package
    dotnet tool install --global --add-source ./release "$PROJECT_NAME"
    print_success "Installation completed successfully"
}

# Sample config function
sample_config() {
    print_info "Generating sample configuration files..."
    mkdir -p config-samples
    
    if [ -f "configs/batch-sample.yaml" ]; then
        cp configs/batch-sample.yaml config-samples/
    fi
    
    if [ -f "configs/batch-sample.json" ]; then
        cp configs/batch-sample.json config-samples/
    fi
    
    print_success "Sample configurations created in config-samples/"
}

# Development setup function
dev_setup() {
    print_info "Setting up development environment..."
    dotnet restore
    mkdir -p output logs temp
    print_success "Development environment setup completed"
}

# Development clean function
dev_clean() {
    print_info "Cleaning development artifacts..."
    clean
    rm -rf output logs temp config-samples release
    print_success "Development clean completed"
}

# Quick test function
quick_test() {
    print_info "Running quick test..."
    build
    
    if [ -f "../../../BackEnd/Guru.sln" ]; then
        dotnet run -- -s "../../../BackEnd/Guru.sln" -o "output/test-result.json" -g "output/test-graph.json" -v --stats-csv "output/test-stats.csv"
        print_success "Quick test completed successfully"
    else
        print_warning "No test solution found. Please specify a solution file:"
        echo "$0 run -s /path/to/solution.sln -o output/result.json -v"
    fi
}

# Analyze function using .env defaults
analyze() {
    print_info "Iniciando análisis de solución..."
    
    local solution_path=""
    
    # Check if there's a default solution configured
    if [ -n "$DEFAULT_SOLUTION" ] && [ -f "$DEFAULT_SOLUTION" ]; then
        solution_path="$DEFAULT_SOLUTION"
        print_info "Usando solución configurada: $solution_path"
    else
        # No default solution or doesn't exist, auto-discover
        if [ -z "$DEFAULT_SOLUTION" ]; then
            print_info "No hay DEFAULT_SOLUTION_PATH configurado, buscando automáticamente..."
        else
            print_warning "Solución configurada no encontrada: $DEFAULT_SOLUTION"
            print_info "Buscando automáticamente en repositorios..."
        fi
        
        if ! solution_path=$(auto_discover_solution); then
            print_error "No se pudo encontrar una solución para analizar"
            echo ""
            echo "Opciones disponibles:"
            echo "1. Configurar DEFAULT_SOLUTION_PATH en .env (cp .env.example .env)"
            echo "2. Clonar repositorios en ../Repo/Cloned/ usando 'grafo repo clone'"
            echo "3. Usar 'grafo indexer run -s path/to/solution.sln' para análisis directo"
            return 1
        fi
    fi
    
    # Verificar que la solución seleccionada existe
    if [ ! -f "$solution_path" ]; then
        print_error "Archivo de solución no encontrado: $solution_path"
        return 1
    fi
    
    # Asegurar que está compilado
    if ! build; then
        print_error "Error compilando el proyecto"
        return 1
    fi
    
    # Detectar nombre del repositorio desde la ruta de la solución
    local repo_name=""
    if [[ "$solution_path" == *"/Repo/"* ]] || [[ "$solution_path" == *"\\Repo\\"* ]]; then
        # Normalizar path separators (convertir \ a /)
        local normalized_path="${solution_path//\\//}"
        
        # Extraer el nombre del repositorio de la ruta (.../Repo/Cloned/RepoName/...)
        # Esta regex captura el primer directorio después de /Repo/Cloned/
        if [[ "$normalized_path" =~ Repo/Cloned/([^/]+) ]]; then
            repo_name="${BASH_REMATCH[1]}"
            
            # Validar que no capturamos "Cloned" como nombre de repo (no debería pasar con la regex correcta)
            if [[ "$repo_name" == "Cloned" ]]; then
                repo_name=""
            fi
        fi
    fi
    
    # Construir directorio de salida basado en configuración
    local base_output_dir="$DEFAULT_OUTPUT"
    if [ "${USE_REPO_NAME_IN_OUTPUT:-true}" = "true" ] && [ -n "$repo_name" ]; then
        base_output_dir="./${repo_name}_GraphFiles"
        print_info "Usando directorio de salida específico del repositorio: $base_output_dir"
    fi
    
    # Preparar directorio de salida
    mkdir -p "$base_output_dir"
    
    # Construir nombre base del archivo de salida
    local solution_name=$(basename "$solution_path" .sln)
    local timestamp=""
    
    if [ "${INCLUDE_TIMESTAMP:-false}" = "true" ]; then
        timestamp="-$(date +%Y%m%d-%H%M%S)"
    fi
    
    local output_prefix="${OUTPUT_FILE_PREFIX:-$solution_name}"
    
    # Determinar directorio final de salida
    local final_output_dir="$base_output_dir"
    if [ "${CREATE_SOLUTION_SUBDIR:-true}" = "true" ]; then
        final_output_dir="$base_output_dir/$solution_name"
        mkdir -p "$final_output_dir"
    fi
    
    print_info "Analizando: $solution_path"
    print_info "Directorio de salida: $final_output_dir"
    
    # Construir argumentos para dotnet run
    local args=()
    args+=("--")
    args+=("-s" "$solution_path")
    args+=("-o" "$final_output_dir/${output_prefix}${timestamp}-symbols.$DEFAULT_FORMAT")
    
    # Opciones basadas en .env
    if [ "${GENERATE_GRAPHS:-true}" = "true" ]; then
        args+=("-g" "$final_output_dir/${output_prefix}${timestamp}-graph.$DEFAULT_FORMAT")
    fi
    
    if [ "${GENERATE_STATISTICS:-true}" = "true" ]; then
        args+=("--stats-csv" "$final_output_dir/${output_prefix}${timestamp}-stats.csv")
    fi
    
    if [ "${VERBOSE_MODE:-false}" = "true" ]; then
        args+=("-v")
    fi
    
    if [ "${SHOW_PROGRESS:-true}" = "true" ]; then
        args+=("--progress")
    fi
    
    if [ -n "${FILTER_SYMBOL_TYPES:-}" ]; then
        args+=("--filter-types" "$FILTER_SYMBOL_TYPES")
    fi
    
    if [ -n "${EXCLUDE_PROJECTS_REGEX:-}" ]; then
        args+=("--exclude-projects" "$EXCLUDE_PROJECTS_REGEX")
    fi
    
    if [ -n "${INCLUDE_PROJECTS_REGEX:-}" ]; then
        args+=("--include-only" "$INCLUDE_PROJECTS_REGEX")
    fi
    
    args+=("--output-format" "$DEFAULT_FORMAT")
    
    # Ejecutar análisis
    print_info "Ejecutando análisis con argumentos: ${args[*]}"
    
    if dotnet run --project . "${args[@]}"; then
        print_success "Análisis completado exitosamente"
        print_info "Resultados guardados en: $final_output_dir"
        
        # Mostrar archivos generados
        if [ -d "$final_output_dir" ]; then
            print_info "Archivos generados:"
            find "$final_output_dir" -name "${output_prefix}${timestamp}*" -type f | while read -r file; do
                local size=$(ls -lh "$file" | awk '{print $5}')
                echo "  📄 $(basename "$file") ($size)"
            done
        fi
        
        return 0
    else
        print_error "Error durante el análisis"
        return 1
    fi
}

# List available solutions
list_solutions() {
    print_info "Buscando soluciones disponibles..."
    
    # Check if there's a configured default solution
    if [ -n "$DEFAULT_SOLUTION" ]; then
        if [ -f "$DEFAULT_SOLUTION" ]; then
            print_success "Solución configurada por defecto: $DEFAULT_SOLUTION"
        else
            print_warning "Solución configurada no encontrada: $DEFAULT_SOLUTION"
        fi
        echo ""
    fi
    
    # Discover repositories and find all solutions
    local solutions=()
    
    while IFS= read -r solution; do
        if [ -n "$solution" ]; then
            solutions+=("$solution")
        fi
    done < <(discover_repositories | find_all_solution_files)
    
    if [ ${#solutions[@]} -eq 0 ]; then
        print_warning "No se encontraron repositorios o archivos .sln"
        return 1
    fi
    
    print_info "Soluciones disponibles en repositorios:"
    echo ""
    
    local i=1
    for solution in "${solutions[@]}"; do
        IFS='|' read -r path display <<< "$solution"
        
        # Check if file exists and get size
        if [ -f "$path" ]; then
            local size=$(ls -lh "$path" 2>/dev/null | awk '{print $5}')
            local status="✓"
        else
            local size="N/A"
            local status="✗"  
        fi
        
        printf "  %2d) %s %-50s [%s]\n" "$i" "$status" "$display" "$size"
        ((i++))
    done
    
    echo ""
    print_info "Total: $((i-1)) soluciones encontradas"
    echo ""
    echo "Para analizar una solución específica:"
    echo "  $0 analyze                    # Selección interactiva"
    echo "  $0 run -s <path>              # Análisis directo"
    
    return 0
}

# All function
all() {
    print_info "Running complete build process..."
    clean
    build
    test
    package
    print_success "Build complete!"
}

# CI build function
ci_build() {
    print_info "Running CI build..."
    clean
    build
    test
    print_success "CI build completed successfully"
}

# CI package function
ci_package() {
    print_info "Running CI package..."
    ci_build
    package
    docker_build
    print_success "CI package completed successfully"
}

# Main script logic
main() {
    # Initialize variables and load .env if exists
    init_variables
    
    # Handle no arguments
    if [ $# -eq 0 ]; then
        show_help
        return 0
    fi
    
    # Parse command
    local command="$1"
    shift
    
    case "$command" in
        help|-h|--help)
            show_help
            ;;
        build)
            build
            ;;
        clean)
            clean
            ;;
        run)
            run "$@"
            ;;
        test)
            test
            ;;
        docker-build)
            docker_build
            ;;
        docker-run)
            docker_run "$@"
            ;;
        package)
            package
            ;;
        install)
            install
            ;;
        sample-config)
            sample_config
            ;;
        dev-setup)
            dev_setup
            ;;
        dev-clean)
            dev_clean
            ;;
        quick-test)
            quick_test
            ;;
        analyze)
            analyze
            ;;
        list-solutions)
            list_solutions
            ;;
        all)
            all
            ;;
        ci-build)
            ci_build
            ;;
        ci-package)
            ci_package
            ;;
        *)
            print_error "Unknown command: $command"
            echo ""
            show_help
            return 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
