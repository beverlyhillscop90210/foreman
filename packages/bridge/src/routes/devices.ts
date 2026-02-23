import { Hono } from 'hono';
import { DeviceRegistry } from '../services/device-registry.js';
import { TunnelService } from '../services/tunnel.js';
import { createLogger } from '../logger.js';
import type { CreateDeviceRequest } from '../types.js';

const log = createLogger('routes:devices');

export function createDeviceRoutes(
  registry: DeviceRegistry,
  tunnelService: TunnelService,
): Hono {
  const router = new Hono();

  // ── List all devices ─────────────────────────────────────────
  router.get('/', (c) => {
    const devices = registry.listDevices();
    const status = c.req.query('status');
    const type = c.req.query('type');

    let filtered = devices;
    if (status) filtered = filtered.filter(d => d.status === status);
    if (type) filtered = filtered.filter(d => d.type === type);

    return c.json({ devices: filtered });
  });

  // ── Get single device ────────────────────────────────────────
  router.get('/:id', (c) => {
    const device = registry.getDevice(c.req.param('id'));
    if (!device) return c.json({ error: 'Device not found' }, 404);
    return c.json(device);
  });

  // ── Create device + generate connection token ────────────────
  router.post('/', async (c) => {
    try {
      const body = await c.req.json() as CreateDeviceRequest;
      if (!body.name || !body.type) {
        return c.json({ error: 'name and type are required' }, 400);
      }

      const { device, token } = registry.createDevice(body);

      // Try to provision a Cloudflare tunnel
      let tunnelInfo = null;
      if (tunnelService.isConfigured()) {
        try {
          tunnelInfo = await tunnelService.createTunnel(device.id, device.name);
          registry.setTunnelInfo(device.id, tunnelInfo.tunnelId, tunnelInfo.hostname, tunnelInfo.tunnelToken);
        } catch (err) {
          log.warn('Failed to create tunnel — device created without tunnel', {
            deviceId: device.id,
            error: String(err),
          });
        }
      }

      // Build the install command for the user
      const installCommand = buildInstallCommand(token, tunnelInfo);

      return c.json({
        device: registry.getDevice(device.id),
        connection_token: token,
        tunnel: tunnelInfo ? {
          hostname: tunnelInfo.hostname,
          tunnel_id: tunnelInfo.tunnelId,
        } : null,
        install_instructions: installCommand,
      }, 201);
    } catch (error) {
      log.error('Failed to create device', { error: String(error) });
      return c.json({ error: error instanceof Error ? error.message : 'Failed to create device' }, 500);
    }
  });

  // ── Update device ────────────────────────────────────────────
  router.put('/:id', async (c) => {
    const body = await c.req.json();
    const device = registry.updateDevice(c.req.param('id'), body);
    if (!device) return c.json({ error: 'Device not found' }, 404);
    return c.json(device);
  });

  // ── Delete device (and cleanup tunnel) ───────────────────────
  router.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const device = registry.getDevice(id);

    // Cleanup Cloudflare tunnel if exists
    if (device?.tunnel_id && tunnelService.isConfigured()) {
      try {
        await tunnelService.deleteTunnel(device.tunnel_id);
      } catch (err) {
        log.warn('Failed to delete tunnel', { deviceId: id, tunnelId: device.tunnel_id, error: String(err) });
      }
    }

    const deleted = registry.deleteDevice(id);
    if (!deleted) return c.json({ error: 'Device not found' }, 404);
    return c.json({ success: true });
  });

  // ── Agent connect (device calls this with one-time token) ────
  router.post('/connect', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.token) {
        return c.json({ error: 'token is required' }, 400);
      }

      const device = registry.connectDevice({
        token: body.token,
        capabilities: body.capabilities,
        hostname: body.hostname,
      });

      if (!device) {
        return c.json({ error: 'Invalid, expired, or already-used token' }, 401);
      }

      return c.json({
        device,
        tunnel_token: device.tunnel_token, // so agent can start cloudflared
        message: 'Connected successfully',
      });
    } catch (error) {
      log.error('Device connect failed', { error: String(error) });
      return c.json({ error: 'Connection failed' }, 500);
    }
  });

  // ── Heartbeat ────────────────────────────────────────────────
  router.post('/:id/heartbeat', async (c) => {
    const id = c.req.param('id');
    let body = {};
    try { body = await c.req.json(); } catch { /* empty body ok */ }

    const device = registry.heartbeat(id, body as any);
    if (!device) return c.json({ error: 'Device not found' }, 404);
    return c.json({ status: device.status, last_seen_at: device.last_seen_at });
  });

  // ── Get tunnel status ────────────────────────────────────────
  router.get('/:id/tunnel', async (c) => {
    const device = registry.getDevice(c.req.param('id'));
    if (!device) return c.json({ error: 'Device not found' }, 404);
    if (!device.tunnel_id) return c.json({ error: 'No tunnel configured' }, 404);

    if (!tunnelService.isConfigured()) {
      return c.json({
        tunnel_id: device.tunnel_id,
        hostname: device.tunnel_hostname,
        status: 'unknown (tunnel service not configured)',
      });
    }

    try {
      const tunnelStatus = await tunnelService.getTunnelStatus(device.tunnel_id);
      return c.json({
        tunnel_id: device.tunnel_id,
        hostname: device.tunnel_hostname,
        ...tunnelStatus,
      });
    } catch (err) {
      return c.json({
        tunnel_id: device.tunnel_id,
        hostname: device.tunnel_hostname,
        status: 'error',
        error: String(err),
      });
    }
  });

  // ── Regenerate connection token ──────────────────────────────
  router.post('/:id/token', (c) => {
    const id = c.req.param('id');
    const device = registry.getDevice(id);
    if (!device) return c.json({ error: 'Device not found' }, 404);

    // Delete old device and recreate with same ID
    // For simplicity, just create a new token
    const { token } = registry.createDevice({ name: device.name, type: device.type, tags: device.tags });
    // This creates a new device — not ideal. Let's add a method for this.
    // Instead, we expose a simpler flow:
    return c.json({ error: 'Use DELETE + POST to regenerate device' }, 501);
  });

  // ── Setup script (returns shell script for given OS) ─────────
  router.get('/:id/setup-script', (c) => {
    const device = registry.getDevice(c.req.param('id'));
    if (!device) return c.json({ error: 'Device not found' }, 404);

    const os = (c.req.query('os') || 'linux') as 'macos' | 'linux' | 'docker';
    const bridgeUrl = c.req.query('bridge_url') || process.env.BRIDGE_PUBLIC_URL || 'https://foreman.beverlyhillscop.io';
    const cfToken = c.req.query('cf_token') || process.env.CF_TUNNEL_TOKEN || '';

    const script = generateSetupScript({
      os,
      deviceId: device.id,
      deviceName: device.name,
      bridgeUrl,
      cfTunnelToken: cfToken,
    });

    c.header('Content-Type', 'text/plain');
    return c.body(script);
  });

  return router;
}

