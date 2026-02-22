#!/bin/bash
set -e

echo "🚀 Foreman Bridge - Droplet Deployment Script"
echo "=============================================="

# Configuration
DROPLET_IP="${DROPLET_IP:?Set DROPLET_IP env var}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY env var}"
FOREMAN_AUTH_TOKEN=$(openssl rand -hex 32)

echo ""
echo "📋 Configuration:"
echo "  Droplet IP: $DROPLET_IP"
echo "  Auth Token: $FOREMAN_AUTH_TOKEN"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1: Installing Node.js, pnpm, git, and dependencies..."
ssh -i "$SSH_KEY" root@$DROPLET_IP << 'ENDSSH'
set -e

# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Install build tools
apt-get install -y git build-essential curl unzip htop

# Install pnpm globally
npm install -g pnpm

# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

echo "✅ Dependencies installed"
node --version
pnpm --version
ENDSSH

# Step 2: Create foreman user
echo ""
echo "👤 Step 2: Creating foreman user..."
ssh -i "$SSH_KEY" root@$DROPLET_IP << 'ENDSSH'
set -e

# Create user if doesn't exist
if ! id -u foreman > /dev/null 2>&1; then
    useradd -m -s /bin/bash foreman
    echo "✅ User 'foreman' created"
else
    echo "ℹ️  User 'foreman' already exists"
fi

# Create directories
mkdir -p /home/foreman/repos /home/foreman/bridge
chown -R foreman:foreman /home/foreman

# Copy SSH keys
mkdir -p /home/foreman/.ssh
cp /root/.ssh/authorized_keys /home/foreman/.ssh/
chown -R foreman:foreman /home/foreman/.ssh
chmod 700 /home/foreman/.ssh
chmod 600 /home/foreman/.ssh/authorized_keys

echo "✅ User setup complete"
ENDSSH

# Step 3: Push code from local to droplet
echo ""
echo "📥 Step 3: Pushing code to droplet..."
# Create directory structure
ssh -i "$SSH_KEY" foreman@$DROPLET_IP "mkdir -p /home/foreman/repos/foreman"

# Use rsync to push the code
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
  -e "ssh -i $SSH_KEY" \
  /Users/peterschings/Documents/DevOps/_beverlyhillscop/foreman/ \
  foreman@$DROPLET_IP:/home/foreman/repos/foreman/

echo "✅ Code pushed to droplet"

# Step 4: Build the bridge
echo ""
echo "🔨 Step 4: Building Foreman Bridge..."
ssh -i "$SSH_KEY" foreman@$DROPLET_IP << 'ENDSSH'
set -e

cd /home/foreman/repos/foreman

# Install dependencies
pnpm install

# Build bridge
pnpm --filter @foreman/bridge build

echo "✅ Bridge built successfully"
ENDSSH

# Step 5: Create systemd service
echo ""
echo "⚙️  Step 5: Setting up systemd service..."
ssh -i "$SSH_KEY" root@$DROPLET_IP bash -s << ENDSSH
set -e

cat > /etc/systemd/system/foreman-bridge.service << 'EOF'
[Unit]
Description=Foreman Bridge
After=network.target

[Service]
Type=simple
User=foreman
WorkingDirectory=/home/foreman/repos/foreman/packages/bridge
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=PORT=3000
Environment=FOREMAN_API_TOKEN=$FOREMAN_AUTH_TOKEN
Environment=ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
Environment=PROJECTS_DIR=/home/foreman/projects

[Install]
WantedBy=multi-user.target
EOF

# Create projects directory
mkdir -p /home/foreman/projects
chown foreman:foreman /home/foreman/projects

# Reload systemd and start service
systemctl daemon-reload
systemctl enable foreman-bridge
systemctl restart foreman-bridge

echo "✅ Systemd service configured and started"
systemctl status foreman-bridge --no-pager
ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Save these credentials:"
echo "  FOREMAN_AUTH_TOKEN=$FOREMAN_AUTH_TOKEN"
echo ""
echo "🔍 Next steps:"
echo "  1. Test: curl http://207.154.246.112:3000/health"
echo "  2. Set up DNS: foreman.zeon.eco -> 207.154.246.112"
echo "  3. Install Caddy for HTTPS"

