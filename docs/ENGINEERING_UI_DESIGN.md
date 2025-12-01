# Engineering UI Design Pattern

## Philosophy
The Engineering UI style is designed for technicians and engineers who need dense, comprehensive access to system parameters. Unlike the "Operator" view (Metrics Cards), which focuses on high-level status and simple interactions, the Engineering view prioritizes:

*   **Information Density:** Showing multiple related parameters simultaneously.
*   **Direct Control:** Toggle switches, numerical inputs, and raw value displays.
*   **Hierarchy:** Organization from "General/System" (top) to "Low-level/Hardware" (bottom).
*   **Completeness:** Exposing parameters that might be hidden in the Operator view (e.g., PID constants, specific timeouts, pin assignments).

## Layout Structure

### 1. Root Container
*   Standard width (max 960px).
*   Central alignment.
*   Vertical scrolling.

### 2. Sections (Panels)
Each major subsystem (Heaters, Motors, I/O) gets a distinct panel.
*   **Header:** Clear title with optional subtitle describing scope.
*   **Content:** Grid or list layout.
    *   *Grid:* For collections of similar small inputs (e.g., PID Kp/Ki/Kd).
    *   *List:* For mixed controls (e.g., Enable toggle + Timeout input).

### 3. Controls
*   **Inputs:** Label + Input field (Number/Text).
*   **Toggles:** Label + Checkbox/Toggle switch.
*   **Actions:** Buttons for immediate effects (e.g., "Save Config", "Restart Service").
*   **Status:** Read-only indicators (e.g., "Connected", "Running").

## Proposed Structure for Settings Screen

1.  **General / System**
    *   Backend status (polling rate, uptime).
    *   Service controls (Restart, Stop).
    *   Logging configuration (Interval, Flush).

2.  **Process Control (The "Cycle")**
    *   Auto-start configuration.
    *   Timeouts and safety limits.
    *   Cold extrusion protection overrides.

3.  **Subsystems (Detailed)**
    *   **Heaters:** PID parameters, Max Duty, Safety cutoffs.
    *   **Motors:** RPM limits, Acceleration profiles, Drive settings (current/microsteps).
    *   **Cooling:** Fan logic, Peltier control curves.

4.  **Hardware / I/O**
    *   Pin assignments (GPIO BCM).
    *   Sensor calibration points.
    *   LED status behavior.

## Future Components
To maintain consistency, we should eventually create reusable React components:
*   `<ConfigSection title="" description="">`
*   `<SettingRow label="" unit="">`
*   `<ActionRow>`
