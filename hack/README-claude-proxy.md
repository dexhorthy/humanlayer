# Claude API Proxy - Reverse Engineering & Local Inference

This directory contains tools for understanding Claude Code API calls and proxying them to local inference servers.

## Key Findings

### Model Mappings (IMPORTANT UPDATE)
Claude CLI accepts ONLY these model parameters:
- `claude --model opus` → API: `claude-opus-4-20250514`
- `claude --model sonnet` → API: `claude-sonnet-4-20250514`
- No `-m` flag → defaults to opus
- Haiku (`claude-3-5-haiku-20241022`) is used automatically for internal tasks (file extraction, permissions)

### API Details
- Endpoint: `/v1/messages`
- Version: `Anthropic-Version: 2023-06-01`
- Beta: `anthropic-beta: claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14`
- Always uses streaming (`stream: true`)
- Max tokens: 32000 for opus/sonnet, 512 for haiku

## Core Tools

### 1. API Logging Proxy (`claude-api-logger.py`)
Captures complete API requests/responses for analysis:

```bash
# Start the logging proxy
./hack/claude-proxy-control.sh start

# Run Claude with proxy
ANTHROPIC_BASE_URL=http://localhost:9902 timeout 30 claude \
  --verbose --output-format=stream-json \
  --model opus \
  -p 'Your prompt'

# Analyze captured logs
uv run hack/compare-claude-api-calls.py
```

### 2. OpenAI Transformation Proxy (`claude-openai-proxy.py`)
Routes Claude API calls to local OpenAI-compatible server (localhost:9900):

```bash
# Start the transformation proxy
nohup uv run hack/claude-openai-proxy.py > /tmp/claude-openai-proxy.log 2>&1 &

# Use Claude with local inference
ANTHROPIC_BASE_URL=http://localhost:9902 claude -p 'What is 2+2?'
```

**Current configuration** (from crush.json):
- Local model: `qwen3`
- API key: `sk_boomer`
- Endpoint: `http://localhost:9900/v1`

### 3. Proxy Control Script (`claude-proxy-control.sh`)
Manages proxy lifecycle:

```bash
./hack/claude-proxy-control.sh start   # Start logging proxy
./hack/claude-proxy-control.sh stop    # Stop proxy
./hack/claude-proxy-control.sh status  # Check status
./hack/claude-proxy-control.sh logs    # Tail logs

# For OpenAI proxy:
PROXY_TYPE=openai ./hack/claude-proxy-control.sh start
```

### 4. Analysis Tools

**Clean JSON Logs** (`clean-json-logs.py`):
```bash
# View latest log with truncated strings
uv run hack/clean-json-logs.py

# View specific log
uv run hack/clean-json-logs.py claude-api-logs/LOGFILE.json
```

**Compare Models** (`compare-claude-api-calls.py`):
```bash
# See all models and their differences
uv run hack/compare-claude-api-calls.py
```

**Quick Test** (`claude-quick-test.sh`):
```bash
# Test specific model quickly
./hack/claude-quick-test.sh opus
./hack/claude-quick-test.sh sonnet
```

## Local Inference Server Details

The local server at localhost:9900 supports:
- OpenAI-compatible API format
- Model: `qwen3`
- Function/tool calling
- Streaming responses
- System messages

Example direct test:
```bash
curl -s -X POST http://localhost:9900/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_boomer" \
  -d '{
    "model": "qwen3",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 50
  }' | jq .
```

## API Format Transformations

### Anthropic → OpenAI
- System messages: Array of objects → Single system message
- Messages: Complex content arrays → Simple content strings
- Headers: `x-api-key` → `Authorization: Bearer`
- Model names: Map to `qwen3`

### OpenAI → Anthropic
- Streaming: OpenAI SSE format → Anthropic event format
- Response: `choices[0].message.content` → `content[0].text`
- Usage: Map token counts appropriately

## Directory Structure

```
claude-api-logs/              # Captured API request/response JSON files
├── YYYY-MM-DDTHH-MM-SS_model_uuid.json

hack/
├── claude-api-logger.py      # Logging proxy (captures all API calls)
├── claude-openai-proxy.py    # Transformation proxy (Anthropic→OpenAI)
├── claude-proxy-control.sh   # Start/stop/manage proxies
├── clean-json-logs.py        # View logs with truncated strings
├── compare-claude-api-calls.py # Analyze differences between models
├── claude-quick-test.sh      # Quick single model test
├── claude-learn-api.sh       # Run multiple test scenarios
└── README-claude-proxy.md    # This file
```

## Known Limitations

1. Tool/function calling transformation not yet implemented
2. Large requests with 38 tools may overwhelm local models
3. Only basic message content is transformed (no images, etc.)

## Next Steps

1. **Implement tool transformation**: Convert Anthropic tool format to OpenAI function format
2. **Add environment variable support** to claudecode-go for setting `ANTHROPIC_BASE_URL`
3. **Handle complex content types**: Images, tool results, etc.
4. **Optimize for large payloads**: Filter unnecessary data for local models

## Usage Tips

- Always use `timeout` with Claude commands
- Always use `--verbose --output-format=stream-json` for debugging
- Check `/tmp/claude-openai-proxy.log` for transformation details
- Local model restarts can cause connection resets

## Research References

See:
- `thoughts/shared/research/2025-07-30-claude-proxy-logging.md` - Initial proxy research
- `thoughts/shared/research/2025-07-30_19-38-22_claude-code-proxy-local-inference.md` - Original concept