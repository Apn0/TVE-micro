# Regression & Test Execution Plan

## Scope and Objectives
- Cover HMI core flows (navigation, heater/motor control, safety alarms) exposed through the SPA and `/api/control` backend.
- Validate edge cases and guardrails to prevent unsafe GPIO, heater, or motor operations.
- Exercise integrations (logging, GPIO utilities) and telemetry updates exposed by `/api/status` and `/api/data`.

## Regression Checklist

### Core User Flows
| Area | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| Navigation & connection | Load SPA and wait for status polling | Open client; confirm `/api/status` polling populates data; switch between Home, Motor, Heaters, Sensors, History, Test, GPIO, Wiring Calibration, and Settings views. | App shows "Backend: connected" and view-specific content without errors; history buffer fills over time. |
| Heater targets | Adjust Z1/Z2 setpoints from Home/Heaters | Tap setpoint, enter value via keypad overlay, send `SET_TARGET`. | Target updates in UI and persists in next `/api/status` response. |
| Heater duty (manual) | Issue `SET_HEATER` for z1/z2 | From Heater/Test screens trigger manual duty update. | Duty accepted when within 0–100%; relay/duty state updates. |
| Motor RPM | Start/stop main & feed motors | Use Motor screen controls to send `SET_MOTOR` with positive/zero RPM. | Valid RPM commands update state; invalid or over-temp requests are rejected with alarm when applicable. |
| Relay toggles | Toggle fan/pump relays | From Motor/Test, send `SET_RELAY` toggle. | State flips with debounce respected; repeat commands within debounce rejected gracefully. |
| PWM outputs | Adjust PWM channel | Send `SET_PWM_OUTPUT` for valid channel. | Duty applied and stored in state when temps are fresh. |
| Motion steps | Jog motor steps | Use I/O Test to send `MOVE_MOTOR_STEPS` and optional `STOP_MANUAL_MOVE`. | Motor moves specified steps; stop command halts motion. |
| Mode switching | Switch AUTO/MANUAL | Send `SET_MODE` from Settings. | Mode changes and is reflected in subsequent status payloads. |
| Alarm handling | Trigger and clear alarm | Invoke `EMERGENCY_STOP`, then issue `CLEAR_ALARM` once emergency button is not active. | Status becomes `ALARM` with message, outputs off; clear transitions to READY and resets safety. |

### Edge Cases & Validation
| Area | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| Invalid heater duty | Send duty <0 or >100 | POST `SET_HEATER` with out-of-range duty. | Request rejected with 400 and `INVALID_DUTY`. |
| Invalid motor params | Send non-numeric or oversized RPM | POST `SET_MOTOR` with invalid rpm or motor name. | 400 with `INVALID_RPM`/`INVALID_MOTOR`; motors remain unchanged. |
| Stale temperature data | Start motor with stale temps | Manipulate temp freshness to fail `_temps_fresh`. | Command rejected with freshness reason; state not updated. |
| Relay spam | Rapid toggling | Send rapid `SET_RELAY` within debounce window. | API returns `RELAY_DEBOUNCE`; relay state unchanged. |
| GPIO misuse | Bad pin/value | Call `/api/gpio` with invalid pin/value or unknown command. | 400 with `INVALID_PIN_OR_VALUE` or `UNKNOWN_GPIO_COMMAND`. |
| Sequence updates | Negative delays | POST `UPDATE_EXTRUDER_SEQ` with negative delay. | Rejected with `INVALID_SEQUENCE`; config unchanged. |
| PID/pin updates | Invalid PID gains or pins | Submit malformed PID or pin payloads. | Validation errors surfaced; defaults preserved. |

### Integrations
| Area | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| Status/data streaming | Poll `/api/status` and `/api/data` | Hit endpoints repeatedly while toggling devices. | Responses include latest state, temps, motors, relays, mode, and timestamps. |
| Logging control | Start/stop logging | POST `/api/log/start` then `/api/log/stop`. | Logger transitions without errors and reports `success: true`. |
| GPIO utility screen | Read/write GPIO | From GPIO screen, fetch status then set pin mode/value. | Valid commands update pin state; invalid inputs rejected per validation. |

## Test Pass Schedule
| Pass | Platforms/Browsers | Scope | Owner | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| P1 Smoke | Desktop Chrome/Firefox (Linux), mobile Chrome (Android) | Navigation, status polling, heater/motor happy paths | QA | Planned | Run against latest main build. |
| P2 Regression | Desktop Chrome/Edge (Windows), Safari (iOS), Firefox (Linux) | Full regression checklist across flows and edge cases | QA | Planned | Prioritize safety/guardrail scenarios. |
| P3 Integration | Raspberry Pi hardware + SPA (Chromium kiosk) | GPIO, PWM, relay, motor step commands with hardware-in-loop | QA + HW | Planned | Requires hardware availability; log results. |
| P4 Fix verification | Targeted across affected platforms | Re-test defects after fixes land | QA | Pending | Scenarios linked to issue IDs. |

## Defect Tracking & Closure
- Log issues in the tracker with reproduction steps, environment, expected vs. actual, and impacted API commands/screens.
- Prioritize: **P0** safety blocking (heaters/motors uncontrolled, alarms not clearing), **P1** core flow breakage, **P2** minor/UI or logging gaps.
- For each fix, add test-case references and move issue to "Ready for QA"; execute P4 pass and close only after regression around the touched area (related commands/screens) is re-verified.
- Keep checklists updated with execution dates, environment, and pass/fail per scenario to inform release readiness.
