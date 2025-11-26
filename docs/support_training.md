# Support and Ops Enablement

This document provides training topics, contact channels, and SLAs for teams supporting the INTAREMA TVEmicro HMI.

## Training curriculum
- **System overview (1 hr)**: Architecture (backend Flask service, GPIO/ADC/PWM, PID control), key files (`backend/app.py`, `config.json`), and safety model.
- **Hands-on lab (2 hrs)**:
  - Start/stop the backend, run `/api/status` and `/api/data` requests.
  - Execute start/stop sequences and observe relay/motor changes.
  - Simulate alarms (e.g., disconnect a sensor) to practice `CLEAR_ALARM` and log collection.
- **Configuration management (1 hr)**: Editing `config.json`, using `UPDATE_*` commands, and persisting with `SAVE_CONFIG`.
- **Diagnostics (1 hr)**: GPIO tooling, interpreting `TEMP_DATA_STALE`, and using logging intervals/flush settings.

## Contact channels
- **Primary on-call (Ops)**: Pager/phone, 24/7 during production hours.
- **Slack/Chat**: `#tve-hmi-ops` for non-urgent questions and status updates.
- **Email**: `ops@tve-micro.example.com` for weekly summaries and RCA distribution.
- **Escalation**: Controls engineer hotline for wiring/DM556 issues; software engineer for API/config faults.

## SLAs
- **Sev1 (safety/production block)**: 15-minute acknowledgment, mitigation within 60 minutes, post-mortem within 48 hours.
- **Sev2 (degraded)**: 60-minute acknowledgment, mitigation or workaround within 4 hours.
- **Sev3 (minor)**: Next-business-day acknowledgment, fix scheduled in upcoming sprint.

## Knowledge base and handoffs
- Store runbooks in `docs/runbooks.md` and API/usage docs (`docs/user_guide.md`, `docs/api_reference.md`).
- Keep a rolling changelog in `docs/release_notes.md`; review during weekly ops sync.
- Record training completions and shadowing sessions; require annual recertification for operators.
- Capture lessons learned after incidents and update training decks accordingly.
