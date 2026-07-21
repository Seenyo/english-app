# Oracle AI Bridge deployment

The Oracle VM pulls the public GitHub repository over its existing outbound
connection. GitHub Actions does not need SSH access, so port 22 can remain
restricted to the owner's current IP address.

## Install

Copy this directory to the VM, then run:

```sh
sudo ./install-deploy-automation.sh
```

The installer enables `english-ai-deploy.timer` and performs an initial check.
The timer checks `origin/main` about every five minutes with a small randomized
delay.

## Deployment guarantees

Before the live checkout changes, the candidate commit is installed and
validated in an isolated Git worktree under
`/var/lib/english-ai/deploy-staging`:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run security:client-boundary`

Frontend-only changes fast-forward the checkout without restarting the bridge.
Changes to `server/`, `shared/`, Node configuration, or package manifests stop
the bridge briefly, update dependencies, restart it, and require a successful
local `/health` response. A failed activation restores the previous commit,
reinstalls its dependencies, and restarts the previous version.

Supabase migrations are deliberately not applied by this automation. Apply and
verify migrations separately before merging code that depends on them.

## Operations

Run an immediate deployment check:

```sh
sudo systemctl start english-ai-deploy.service
```

Inspect the timer and recent deployment logs:

```sh
systemctl list-timers english-ai-deploy.timer
sudo journalctl -u english-ai-deploy.service -n 100 --no-pager
```

Pause or resume automatic checks:

```sh
sudo systemctl disable --now english-ai-deploy.timer
sudo systemctl enable --now english-ai-deploy.timer
```

The deployment checkout must remain clean. The deployer refuses to overwrite
local edits in `/opt/english-app`.
