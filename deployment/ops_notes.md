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
- Set `REMOTE` or `BRANCH` environment variables to override the default remote/branch. Provide `REMOTE_URL` if the remote is not already configured (useful on fresh devices).
- If you want to delete untracked files while keeping ignored folders intact, set `CLEAN_UNTRACKED=true` before running the script.
