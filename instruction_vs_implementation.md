# Instruction vs Implementation Review

This repository previously documented several fixes in `probable_failure_review.md`. The table below captures whether those instructions match the current backend implementation.

| Instruction from prior review | Current code status | Evidence |
| --- | --- | --- |
| **Config load now crashes on sensor parsing** — remove duplicate `_validate_sensor_section` and unreachable code in `load_config`. | **Resolved.** There is a single `_validate_sensor_section` helper, and `load_config` simply reads the JSON then passes it to `validate_config` without unreachable branches. | `_validate_sensor_section` has one definition and is used by `_validate_sensors`, while `load_config` returns `validate_config(raw_cfg)`.【F:backend/app.py†L176-L227】【F:backend/app.py†L355-L368】 |
| **REST update branches duplicate and conflict** — consolidate validation in `UPDATE_PID`, `SET_TEMP_SETTINGS`, and `SET_LOGGING_SETTINGS`. | **Resolved.** Each handler now performs a single validation/update path without duplicate legacy blocks. | The REST command handlers validate input once and immediately apply updates for PID, temp settings, and logging settings.【F:backend/app.py†L966-L1069】 |

## Summary
- Most previously documented issues are already fixed in the current backend code.
- Pending tasks have been moved to `docs/TODO.md`.

## Feature implementation verification (requested)
- **Keypad**: Frontend exposes a reusable keypad hook (`useKeypad`) that manages visibility, screen-position clamping, value state, and submission callbacks for numeric entry overlays. Home screen setpoint controls invoke `keypad.openKeypad` with the current field position and close the overlay after submission, ensuring keypad-driven edits are available and dismissed correctly. 【F:frontend/src/hooks/useKeypad.js†L4-L43】【F:frontend/src/components/HomeScreen.jsx†L114-L141】
- **Set point**: Setpoint entries are validated via `validateSetpoint`, which clamps keypad/string input to 0–450°C and rounds to one decimal. The Home screen updates local target state and sends a `SET_TARGET` command with both zones whenever a validated value is submitted, covering setpoint handling end-to-end. 【F:frontend/src/utils/validation.js†L3-L18】【F:frontend/src/components/HomeScreen.jsx†L119-L139】
- **GPIO config**: Backend `/api/control` processing includes a `GPIO_CONFIG` command that parses the requested pin/direction/pull values and calls `hal.configure_pin`, returning `GPIO_CONFIG_ERROR` on exceptions. This path verifies configurable GPIO setup exists and surfaces failure states. 【F:backend/app.py†L1130-L1138】
- **Wiring calibration**: The Wiring Calibration screen provides a checklist for heater, thermistor, motor, and fan wiring, tracking reviewed, safe-to-test, tested, and completion flags. It gates the final “Ready to proceed” action on all required checks during an active review session, confirming the wiring calibration workflow is implemented. 【F:frontend/src/components/WiringCalibrationScreen.jsx†L4-L207】
