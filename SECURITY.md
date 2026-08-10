# Security policy

## Supported versions

SchoolDay is pre-1.0. Security fixes are applied to the current default branch and the most recent release only; older images and source revisions are not supported.

## Reporting a vulnerability

Use the repository's **Security** tab and its **Report a vulnerability** option to send a private report. If private vulnerability reporting is not available, contact the repository owner through a private channel listed on their GitHub profile. Do not open a public issue or discussion for a suspected vulnerability.

Include the affected version or commit, impact, reproduction steps, and any proposed mitigation. Remove credentials, cookies, access tokens, student records, grades, course names, and authenticated provider responses. A maintainer will acknowledge the report, assess its scope, and coordinate disclosure after a fix is available.

## Deployment security

SchoolDay is designed for a single trusted user and does not include authentication. The dashboard, `/api/dashboard`, and `/api/sync` can expose private school data to anyone who can reach the service.

- Keep the Docker port bound to `127.0.0.1` unless traffic passes through an authenticated reverse proxy or access gateway.
- Protect a Cloudflare Tunnel hostname with Cloudflare Access or an equivalent authentication layer before exposing it.
- Store Canvas and StudentVUE credentials only in a private server-side environment file or a secrets manager.
- Treat the SQLite database and backups as sensitive student records. Restrict permissions, encrypt backups where appropriate, and never attach them to an issue.
- Use a versioned container image rather than `latest` when repeatable deployments and controlled upgrades matter.

The repository owner must enable GitHub private vulnerability reporting before the preferred reporting path above becomes available.
