#!/usr/bin/env bash
# Installs the Fantasy Map Generator fork on a Raspberry Pi (Raspberry Pi OS / Debian) and keeps it running as a service.
# Run it again to update. Then open  http://<pi-ip>:5173/Fantasy-Map-Generator/  from any device in the network.
set -euo pipefail

REPO="${FMG_REPO:-https://github.com/nekuro22/Fantasy-Map-Generator.git}"
DIR="${FMG_DIR:-$HOME/fantasy-map-generator}"
PORT="${FMG_PORT:-5173}"
SERVICE="fmg"

say() { printf '\n== %s\n' "$*"; }

say "Node.js 20 or newer"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg git
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
command -v git >/dev/null || sudo apt-get install -y git
node -v

say "Fetching the code into $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$DIR"
fi

say "Installing packages (a few minutes on a Pi)"
cd "$DIR"
npm ci --ignore-scripts

say "Building (needs memory: a swap file helps on a Pi with 2 GB or less)"
NODE_OPTIONS="--max-old-space-size=2048" npm run build

say "Service $SERVICE on port $PORT"
sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null <<UNIT
[Unit]
Description=Fantasy Map Generator
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$DIR
ExecStart=$(command -v npx) vite preview --host 0.0.0.0 --port $PORT --strictPort
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null
sudo systemctl restart "$SERVICE"
sleep 3
systemctl is-active "$SERVICE"

IP="$(hostname -I | awk '{print $1}')"
say "Done: http://$IP:$PORT/Fantasy-Map-Generator/"
