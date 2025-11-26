# INTAREMA TVEmicro HMI User Guide

This guide walks operators, maintainers, and new teammates through the INTAREMA TVEmicro HMI. It covers getting connected, running extrusion safely, and onboarding flows for new users.

## Prerequisites
- Raspberry Pi (PLC) running the backend service (`backend/app.py`) and wired to the machine I/O.
- Network access to the HMI host over the plant LAN.
- Configured `config.json` on the Pi with accurate pin, PWM, sensor, and DM556 driver settings.
- Safety devices (emergency stop, limit switches, interlocks) verified as functional.

## Connecting to the system
1. Start the backend service on the Pi: `python backend/app.py` (runs on `0.0.0.0:5000`).
2. Open the HMI frontend on desktop or mobile; it uses the REST API endpoints served by the backend.
3. Confirm the status banner reads **READY** and no alarm message is latched.

## Status and terminology
- **Statuses**: `READY` (idle), `RUNNING` (control loop active), `STOPPING` (sequenced stop in progress), `ALARM` (latched fault).
- **Modes**: `AUTO` (PID temperature control active) vs `MANUAL` (direct heater duty and motor control allowed).
- **Sensors**: `t1`, `t2`, `t3`, and `motor` temperatures; displayed with the configured decimal precision.
- **Actuators**: Z1/Z2 heaters (0–100% duty), main and feed motors (±5000 RPM), relays (`fan`, `pump`), and optional PWM channels.

## Running an extrusion cycle (AUTO mode)
1. **Set temperature targets**: Enter desired `z1` and `z2` temperatures. The backend clamps invalid inputs and rejects non-finite values.
2. **Preheat**: Wait for sensors to reach targets. The system enforces freshness checks before starting motors.
3. **Start sequence**: Trigger the start command. The sequencer applies the configured feed delay (`extruder_sequence.start_delay_feed`) before enabling the feed motor.
4. **Monitor**: Watch temperatures, motor RPMs, and relay states. An alarm latches if temperatures go stale or safety guards reject a command.
5. **Stop sequence**: Use the stop control. The sequencer honors `extruder_sequence.stop_delay_motor` to let heaters and relays settle.

## Manual operations (MANUAL mode)
- **Heaters**: Use `SET_HEATER` to drive Z1/Z2 directly (0–100% duty). The UI should surface this for maintenance only.
- **Motors**: Send `SET_MOTOR` with `main` or `feed` and an RPM. Commands above ±5000 RPM or issued while temperature data is stale are rejected.
- **Relays**: Toggle `fan` and `pump`; rapid toggles within 0.25 s are rejected to protect hardware.
- **PWM outputs**: Adjust auxiliary channels if configured; duty is clamped to 0–100%.

## Clearing alarms
1. Identify the alarm message on the banner.
2. If the physical emergency button is engaged, release/reset it first; `CLEAR_ALARM` is rejected while it is pressed.
3. Use the **Clear Alarm** action. Outputs are shut down and state resets to `READY`.
4. Re-run prechecks and start the process when safe.

## Onboarding flows
- **New operators**
  - Walk through the status panel, start/stop buttons, and alarm banner.
  - Demonstrate normal start/stop and a simulated alarm (e.g., stale temperature) so they can recognize lockouts.
  - Review daily checks: sensor readings present, fan/pump relays respond, and emergency stop tested.
- **New maintainers**
  - Review `config.json` layout (pins, PWM, sensors, DM556, temp/logging defaults) and how to persist changes via `SAVE_CONFIG`.
  - Practice updating PID gains with `UPDATE_PID` and validating that changes take effect.
  - Exercise GPIO tools (`GPIO_CONFIG`, `GPIO_WRITE/READ`) for wiring validation.
- **Environment setup**
  - Install Python dependencies (`backend/requirements.txt`) and ensure I2C/SPI permissions are present.
  - Configure systemd or a supervisor to auto-start `backend/app.py` on boot and to call `shutdown()` cleanly on stop.

## Troubleshooting checklist
- **No temperatures shown**: Verify ADC and sensor wiring; ensure `adc.enabled` and sensor channels are enabled in `config.json`.
- **Commands rejected as `TEMP_DATA_STALE`**: Confirm the polling interval and sensor freshness (`temp_settings.poll_interval`) and inspect sensor cabling.
- **Relays do not toggle**: Check debounce intervals and confirm the pin assignments in `config.json` match wiring.
- **Cannot clear alarm**: Ensure emergency button is released; reissue `CLEAR_ALARM` and confirm the backend log is clean.
