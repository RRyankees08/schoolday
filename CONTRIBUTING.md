# Contributing to SchoolDay

Thanks for helping improve SchoolDay. The project is currently a pre-1.0, single-user self-hosted application, so small, focused changes with clear tests are easiest to review.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Open an issue before a large feature or architecture change so its scope can be discussed.
- Never post or commit credentials, access tokens, cookies, real student records, course names, grades, school identifiers, or authenticated provider responses.
- Use synthetic fixtures. If a bug only reproduces with live data, reduce it to the smallest anonymized shape that demonstrates the problem.
- Do not weaken the loopback-only Docker default or imply that SchoolDay has built-in authentication.

## Development setup

Requirements:

- Node.js 24 or newer
- pnpm 11 or newer (the exact package-manager version is recorded in `package.json`)

Install dependencies and run the fixture dashboard:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Live providers are optional. If they are necessary for your work, copy `.env.example` to `.env`, supply only the required values, and run `pnpm dev:integrations`. Keep `.env` private. Most changes should be reproducible against fixtures and automated tests.

## Making a change

1. Create a focused branch from the current default branch.
2. Keep provider-specific payloads inside the provider and normalization layers; UI code should consume normalized SchoolDay models.
3. Add or update tests for behavior changes.
4. Update the README or `.env.example` when behavior, deployment, or configuration changes.
5. Run the release checks:

   ```bash
   pnpm test
   pnpm check
   pnpm lint
   pnpm build
   ```

If a check cannot run in your environment, explain why in the pull request instead of claiming it passed.

## Pull requests

Keep pull requests narrow enough to review and describe:

- what changed and why;
- how it was tested;
- any configuration, migration, privacy, or deployment impact;
- screenshots for visible UI changes, using fixture data only.

Maintainers may ask for changes to preserve provider boundaries, deterministic fixture behavior, private-data handling, or the single-page product scope.

## Reporting security issues

Do not open a public issue for a vulnerability or include secrets or student data in a report. Follow the private reporting instructions in [SECURITY.md](./SECURITY.md).
