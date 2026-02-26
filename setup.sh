#!/bin/bash

set -e

echo "🤖 Foreman Setup Script"
echo "======================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm not found. Installing pnpm...${NC}"
    npm install -g pnpm
fi

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
pnpm install

# Build MCP Server
echo -e "${BLUE}🔨 Building MCP Server...${NC}"
cd packages/mcp-server
pnpm build
cd ../..

echo ""
echo -e "${GREEN}✅ Installation complete!${NC}"
echo ""

# Ask for configuration
echo -e "${BLUE}📝 Configuration${NC}"
echo ""

BRIDGE_URL="https://foreman.beverlyhillscop.io"
DASHBOARD_URL="https://dashboard.beverlyhillscop.io"

read -p "Your email for Foreman login: " USER_EMAIL

echo ""
echo -e "${YELLOW}⚠️  Next steps:${NC}"
echo ""
echo "1. Go to ${DASHBOARD_URL}"
echo "2. Sign up with: ${USER_EMAIL}"
echo "3. Go to Settings → Create Personal Access Token (PAT)"
echo "4. Copy the token (starts with 'fm_')"
echo ""
read -p "Paste your PAT token here: " PAT_TOKEN

echo ""
echo -e "${BLUE}🔑 Setting up API Keys...${NC}"
echo ""
echo "You need an OpenRouter API key to use Foreman."
echo "Get one at: https://openrouter.ai/keys"
echo ""
read -p "Paste your OpenRouter API key: " OPENROUTER_KEY

# Set API key via Foreman API
echo ""
echo -e "${BLUE}📤 Uploading API key to Foreman...${NC}"
curl -X PUT "${BRIDGE_URL}/api/api-keys/openrouter" \
  -H "Authorization: Bearer ${PAT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"key_value\": \"${OPENROUTER_KEY}\"}" \
  -s > /dev/null

echo -e "${GREEN}✅ API key uploaded!${NC}"
echo ""

# Generate Claude Desktop config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_PATH="${SCRIPT_DIR}/packages/mcp-server/dist/index.js"

CLAUDE_CONFIG=$(cat <<EOF
{
  "mcpServers": {
    "foreman": {
      "command": "node",
      "args": ["${MCP_PATH}"],
      "env": {
        "FOREMAN_BRIDGE_URL": "${BRIDGE_URL}",
        "FOREMAN_AUTH_TOKEN": "${PAT_TOKEN}"
      }
    }
  }
}
EOF
)

# Detect OS and set Claude config path
if [[ "$OSTYPE" == "darwin"* ]]; then
    CLAUDE_CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CLAUDE_CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
else
    CLAUDE_CONFIG_PATH="UNKNOWN"
fi

echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "${BLUE}📋 Claude Desktop Configuration${NC}"
echo ""
echo "Copy this to: ${CLAUDE_CONFIG_PATH}"
echo ""
echo "${CLAUDE_CONFIG}"
echo ""

# Offer to write config automatically
if [ "$CLAUDE_CONFIG_PATH" != "UNKNOWN" ]; then
    read -p "Do you want me to write this config automatically? (y/n): " AUTO_WRITE
    if [[ "$AUTO_WRITE" == "y" || "$AUTO_WRITE" == "Y" ]]; then
        mkdir -p "$(dirname "$CLAUDE_CONFIG_PATH")"
        
        # Backup existing config
        if [ -f "$CLAUDE_CONFIG_PATH" ]; then
            cp "$CLAUDE_CONFIG_PATH" "${CLAUDE_CONFIG_PATH}.backup"
            echo -e "${YELLOW}⚠️  Backed up existing config to ${CLAUDE_CONFIG_PATH}.backup${NC}"
        fi
        
        echo "$CLAUDE_CONFIG" > "$CLAUDE_CONFIG_PATH"
        echo -e "${GREEN}✅ Config written to ${CLAUDE_CONFIG_PATH}${NC}"
    fi
fi

echo ""
echo -e "${GREEN}🎉 All done!${NC}"
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop"
echo "2. Say: 'Create a task to add authentication to my-api'"
echo ""
echo "Happy coding! 🚀"

