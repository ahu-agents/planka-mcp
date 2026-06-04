# AGENTS

This repository accepts AI-assisted contributions.

## Guardrails
- Keep changes small and reviewable.
- Be careful with write tools (create/update/delete) and admin-only operations; do not change their behavior or role guards without explicit intent.
- Do not weaken the loopback-bind default or the raw-tool guard without explicit intent.
- Do not commit secrets, credentials, or personal data.

## Required Human Checks
- Review every AI-generated change before merge.
- Validate role-aware capability checks and network-bind guards.
- Ensure docs (tool list, env vars) match the implementation.

## Attribution
A concise note such as "AI-assisted" in the PR description is recommended for transparency.
