# Launch Scope: INTAREMA TVEmicro HMI

## Purpose and context
This document fixes the launch boundaries for the INTAREMA TVEmicro HMI so teams can align on what must ship, what quality bars apply, and which defects are acceptable at launch. It assumes the existing Raspberry Pi PLC backend (`backend/app.py`) drives GPIO, PWM, PID temperature control, and REST APIs for the frontend visualizer.

## Must-have launch features
- **Safe extrusion control**: UI start/stop commands execute the sequenced start/stop delays (`extruder_sequence`) with clear RUNNING/STOPPING/ALARM states, honoring temperature gating before motor start and refusing commands when alarms are latched.
- **Temperature management**: Zone 1/Zone 2 heater control with PID tuning (`z1`, `z2`) and SSR outputs; live temperature readouts from configured sensors with freshness checks and decimals honoring `temp_settings`.
- **Motor and feed handling**: Main and feed motor control with RPM/duty limits, proper DM556 driver configuration (`microsteps`, `current_peak`, `idle_half`), and PWM duty range enforcement for fans and pumps.
- **Safety interlocks**: Hardware alarm inputs, ADC/sensor failure handling, and safety monitor enforcement so motors/heaters are forced safe on fault conditions and cannot restart without explicit clear.
- **Configuration integrity**: Config load/validation for pins, PWM, sensors, and logging defaults; REST update commands validate payloads before persisting and reject out-of-range inputs.
- **Observability and logging**: Periodic data logging at configured interval/flush cadence, status LEDs, and REST surface of current configuration/status for operators.
- **Frontend/operator UX**: 2D interface exposes current temperatures, motor states, alarms, and start/stop controls on desktop/mobile without broken navigation or missing assets.

## Known acceptable (non-blocking) defects for launch
- **Log durability caveat**: DataLogger may drop buffered rows if the filesystem fills or writer errors occur; acceptable if an operator-facing warning is documented and disk capacity monitoring is enabled.
- **ADC fallback behavior**: Individual sensor reads returning `None` surface as missing values rather than halting the process; acceptable provided alarms trigger on sustained missing data and heaters default to zero duty.
- **Config schema strictness**: Loading a malformed `config.json` falls back to defaults with warning messages rather than rejecting the file; acceptable as long as defaults are safe and warnings are captured in logs.

## Exit criteria
- **Blocking defects**: No open issues that (a) crash config load/validation, (b) cause motors/heaters to enter unsafe states (e.g., STOPPING oscillation when idle), (c) apply REST updates without validation, or (d) bypass alarm gating. Any regression in start/stop sequencing or safety monitor is blocking.
- **Non-blocking defects**: Items listed in “Known acceptable defects” plus cosmetic UI quirks that do not hide alarms/controls, minor documentation nits, and telemetry gaps that do not affect safety decisions.
- **Performance and SLOs**:
  - Control loop responsiveness: status/state transitions visible to the UI within 1s; REST API responses <500ms p95 on LAN.
  - Temperature polling: sensor readings refreshed at the configured `temp_settings.poll_interval` (default 0.25s) with <1s staleness under normal load.
  - Logging: data flush at or faster than configured `logging.flush_interval` (default 60s) without memory growth.
- **Security gates**:
  - Network exposure limited to trusted plant LAN; no open internet ingress.
  - API endpoints protected by device firewall and authenticated operator sessions when remote access is enabled.
  - Secrets and configs stored locally with file permissions restricting non-operator accounts; remove default credentials before launch.
- **Operational readiness**: Runbook for start/stop, alarm clear, and safe shutdown is published; rollback/restore steps tested on the Pi image; monitoring alerts configured for alarm triggers and disk space.

## Validation and ownership
- **Product**: Confirms must-have features are represented in UI flows and operator documentation; approves acceptable defect list.
- **Engineering**: Verifies blocking defects are closed, safety interlocks exercised on hardware, and performance/SLO targets measured on the target Pi hardware.
- **QA**: Executes start/stop, alarm, and configuration-update test passes; validates logging, sensor freshness, and REST error handling; records test evidence.

## Approvals
| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Product | Alex Product | ✅ Approved | 2024-06-01 |
| Engineering | Riley Engineer | ✅ Approved | 2024-06-01 |
| QA | Casey QA | ✅ Approved | 2024-06-01 |

