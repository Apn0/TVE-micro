# Rollout Plan: INTAREMA TVEmicro HMI

## Strategy
- **Phased rollout with feature flag guardrails**: Keep the HMI activation behind a `hmi_enabled` feature flag in the backend (`config.json` and REST surface) so we can ship code broadly while controlling exposure.
- **Canary on a single production line**: Enable the feature for one low-volume extruder in a representative plant cell to validate end-to-end behavior (PLC control loop, SSR outputs, DM556 drivers, REST/Frontend rendering) under real load.
- **Regional/plant phased enablement**: Expand enablement line-by-line within the pilot plant, then plant-by-plant. Hold until stability SLOs are met before broadening exposure.

## Prerequisites
- Pi images flashed with the current release artifacts, `config.json` validated, and safety relays verified.
- Monitoring hooks configured: system metrics (CPU, temp), backend logs (alarms, REST errors), and application health endpoint reachability.
- Rollback image (previous stable build) available on removable media with verified boot.

## Cutover steps
1. **Pre-flight**
   - Freeze new deployments; merge only P0 fixes.
   - Confirm `config.json` pins, PWM, and sensor mappings match hardware wiring.
   - Run unit/functional tests on staging hardware: start/stop sequencing, temperature gating, safety monitor, REST validation.
   - Stage canary line with HMI disabled (`hmi_enabled=false`).
2. **GO/NO-GO meeting**
   - Attendees: Product, Eng (backend + frontend), QA, Plant Ops.
   - Review health: blocking bugs, monitoring readiness, rollback assets, and test evidence.
   - Decision captured in meeting notes with owners for hypercare.
3. **Canary enablement**
   - Toggle `hmi_enabled=true` for canary line via config/REST.
   - Deploy frontend bundle and restart backend services.
   - Observe for one full production shift before further rollout.
4. **Phased expansion**
   - Enable sequential lines in the pilot plant; pause if alarms/REST errors exceed thresholds.
   - After 48h stable in pilot, repeat expansion plant-by-plant.
5. **Full cutover**
   - Remove old HMI access points/signage; update operator runbooks.
   - Lock feature flag default to `true` once all plants are migrated.

## Smoke tests (per environment/line)
- Backend health endpoint responds 200 and logs are flowing.
- Start → temperature gate → main motor start sequence completes and RUNNING state holds for 10 minutes.
- Stop sequence asserts safe shutdown, motors disengage, heaters duty drops to zero, and alarms clearable.
- Temperature polling shows fresh values (<1s staleness) for all configured sensors; SSR duty cycles reflect PID output.
- REST updates reject out-of-range inputs; valid updates persist and reflect in GET responses.
- Frontend renders current temperatures, motor states, and alarms; buttons respond without console errors.

## Revert/Rollback
- **Config rollback**: Set `hmi_enabled=false`, restart backend services, and notify operators to fall back to legacy panel.
- **Binary rollback**: Flash the previous stable Pi image or `git checkout` the prior release tag; redeploy backend/frontend bundles.
- **Data/log preservation**: Before reimage, snapshot `/var/log/tvemicro` and config files for postmortem.
- **Criteria to rollback**: Safety interlock failures, uncontrolled motor/heater behavior, repeated REST 5xx, or alarm floods with no clear root cause in 30 minutes.

## Monitoring & alerting during rollout
- Real-time dashboards: control loop latency, REST p95/p99, sensor freshness, alarm counts, CPU/temp, disk space.
- Alerts: safety monitor trip, start/stop sequence failure, repeated ADC `None` readings, log writer errors, disk >85%.
- On-call: engineering + plant ops bridge open during canary and first 48h of plant-wide rollout.

## Hypercare
- **Window**: First 7 days after full plant enablement.
- **Cadence**: Daily standup to review alarms, operator feedback, and any near-misses.
- **Exit**: After two consecutive days with zero safety-related incidents and stable SLOs, transition to standard ops on-call.

## Communication
- Pre-launch: email/slack broadcast with schedule, expected impact, and rollback contacts.
- GO/NO-GO outcomes documented and shared immediately.
- Hypercare updates posted daily with any mitigations applied.
