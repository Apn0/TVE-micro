# PID Auto-Tuner Guide

The TVE-micro system includes a built-in **Ziegler-Nichols Relay Auto-Tuner** to automatically calculate optimal PID parameters for the heater zones. This tool eliminates manual guesswork and ensures stable temperature control.

## ⚠️ Safety Warning

**READ BEFORE TUNING:**
1.  **High Temperatures:** The tuning process will heat the zones to the specified setpoint. Ensure the machine is safe to operate at these temperatures.
2.  **Oscillations:** The tuner intentionally forces the temperature to oscillate above and below the setpoint. Small overshoots are expected.
3.  **Supervision:** Do not leave the machine unattended during tuning. If temperatures rise uncontrollably, use the **Physical Emergency Stop** or click **STOP TUNING** immediately.

## How It Works

The Auto-Tuner uses the **Relay Feedback Method**:
1.  It hijacks control of the selected heater zone (temporarily disabling the standard PID).
2.  It toggles the heater power between **0%** and **70%** (configurable via code) based on a setpoint crossing logic.
3.  It measures the **Amplitude** (temperature swing) and **Period** (time between peaks) of the resulting oscillation.
4.  It uses these measurements to calculate the **Ultimate Gain ($K_u$)** and **Ultimate Period ($P_u$)**.
5.  It applies the **Tyreus-Luyben** tuning rules to generate stable $K_p, K_i, K_d$ parameters.

*Note: Tyreus-Luyben is chosen over classic Ziegler-Nichols to prioritize stability and minimize overshoot, which is critical for polymer processing.*

## Step-by-Step Instructions

1.  **Navigate to the Heaters Tab**: Open the HMI and go to the "HEATERS" screen.
2.  **Select a Zone**: Click on the card for **Zone 1** (Barrel) or **Zone 2** (Nozzle) to expand it.
3.  **Start Tuning**:
    -   Click the **Auto-Tune** button.
    -   Confirm the dialog. The system will default to a tuning setpoint of **150°C**.
4.  **Monitor Progress**:
    -   The card will display a "TUNING..." status.
    -   Wait for approximately **3-5 oscillation cycles**. This may take 5-10 minutes depending on the thermal mass.
    -   You will see the temperature rise, cross the setpoint, fall, and rise again.
5.  **Apply Results**:
    -   When tuning is complete, the status will change to **DONE**.
    -   The calculated PID values ($K_p, K_i, K_d$) will be displayed.
    -   Click **APPLY SETTINGS** to save these values to the system configuration.
6.  **Verify**: The system will automatically revert to standard PID control using the new parameters.

## Troubleshooting

*   **Tuning Fails / Timeouts**: If the system cannot induce oscillation within 30 minutes, it will abort. Check if the heater power is sufficient or if the sensor is detached.
*   **"TEMP_DATA_STALE" Alarm**: Ensure sensors are reading correctly before starting.
*   **Oscillation Too Large**: The tuner uses a hysteresis of ±0.5°C. If your sensor is very noisy, it might trigger false cycles. Ensure sensor wiring is shielded.

## Configuration

Advanced users can adjust tuning parameters in `backend/autotune.py`:
-   `tune_power`: Default 70.0% (Duty cycle during heating phase).
-   `hysteresis`: Default 0.5°C (Noise band).
-   `cycles_required`: Default 3 (Number of full cycles to observe).
