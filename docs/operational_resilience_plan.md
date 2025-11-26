# Operational Resilience and Observability Plan

This document captures the checks and drills required to harden the TVEmicro HMI stack (Raspberry Pi PLC backend plus web frontend) for reliability, observability, and disaster readiness.

## Infrastructure as Code (IaC), autoscaling, and recovery
- **IaC coverage:**
  - Track all Raspberry Pi/edge bootstrap steps (OS image, kernel modules, I2C/SPI/GPIO permissions, Python/Node dependencies, udev rules) in versioned IaC (e.g., Ansible/Terraform + Packer). Include hardware pin maps from `schematic.oxps` and `WIRING_MAP.md` as code comments/vars to avoid drift.
  - Represent backend/frontend builds, container images (tags, SBOMs), environment variables, secrets references, and network/security groups as code. Require CI validation (lint + `terraform plan`/`ansible --check`) before merge.
  - Maintain prod/stage parity: same IaC modules with different `tfvars`/inventory; enforce promotion from stage to prod only after automated conformance checks.
- **Autoscaling and capacity:**
  - For cloud-deployed services (dashboards, remote log/trace collectors, artifact storage), define HPA/ASG policies with CPU/memory and queue-depth targets; set minimum pods/instances for control-plane services so Pi data ingestion is not throttled.
  - Size Raspberry Pi headroom via burn-in tests; capture CPU/thermal ceilings and reserve 30% headroom for surge logging/tracing loads.
- **Backups and disaster recovery:**
  - Nightly backups of configuration (`backend/config.json` overrides, GPIO mappings, dashboards, alert rules) to versioned object storage with 30-day retention; encrypt at rest and in transit.
  - Golden images: maintain signed Pi disk images (OS + application) produced from IaC; store last 3 versions with checksum verification.
  - Database/log stores (if enabled) require PITR and weekly restore tests; document RPO/RTO targets (e.g., RPO ≤ 15m for config, RTO ≤ 1h for Pi replacement) and track in runbooks.
  - DR playbook for Pi loss: provision spare hardware from image, replay config backup, validate GPIO outputs in dry-run mode before connecting to motors/heaters.

## Observability: metrics, logs, traces, dashboards, and alerts
- **Metrics (SLIs):**
  - Control loop: latency/jitter per cycle, percentage of cycles meeting deadlines, alarm rate, heater/motor duty ranges, temperature stability bands.
  - API: request rate, p95/p99 latency, error rate by command (`SET_MOTOR`, `SET_TEMP_SETTINGS`, etc.), config validation failures.
  - System: CPU/memory/thermal, disk usage and log fsync errors, GPIO bus errors (I2C/SPI), ADC read failures.
  - Data logging: write success vs. buffer drops, flush latency, time since last successful write.
- **Logs:**
  - Structured JSON logs from backend with correlation IDs per REST request and per control cycle. Include fields for command type, validation result, GPIO pin targets, and alarm transitions.
  - Forward logs to centralized store (e.g., Loki/ELK) with retention tiers; add sampling for noisy debug logs to protect Pi storage.
- **Traces:**
  - Instrument REST handlers and control-loop phases (sensor read → validation → actuator write) with OpenTelemetry spans; propagate trace IDs into logs for joinability.
- **Dashboards and alerts aligned to SLOs/error budgets:**
  - Dashboards: control-loop health (latency, jitter, alarms), API success/latency, hardware errors, and log write health. Include release markers for IaC/app deploys.
  - SLO examples: 99.5% of control cycles complete within deadline; ≤0.1% REST commands fail validation; ≤0.5% GPIO write failures per hour.
  - Alerts: budget burn alerts for each SLO, high alarm frequency, repeated validation failures, spike in ADC/GPIO errors, log flush failures, and approaching disk/thermal limits.
  - On-call runbooks linked from alerts with escalation paths and mitigation steps (restart control loop, revert IaC module, fail over to spare Pi).

## Chaos engineering and failover drills
- **Planned drills (quarterly minimum):**
  - **Sensor/ADC failure:** simulate `None`/out-of-range readings to confirm safe heater/motor shutdown and alarm latching.
  - **GPIO bus contention:** introduce I2C/SPI timeouts to validate retries and fallback behaviors; ensure alarms prevent re-arming until cleared.
  - **Filesystem exhaustion:** fill log partition to verify logger backpressure and alerting; confirm control loop continues in safe mode.
  - **Process crash/restart:** kill backend service to check watchdog/systemd restart and that state resumes from persisted config without unsafe outputs.
  - **Network/log pipeline outage:** block egress to log/trace backend to confirm local buffering and that control loop remains functional.
  - **Pi hardware failover:** execute DR playbook on spare hardware using latest golden image + config backup; measure RTO/RPO adherence.
- **Execution hygiene:**
  - Run drills in staging first; require sign-off before prod chaos.
  - Record outcomes, detected gaps, and fixes in a resilience backlog; track remediation SLAs.
  - Automate repeatable chaos cases (network loss, process crash, disk full) via scripts baked into IaC so they can run in CI/stage as smoke tests.
