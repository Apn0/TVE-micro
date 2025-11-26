# Performance validation plan

This plan defines service-level objectives (SLOs), representative workloads, and repeatable steps to load-test and profile the TVE-micro backend APIs in a production-like environment.

## Workloads

| Scenario | Description | Concurrency (users) | Target RPS | Notes |
| --- | --- | --- | --- | --- |
| Monitoring | Dashboard polling of `/api/status` and `/api/data` while watching temperatures and motor states. | 20 | 40 | Emulates wall-display/engineering dashboards that refresh sub-second. |
| Operator controls | Adjusts targets, heater duties, and motor RPMs through `/api/control`. | 10 | 20 | Uses realistic targets (210–245 °C), duties (25–55%), and RPMs (0–1800). |
| Logging lifecycle | Toggles `/api/log/start` and `/api/log/stop` while polling data. | 4 | 4 | Validates file I/O bursts and state transitions. |
| GPIO management | Reads/writes `/api/gpio` for status LEDs/relays. | 4 | 6 | Keeps GPIO pressure low but continuous. |

> Run all scenarios together to approximate production mix: ~38 virtual users at ~70–75 RPS sustained.

## Target SLOs

| Endpoint group | p95 latency | p99 latency | Error budget |
| --- | --- | --- | --- |
| Telemetry reads (`GET /api/status`, `GET /api/data`) | ≤150 ms | ≤250 ms | ≤0.1% non-2xx |
| Control writes (`POST /api/control`) | ≤250 ms | ≤400 ms | ≤0.2% non-2xx |
| Logging toggles (`POST /api/log/start`, `POST /api/log/stop`) | ≤300 ms | ≤500 ms | ≤0.2% non-2xx |
| GPIO calls (`GET/POST /api/gpio`) | ≤200 ms | ≤300 ms | ≤0.1% non-2xx |

A test run passes when each endpoint group meets both latency thresholds and stays within its error budget for at least 10 continuous minutes.

## Environment and data

* Deploy the Flask service with the same `config.json` and pin mappings used on the Pi that drives the production PLC.
* Run behind the production web server (e.g., nginx + gunicorn) with identical worker counts and timeouts.
* Enable realistic sensor input streams (hardware or a deterministic simulator) so that temperature and motor safety checks execute.
* Preserve logging paths and retention settings to exercise disk I/O exactly as in production.

## Load testing steps (Locust)

1. Install dependencies on the load generator:
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r backend/requirements.txt -r backend/performance/requirements.txt
   ```
2. Start the backend in production mode (example gunicorn invocation):
   ```bash
   gunicorn -w 2 -b 0.0.0.0:5000 backend.app:app
   ```
3. From the load generator, run Locust headlessly against the service host:
   ```bash
   locust -f backend/performance/locustfile.py \
     --headless -u 38 -r 8 -t 15m --host http://<service-host>:5000
   ```
   *The command spawns the workload mix described above; adjust `-u`/`-r` to mirror expected peak demand.*
4. Export results for SLO checks:
   ```bash
   locust -f backend/performance/locustfile.py --headless -u 38 -r 8 -t 15m \
     --host http://<service-host>:5000 --csv perf_run
   ```
   Review `perf_run_stats.csv` for p95/p99 and the failure rate columns versus the SLO table.

## Profiling and tuning loop

1. While a load test is running, capture CPU and wall-clock hotspots:
   ```bash
   sudo py-spy record --pid $(pgrep -f 'gunicorn.*backend.app') --rate 50 \
     --duration 60 --output flame.svg
   ```
   For I/O wait or threading issues, run `py-spy top --pid ...` to see blocked functions.
2. Identify slow paths (e.g., sensor polling, logging flushes, safety checks). Typical remediations:
   * Raise `logging.flush_interval` and `temp_settings.avg_window` only if it doesn’t compromise safety responsiveness.
   * Increase gunicorn workers or enable keep-alives on nginx to reduce connection churn.
   * Cache stable configuration reads in memory instead of reloading from disk inside request handlers.
3. Re-run the 15-minute Locust test after each change. A change is accepted only if all SLOs remain green for the full run and no error budget regressions appear.

## Acceptance checklist

- [ ] Tests exercised all four workload scenarios simultaneously.
- [ ] p95/p99 per endpoint group meet or beat the SLO table.
- [ ] Error rate stays within the budget throughout the run.
- [ ] Latest flame graph is attached to the test record with the remediation note that was validated.
