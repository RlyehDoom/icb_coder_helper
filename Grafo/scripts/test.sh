#!/bin/bash

# test.sh - Run complete test suite for Grafo
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
    echo -e "${CYAN}🧪 Running Grafo Test Suite${NC}"
    echo -e "${BLUE}───────────────────────────${NC}"
    echo ""
}

# Parse command line arguments
QUICK_TEST=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --quick|-q)
            QUICK_TEST=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --quick, -q     Run quick tests only"
            echo "  --verbose, -v   Verbose output"
            echo "  --help, -h      Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                # Run full test suite"
            echo "  $0 --quick        # Run quick tests"
            echo "  $0 --verbose      # Run with verbose output"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Test RoslynIndexer
test_indexer() {
    log_step "1/3" "Testing RoslynIndexer"
    
    if [ -d "Indexer" ]; then
        cd Indexer
        
        # Check if there are unit tests
        if [ -d "tests" ]; then
            log_info "Running unit tests..."
            dotnet test tests/
        else
            log_info "No unit tests found, running basic functionality test..."
            
            # Try to run indexer with help to verify it works
            if dotnet run -- --help > /dev/null; then
                log_success "RoslynIndexer basic functionality test passed"
            else
                log_error "RoslynIndexer basic functionality test failed"
                cd ..
                return 1
            fi
        fi
        
        cd ..
        log_success "RoslynIndexer tests completed"
    else
        log_warning "Indexer directory not found, skipping indexer tests"
    fi
}

# Test CLI functionality
test_cli() {
    log_step "2/3" "Testing CLI functionality"
    
    # Test CLI commands
    local cli_tests=(
        "--version:Version check"
        "status:System status"
        "indexer status:Indexer status"
        "repo status:Repository status"
        "test status:Test status"
    )
    
    for test in "${cli_tests[@]}"; do
        IFS=':' read -r command description <<< "$test"
        
        log_info "Testing: $description"
        if [ "$VERBOSE" = true ]; then
            node src/cli.js $command
        else
            if node src/cli.js $command > /dev/null 2>&1; then
                log_info "✓ $description passed"
            else
                log_error "✗ $description failed"
                return 1
            fi
        fi
    done
    
    log_success "CLI functionality tests completed"
}

# Run integration tests
test_integration() {
    log_step "3/3" "Running integration tests"
    
    if [ "$QUICK_TEST" = true ]; then
        log_info "Running quick integration test..."
        
        if [ "$VERBOSE" = true ]; then
            node src/cli.js test run --quick --verbose
        else
            node src/cli.js test run --quick
        fi
    else
        log_info "Setting up test environment..."
        node src/cli.js test setup
        
        log_info "Running comprehensive tests..."
        if [ "$VERBOSE" = true ]; then
            node src/cli.js test run --verbose
        else
            node src/cli.js test run
        fi
    fi
    
    log_success "Integration tests completed"
}

# Generate test report
generate_report() {
    echo ""
    log_info "📊 Test Summary Report"
    echo -e "${BLUE}────────────────────────${NC}"
    
    # Run system status
    node src/cli.js status
    
    echo ""
    if [ "$QUICK_TEST" = true ]; then
        log_success "✅ Quick test suite completed successfully!"
    else
        log_success "✅ Full test suite completed successfully!"
    fi
    
    echo ""
    echo -e "${YELLOW}Test artifacts:${NC}"
    
    # Check for test results
    if [ -d "test-results" ]; then
        local file_count=$(find test-results -type f | wc -l)
        echo "  Test results: $file_count files in test-results/"
    fi
    
    if [ -d "Indexer/test-results" ]; then
        local indexer_files=$(find Indexer/test-results -type f | wc -l)
        echo "  Indexer results: $indexer_files files in Indexer/test-results/"
    fi
    
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  - Review test results in test-results/ directory"
    echo "  - Use 'node src/cli.js interactive' for manual testing"
    echo "  - Run './scripts/clean.sh' to clean up test artifacts"
    echo ""
}

# Main execution
main() {
    print_header
    
    # Check prerequisites
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        exit 1
    fi
    
    if ! command -v dotnet &> /dev/null; then
        log_error ".NET SDK not found"
        exit 1
    fi
    
    log_info "Starting test suite..."
    if [ "$QUICK_TEST" = true ]; then
        log_info "Mode: Quick tests"
    else
        log_info "Mode: Full test suite"
    fi
    
    if [ "$VERBOSE" = true ]; then
        log_info "Verbose output enabled"
    fi
    
    echo ""
    
    # Run tests
    test_indexer
    echo ""
    
    test_cli
    echo ""
    
    test_integration
    
    # Generate report
    generate_report
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Tests interrupted by user${NC}"; exit 130' INT

# Check if we're in the correct directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    log_error "This script must be run from the Grafo directory"
    log_info "Usage: cd Grafo && ./scripts/test.sh [OPTIONS]"
    exit 1
fi

# Run main function
main