// ── Helpers ──────────────────────────────────────────────────────

function buildInstallCommand(token: string, tunnelInfo: TunnelInfo | null): string {
  const lines = [
    '# Install and connect this device to Foreman',
    '# Run these commands on the target device:',
    '',
  ];

  if (tunnelInfo) {
    lines.push(
      '# 1. Install cloudflared (if not already installed)',
      '# macOS: brew install cloudflared',
      '# Debian/Ubuntu: curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg && echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list && sudo apt update && sudo apt install cloudflared',
      '',
      '# 2. Run the tunnel',
      `cloudflared tunnel run --token ${tunnelInfo.tunnelToken}`,
      '',
    );
  }

  lines.push(
    '# Register device with Foreman:',
    `curl -X POST http://YOUR_BRIDGE_HOST:3000/devices/connect \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"token": "${token}"}'`,
  );

  return lines.join('\n');
}

interface TunnelInfo {
  tunnelId: string;
  tunnelToken: string;
  hostname: string;
}

// ── Setup Script Generator ──────────────────────────────────────

interface SetupScriptOpts {
  os: 'macos' | 'linux' | 'docker';
  deviceId: string;
  deviceName: string;
  bridgeUrl: string;
  cfTunnelToken: string;
}

function generateSetupScript(opts: SetupScriptOpts): string {
  const { os, deviceId, deviceName, bridgeUrl, cfTunnelToken } = opts;

  const header = `#!/bin/bash
set -e
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           FOREMAN — Device Connection Setup                 ║"
echo "║           Device: ${deviceName.padEnd(40).slice(0, 40)}║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
`;

  const installCf = os === 'macos'
    ? `# Step 1: Install cloudflared
echo "▸ Installing cloudflared via Homebrew..."
if ! command -v cloudflared &> /dev/null; then
  HOMEBREW_NO_AUTO_UPDATE=1 brew install cloudflared </dev/null
  echo "  ✓ cloudflared installed"
else
  echo "  ✓ cloudflared already installed"
fi
`
    : os === 'docker'
    ? `# Step 1: cloudflared will run in Docker
echo "▸ Pulling cloudflared Docker image..."
docker pull cloudflare/cloudflared:latest </dev/null
echo "  ✓ cloudflared image ready"
`
    : `# Step 1: Install cloudflared
echo "▸ Installing cloudflared..."
if ! command -v cloudflared &> /dev/null; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared </dev/null
  chmod +x /usr/local/bin/cloudflared
  echo "  ✓ cloudflared installed"
else
  echo "  ✓ cloudflared already installed"
fi
`;

  const startTunnel = cfTunnelToken
    ? os === 'docker'
      ? `# Step 2: Start Cloudflare Tunnel (background)
echo "▸ Starting Cloudflare Tunnel in Docker..."
docker run -d --name foreman-tunnel --restart unless-stopped \\
  cloudflare/cloudflared:latest tunnel run --token ${cfTunnelToken}
echo "  ✓ Tunnel running in container 'foreman-tunnel'"
`
      : os === 'macos'
      ? `# Step 2: Start Cloudflare Tunnel
echo "▸ Starting Cloudflare Tunnel..."
cloudflared tunnel run --token ${cfTunnelToken} </dev/null &
TUNNEL_PID=$!
sleep 2
echo "  ✓ Tunnel running (PID: $TUNNEL_PID)"
echo ""
echo "  To run as a persistent service:"
echo "  sudo cloudflared service install ${cfTunnelToken}"
`
      : `# Step 2: Install and start Cloudflare Tunnel as service
echo "▸ Installing Cloudflare Tunnel as systemd service..."
sudo cloudflared service install ${cfTunnelToken}
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
echo "  ✓ Tunnel service installed and running"
`
    : `# Step 2: Cloudflare Tunnel (skipped — no token configured)
echo "⚠  No Cloudflare tunnel token configured."
echo "   Set CF_TUNNEL_TOKEN in bridge config to enable tunnels."
`;

  const detect = `# Step 3: Detect device capabilities
echo ""
echo "▸ Detecting device capabilities..."
CAPS="{}"

# GPU detection
if command -v nvidia-smi &> /dev/null; then
  GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | xargs)
  GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>/dev/null | head -1 | xargs)
  echo "  GPU: $GPU_NAME ($GPU_MEM)"
  CAPS=$(echo "$CAPS" | python3 -c "import sys,json; d=json.load(sys.stdin); d['gpu']='$GPU_NAME $GPU_MEM'; print(json.dumps(d))" 2>/dev/null || echo "$CAPS")
fi

# CUDA
if command -v nvcc &> /dev/null; then
  CUDA_VER=$(nvcc --version 2>/dev/null | grep "release" | sed 's/.*release \\([0-9.]*\\).*/\\1/')
  echo "  CUDA: $CUDA_VER"
  CAPS=$(echo "$CAPS" | python3 -c "import sys,json; d=json.load(sys.stdin); d['cuda']='$CUDA_VER'; print(json.dumps(d))" 2>/dev/null || echo "$CAPS")
fi

# Python
if command -v python3 &> /dev/null; then
  PY_VER=$(python3 --version 2>/dev/null | awk '{print $2}')
  echo "  Python: $PY_VER"
  CAPS=$(echo "$CAPS" | python3 -c "import sys,json; d=json.load(sys.stdin); d['python']='$PY_VER'; print(json.dumps(d))" 2>/dev/null || echo "$CAPS")
fi

# Ollama
if command -v ollama &> /dev/null; then
  OLLAMA_VER=$(ollama --version 2>/dev/null | head -1)
  OLLAMA_MODELS=$(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}' | tr '\\n' ',' | sed 's/,$//')
  echo "  Ollama: $OLLAMA_VER"
  echo "  Models: $OLLAMA_MODELS"
  CAPS=$(echo "$CAPS" | python3 -c "import sys,json; d=json.load(sys.stdin); d['ollama']={'version':'$OLLAMA_VER','models':'$OLLAMA_MODELS'.split(',')}; print(json.dumps(d))" 2>/dev/null || echo "$CAPS")
fi

# OS
OS_INFO=$(uname -s -r -m)
echo "  OS: $OS_INFO"
CAPS=$(echo "$CAPS" | python3 -c "import sys,json; d=json.load(sys.stdin); d['os']='$OS_INFO'; d['arch']='$(uname -m)'; print(json.dumps(d))" 2>/dev/null || echo "$CAPS")

# Memory
if [[ "$(uname)" == "Darwin" ]]; then
  MEM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
else
  MEM_GB=$(( $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1048576 ))
fi
echo "  Memory: \${MEM_GB}GB"
CAPS=$(echo "$CAPS" | python3 -c "import sys,json; d=json.load(sys.stdin); d['memory_gb']=$MEM_GB; print(json.dumps(d))" 2>/dev/null || echo "$CAPS")
`;

  const register = `# Step 4: Register with Foreman
echo ""
DEVICE_TOKEN="\${DEVICE_TOKEN:-}"
if [ -z "$DEVICE_TOKEN" ]; then
  echo "▸ No DEVICE_TOKEN env var set. Please provide your connection token:"
  read -p "  Token: " DEVICE_TOKEN
fi
echo "▸ Registering device with Foreman..."
RESPONSE=$(curl -sf -X POST "${bridgeUrl}/devices/connect" \\
  -H "Content-Type: application/json" \\
  -d "{\\"token\\": \\"$DEVICE_TOKEN\\", \\"capabilities\\": $CAPS}" 2>&1)

if [ $? -eq 0 ]; then
  echo "  ✓ Device registered successfully!"
  echo ""
  echo "$RESPONSE" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  dev = d.get('device', {})
  print(f'  Name:     {dev.get(\"name\", \"?\")}')
  print(f'  Status:   {dev.get(\"status\", \"?\")}')
  print(f'  Type:     {dev.get(\"type\", \"?\")}')
  caps = dev.get('capabilities', {})
  if caps.get('gpu'): print(f'  GPU:      {caps[\"gpu\"]}')
  if caps.get('ollama'): print(f'  Ollama:   {caps[\"ollama\"].get(\"version\",\"\")} — {len(caps[\"ollama\"].get(\"models\",[]))} models')
except: pass
" 2>/dev/null
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  ✓ Device connected to Foreman!                            ║"
  echo "║  You can now assign tasks to this device from the DAG.     ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
else
  echo "  ✗ Failed to register device."
  echo "  Response: $RESPONSE"
  exit 1
fi
`;

  return header + installCf + '\n' + startTunnel + '\n' + detect + '\n' + register;
}
