# TVE-micro HMI

The **TVE-micro** is a specialized HMI (Human-Machine Interface) and control backend for an EREMA INTAREMA TVEmicro extruder. It features a React-based frontend for monitoring and control, and a Python Flask backend for hardware interfacing, PID control, and safety logic.

## Overview

This repository contains the complete source code for the control system:

- **Frontend**: A modern React/Vite single-page application (SPA) providing real-time data visualization, motor control, heater management, and system configuration.
- **Backend**: A Python Flask application that acts as the PLC logic. It manages GPIO, I2C sensors (ADS1115), PWM drivers (PCA9685), PID loops, and safety interlocks.

The system is designed to run on a Raspberry Pi but includes a simulation mode for development on non-hardware platforms (Windows/Linux/macOS).

## Prerequisites

- **Python 3.7+**
- **Node.js 16+** and **npm**
- **Raspberry Pi** (optional, for hardware control) with:
  - Enabled I2C and GPIO interfaces
  - `RPi.GPIO` and `smbus2` libraries

## Installation

### Backend Setup

1.  Navigate to the project root directory.
2.  Install Python dependencies:
    ```bash
    pip install -r backend/requirements.txt
    ```

### Frontend Setup

1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Install Node.js dependencies:
    ```bash
    npm install
    ```

## Usage

### Running the Application (Development)

You will typically run the backend and frontend in separate terminals.

1.  **Start the Backend**:
    From the `backend` directory (or project root):
    ```bash
    cd backend
    python3 app.py
    ```
    The server will start on `http://127.0.0.1:5000`. If hardware is not detected, it will default to **Simulation Mode**.

2.  **Start the Frontend**:
    From the `frontend` directory:
    ```bash
    cd frontend
    npm run dev
    ```
    The Vite dev server will start (usually on `http://localhost:3000`) and proxy API requests to the Flask backend.

### Running in Production

For deployment on the Raspberry Pi:

1.  Build the frontend:
    ```bash
    cd frontend
    npm run build
    ```
    This generates static files in `frontend/dist`.

2.  Configure Nginx (or another web server) to serve the `frontend/dist` files and reverse-proxy `/api` requests to the Flask application running on port 5000.

3.  Set up the Flask app as a systemd service to ensure it runs on boot.

## Project Structure

```
TVE-micro/
├── backend/                # Python Flask backend
│   ├── app.py              # Main entry point & API routes
│   ├── hardware.py         # HAL (Hardware Abstraction Layer)
│   ├── safety.py           # Safety limits & interlocks
│   ├── pid.py              # PID controller implementation
│   ├── logger.py           # CSV data logging
│   └── config.json         # System configuration (pins, PID, etc.)
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # UI components (screens, widgets)
│   │   ├── hooks/          # Custom React hooks
│   │   ├── App.jsx         # Main layout & router
│   │   └── main.jsx        # Entry point
│   └── vite.config.js      # Vite build config
├── docs/                   # Documentation files
└── README.md               # This file
```

## Testing

### Backend Tests

Run unit tests from the project root:

```bash
python3 -m unittest discover backend
```

This will run all tests matching `test_*.py` in the `backend/` directory.

### Frontend Verification

The repository includes Playwright tests for E2E verification. Run them from the `frontend` directory:

```bash
npx playwright test
```

## Documentation

- **User Guide**: `docs/user_guide.md`
- **API Reference**: `docs/api_reference.md`
- **Runbooks**: `docs/runbooks.md`
