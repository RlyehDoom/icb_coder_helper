#!/bin/bash

# build.sh - Build all Grafo components
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

log_step() {
    echo -e "${CYAN}[$1]${NC} $2"
}

print_header() {
    echo -e "${CYAN}🔧 Building Grafo Components${NC}"
    echo -e "${BLUE}─────────────────────────────${NC}"
    echo ""
}

# Build RoslynIndexer
build_indexer() {
    log_step "1/2" "Building RoslynIndexer"
    
    if [ ! -d "Indexer" ]; then
        log_error "Indexer directory not found"
        exit 1
    fi
    
    cd Indexer
    
    # Check if .NET is available
    if ! command -v dotnet &> /dev/null; then
        log_error ".NET SDK not found"
        exit 1
    fi
    
    # Build in Release configuration
    log_info "Compiling in Release mode..."
    dotnet build -c Release
    
    # Verify executable was created
    if [ -f "bin/Release/net8.0/RoslynIndexer.dll" ]; then
        log_success "RoslynIndexer executable created"
    else
        log_error "RoslynIndexer executable not found after build"
        exit 1
    fi
    
    cd ..
    log_success "RoslynIndexer build completed"
}

# Check CLI functionality
check_cli() {
    log_step "2/2" "Verifying CLI functionality"
    
    if [ ! -f "src/cli.js" ]; then
        log_error "CLI file not found at src/cli.js"
        exit 1
    fi
    
    # Check Node.js is available
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        exit 1
    fi
    
    # Test CLI version command
    if node src/cli.js --version > /dev/null; then
        log_success "CLI is working correctly"
    else
        log_error "CLI test failed"
        exit 1
    fi
}

# Main execution
main() {
    print_header
    
    build_indexer
    echo ""
    
    check_cli
    echo ""
    
    log_success "🎉 All components built successfully!"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  - Run './scripts/test.sh' to test the build"
    echo "  - Use 'node src/cli.js status' to check system status"
    echo "  - Try 'node src/cli.js interactive' for guided operations"
    echo ""
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Build interrupted by user${NC}"; exit 130' INT

# Check if we're in the correct directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    log_error "This script must be run from the Grafo directory"
    log_info "Usage: cd Grafo && ./scripts/build.sh"
    exit 1
fi

# Run main function
main
