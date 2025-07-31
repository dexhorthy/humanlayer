#!/bin/bash
# Tight iteration loop to learn Claude API patterns

set -e

PROXY_PORT=9902
PROXY_URL="http://localhost:${PROXY_PORT}"
PROXY_SCRIPT="hack/claude-api-logger.py"
LOG_DIR="claude-api-logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if proxy is running
is_proxy_running() {
    curl -s "${PROXY_URL}/health" > /dev/null 2>&1
}

# Start proxy in background if not running
ensure_proxy() {
    if ! is_proxy_running; then
        echo -e "${YELLOW}Starting proxy in background...${NC}"
        python ${PROXY_SCRIPT} > proxy.log 2>&1 &
        PROXY_PID=$!
        sleep 2
        
        if is_proxy_running; then
            echo -e "${GREEN}✓ Proxy started (PID: ${PROXY_PID})${NC}"
        else
            echo -e "${RED}✗ Failed to start proxy${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✓ Proxy already running${NC}"
    fi
}

# Run a test and capture results
run_test() {
    local test_name="$1"
    local claude_cmd="$2"
    
    echo -e "\n${BLUE}━━━ Test: ${test_name} ━━━${NC}"
    echo "Command: $claude_cmd"
    
    # Clear previous logs for this specific test
    rm -f ${LOG_DIR}/*.json
    
    # Run the command with timeout
    if timeout 5 bash -c "ANTHROPIC_BASE_URL=${PROXY_URL} ${claude_cmd}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Command executed${NC}"
    else
        echo -e "${YELLOW}⚠ Command timed out or failed (this is ok for learning)${NC}"
    fi
    
    # Give proxy time to save logs
    sleep 0.5
    
    # Analyze what we learned
    echo -e "\n${YELLOW}What we learned:${NC}"
    
    # Find the log file
    LOG_FILE=$(ls -t ${LOG_DIR}/*.json 2>/dev/null | head -1)
    
    if [ -z "$LOG_FILE" ]; then
        echo -e "${RED}No log file created!${NC}"
        return
    fi
    
    # Extract key information using jq or python
    python3 <<EOF
import json
with open('${LOG_FILE}', 'r') as f:
    data = json.load(f)
    
print(f"Model: {data.get('model', 'unknown')}")
print(f"Path: {data.get('path', 'unknown')}")
print(f"Method: {data.get('method', 'unknown')}")

request = data.get('request', {})
headers = request.get('headers', {})
body = request.get('body_json', {})

print(f"\nHeaders:")
print(f"  anthropic-version: {headers.get('anthropic-version', 'not set')}")
print(f"  anthropic-beta: {headers.get('anthropic-beta', 'not set')}")
print(f"  x-api-key: {'present' if 'x-api-key' in headers else 'not present'}")

print(f"\nRequest body:")
print(f"  model: {body.get('model', 'not set')}")
print(f"  max_tokens: {body.get('max_tokens', 'not set')}")
print(f"  temperature: {body.get('temperature', 'not set')}")
print(f"  stream: {body.get('stream', 'not set')}")
if 'system' in body:
    print(f"  system: <present, {len(body['system'])} chars>")
if 'messages' in body:
    print(f"  messages: {len(body['messages'])} message(s)")
    for i, msg in enumerate(body['messages'][:2]):
        print(f"    [{i}] role: {msg.get('role')}, content length: {len(str(msg.get('content', '')))} chars")

# Show full JSON structure
print(f"\nFull request JSON structure:")
print(f"  Keys: {list(body.keys())}")

response = data.get('response', {})
print(f"\nResponse:")
print(f"  Status: {response.get('status_code', 'unknown')}")
print(f"  Streaming: {response.get('streaming', False)}")
EOF
}

# Main execution
main() {
    echo -e "${GREEN}=== Claude API Learning Script ===${NC}"
    echo "This script will run various Claude commands and show exactly what API calls are made"
    
    # Ensure log directory exists
    mkdir -p ${LOG_DIR}
    
    # Start proxy if needed
    ensure_proxy
    
    # Test 1: Default model (no -m flag)
    run_test "Default model" \
        "claude -p 'What is 2+2?'"
    
    # Test 2: Opus explicitly
    run_test "Opus model" \
        "claude -m opus -p 'What is 2+2?'"
    
    # Test 3: Sonnet model
    run_test "Sonnet model" \
        "claude -m sonnet -p 'What is 2+2?'"
    
    # Test 4: Default (no model specified - might use haiku automatically)
    run_test "No model flag (may use haiku)" \
        "claude -p 'What is 2+2?'"
    
    # Test 5: With more options
    run_test "With temperature" \
        "claude -m opus -T 0.7 -p 'What is 2+2?'"
    
    # Summary
    echo -e "\n${GREEN}━━━ SUMMARY ━━━${NC}"
    echo "All captured logs are in: ${LOG_DIR}/"
    echo "To see detailed analysis of all tests run:"
    echo "  python ${PROXY_SCRIPT} --analyze"
    
    # Kill proxy if we started it
    if [ ! -z "${PROXY_PID}" ]; then
        echo -e "\n${YELLOW}Stopping proxy (PID: ${PROXY_PID})...${NC}"
        kill ${PROXY_PID} 2>/dev/null || true
    fi
}

# Run main
main