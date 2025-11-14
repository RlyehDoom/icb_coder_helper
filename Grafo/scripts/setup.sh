#!/bin/bash

# setup.sh - Complete environment setup for Grafo CLI
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
print_banner() {
    echo -e "${CYAN}"
    echo "   ██████╗ ██████╗  █████╗ ███████╗ ██████╗ "
    echo "  ██╔════╝ ██╔══██╗██╔══██╗██╔════╝██╔═══██╗"
    echo "  ██║  ███╗██████╔╝███████║█████╗  ██║   ██║"
    echo "  ██║   ██║██╔══██╗██╔══██║██╔══╝  ██║   ██║"
    echo "  ╚██████╔╝██║  ██║██║  ██║██║     ╚██████╔╝"
    echo "   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝      ╚═════╝ "
    echo -e "${NC}"
    echo -e "${CYAN}                Setup Script${NC}"
    echo -e "${BLUE}  Complete Environment Setup for Grafo CLI${NC}"
    echo -e "${BLUE}  ─────────────────────────────────────────────${NC}"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[$1]${NC} $2"
}

# Check prerequisites
check_prerequisites() {
    log_step "1/5" "Checking prerequisites"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js >= 16.x"
        log_info "Download from: https://nodejs.org/"
        exit 1
    fi
    
    local node_version=$(node --version | sed 's/v//')
    log_info "Node.js version: $node_version"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    local npm_version=$(npm --version)
    log_info "npm version: $npm_version"
    
    # Check .NET
    if ! command -v dotnet &> /dev/null; then
        log_error ".NET SDK is not installed. Please install .NET 8.0 SDK"
        log_info "Download from: https://dotnet.microsoft.com/download/dotnet/8.0"
        exit 1
    fi
    
    local dotnet_version=$(dotnet --version)
    log_info ".NET version: $dotnet_version"
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install Git"
        log_info "Download from: https://git-scm.com/downloads"
        exit 1
    fi
    
    local git_version=$(git --version)
    log_info "$git_version"
    
    log_success "All prerequisites satisfied"
}

# Install Node.js dependencies
install_dependencies() {
    log_step "2/5" "Installing Node.js dependencies"
    
    if [ -f "package.json" ]; then
        npm install
        log_success "Node.js dependencies installed"
    else
        log_error "package.json not found"
        exit 1
    fi
}

# Build components
build_components() {
    log_step "3/5" "Building components"
    
    # Check CLI functionality
    log_info "Checking CLI functionality..."
    if [ -f "src/cli.js" ]; then
        node src/cli.js --version > /dev/null && log_info "✓ CLI working correctly"
    else
        log_error "CLI not found at src/cli.js"
        exit 1
    fi
    
    # Build RoslynIndexer
    log_info "Building RoslynIndexer..."
    if [ -d "Indexer" ]; then
        cd Indexer
        dotnet build -c Release
        cd ..
        log_success "RoslynIndexer built successfully"
    else
        log_error "Indexer directory not found"
        exit 1
    fi
}

# Setup test environment
setup_testing() {
    log_step "4/5" "Setting up test environment"
    
    # Use CLI to setup testing
    node src/cli.js test setup
    log_success "Test environment configured"
}

# Verify installation
verify_installation() {
    log_step "5/5" "Verifying installation"
    
    echo ""
    log_info "Running system status check..."
    node src/cli.js status
    
    log_success "Installation verification completed"
}

# Main execution
main() {
    print_banner
    
    log_info "Starting complete environment setup..."
    echo ""
    
    check_prerequisites
    echo ""
    
    install_dependencies
    echo ""
    
    build_components
    echo ""
    
    setup_testing
    echo ""
    
    verify_installation
    echo ""
    
    log_success "🎉 Grafo environment setup complete!"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  - Use 'node src/cli.js' or install globally with 'npm install -g .'"
    echo "  - Run 'node src/cli.js status' to verify setup"
    echo "  - Try 'node src/cli.js interactive' for guided operations"
    echo ""
    echo -e "${BLUE}Quick commands to try:${NC}"
    echo "  node src/cli.js indexer build    # Build RoslynIndexer"
    echo "  node src/cli.js repo list        # List repositories"
    echo "  node src/cli.js test run --quick # Quick test"
    echo ""
}

# Handle script interruption
trap 'log_warning "Setup interrupted by user"; exit 130' INT

# Check if we're in the correct directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    log_error "This script must be run from the Grafo directory"
    log_info "Usage: cd Grafo && ./scripts/setup.sh"
    exit 1
fi

# Run main function
main
