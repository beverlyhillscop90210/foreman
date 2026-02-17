#!/bin/bash
set -e

echo "🔒 Setting up Caddy for HTTPS"
echo "=============================="

DROPLET_IP="207.154.246.112"
SSH_KEY="$HOME/.ssh/id_ed25519"
DOMAIN="foreman.zeon.eco"

echo ""
echo "📋 Configuration:"
echo "  Domain: $DOMAIN"
echo "  Droplet IP: $DROPLET_IP"
echo ""

# Install Caddy and configure
ssh -i "$SSH_KEY" root@$DROPLET_IP << 'ENDSSH'
set -e

echo "📦 Installing Caddy..."
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

echo "⚙️  Configuring Caddy..."
cat > /etc/caddy/Caddyfile << 'EOF'
foreman.zeon.eco {
    reverse_proxy localhost:3000
}
EOF

echo "🔄 Restarting Caddy..."
systemctl restart caddy
systemctl enable caddy

echo "✅ Caddy configured and running"
systemctl status caddy --no-pager
ENDSSH

echo ""
echo "✅ Caddy setup complete!"
echo ""
echo "📝 Next steps:"
echo "  1. Add DNS A record: foreman.zeon.eco -> 207.154.246.112"
echo "  2. Wait for DNS propagation (1-5 minutes)"
echo "  3. Test: curl https://foreman.zeon.eco/health"
echo ""
echo "  Caddy will automatically get SSL certificate from Let's Encrypt once DNS is set up."

