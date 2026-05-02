# Planka MCP

A small, maintained MCP server for [Planka](https://github.com/plankanban/planka), built for agent use.

It supports **Streamable HTTP** first and keeps **stdio** as a compatibility fallback.

## Why this exists

The stock Planka stdio MCP used in our environment was brittle in long-running agent workflows and its API surface was too narrow. This server keeps the transport boring and exposes the operations agents actually need: projects, boards, lists, cards, tasks, comments, labels, plus an optional guarded raw API escape hatch.

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
- `list_projects`
- `get_structure`
- `get_board`
- `get_card`
- `get_comments`

Write tools:

- `create_list`, `update_list`, `delete_list`
- `create_card`, `update_card`, `move_card`, `delete_card`
- `create_task_list`, `create_task`, `create_tasks`, `update_task`, `delete_task`, `delete_task_list`
- `add_comment`, `update_comment`, `delete_comment`
- `create_label`, `update_label`, `delete_label`, `add_label_to_card`, `remove_label_from_card`, `set_card_labels`

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
