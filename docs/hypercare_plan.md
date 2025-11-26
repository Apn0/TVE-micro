# Hypercare runbook: INTAREMA TVEmicro HMI

This playbook governs the first week after launch so the team can monitor adoption, catch regressions quickly, and turn incidents into durable fixes.

## KPI tracking against targets
| KPI | Definition | Target | Source/collection |
| --- | --- | --- | --- |
| Activation | Operators who complete first start/stop cycle on the HMI within 24h of first login | ≥90% of activated accounts per site | Auth/session logs plus REST start/stop audit trail |
| 7-day retention | Returning operators who run at least one start/stop or temperature update in a 7-day window | ≥75% of activated operators | Auth/session logs aggregated daily |
| Control latency | REST API p95 response time for start/stop, alarm clear, and config update endpoints | ≤500ms p95 on LAN (matches launch scope) | API gateway/NGINX metrics plus backend timing logs |
| Sensor freshness | % of temperature reads delivered to UI within 1s of poll interval | ≥99% on target hardware | Backend polling logs with staleness flag |
| Error rate | 5xx rate for control/config endpoints; failed GPIO/ADC reads per minute | <0.5% 5xx; <1% sensor read failures | API error logs and backend error counters |

**Cadence**: track KPIs per shift and publish a daily summary. Trigger an investigation if latency, freshness, or error rate misses target for 2 consecutive collection periods.

## Feedback and bug triage
- **Intake channels**: in-app feedback form, operator Slack channel, and on-call phone escalation from the plant floor.
- **Triage window**: review new items every 2 hours during production shifts.
- **Severity and response**:
  - `P0` safety/production blockers (cannot start/stop, uncontrolled heaters): acknowledge <10 minutes, hotfix within 2 hours, keep product + QA in the loop.
  - `P1` degraded but safe (intermittent sensor reads, UI latency >1s): acknowledge <30 minutes, fix or rollback within 8 hours.
  - `P2` minor UI/telemetry issues: schedule into next daily patch train.
- **Patch hygiene**: capture repro steps and log snippets in the issue, add regression test when feasible, and document temporary mitigations (e.g., manual stop/run sequence) in the runbook.

## Postmortem and follow-ups
- **Schedule**: hold a 45-minute retrospective 72 hours after launch (and after any P0/P1 incident) with Product, Engineering, QA, and Operations.
- **Inputs**: KPI trend lines, incident timeline, patches shipped, and any operator-reported UX gaps.
- **Outputs**: action items with owners and due dates; create tracking tickets for code changes, documentation updates, and monitoring gaps. Re-review open items at the end of hypercare week and fold remaining tasks into the regular sprint backlog.
