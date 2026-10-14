#!/usr/bin/env bash
# Installs the Fantasy Map Generator fork on a Raspberry Pi (Raspberry Pi OS / Debian) and keeps it running as a service.
# Run it again to update. Then open  http://<pi-ip>:5173/Fantasy-Map-Generator/  from any device in the network.
set -euo pipefail

REPO="${FMG_REPO:-https://github.com/nekuro22/Fantasy-Map-Generator.git}"
DIR="${FMG_DIR:-$HOME/fantasy-map-generator}"
PORT="${FMG_PORT:-5173}"
API_PORT="${FMG_API_PORT:-5174}"
MAPS="${FMG_MAPS:-$HOME/fmg-maps}"
TOKEN_FILE="${FMG_TOKEN_FILE:-$HOME/.config/fmg/token}"
SERVICE="fmg"
API_SERVICE="fmg-api"

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
(cd tools/fmg-cli && npm ci --omit=dev --ignore-scripts)

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

say "API service $API_SERVICE on port $API_PORT (needs the token), maps in $MAPS"
mkdir -p "$MAPS"
node tools/fmg-cli/src/cli.js token >/dev/null   # makes the token file when missing (owner-only)
sudo tee "/etc/systemd/system/$API_SERVICE.service" >/dev/null <<UNIT
[Unit]
Description=Fantasy Map Generator API
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$DIR
Environment=FMG_TOKEN_FILE=$TOKEN_FILE
ExecStart=$(command -v node) $DIR/tools/fmg-cli/src/cli.js serve --dir $MAPS --port $API_PORT
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

# the "fmg" command for use on the Pi itself
sudo tee /usr/local/bin/fmg >/dev/null <<WRAP
#!/usr/bin/env bash
export FMG_TOKEN_FILE="\${FMG_TOKEN_FILE:-$TOKEN_FILE}"
exec "$(command -v node)" "$DIR/tools/fmg-cli/src/cli.js" "\$@"
WRAP
sudo chmod +x /usr/local/bin/fmg

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" "$API_SERVICE" >/dev/null
sudo systemctl restart "$SERVICE" "$API_SERVICE"
sleep 3
systemctl is-active "$SERVICE" "$API_SERVICE"

IP="$(hostname -I | awk '{print $1}')"
say "Done"
echo "App:    http://$IP:$PORT/Fantasy-Map-Generator/"
echo "API:    http://$IP:$API_PORT/api/health   (needs the token)"
echo "Token:  fmg token        (file $TOKEN_FILE)"
echo "Update: bash $DIR/tools/raspberry-pi/update.sh"
echo "From another computer:  FMG_URL=http://$IP:$API_PORT FMG_TOKEN=<token> fmg remote maps"
echo "Keep the API inside your home network or Tailscale; never forward the port to the internet."
