#!/bin/bash
# Control script for Claude API logger proxy

PROXY_SCRIPT="hack/claude-api-logger.py"
PID_FILE="/tmp/claude-proxy.pid"
LOG_FILE="/tmp/claude-proxy.log"
PROXY_PORT=9902

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

start_proxy() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${YELLOW}Proxy already running with PID $PID${NC}"
            return 0
        fi
    fi
    
    echo -e "${GREEN}Starting Claude proxy...${NC}"
    nohup uv run "$PROXY_SCRIPT" > "$LOG_FILE" 2>&1 &
    PID=$!
    echo $PID > "$PID_FILE"
    
    # Wait a bit and check if it started
    sleep 2
    if kill -0 "$PID" 2>/dev/null; then
        echo -e "${GREEN}✓ Proxy started successfully (PID: $PID)${NC}"
        echo "Log file: $LOG_FILE"
    else
        echo -e "${RED}✗ Failed to start proxy${NC}"
        rm -f "$PID_FILE"
        return 1
    fi
}

stop_proxy() {
    if [ ! -f "$PID_FILE" ]; then
        echo -e "${YELLOW}No proxy PID file found${NC}"
        return 0
    fi
    
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo -e "${GREEN}Stopping proxy (PID: $PID)...${NC}"
        kill "$PID"
        rm -f "$PID_FILE"
        echo -e "${GREEN}✓ Proxy stopped${NC}"
    else
        echo -e "${YELLOW}Proxy not running (stale PID file)${NC}"
        rm -f "$PID_FILE"
    fi
}

restart_proxy() {
    echo -e "${YELLOW}Restarting proxy...${NC}"
    stop_proxy
    sleep 1
    start_proxy
}

status_proxy() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${GREEN}✓ Proxy is running (PID: $PID)${NC}"
            echo "URL: http://localhost:$PROXY_PORT"
            echo "Log: $LOG_FILE"
        else
            echo -e "${RED}✗ Proxy is not running (stale PID file)${NC}"
            rm -f "$PID_FILE"
        fi
    else
        echo -e "${YELLOW}Proxy is not running${NC}"
    fi
}

tail_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo -e "${RED}No log file found${NC}"
    fi
}

# Main
case "$1" in
    start)
        start_proxy
        ;;
    stop)
        stop_proxy
        ;;
    restart)
        restart_proxy
        ;;
    status)
        status_proxy
        ;;
    logs)
        tail_logs
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "  start   - Start the proxy in background"
        echo "  stop    - Stop the proxy"
        echo "  restart - Restart the proxy"
        echo "  status  - Check if proxy is running"
        echo "  logs    - Tail the proxy logs"
        exit 1
        ;;
esac