# Hosting

The public game runs on one AWS Lightsail instance (Ubuntu 24.04). [Caddy](https://caddyserver.com) serves the built client, handles HTTPS, and proxies `/ws` and `/health` to the Node server, which runs under systemd as the `life-multi` user.

The server keeps the whole game in memory and in one SQLite file, so it runs as a single instance with local disk. Don't put it behind a load balancer or run more than one copy.

| On the instance                     | What                                   |
| ----------------------------------- | -------------------------------------- |
| `/opt/life-multi/releases/<sha>`    | One directory per deploy (last 3 kept) |
| `/opt/life-multi/current`           | Symlink to the live release            |
| `/var/lib/life-multi/life-multi.db` | Game database                          |
| `/etc/default/caddy`                | `DOMAIN` used by the Caddyfile         |
| `deploy/life-multi.service`         | Installed to `/etc/systemd/system/`    |
| `deploy/Caddyfile`                  | Installed to `/etc/caddy/Caddyfile`    |

## One-time setup

### AWS CLI

Use a dedicated profile so commands never hit another account:

```sh
aws login --profile life-multi --region eu-central-1
aws sts get-caller-identity --profile life-multi
```

The commands below assume `--profile life-multi --region eu-central-1`.

### Instance

```sh
ssh-keygen -t ed25519 -C life-multi-lightsail -f ~/.ssh/life-multi
aws lightsail import-key-pair --key-pair-name life-multi --public-key-base64 file://~/.ssh/life-multi.pub
aws lightsail create-instances --instance-names life-multi --availability-zone eu-central-1a \
  --blueprint-id ubuntu_24_04 --bundle-id micro_3_0 --key-pair-name life-multi \
  --add-ons addOnType=AutoSnapshot
aws lightsail allocate-static-ip --static-ip-name life-multi-ip
aws lightsail attach-static-ip --static-ip-name life-multi-ip --instance-name life-multi
aws lightsail put-instance-public-ports --instance-name life-multi --port-infos \
  fromPort=22,toPort=22,protocol=tcp,cidrs=<your-ip>/32 \
  fromPort=80,toPort=80,protocol=tcp \
  fromPort=443,toPort=443,protocol=tcp
```

Port 3001 stays closed. Only Caddy talks to the game server.

### Domain

Point the domain at the static IP. For a DuckDNS subdomain, set its IP on duckdns.org. For a registered domain, add an A record.

### Bootstrap the server

```sh
scp -i ~/.ssh/life-multi deploy/setup.sh ubuntu@<static-ip>:
ssh -i ~/.ssh/life-multi ubuntu@<static-ip> sudo DOMAIN=<domain> bash setup.sh
```

This installs Node 22 and Caddy and creates the `life-multi` user and directories. Running it again is safe.

## Deploy

From an up-to-date `main`, in Git Bash:

```sh
LIFE_MULTI_HOST=ubuntu@<static-ip> scripts/deploy.sh
```

The script builds the client locally, uploads the commit and the built client, installs the systemd unit and Caddyfile, switches `current` to the new release, restarts the server, and waits for `/health`. Players see "disconnected, retrying…" for a second or two and then reconnect on their own. Set `LIFE_MULTI_SSH_KEY` if your key isn't at `~/.ssh/life-multi`.

## Operations

On the instance (`ssh -i ~/.ssh/life-multi ubuntu@<static-ip>`):

| Task          | Command                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server logs   | `journalctl -u life-multi -f`                                                                                                                                                                          |
| Caddy logs    | `journalctl -u caddy -f`                                                                                                                                                                               |
| Roll back     | `sudo ln -sfn /opt/life-multi/releases/<sha> /opt/life-multi/current && sudo systemctl restart life-multi`                                                                                             |
| Admin tool    | `cd /opt/life-multi/current/apps/server && sudo -u life-multi DATABASE_PATH=/var/lib/life-multi/life-multi.db node --experimental-strip-types --disable-warning=ExperimentalWarning src/admin.ts list` |
| Change domain | Edit `DOMAIN` in `/etc/default/caddy`, then `sudo systemctl restart caddy`                                                                                                                             |

### Backups

Lightsail takes an automatic snapshot of the instance every day. To restore one, create a new instance from the snapshot and move the static IP to it with `attach-static-ip`.
