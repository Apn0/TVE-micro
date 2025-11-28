# Deployment Instructions

It seems you are having trouble seeing the new features. This is likely due to one of three reasons:

1.  **Browser Caching:** The browser is holding onto the old version of the interface.
2.  **Missing Dependencies:** New Python or Node.js libraries were not installed.
3.  **Deployment Method:** Drag-and-dropping files can sometimes miss hidden files or overwrite configuration files you intended to keep (or fail to update ones you need).

## Quick Fix Steps

### 1. Update Code & Dependencies

Run these commands on your Raspberry Pi in a terminal:

```bash
# Navigate to your project folder
cd /path/to/your/project

# 1. Update Python dependencies (Backend)
pip install -r backend/requirements.txt

# 2. Update Node dependencies (Frontend)
cd frontend
npm install

# 3. Rebuild the frontend (if you are running in production mode)
# If you use 'npm run dev', you can skip this, but a restart is still needed.
npm run build
```

### 2. Restart Services

You mentioned you restarted `npm run dev` and `app.py`. Ensure they are stopped completely before starting them again.

**Backend:**
```bash
# Stop existing python process
pkill -f "python3 app.py"

# Start backend
cd /path/to/your/project/backend
python3 app.py
```

**Frontend (Dev Mode):**
```bash
# Stop existing vite process
pkill -f "vite"

# Start frontend
cd /path/to/your/project/frontend
npm run dev
```

### 3. Clear Browser Cache (Important!)

If you refresh the page and still see the old interface, your browser has cached the old Javascript files.

*   **Chrome/Firefox/Edge:** Press `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac) to do a "Hard Reload".
*   Or open the Developer Tools (`F12`), go to the **Network** tab, check "Disable cache", and refresh.

## Verification

Once reloaded, check for these specific new features to confirm you are on the latest version:

1.  **Wiring Calibration:**
    *   Go to the navigation menu on the left.
    *   Look for a new tab called **"WIRING CALIBRATION"**.
    *   If you see it, the update was successful.

2.  **Sequencing Config:**
    *   Go to the **"SETTINGS"** tab.
    *   Scroll down. You should see a section or button for **"Sequencing Configuration"** (often labeled "Configure Sequence").

3.  **GPIO Screen:**
    *   Go to the **"GPIO"** tab in the navigation menu.
    *   It should show a grid of pins with their status (High/Low) and Mode (Input/Output).

## Troubleshooting

*   **"SyntaxError" in Console:** I have fixed a critical syntax error in `frontend/src/App.jsx`. If you previously saw a blank screen or errors in the browser console (F12), this new update should fix it. Please re-copy `frontend/src/App.jsx` if you are dragging and dropping files individually.
*   **Missing Tabs:** If you don't see the new tabs in the sidebar, verify that `frontend/src/components/Nav.jsx` was updated correctly. It should contain `"WIRING CALIBRATION"` in the `tabs` list.
