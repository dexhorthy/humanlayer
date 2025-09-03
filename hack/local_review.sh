#!/usr/bin/env bash

# hack/local_review.sh - Worktree creation from GitHub branch
# Usage: ./hack/local_review.sh gh_username:branchName
# Example: ./hack/local_review.sh samdickson22:sam/eng-1696-hotkey-for-yolo-mode

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 gh_username:branchName"
    echo "Example: $0 samdickson22:sam/eng-1696-hotkey-for-yolo-mode"
    exit 1
fi

INPUT="$1"

# Extract username and branch
IFS=':' read -r GH_USERNAME BRANCH_NAME <<< "$INPUT"

if [ -z "$GH_USERNAME" ] || [ -z "$BRANCH_NAME" ]; then
    echo -e "${RED}Error: Invalid format. Please use: gh_username:branchName${NC}"
    exit 1
fi

echo -e "${BLUE}Setting up worktree for ${GH_USERNAME}:${BRANCH_NAME}${NC}"

# Extract ticket number or create short name
SHORT_NAME=""
if [[ "$BRANCH_NAME" =~ (eng|ENG)-([0-9]+) ]]; then
    # Extract ticket number (e.g., eng-1696 or ENG-1696)
    TICKET="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}"
    SHORT_NAME=$(echo "$TICKET" | tr '[:upper:]' '[:lower:]')
else
    # Sanitize branch name for directory
    SHORT_NAME=$(echo "$BRANCH_NAME" | sed 's/[^a-zA-Z0-9-]/-/g' | cut -c1-20)
fi

WORKTREE_PATH="$HOME/wt/humanlayer/$SHORT_NAME"

# Check if worktree already exists
if [ -d "$WORKTREE_PATH" ]; then
    echo -e "${RED}Error: Worktree already exists at $WORKTREE_PATH${NC}"
    echo "To remove it, run: git worktree remove $WORKTREE_PATH"
    exit 1
fi

# Check if remote exists, add if needed
REMOTE_NAME="$GH_USERNAME"
if ! git remote get-url "$REMOTE_NAME" &>/dev/null; then
    echo -e "${BLUE}Adding remote: $REMOTE_NAME${NC}"
    git remote add "$REMOTE_NAME" "git@github.com:${GH_USERNAME}/humanlayer" || {
        echo -e "${RED}Error: Failed to add remote${NC}"
        exit 1
    }
fi

# Fetch from remote
echo -e "${BLUE}Fetching from $REMOTE_NAME...${NC}"
git fetch "$REMOTE_NAME" || {
    echo -e "${RED}Error: Failed to fetch from remote${NC}"
    exit 1
}

# Create worktree
echo -e "${BLUE}Creating worktree at $WORKTREE_PATH...${NC}"
git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "${REMOTE_NAME}/${BRANCH_NAME}" || {
    echo -e "${RED}Error: Failed to create worktree${NC}"
    exit 1
}

# Copy Claude settings if they exist
if [ -f ".claude/settings.local.json" ]; then
    echo -e "${BLUE}Copying .claude/settings.local.json...${NC}"
    mkdir -p "$WORKTREE_PATH/.claude"
    cp ".claude/settings.local.json" "$WORKTREE_PATH/.claude/"
fi

# Run setup in the worktree
echo -e "${BLUE}Running setup...${NC}"
make -C "$WORKTREE_PATH" setup 2>/dev/null || {
    echo -e "${YELLOW}Note: Setup had some warnings but continuing${NC}"
}

# Setup thoughts
echo -e "${BLUE}Setting up thoughts...${NC}"
make -C "$WORKTREE_PATH" thoughts 2>/dev/null || {
    echo -e "${YELLOW}Note: Thoughts setup had warnings but continuing${NC}"
}

echo -e "\n${GREEN}✓ Worktree created successfully!${NC}"
echo ""
echo "Location: $WORKTREE_PATH"
echo "Branch: $BRANCH_NAME"
echo "Remote: $REMOTE_NAME"
echo ""
echo "To launch Claude Code:"
echo "  humanlayer launch --model opus -w $WORKTREE_PATH \"/implement_plan\""