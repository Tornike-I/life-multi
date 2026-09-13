#!/usr/bin/env bash
# See docs/hosting.md.
set -euo pipefail

host="${LIFE_MULTI_HOST:?set LIFE_MULTI_HOST, e.g. ubuntu@203.0.113.10}"
key="${LIFE_MULTI_SSH_KEY:-$HOME/.ssh/life-multi}"
ssh_opts=(-i "$key" -o StrictHostKeyChecking=accept-new)

cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted changes; commit or stash them first." >&2
  exit 1
fi

git fetch --quiet origin main
sha="$(git rev-parse --short=12 HEAD)"
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  read -r -p "HEAD ($sha) is not origin/main. Deploy anyway? [y/N] " answer
  [[ "$answer" == [yY] ]] || exit 1
fi

npm ci
npm run build

release="/opt/life-multi/releases/$sha"
echo "Uploading $sha to $host"
git archive --format=tar HEAD |
  ssh "${ssh_opts[@]}" "$host" "sudo rm -rf $release && sudo mkdir -p $release && sudo tar -x -C $release"
tar -c -C apps/client dist |
  ssh "${ssh_opts[@]}" "$host" "sudo tar -x -C $release/apps/client"

ssh "${ssh_opts[@]}" "$host" sudo bash -s -- "$sha" <<'REMOTE'
set -euo pipefail
sha="$1"
root=/opt/life-multi
release="$root/releases/$sha"

cd "$release"
npm ci --omit=dev --no-audit --no-fund

DOMAIN="$(. /etc/default/caddy && echo "$DOMAIN")" \
  caddy validate --config deploy/Caddyfile --adapter caddyfile
install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
install -m 644 deploy/life-multi.service /etc/systemd/system/life-multi.service

ln -sfn "$release" "$root/current.new"
mv -T "$root/current.new" "$root/current"

systemctl daemon-reload
systemctl enable --quiet life-multi
systemctl restart life-multi
systemctl reload caddy

healthy=0
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3001/health >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ $healthy -ne 1 ]]; then
  echo "life-multi did not become healthy" >&2
  journalctl -u life-multi -n 50 --no-pager >&2
  exit 1
fi

live="$(readlink -f "$root/current")"
ls -1dt "$root"/releases/* | tail -n +4 | while read -r old; do
  [[ "$old" == "$live" ]] || rm -rf "$old"
done

echo "Deployed $sha"
REMOTE
