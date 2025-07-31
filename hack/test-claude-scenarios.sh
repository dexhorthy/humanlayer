#!/bin/bash
# Test script for Claude proxy with different scenarios

set -e

PROXY_URL="http://localhost:9901"
PROXY_SCRIPT="hack/test-claude-proxy.py"

echo "=== Claude Proxy Test Scenarios ==="
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if proxy is running
check_proxy() {
    if curl -s "${PROXY_URL}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Proxy is running${NC}"
        return 0
    else
        echo -e "${RED}✗ Proxy is not running${NC}"
        echo -e "${YELLOW}Start it with: python ${PROXY_SCRIPT}${NC}"
        return 1
    fi
}

# Test function
run_test() {
    local test_name="$1"
    local command="$2"
    
    echo -e "${YELLOW}Test: ${test_name}${NC}"
    echo "Command: $command"
    echo "---"
    
    # Run with timeout to prevent hanging
    if timeout 10 bash -c "$command"; then
        echo -e "${GREEN}✓ Test passed${NC}"
    else
        echo -e "${RED}✗ Test failed or timed out${NC}"
    fi
    echo
}

# Main tests
main() {
    echo "Prerequisites:"
    echo "1. Install dependencies: pip install flask requests"
    echo "2. Run proxy in another terminal: python ${PROXY_SCRIPT}"
    echo "3. Optionally run local API on :9900"
    echo
    
    if ! check_proxy; then
        exit 1
    fi
    echo
    
    # Test 1: Basic Claude CLI with proxy
    run_test "Basic Claude CLI" \
        "ANTHROPIC_BASE_URL=${PROXY_URL} claude -p 'What is 2+2?'"
    
    # Test 2: Explicit model selection (should route to Anthropic)
    run_test "Claude 3.5 Sonnet (Anthropic)" \
        "ANTHROPIC_BASE_URL=${PROXY_URL} claude -m claude-3-5-sonnet-20241022 -p 'What is 2+2?'"
    
    # Test 3: Opus 4 model (should route to local if available)
    run_test "Opus 4 (Local routing)" \
        "ANTHROPIC_BASE_URL=${PROXY_URL} claude -m opus-4 -p 'What is 2+2?'"
    
    # Test 4: Direct API call with curl
    run_test "Direct API call" \
        "curl -X POST ${PROXY_URL}/v1/messages \
        -H 'Content-Type: application/json' \
        -H 'x-api-key: test-key' \
        -H 'anthropic-version: 2023-06-01' \
        -d '{\"model\": \"claude-3-5-sonnet-20241022\", \"messages\": [{\"role\": \"user\", \"content\": \"Hi\"}], \"max_tokens\": 10}'"
    
    # Test 5: Health check
    run_test "Health check" \
        "curl -s ${PROXY_URL}/health | jq ."
    
    echo "Check claude-proxy.log for detailed request/response logs"
}

# Run main
main