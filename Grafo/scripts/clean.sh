#!/bin/bash

# clean.sh - Clean all build artifacts and temporary files
# Cross-platform script for Windows (Git Bash/WSL), Linux, and macOS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[$1]${NC} $2"
}

print_header() {
    echo -e "${CYAN}🧹 Cleaning Grafo Project${NC}"
    echo -e "${BLUE}─────────────────────────${NC}"
    echo ""
}

# Parse command line arguments
DEEP_CLEAN=false
KEEP_REPOS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --deep)
            DEEP_CLEAN=true
            shift
            ;;
        --keep-repos)
            KEEP_REPOS=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --deep         Deep clean (includes node_modules)"
            echo "  --keep-repos   Keep cloned repositories"
            echo "  --help, -h     Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                # Standard clean"
            echo "  $0 --deep        # Deep clean including node_modules"
            echo "  $0 --keep-repos  # Clean but keep repositories"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Clean RoslynIndexer artifacts
clean_indexer() {
    log_step "1/4" "Cleaning RoslynIndexer artifacts"
    
    if [ -d "Indexer" ]; then
        cd Indexer
        
        # Clean .NET build artifacts
        if command -v dotnet &> /dev/null; then
            log_info "Running dotnet clean..."
            dotnet clean > /dev/null 2>&1 || true
        fi
        
        # Remove build directories
        local dirs_to_clean=("bin" "obj" "test-results" "output" "logs" "temp")
        for dir in "${dirs_to_clean[@]}"; do
            if [ -d "$dir" ]; then
                rm -rf "$dir"
                log_info "Removed Indexer/$dir/"
            fi
        done
        
        cd ..
        log_success "RoslynIndexer artifacts cleaned"
    else
        log_warning "Indexer directory not found"
    fi
}

# Clean test results and temporary files
clean_test_artifacts() {
    log_step "2/4" "Cleaning test artifacts"
    
    local dirs_to_clean=("test-results" "analysis-output" "output" "temp")
    local cleaned_count=0
    
    for dir in "${dirs_to_clean[@]}"; do
        if [ -d "$dir" ]; then
            rm -rf "$dir"
            log_info "Removed $dir/"
            ((cleaned_count++))
        fi
    done
    
    # Clean temporary files
    local temp_patterns=("*.tmp" "*.log" "*.cache" "npm-debug.log*" "yarn-debug.log*" "yarn-error.log*")
    for pattern in "${temp_patterns[@]}"; do
        if ls $pattern 1> /dev/null 2>&1; then
            rm -f $pattern
            log_info "Removed $pattern files"
            ((cleaned_count++))
        fi
    done
    
    if [ $cleaned_count -gt 0 ]; then
        log_success "Test artifacts cleaned ($cleaned_count items)"
    else
        log_info "No test artifacts to clean"
    fi
}

# Clean Node.js artifacts
clean_node_artifacts() {
    log_step "3/4" "Cleaning Node.js artifacts"
    
    if [ "$DEEP_CLEAN" = true ]; then
        if [ -d "node_modules" ]; then
            log_info "Deep clean: Removing node_modules..."
            rm -rf node_modules
            log_info "Removed node_modules/"
        fi
        
        if [ -f "package-lock.json" ]; then
            log_info "Deep clean: Removing package-lock.json..."
            rm -f package-lock.json
            log_info "Removed package-lock.json"
        fi
        
        log_success "Node.js artifacts deep cleaned"
    else
        # Just clean npm cache and temporary files
        if [ -d ".npm" ]; then
            rm -rf .npm
            log_info "Removed .npm cache"
        fi
        
        log_info "Standard Node.js clean completed"
    fi
}

# Clean repository artifacts
clean_repository_artifacts() {
    log_step "4/4" "Cleaning repository artifacts"
    
    if [ "$KEEP_REPOS" = true ]; then
        log_info "Keeping repositories as requested"
        
        # Only clean temporary files in repositories
        if [ -d "Repo" ]; then
            find Repo -name "bin" -type d -exec rm -rf {} + 2>/dev/null || true
            find Repo -name "obj" -type d -exec rm -rf {} + 2>/dev/null || true
            find Repo -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
            find Repo -name "*.tmp" -type f -delete 2>/dev/null || true
            find Repo -name "*.log" -type f -delete 2>/dev/null || true
            log_info "Cleaned temporary files in repositories"
        fi
    else
        # Option to clean all repositories (dangerous!)
        echo ""
        log_warning "This will remove ALL cloned repositories!"
        read -p "Are you sure you want to delete all repositories? (y/N): " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if [ -d "Repo" ]; then
                rm -rf Repo
                log_info "Removed Repo/ directory"
            fi
            log_success "Repository artifacts cleaned"
        else
            log_info "Repository cleaning cancelled"
        fi
    fi
}

# Calculate space saved
calculate_space_saved() {
    echo ""
    log_info "📊 Cleanup Summary"
    echo -e "${BLUE}──────────────────${NC}"
    
    # Show current disk usage of project
    if command -v du &> /dev/null; then
        local project_size=$(du -sh . 2>/dev/null | cut -f1 || echo "Unknown")
        log_info "Current project size: $project_size"
    fi
    
    echo ""
    if [ "$DEEP_CLEAN" = true ]; then
        log_success "🎉 Deep cleanup completed!"
        echo -e "${YELLOW}Note:${NC} You'll need to run './scripts/setup.sh' to reinstall dependencies"
    else
        log_success "🎉 Standard cleanup completed!"
    fi
    
    echo ""
    echo -e "${BLUE}Cleaned components:${NC}"
    echo "  ✓ RoslynIndexer build artifacts"
    echo "  ✓ Test results and temporary files"
    if [ "$DEEP_CLEAN" = true ]; then
        echo "  ✓ Node.js dependencies (deep clean)"
    else
        echo "  ✓ Node.js cache files"
    fi
    if [ "$KEEP_REPOS" = false ]; then
        echo "  ✓ Repository artifacts"
    else
        echo "  ✓ Repository temporary files (kept repos)"
    fi
    
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    if [ "$DEEP_CLEAN" = true ]; then
        echo "  - Run './scripts/setup.sh' to reinstall and rebuild"
    else
        echo "  - Project is ready to use"
        echo "  - Run './scripts/build.sh' if you need to rebuild"
    fi
    echo "  - Use 'node src/cli.js status' to check system status"
    echo ""
}

# Main execution
main() {
    print_header
    
    log_info "Starting cleanup process..."
    if [ "$DEEP_CLEAN" = true ]; then
        log_warning "Deep clean mode enabled"
    fi
    if [ "$KEEP_REPOS" = true ]; then
        log_info "Repositories will be preserved"
    fi
    
    echo ""
    
    clean_indexer
    echo ""
    
    clean_test_artifacts
    echo ""
    
    clean_node_artifacts
    echo ""
    
    clean_repository_artifacts
    
    calculate_space_saved
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Cleanup interrupted by user${NC}"; exit 130' INT

# Check if we're in the correct directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    log_error "This script must be run from the Grafo directory"
    log_info "Usage: cd Grafo && ./scripts/clean.sh [OPTIONS]"
    exit 1
fi

# Run main function
main
