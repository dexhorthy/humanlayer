#!/bin/bash
# Ultra-tight iteration loop - run one test, learn one thing

set -e

PROXY_PORT=9902
PROXY_URL="http://localhost:${PROXY_PORT}"
LOG_DIR="claude-api-logs"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default model
MODEL="${1:-opus}"
PROMPT="${2:-What is 2+2?}"

echo -e "${BLUE}=== Quick Claude API Test ===${NC}"
echo "Model: $MODEL"
echo "Prompt: $PROMPT"

# Start proxy if needed
if ! curl -s "${PROXY_URL}/health" > /dev/null 2>&1; then
    echo "Starting proxy..."
    python hack/claude-api-logger.py > /tmp/proxy.log 2>&1 &
    PROXY_PID=$!
    sleep 2
fi

# Clear old logs
rm -f ${LOG_DIR}/*.json

# Run the test
echo -e "\n${YELLOW}Running test...${NC}"
timeout 5 bash -c "ANTHROPIC_BASE_URL=${PROXY_URL} claude -m ${MODEL} -p '${PROMPT}'" > /dev/null 2>&1 || true

sleep 0.5

# Show what we learned
LOG_FILE=$(ls -t ${LOG_DIR}/*.json 2>/dev/null | head -1)

if [ -z "$LOG_FILE" ]; then
    echo "No log captured!"
    exit 1
fi

echo -e "\n${GREEN}=== CAPTURED API CALL ===${NC}"

python3 <<EOF
import json

with open('${LOG_FILE}', 'r') as f:
    data = json.load(f)

request = data['request']
body = request.get('body_json', {})
headers = request['headers']

print(f"\nMODEL STRING: {body.get('model', 'NOT SET')}")
print(f"VERSION: {headers.get('anthropic-version', 'NOT SET')}")
print(f"PATH: {data['path']}")

print(f"\nFULL REQUEST BODY:")
print(json.dumps(body, indent=2))

print(f"\nKEY FIELDS:")
print(f"  max_tokens: {body.get('max_tokens', 'default')}")
print(f"  temperature: {body.get('temperature', 'default')}")  
print(f"  stream: {body.get('stream', 'default')}")

if data['model'] == '${MODEL}':
    print(f"\n✓ Model matches: CLI -m ${MODEL} → API model: {body.get('model')}")
else:
    print(f"\n✗ Model mismatch: CLI -m ${MODEL} → API model: {body.get('model')}")
EOF

# Kill proxy if we started it
if [ ! -z "${PROXY_PID}" ]; then
    kill ${PROXY_PID} 2>/dev/null || true
fi

echo -e "\n${YELLOW}Usage:${NC}"
echo "  $0 [model] [prompt]"
echo "  $0 opus"
echo "  $0 sonnet" 
echo "  $0 haiku"