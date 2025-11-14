#!/bin/bash

# install.sh - Install Grafo CLI globally
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
    echo -e "${CYAN}🌍 Installing Grafo CLI Globally${NC}"
    echo -e "${BLUE}─────────────────────────────────${NC}"
    echo ""
}

# Parse command line arguments
UNINSTALL=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --uninstall|-u)
            UNINSTALL=true
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --uninstall, -u   Uninstall global CLI"
            echo "  --force, -f       Force installation"
            echo "  --help, -h        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                # Install globally"
            echo "  $0 --uninstall    # Uninstall global CLI"
            echo "  $0 --force        # Force reinstall"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if already installed globally
check_global_installation() {
    if command -v grafo &> /dev/null; then
        local installed_version=$(grafo --version 2>/dev/null || echo "unknown")
        local current_version=$(node src/cli.js --version 2>/dev/null || echo "unknown")
        
        log_info "Global installation detected:"
        log_info "  Installed version: $installed_version"
        log_info "  Current version: $current_version"
        
        if [ "$FORCE" = false ] && [ "$UNINSTALL" = false ]; then
            echo ""
            read -p "Grafo CLI is already installed globally. Reinstall? (y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Installation cancelled"
                exit 0
            fi
        fi
        
        return 0
    else
        return 1
    fi
}

# Uninstall global CLI
uninstall_global() {
    log_step "1/1" "Uninstalling global Grafo CLI"
    
    if command -v grafo &> /dev/null; then
        log_info "Removing global installation..."
        
        # Try to uninstall using npm
        if npm uninstall -g grafo-cli; then
            log_success "Global Grafo CLI uninstalled successfully"
        else
            log_warning "npm uninstall failed, trying alternative method..."
            
            # Alternative: find npm global directory and remove manually
            local npm_global=$(npm config get prefix 2>/dev/null || echo "")
            if [ -n "$npm_global" ]; then
                local bin_path="$npm_global/bin/grafo"
                local lib_path="$npm_global/lib/node_modules/grafo-cli"
                
                if [ -f "$bin_path" ]; then
                    rm -f "$bin_path"
                    log_info "Removed $bin_path"
                fi
                
                if [ -d "$lib_path" ]; then
                    rm -rf "$lib_path"
                    log_info "Removed $lib_path"
                fi
                
                log_success "Manual uninstall completed"
            else
                log_error "Could not determine npm global directory"
                return 1
            fi
        fi
    else
        log_info "Grafo CLI is not installed globally"
    fi
    
    # Verify uninstallation
    if ! command -v grafo &> /dev/null; then
        log_success "✅ Grafo CLI successfully uninstalled"
    else
        log_error "❌ Uninstallation may have failed - 'grafo' command still available"
        return 1
    fi
}

# Install global CLI
install_global() {
    log_step "1/3" "Preparing for global installation"
    
    # Check prerequisites
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check if project is built
    if [ ! -f "src/cli.js" ]; then
        log_error "CLI source not found. Make sure you're in the Grafo directory"
        exit 1
    fi
    
    # Verify CLI works locally first
    if ! node src/cli.js --version &> /dev/null; then
        log_error "CLI is not working locally. Run './scripts/setup.sh' first"
        exit 1
    fi
    
    log_success "Prerequisites verified"
    
    log_step "2/3" "Installing globally with npm"
    
    # Install globally
    log_info "Running npm install -g ..."
    if npm install -g .; then
        log_success "npm global installation completed"
    else
        log_error "npm global installation failed"
        return 1
    fi
    
    log_step "3/3" "Verifying global installation"
    
    # Verify installation
    if command -v grafo &> /dev/null; then
        local version=$(grafo --version 2>/dev/null || echo "unknown")
        log_success "Global 'grafo' command available"
        log_info "Version: $version"
        
        # Test a few commands
        log_info "Testing global commands..."
        if grafo status &> /dev/null; then
            log_success "✅ Global installation verified successfully"
        else
            log_warning "⚠️  Global command installed but may have issues"
        fi
    else
        log_error "❌ Global installation failed - 'grafo' command not available"
        return 1
    fi
}

# Show usage instructions
show_usage_instructions() {
    echo ""
    log_info "📚 Global CLI Usage"
    echo -e "${BLUE}──────────────────────${NC}"
    echo ""
    echo "You can now use the 'grafo' command from anywhere:"
    echo ""
    echo -e "${CYAN}Basic commands:${NC}"
    echo "  grafo --version              # Show version"
    echo "  grafo status                 # System status"
    echo "  grafo interactive            # Interactive mode"
    echo ""
    echo -e "${CYAN}Component management:${NC}"
    echo "  grafo indexer build          # Build RoslynIndexer"
    echo "  grafo repo list              # List repositories"
    echo "  grafo test run --quick       # Quick test"
    echo ""
    echo -e "${CYAN}Global operations:${NC}"
    echo "  grafo all setup              # Setup environment"
    echo "  grafo all status             # Full system status"
    echo ""
    echo -e "${YELLOW}Note:${NC} When using global installation, make sure to run commands"
    echo "from a directory that contains a Grafo project structure."
    echo ""
}

# Main execution
main() {
    print_header
    
    if [ "$UNINSTALL" = true ]; then
        uninstall_global
        exit 0
    fi
    
    log_info "Starting global installation process..."
    echo ""
    
    # Check existing installation
    if check_global_installation; then
        echo ""
    fi
    
    # Install globally
    install_global
    
    # Show usage instructions
    show_usage_instructions
    
    log_success "🎉 Grafo CLI global installation complete!"
    echo ""
    echo -e "${YELLOW}Quick test:${NC}"
    echo "  grafo --version"
    echo "  grafo status"
    echo ""
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Installation interrupted by user${NC}"; exit 130' INT

# Check if we're in the correct directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    log_error "This script must be run from the Grafo directory"
    log_info "Usage: cd Grafo && ./scripts/install.sh [OPTIONS]"
    exit 1
fi

# Run main function
main
