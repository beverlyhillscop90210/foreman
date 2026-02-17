# Foreman Bridge – Agent Briefing: Droplet Setup + Deployment

## Context

We have a DigitalOcean Droplet (Ubuntu 24.04, 2GB RAM, Frankfurt) and a GitHub repo. 
Your job is to set up the droplet and deploy the Foreman Bridge.

## Resources

- **GitHub Repo**: https://github.com/beverlyhillscop90210/foreman
- **Droplet**: Fresh Ubuntu 24.04, SSH access configured (same key as Zeon)
- **Droplet IP**: Check DigitalOcean dashboard

## Task 1: Droplet Setup

SSH into the droplet and install:

1. Node.js 22 LTS (via nodesource)
2. pnpm (global)
3. git, build-essential, curl, unzip, htop
4. Claude Code CLI: `npm install -g @anthropic-ai/claude-code`

Create a `foreman` user (don't run things as root):
- Home: `/home/foreman`
- Copy SSH keys from root
- Directories: `/home/foreman/repos/`, `/home/foreman/bridge/`

Clone the foreman repo:
```bash
su - foreman -c "git clone https://github.com/beverlyhillscop90210/foreman.git /home/foreman/repos/foreman"
```

## Task 2: Bridge Deployment

The bridge code is in `packages/bridge/`. Deploy it:

1. `cd /home/foreman/repos/foreman`
2. `pnpm install`
3. `pnpm --filter @foreman/bridge build`
4. Set up environment variables:
   - `ANTHROPIC_API_KEY` – needed for Opus review calls (ask Peter for the key)
   - `FOREMAN_AUTH_TOKEN` – generate a random token: `openssl rand -hex 32`
   - `PORT` – default 3000
5. Run with a process manager (pm2 or systemd)

### Systemd Service

Create `/etc/systemd/system/foreman-bridge.service`:
```ini
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
Environment=FOREMAN_AUTH_TOKEN=<generated_token>
Environment=ANTHROPIC_API_KEY=<peters_key>

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
systemctl enable foreman-bridge
systemctl start foreman-bridge
```

## Task 3: Reverse Proxy + SSL

Set up Caddy (simpler than nginx) for HTTPS:

```bash
apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:
```
foreman.beverlyhillscop.io {
    reverse_proxy localhost:3000
}
```

Peter needs to add a DNS A record for `foreman.beverlyhillscop.io` pointing to the droplet IP.

Restart Caddy:
```bash
systemctl restart caddy
```

Caddy handles SSL automatically via Let's Encrypt.

## Task 4: Verify

After deployment, verify:

1. `curl http://localhost:3000/health` returns OK
2. `curl https://foreman.beverlyhillscop.io/health` returns OK (after DNS propagation)
3. Test auth: `curl -H "Authorization: Bearer <token>" https://foreman.beverlyhillscop.io/tasks`

## Task 5: Dashboard (if bridge is done)

Build the PWA dashboard in `packages/dashboard/`:
- Vite + React + Tailwind CSS
- Mobile-first design
- Pages:
  - **Task Feed**: live list of tasks with status (pending/running/review/done)
  - **Task Detail**: briefing, scope, agent output, diff
  - **Diff Review**: syntax-highlighted diff with approve/reject buttons
- Connect to Bridge API via WebSocket for real-time updates
- Deploy to Cloudflare Pages or serve from the same droplet

## Scope

You may ONLY work in:
- The foreman repo (`/home/foreman/repos/foreman/`)
- Droplet system config (`/etc/systemd/`, `/etc/caddy/`)

Do NOT touch any other repos or services on the droplet.

## Verification Before Done

- [ ] Droplet has Node.js 22, pnpm, git, Claude Code CLI
- [ ] foreman user exists with correct permissions
- [ ] Foreman repo cloned
- [ ] Bridge builds and runs
- [ ] Systemd service running
- [ ] HTTPS via Caddy working (after DNS)
- [ ] Health endpoint responding
- [ ] Auth token working
