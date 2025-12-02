# Deployment and Runtime Notes

## Frontend build modes
- `npm run dev` starts the Vite development server with hot reload and the `/api` proxy; this is for local editing and does not produce build artifacts.
- `npm run build` generates the production bundle under `frontend/dist`, which is what gets served in deployments and by Nginx.
- `npm run preview` serves the previously built `dist` bundle locally using the same production build output so you can test the optimized assets without running the full dev server.

## Systemd service user and paths
- The sample `deployment/intarema.service` uses the default Raspberry Pi user and paths (`/home/pi/INTAREMA_TVEmicro`), but you can change `User` and `WorkingDirectory` to match your device (for example, `/home/rasparie/INTAREMA_TVEmicro`).
- Keep the `ExecStart` command pointing at the backend entrypoint (`app.py`) and ensure the chosen user owns the working directory so restarts succeed.

## Nginx configuration
- `deployment/nginx_intarema.conf` serves the built frontend bundle from `frontend/dist` at the site root and proxies `/api` requests to the backend on `http://127.0.0.1:5000`.
- Update the `root` path if your deployment directory differs from the default so that Nginx can find `index.html` and static assets.

## Updating the deployment from GitHub
- Run `deployment/update_from_github.sh` from anywhere inside the repository to fast-forward to the latest code on the configured remote without touching ignored directories like `frontend/node_modules` or `frontend/dist`.
- If you see `Permission denied` when executing the script directly (for example on a filesystem mounted without the exec flag), invoke it with `bash deployment/update_from_github.sh` or mark it executable with `chmod +x deployment/update_from_github.sh`.
- On fresh deployments that do not yet have a checked-out branch, the script now falls back to the remote's default branch after fetching. Set `BRANCH` explicitly if you need a different target.
- If the working tree has uncommitted changes but the repository has no commits yet, stash is not possible; clean or commit those changes before running the script.
- Set `REMOTE` or `BRANCH` environment variables to override the default remote/branch. If no `origin` exists and exactly one remote is configured, the script will use that remote automatically; otherwise provide `REMOTE` or `REMOTE_URL` when the remote is missing (useful on fresh devices).
- If you want to delete untracked files while keeping ignored folders intact, set `CLEAN_UNTRACKED=true` before running the script.
