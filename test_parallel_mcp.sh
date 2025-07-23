#\!/bin/bash
echo "Testing parallel approvals with MCP"

# Set up environment for MCP server
export HUMANLAYER_DAEMON_SOCKET=~/.humanlayer/daemon-dev.sock
export HUMANLAYER_RUN_ID=test-parallel-$(date +%s)

# Create MCP config
cat > /tmp/test-mcp-config.json << EOJ
{
  "mcpServers": {
    "approvals": {
      "command": "npx",
      "args": ["humanlayer", "mcp", "claude_approvals"],
      "env": {
        "HUMANLAYER_DAEMON_SOCKET": "$HUMANLAYER_DAEMON_SOCKET",
        "HUMANLAYER_RUN_ID": "$HUMANLAYER_RUN_ID"
      }
    }
  }
}
EOJ

echo "MCP config:"
cat /tmp/test-mcp-config.json

echo ""
echo "Launch claude with: claude -p 'Run hack/sleep_and_echo.sh with \"first\" AND hack/sleep_and_echo.sh with \"second\" in parallel. Call Bash tool TWICE in ONE message.' --mcp-config /tmp/test-mcp-config.json --permission-prompt-tool mcp__approvals__request_permission"
