# New TODOs

## From docs/ENGINEERING_UI_DESIGN.md
### Future Components
To maintain consistency, we should eventually create reusable React components:
*   `<ConfigSection title="" description="">`
*   `<SettingRow label="" unit="">`
*   `<ActionRow>`

## From SECURITY_REPORT.md
### Next Steps
- Run DAST against a deployed staging environment.
- Add authentication/authorization to control endpoints and enforce HTTPS in deployment configs.
- Monitor dependency updates via scheduled `pip-audit`/`npm audit` in CI.
