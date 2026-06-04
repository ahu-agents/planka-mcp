# Contributing

Thanks for contributing to Planka MCP.

## Requirements
- Node.js 20.11+
- npm

## Development Setup
```bash
npm ci
npm run build
npm test
```

A live read-only smoke test against a configured Planka instance is available:

```bash
set -a; source /path/to/planka.env; set +a
npm run smoke:live
```

## Branch and Commit Guidelines
- Create a feature branch from `main`.
- Use Conventional Commits, e.g.:
  - `feat: add card label tool`
  - `fix: harden runtime guards`
  - `docs: present capabilities`

## Pull Request Checklist
- Keep changes focused and minimal.
- Add or update tests for behavior changes.
- Update docs (tool list, env vars) when behavior changes.
- Ensure `npm run build` and `npm test` pass, and CI is green.

## Security and Secrets
- Never commit Planka credentials; keep them in environment files or secrets.
- Prefer binding Streamable HTTP to loopback; see the README security notes.
- For vulnerabilities, follow `SECURITY.md`.

## Review Policy
- All PRs require human review before merge.
- AI-assisted changes are welcome, but maintainers are responsible for final correctness.
