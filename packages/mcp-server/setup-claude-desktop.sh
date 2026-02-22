#!/bin/bash
set -e

echo "🔧 Foreman MCP Server - Claude Desktop Setup"
echo "=============================================="
echo ""

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
  CONFIG_DIR="$HOME/Library/Application Support/Claude"
  CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  CONFIG_DIR="$APPDATA/Claude"
  CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  CONFIG_DIR="$HOME/.config/claude"
  CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
else
  echo "❌ Unsupported OS: $OSTYPE"
  exit 1
fi

echo "📍 Config location: $CONFIG_FILE"
echo ""

# Create config directory if it doesn't exist
if [ ! -d "$CONFIG_DIR" ]; then
  echo "📁 Creating config directory..."
  mkdir -p "$CONFIG_DIR"
fi

# Get absolute path to this script's directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MCP_SERVER_PATH="$SCRIPT_DIR/dist/index.js"

echo "🔍 MCP Server path: $MCP_SERVER_PATH"
echo ""

# Check if dist/index.js exists
if [ ! -f "$MCP_SERVER_PATH" ]; then
  echo "❌ MCP server not built yet!"
  echo "   Run: pnpm build"
  exit 1
fi

# Prompt for configuration
echo "📋 Configure your Foreman Bridge connection"
echo ""

read -p "   Bridge URL (e.g. https://foreman.example.com or http://localhost:3000): " BRIDGE_URL
if [ -z "$BRIDGE_URL" ]; then
  BRIDGE_URL="http://localhost:3000"
  echo "   Using default: $BRIDGE_URL"
fi

read -p "   Auth Token (FOREMAN_AUTH_TOKEN): " AUTH_TOKEN
if [ -z "$AUTH_TOKEN" ]; then
  echo "❌ Auth token is required."
  exit 1
fi
echo ""

# Backup existing config if it exists
if [ -f "$CONFIG_FILE" ]; then
  BACKUP_FILE="$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
  echo "💾 Backing up existing config to:"
  echo "   $BACKUP_FILE"
  cp "$CONFIG_FILE" "$BACKUP_FILE"
  echo ""
fi

# Create the config
echo "✍️  Writing MCP server configuration..."
cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "foreman": {
      "command": "node",
      "args": [
        "$MCP_SERVER_PATH"
      ],
      "env": {
        "BRIDGE_URL": "$BRIDGE_URL",
        "FOREMAN_AUTH_TOKEN": "$AUTH_TOKEN"
      }
    }
  }
}
EOF

echo "✅ Configuration written successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Restart Claude Desktop"
echo "   2. Open a new conversation"
echo "   3. The Foreman tools should be available"
echo ""
echo "🔍 To verify:"
echo "   - Check Claude Desktop logs: ~/Library/Logs/Claude/mcp*.log"
echo "   - Ask Claude: 'What MCP tools do you have available?'"
echo ""
echo "🎉 Setup complete!"

