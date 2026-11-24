# SNCK Panel · Node.js edition

A premium, pure-black game-server and VPS management panel built with **Node.js + Express + TypeScript** and **React + Vite**. It manages Minecraft servers through Docker, either on the panel host or on remote VPS nodes running the bundled agent.

> This repository is the Node.js implementation. The PHP/Laravel panel lives in the original [SnckBoy/snck-panel](https://github.com/SnckBoy/snck-panel) repository and is not part of this one.

## One-command install

On a fresh Ubuntu 20.04+/Debian 11+ host:

```bash
curl -fsSL https://raw.githubusercontent.com/SnckBoy/snck-panel.js/main/install.sh | sudo bash
```

The installer opens a menu:

1. Install panel
2. Update panel
3. Service control (start / stop / restart / logs)
4. Create or reset a user
5. Diagnostics
6. Install Docker (needed to host Minecraft servers locally)
7. Uninstall

The install path is `/opt/snck-panel`, the systemd service is `snck-panel`, and the default port is `6767`. Open `http://SERVER_IP:6767/setup` to create the Owner account.

Non-interactive install: `curl ... | sudo SNCK_NONINTERACTIVE=1 bash`.

## Manual development

```bash
npm ci
cp .env.example .env          # set JWT_SECRET, NODE_ENCRYPTION_KEY, NODE_AUTH_SECRET
npm run dev                   # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Environment

Required:

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs session tokens (at least 16 characters; 32+ recommended) |
| `NODE_ENCRYPTION_KEY` | Encrypts stored node credentials |
| `NODE_AUTH_SECRET` | Local node bootstrap secret |

Common optional values: `PORT` (default `6767`), `HOST`, `PANEL_URL`, `PANEL_ALLOWED_ORIGINS`, `SFTP_PORT`, `DOCKER_SOCKET_PATH`, `NODE_HEARTBEAT_TIMEOUT_MS`. See [.env.example](.env.example). Never commit a real `.env`.

## Connecting a VPS node

1. Install the panel and make it reachable from the VPS over HTTP(S).
2. Open **Nodes → New node**, complete the wizard and copy the generated command.
3. Run it as root on Ubuntu 20.04+/Debian 11–13. It installs Docker and Node.js, downloads the agent from the panel, exchanges the one-time token for a credential, and starts `shironex-node` with systemd.
4. The node shows **ONLINE** only after an authenticated heartbeat. If it stays offline, check `systemctl status shironex-node` and `journalctl -u shironex-node`.

Setup tokens are random, stored as hashes, expire, and can be used once. A node is never marked online just because a token was issued.

## How Minecraft servers run

Server creation uses Docker images from the `itzg` project (`itzg/minecraft-server`, or `itzg/bungeecord` for proxies) with a per-server random RCON password, resource limits, a bound port and a persistent server directory. Containers are created on the selected node: the panel host's Docker socket for local nodes, or the remote agent for VPS nodes. Docker must be installed and reachable, otherwise creation fails with an explicit error.

## Useful commands

```bash
sudo systemctl status snck-panel
sudo journalctl -u snck-panel -f
cd /opt/snck-panel && sudo -u snck env HOME=/var/lib/snck npm run createuser
```

## Verification

```bash
npm run lint        # TypeScript
npm test            # theme, Discord and node lifecycle suites
npm run build
PANEL_URL=http://127.0.0.1:3000 node scripts/verify-redesign.mjs
```

## Security notes

- Secrets live only in `.env` (mode 600, gitignored) and are never sent to the browser.
- Registration tokens are hashed and single-use; node credentials are encrypted at rest.
- Server actions enforce ownership/role checks, maintenance gating and input validation.
- Put the panel behind HTTPS (reverse proxy or Cloudflare Tunnel) before exposing it publicly.
