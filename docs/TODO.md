# Project TODO List

This document consolidates pending tasks and technical debt identified from code reviews, failure analysis, and feature requests.

## High Priority (Stability & Safety)

### Reliability
- [ ] **Race Condition Analysis**: Exercise race conditions around `state_lock`, `_control_stop`, and `running_event` in `control_loop` to ensure robust status recovery.

### Security (Next Steps)
- [ ] **DAST Scanning**: Run DAST against a deployed staging environment.
- [ ] **Auth & HTTPS**: Add authentication/authorization to control endpoints and enforce HTTPS in deployment configs.
- [ ] **Dependency Monitoring**: Monitor dependency updates via scheduled `pip-audit`/`npm audit` in CI.

## Medium Priority (UX & Features)

### Frontend Polish
- [ ] **Standardize Button Styles**: Ensure all buttons use `styles.button` or `styles.buttonSecondary` across the app.
- [ ] **Unified Error Handling**: Create a standard error boundary or hook for displaying API errors in the frontend.

### Future Components
To maintain consistency, we should eventually create reusable React components:
- [ ] **ConfigSection**: `<ConfigSection title="" description="">`
- [ ] **SettingRow**: `<SettingRow label="" unit="">`
- [ ] **ActionRow**: `<ActionRow>`

## Low Priority (Cleanup)

*(No items currently)*
