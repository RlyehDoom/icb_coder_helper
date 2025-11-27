#!/bin/bash
# Run Grafo API tests using Newman

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLECTION="$SCRIPT_DIR/Grafo_API_v2.1.postman_collection.json"

# Default values
BASE_URL="${BASE_URL:-http://localhost:8081}"
VERSION="${VERSION:-6.5.0}"

echo "=========================================="
echo "Grafo API Tests"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "Version:  $VERSION"
echo "=========================================="

# Check if newman is installed
if ! command -v newman &> /dev/null; then
    echo "Error: Newman not installed. Run: npm install -g newman"
    exit 1
fi

# Check if service is running
echo "Checking API health..."
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo "Error: API not responding at $BASE_URL"
    echo "Start service with: grafo query start"
    exit 1
fi

echo "API is healthy. Running tests..."
echo ""

# Run tests
newman run "$COLLECTION" \
    --env-var "baseUrl=$BASE_URL" \
    --env-var "version=$VERSION" \
    --reporters cli \
    --color on

echo ""
echo "=========================================="
echo "Tests completed"
echo "=========================================="
