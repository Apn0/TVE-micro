# Security Assessment and Threat Modeling

## Automated Scans
- **SAST:** `bandit -r backend` – no issues after tightening exception handling and logging.
- **Python dependency audit:** `pip-audit -r backend/requirements.txt` – no known vulnerabilities.
- **Frontend dependency audit:** `npm audit --production` – no vulnerabilities found.
- **DAST:** Not performed; no running environment with exposed endpoints was available in this workspace. A dynamic scan should be run against a deployed instance before release.

## Implemented Remediations
- Replaced silent `except` blocks with explicit exception logging so operational failures are visible without crashing control loops.
- Default Flask host now binds to `127.0.0.1` and uses environment variables for host/port/debug to avoid inadvertent exposure of the API on all interfaces.
- Simulation randomness is marked as non-cryptographic (`# nosec B311`) to document risk acceptance for non-security use.

## Residual Risks and Accepted Exceptions
- Simulation randomness (`random.uniform`) remains for test-mode physics modeling only; it is not used for security or entropy-sensitive features.
- TLS is not configured in the provided Nginx config (listens on port 80). Deployments should terminate TLS in Nginx or an upstream proxy and enforce HTTPS-only access.
- No authentication or authorization is implemented; access control relies on network isolation. Harden deployment by adding API authentication and role checks.

## Threat Modeling Highlights
- **Authentication/Authorization:** No authN/Z exists. Threats include unauthorized command execution against the extruder API; mitigations include mTLS or token-based auth and role checks per route.
- **Payments:** No payment flows are present. If added later, enforce PCI-compliant handling, tokenization, and segregate payment services from control-plane APIs.
- **Data Export:** `/api/data` and logging endpoints return operational state and temperature data. Risks include leakage of operational telemetry; mitigations include authZ, rate limits, and ensuring logs exclude PII.
- **Secrets Management:** Application uses static config only; no secrets are stored. If credentials are introduced, load them from environment or a secret manager and avoid committing to the repo.
- **TLS:** Current reverse-proxy config is HTTP-only. Use certificates (e.g., Let’s Encrypt) and HSTS in production.
- **Logging & PII:** Logged fields are device telemetry only. Avoid adding user identifiers; if introduced, mask or minimize PII and rotate log files with restricted permissions.

## Validation of Policies
- **AuthZ/AuthN:** Not implemented; deployment must restrict network exposure or add auth middleware.
- **Secrets:** None present; rely on environment variables/secret stores for future credentials.
- **TLS:** Required at the ingress proxy; add HTTPS listeners to `nginx_intarema.conf` for production.
- **PII Handling:** No PII collected; maintain this boundary and scrub future additions from logs and exports.

