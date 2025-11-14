#!/bin/bash

# analyze-solution.sh - Script to analyze a C# solution using RoslynIndexer
# Usage: ./analyze-solution.sh <solution_path> [output_dir] [options]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(dirname "$SCRIPT_DIR")"
INDEXER_EXE="$INDEXER_DIR/bin/Release/net8.0/RoslynIndexer.dll"

# Default values
OUTPUT_DIR="./analysis-output"
VERBOSE=false
GENERATE_GRAPH=true
GENERATE_STATS=true
OUTPUT_FORMAT="json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_usage() {
    echo "Usage: $0 <solution_path> [output_dir] [options]"
    echo ""
    echo "Arguments:"
    echo "  solution_path    Path to the .sln file to analyze"
    echo "  output_dir       Output directory (default: ./analysis-output)"
    echo ""
    echo "Options:"
    echo "  --verbose, -v           Enable verbose output"
    echo "  --no-graph             Skip graph generation"
    echo "  --no-stats             Skip statistics generation"
    echo "  --format FORMAT        Output format: json, xml (default: json)"
    echo "  --filter-types TYPES   Filter symbol types (comma-separated)"
    echo "  --exclude-projects RE  Exclude projects matching regex"
    echo "  --help, -h             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 ./MySolution.sln"
    echo "  $0 ./MySolution.sln ./output --verbose"
    echo "  $0 ./MySolution.sln ./output --filter-types 'Class,Interface'"
    echo "  $0 ./MySolution.sln ./output --exclude-projects '.*\.Tests$'"
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

check_prerequisites() {
    # Check if .NET is installed
    if ! command -v dotnet &> /dev/null; then
        log_error ".NET is not installed or not in PATH"
        exit 1
    fi

    # Check if indexer executable exists
    if [ ! -f "$INDEXER_EXE" ]; then
        log_warning "RoslynIndexer not found at $INDEXER_EXE"
        log_info "Building RoslynIndexer..."
        cd "$INDEXER_DIR"
        dotnet build -c Release
        if [ ! -f "$INDEXER_EXE" ]; then
            log_error "Failed to build RoslynIndexer"
            exit 1
        fi
    fi
}

# Parse arguments
SOLUTION_PATH=""
EXTRA_ARGS=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            print_usage
            exit 0
            ;;
        --verbose|-v)
            VERBOSE=true
            EXTRA_ARGS="$EXTRA_ARGS --verbose"
            shift
            ;;
        --no-graph)
            GENERATE_GRAPH=false
            shift
            ;;
        --no-stats)
            GENERATE_STATS=false
            shift
            ;;
        --format)
            OUTPUT_FORMAT="$2"
            EXTRA_ARGS="$EXTRA_ARGS --output-format $2"
            shift 2
            ;;
        --filter-types)
            EXTRA_ARGS="$EXTRA_ARGS --filter-types '$2'"
            shift 2
            ;;
        --exclude-projects)
            EXTRA_ARGS="$EXTRA_ARGS --exclude-projects '$2'"
            shift 2
            ;;
        -*)
            log_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
        *)
            if [ -z "$SOLUTION_PATH" ]; then
                SOLUTION_PATH="$1"
            elif [ -z "$OUTPUT_DIR" ] || [ "$OUTPUT_DIR" = "./analysis-output" ]; then
                OUTPUT_DIR="$1"
            fi
            shift
            ;;
    esac
done

# Validate required arguments
if [ -z "$SOLUTION_PATH" ]; then
    log_error "Solution path is required"
    print_usage
    exit 1
fi

if [ ! -f "$SOLUTION_PATH" ]; then
    log_error "Solution file not found: $SOLUTION_PATH"
    exit 1
fi

# Main execution
main() {
    log_info "RoslynIndexer Analysis Script"
    log_info "Solution: $SOLUTION_PATH"
    log_info "Output: $OUTPUT_DIR"

    check_prerequisites

    # Create output directory
    mkdir -p "$OUTPUT_DIR"

    # Generate file names
    SOLUTION_NAME=$(basename "$SOLUTION_PATH" .sln)
    SYMBOLS_FILE="$OUTPUT_DIR/${SOLUTION_NAME}-symbols.${OUTPUT_FORMAT}"
    GRAPH_FILE="$OUTPUT_DIR/${SOLUTION_NAME}-graph.${OUTPUT_FORMAT}"
    STATS_FILE="$OUTPUT_DIR/${SOLUTION_NAME}-stats.csv"

    # Build command
    CMD="dotnet \"$INDEXER_EXE\" -s \"$SOLUTION_PATH\" -o \"$SYMBOLS_FILE\""

    if [ "$GENERATE_GRAPH" = true ]; then
        CMD="$CMD -g \"$GRAPH_FILE\""
    fi

    if [ "$GENERATE_STATS" = true ]; then
        CMD="$CMD --stats-csv \"$STATS_FILE\""
    fi

    if [ -n "$EXTRA_ARGS" ]; then
        CMD="$CMD $EXTRA_ARGS"
    fi

    # Execute analysis
    log_info "Starting analysis..."
    if [ "$VERBOSE" = true ]; then
        log_info "Command: $CMD"
    fi

    if eval "$CMD"; then
        log_success "Analysis completed successfully!"
        echo ""
        log_info "Output files:"
        echo "  Symbols: $SYMBOLS_FILE"
        if [ "$GENERATE_GRAPH" = true ]; then
            echo "  Graph: $GRAPH_FILE"
            if [ -f "$OUTPUT_DIR/${SOLUTION_NAME}-graph-structural.${OUTPUT_FORMAT}" ]; then
                echo "  Structural Graph: $OUTPUT_DIR/${SOLUTION_NAME}-graph-structural.${OUTPUT_FORMAT}"
            fi
        fi
        if [ "$GENERATE_STATS" = true ]; then
            echo "  Statistics: $STATS_FILE"
        fi
        echo ""
        
        # Show quick stats if available
        if [ -f "$STATS_FILE" ] && command -v head &> /dev/null; then
            log_info "Quick Statistics:"
            head -10 "$STATS_FILE" | while IFS=, read -r metric count; do
                if [ "$metric" != "Metric" ]; then
                    echo "  $metric: $count"
                fi
            done
        fi
    else
        log_error "Analysis failed!"
        exit 1
    fi
}

# Trap to handle script interruption
trap 'log_warning "Analysis interrupted by user"; exit 130' INT

# Run main function
main
