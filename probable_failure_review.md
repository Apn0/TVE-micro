# Probable failure review targets

The following areas merit targeted failure-mode analysis and test coverage to match the earlier "probable failure" audit. Each section summarizes the risky behaviors observed in the current implementation and suggests focused checks.

## Re-evaluation highlights (current code)
- **Config load now crashes on sensor parsing:** `load_config` calls `_validate_sensors`, but the helper `_validate_sensor_section` is defined twice with incompatible signatures; the later definition shadows the first, so `_validate_sensors` passes four arguments to a two-argument function and raises immediately. The stray code after the first `return validate_config(raw_cfg)` in `load_config` is also dead and confusing. Fix by removing the duplicate helper, wiring the correct signature, and pruning unreachable code so configuration can load. 【F:backend/app.py†L176-L274】【F:backend/app.py†L377-L395】
- **Start button defaults to STOPPING when idle:** In `control_loop`, the `start_event` branch sets STARTING, but the `else` clause is unconditional, so every loop that lacks a new start edge calls `_set_status("STOPPING")`, even when already in READY or RUNNING. This makes the sequence logic oscillate and can drop motors unexpectedly. Guard the STOPPING transition with an explicit status check or a separate stop command. 【F:backend/app.py†L553-L608】
- **REST update branches duplicate and conflict:** The `UPDATE_PID`, `SET_TEMP_SETTINGS`, and `SET_LOGGING_SETTINGS` handlers each contain two disjoint validation/update blocks: one uses the structured validators, then legacy code repeats different checks. The second block executes unconditionally after successful validation, leading to mixed configuration states and harder-to-audit safety. Consolidate each command to a single validation path. 【F:backend/app.py†L994-L1112】【F:backend/app.py†L1113-L1153】

## Configuration loading and defaults
- `load_config` only overlays `config.json` onto `DEFAULT_CONFIG` without validating key presence, value types, or ranges, so malformed JSON can silently revert to defaults or propagate bad values into runtime state. Consider adding schema validation and type guards before accepting overrides.
- `/api/control` update commands write unvalidated payloads directly into `sys_config`, allowing out-of-range PID gains, PWM settings, or pin numbers to persist. Add bounded checks and rejection paths before persisting config updates.

## Background control-state machine
- The `control_loop` depends on edge-detected `btn_start` transitions to enter STARTING/STOPPING and uses simple elapsed timers for sequencing. Missed edges or timing jitter could leave the state stuck in STARTING/STOPPING or skip transitions. Exercise race conditions around `state_lock`, `_control_stop`, and `running_event` to ensure status recovery.
- Alarm handling in the loop currently clears `running_event` and blinks LEDs but otherwise keeps looping; verify alarms cannot be overwritten by subsequent events and that outputs remain latched off until cleared.

## REST command handling
- REST commands accept RPM, duty cycle, and PID inputs without range enforcement, so extreme or NaN values could reach hardware calls or corrupt `state`. Harden input validation for motor speeds, heater duties, PWM outputs, and PID tuning before invoking HAL methods.
- Safety gating is limited to heater temperature checks in `SET_MOTOR`; other commands bypass motor/heater safety or debounce. Add guards for repeated toggles, stale `temps`, and invalid GPIO writes.

## Sensor acquisition and ADC fallbacks
- `ADS1115Driver.read_voltage` returns `None` whenever the bus is unavailable, the channel is invalid, or reads fail, but callers assume numeric voltages. Audit downstream temperature conversion for None handling and ensure failures trigger safe outputs rather than zero/NaN propagation.

## Data logging pipeline
- `DataLogger` opens files and buffers rows before flushing but does not handle disk-full or writer errors beyond print statements. A failure mid-run could drop logs silently or hold data in memory. Add error hooks, retries, and buffer backpressure to avoid unbounded growth or silent loss.
- Deviation-based flushing depends on numeric conversion of logged strings; malformed values become `NAN` and skip detection. Consider explicit validation and alerting when readings or duty cycles are non-numeric.

## PID and heater outputs
- In AUTO mode the loop applies PID output whenever a temperature reading is non-`None`, otherwise it drives heaters to zero. There is no plausibility filter for stale or noisy readings or anti-windup if sensors flap. Add sensor freshness checks and PID reset/saturation handling before applying heater duty.

## Alarm clear and recovery flow
- Clearing alarms resets outputs and state but immediately re-enables `running_event`, depending on the physical emergency button state for safety. Confirm that alarms cannot re-arm instantly on the next loop iteration and that stale `alarm_msg` values are cleared alongside halting motors/heaters.
