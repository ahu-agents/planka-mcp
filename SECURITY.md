# Security Policy

## Supported Versions
The `main` branch is the only actively supported line at the moment.

## Reporting a Vulnerability
Please do not open public issues for security vulnerabilities.

Report privately by email to security@ahu.services and include:
- affected component or tool
- impact and attack scenario
- reproduction steps
- suggested mitigation if available

You will receive an acknowledgement as soon as possible, and we will coordinate remediation and disclosure timing.

## Hardening Notes
- Keep Planka credentials in environment files or service-manager secrets, never in repository files.
- Prefer binding Streamable HTTP to `127.0.0.1`; non-loopback binds are refused unless explicitly enabled.
- Put any deliberate LAN/WAN bind behind authenticated reverse-proxy or firewall controls.
- The raw `planka_request` tool is disabled by default; enable it only when needed.
- Upstream Planka error bodies are redacted by default; enable `PLANKA_MCP_DEBUG_ERRORS=1` only while debugging.
