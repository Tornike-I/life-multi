#!/usr/bin/env bash
# See docs/hosting.md.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
domain="${DOMAIN:?run as: sudo DOMAIN=<domain> bash setup.sh}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https

if [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" != 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if [[ ! -f /etc/apt/sources.list.d/caddy-stable.list ]]; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    >/etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
fi
apt-get install -y caddy

id life-multi >/dev/null 2>&1 ||
  useradd --system --no-create-home --home-dir /var/lib/life-multi --shell /usr/sbin/nologin life-multi
mkdir -p /opt/life-multi/releases

echo "DOMAIN=$domain" >/etc/default/caddy
mkdir -p /etc/systemd/system/caddy.service.d
cat >/etc/systemd/system/caddy.service.d/life-multi.conf <<'EOF'
[Service]
EnvironmentFile=/etc/default/caddy
EOF
systemctl daemon-reload
systemctl restart caddy

echo "Setup done for $domain. Deploy with scripts/deploy.sh."
