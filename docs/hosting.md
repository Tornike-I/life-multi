# Hosting

The public game runs on one AWS Lightsail instance (Ubuntu 24.04). [Caddy](https://caddyserver.com) serves the built client, handles HTTPS, and proxies `/ws` and `/health` to the Node server, which runs under systemd as the `life-multi` user.

The server keeps the whole game in memory and in one SQLite file, so it runs as a single instance with local disk. Don't put it behind a load balancer or run more than one copy.

| On the instance                     | What                                   |
| ----------------------------------- | -------------------------------------- |
| `/opt/life-multi/releases/<sha>`    | One directory per deploy (last 3 kept) |
| `/opt/life-multi/current`           | Symlink to the live release            |
| `/var/lib/life-multi/life-multi.db` | Game database                          |
| `/var/lib/life-multi/backups`       | Pre-deploy snapshots (last 10 kept)    |
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
aws lightsail create-instances --instance-names life-multi-server --availability-zone eu-central-1a \
  --blueprint-id ubuntu_24_04 --bundle-id micro_3_0 --key-pair-name life-multi \
  --add-ons addOnType=AutoSnapshot
aws lightsail allocate-static-ip --static-ip-name life-multi-ip
aws lightsail attach-static-ip --static-ip-name life-multi-ip --instance-name life-multi-server
aws lightsail put-instance-public-ports --instance-name life-multi-server --port-infos \
  fromPort=22,toPort=22,protocol=tcp,cidrs=0.0.0.0/0 \
  fromPort=80,toPort=80,protocol=tcp \
  fromPort=443,toPort=443,protocol=tcp
```

Port 3001 stays closed. Only Caddy talks to the game server.

Port 22 is open to every address because the deploy workflow connects from GitHub's runners, whose addresses change constantly and are not published as a list worth pinning. An SSH key is then the only thing guarding it, so confirm the instance refuses passwords:

```sh
ssh -i ~/.ssh/life-multi ubuntu@<static-ip> sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin)'
```

Both should read `no`. Narrow port 22 back to `<your-ip>/32` if you ever drop the workflow and go back to deploying by hand.

### Domain

Point the domain at the static IP. For a DuckDNS subdomain, set its IP on duckdns.org. For a registered domain, add an A record.

### Bootstrap the server

```sh
scp -i ~/.ssh/life-multi deploy/setup.sh ubuntu@<static-ip>:
ssh -i ~/.ssh/life-multi ubuntu@<static-ip> sudo DOMAIN=<domain> bash setup.sh
```

This installs Node 22 and Caddy and creates the `life-multi` user and directories. Running it again is safe.

## Deploy

Deploys never touch `/var/lib/life-multi`, so the board survives them. The server also saves the world on `SIGTERM` before systemd restarts it, and the database is snapshotted first (see [Backups](#backups)). Players see "disconnected, retrying…" for a second or two and then reconnect on their own.

Either route runs the same `scripts/deploy.sh`: it builds the client, uploads the commit and the built client, installs the systemd unit and Caddyfile, switches `current` to the new release, snapshots the database, restarts the server, and waits for `/health`. A release that never answers `/health` fails the deploy and leaves the logs in the output; `current` has already moved, so roll back with the command under [Operations](#operations).

### From GitHub

Actions → **Deploy** → **Run workflow**. It always deploys the tip of `main`, whatever branch the button is pressed from, and only one deploy runs at a time.

Nothing gates the button beyond branch protection on `main`, so check that CI is green on the commit you're shipping.

### From your machine

From an up-to-date `main`, in Git Bash:

```sh
LIFE_MULTI_HOST=ubuntu@<static-ip> scripts/deploy.sh
```

Set `LIFE_MULTI_SSH_KEY` if your key isn't at `~/.ssh/life-multi`. The script asks before deploying anything that isn't `origin/main`; `LIFE_MULTI_ASSUME_YES=1` skips that prompt, which is what the workflow uses.

### Secrets the workflow needs

Three repository secrets, all set once. They assume port 22 is open to every address, as set under [Instance](#instance).

Give Actions its own key rather than reusing yours, so it can be revoked on its own:

```sh
ssh-keygen -t ed25519 -C life-multi-deploy -f ~/.ssh/life-multi-deploy -N ""
ssh -i ~/.ssh/life-multi ubuntu@<static-ip> \
  "umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys" \
  < ~/.ssh/life-multi-deploy.pub
```

Read the host key over that trusted connection rather than `ssh-keyscan`, which would trust whatever answers:

```sh
ssh -i ~/.ssh/life-multi ubuntu@<static-ip> cat /etc/ssh/ssh_host_ed25519_key.pub |
  awk '{ print "<static-ip> " $1 " " $2 }' > /tmp/life-multi-known-hosts
```

```sh
gh secret set LIFE_MULTI_SSH_KEY < ~/.ssh/life-multi-deploy
gh secret set LIFE_MULTI_KNOWN_HOSTS < /tmp/life-multi-known-hosts
gh secret set LIFE_MULTI_HOST --body "ubuntu@<static-ip>"
```

| Secret                   | What                                               |
| ------------------------ | -------------------------------------------------- |
| `LIFE_MULTI_SSH_KEY`     | Private half of the deploy key                     |
| `LIFE_MULTI_KNOWN_HOSTS` | The instance's host key; the deploy fails if unset |
| `LIFE_MULTI_HOST`        | `ubuntu@<static-ip>`                               |

The workflow runs in the `production` environment, so required reviewers can be added there to make deploys need an approval.

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

Every deploy snapshots the database to `/var/lib/life-multi/backups/<utc-timestamp>-<sha>.db` just before restarting the server, keeping the last 10. It uses SQLite's `VACUUM INTO` (`deploy/snapshot.mjs`), so the snapshot is consistent and includes writes still sitting in the write-ahead log. A snapshot that fails only warns; it doesn't stop the deploy.

To restore one, stop the server first, and delete the stale `-wal` and `-shm` alongside the database:

```sh
sudo systemctl stop life-multi
sudo install -o life-multi -g life-multi -m 644 \
  /var/lib/life-multi/backups/<file>.db /var/lib/life-multi/life-multi.db
sudo rm -f /var/lib/life-multi/life-multi.db-wal /var/lib/life-multi/life-multi.db-shm
sudo systemctl start life-multi
```

Lightsail also takes an automatic snapshot of the whole instance every day. To restore one, create a new instance from the snapshot and move the static IP to it with `attach-static-ip`.
