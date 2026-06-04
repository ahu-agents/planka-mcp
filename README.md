# Planka MCP

> An MCP server for [Planka](https://github.com/plankanban/planka) kanban automation.

[![CI](https://github.com/ahu-agents/planka-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ahu-agents/planka-mcp/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/ahu-agents/planka-mcp)](LICENSE)

[![Support via bunq](https://img.shields.io/badge/Support-bunq-00A1E0?style=flat-square&logo=bunq&logoColor=white)](https://bunq.me/ahuservices?description=planka-mcp-maintenance-support)

An MCP server for [Planka](https://github.com/plankanban/planka) kanban automation.

It exposes Planka projects, boards, users, memberships, lists, cards, tasks, comments, and labels through MCP tools. It runs as **Streamable HTTP** by default and also supports **stdio** for clients that need it.

## Capabilities

- Read project, board, card, comment, and user data.
- Create, update, and delete projects and boards.
- Manage project managers and board members.
- Create and manage users, including role, email, username, and password updates.
- Create and manage lists, cards, task lists, tasks, comments, and labels.
- Report the current Planka user and role with `get_current_user`.
- Report role-aware tool guidance with `get_capabilities` so agents can see which operations are expected to be allowed before attempting them.
- Optionally expose a guarded raw Planka API request tool.

## Install

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` and set:

- `PLANKA_BASE_URL`
- `PLANKA_AGENT_EMAIL`
- `PLANKA_AGENT_PASSWORD`

Optional:

- `PLANKA_MCP_TRANSPORT=streamable-http|stdio`
- `PLANKA_MCP_HOST=127.0.0.1`
- `PLANKA_MCP_PORT=3333`
- `PLANKA_MCP_PATH=/mcp`
- `PLANKA_MCP_ENABLE_RAW=1` to enable the generic `planka_request` tool
- `PLANKA_MCP_ALLOW_NETWORK_BIND=1` to permit non-loopback binds; only use behind authenticated network controls
- `PLANKA_MCP_DEBUG_ERRORS=1` to include upstream Planka response bodies in tool errors for debugging

## Run Streamable HTTP

```bash
PLANKA_MCP_TRANSPORT=streamable-http npm start
```

OpenClaw MCP config example:

```json
{
  "mcp": {
    "servers": {
      "planka": {
        "url": "http://127.0.0.1:3333/mcp",
        "transport": "streamable-http",
        "connectionTimeoutMs": 10000
      }
    }
  }
}
```

## Run stdio fallback

```bash
PLANKA_MCP_TRANSPORT=stdio npm start
```

## Tools

Read tools:

- `health_check`
- `get_current_user`
- `get_capabilities`
- `list_projects`
- `list_users`
- `get_user`
- `get_structure`
- `get_board`
- `get_card`
- `get_comments`

Write tools:

- `create_user`, `update_user`, `update_user_email`, `update_user_username`, `update_user_password`, `delete_user`
- `create_project`, `update_project`, `delete_project`
- `create_board`, `update_board`, `delete_board`
- `add_project_manager`, `remove_project_manager`
- `add_board_member`, `update_board_member`, `remove_board_member`
- `create_list`, `update_list`, `delete_list`
- `create_card`, `update_card`, `move_card`, `delete_card`
- `create_task_list`, `create_task`, `create_tasks`, `update_task`, `delete_task`, `delete_task_list`
- `add_comment`, `update_comment`, `delete_comment`
- `create_label`, `update_label`, `delete_label`, `add_label_to_card`, `remove_label_from_card`, `set_card_labels`

Role-aware helper:

- `get_capabilities` returns the current Planka MCP user role and a status map for admin/project/board/user operations. Admin-only tools also fail early with a clear role message when the current MCP user is not allowed.

Optional raw tool:

- `planka_request` — only registered when `PLANKA_MCP_ENABLE_RAW=1`; path must start with `/api/`.

## Test

```bash
npm test
```

Live read-only smoke against a configured Planka:

```bash
set -a
source /path/to/planka.env
set +a
npm run smoke:live
```

The live smoke only authenticates and reads project/board/list structure.

## Security notes

- Keep credentials in environment files or service manager secrets, not in repository files.
- Prefer binding Streamable HTTP to `127.0.0.1` and let your local MCP client connect over loopback.
- Non-loopback binds are refused by default. If you deliberately bind to LAN/WAN, put the service behind authenticated reverse-proxy or firewall controls first.
- Streamable HTTP currently runs in stateless POST mode. `GET` and `DELETE` session lifecycle requests return `405` intentionally.
- Upstream Planka error bodies are redacted by default from MCP tool errors; enable `PLANKA_MCP_DEBUG_ERRORS=1` only while debugging.
- The raw API tool is disabled by default because it expands the callable API surface.

## Governance

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- AI-agent guide: [AGENTS.md](AGENTS.md)
- License: [LICENSE](LICENSE)

## Support

If this MCP server is useful to you, you can [support its ongoing maintenance via bunq](https://bunq.me/ahuservices?description=planka-mcp-maintenance-support). Support is voluntary and appreciated, but does not create any entitlement to support, features, consulting, an SLA, or invoice-based work.

## License

MIT — see [LICENSE](LICENSE).
