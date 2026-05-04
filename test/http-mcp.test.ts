import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpApp, runHttp } from "../src/server.js";
import type { Config } from "../src/config.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function listen(server: Server): Promise<number> {
  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

const baseConfig: Config = {
  baseUrl: "http://planka.local",
  email: "agent@example.invalid",
  password: "pw",
  timeoutMs: 1000,
  enableRaw: false,
  transport: "streamable-http",
  host: "127.0.0.1",
  port: 0,
  path: "/mcp",
  allowNetworkBind: false,
  debugErrors: false,
};

async function withClient(fetchImpl: typeof fetch, fn: (client: Client) => Promise<void>, config: Config = baseConfig) {
  const app = createHttpApp(config, fetchImpl);
  const httpServer = createServer(app);
  const port = await listen(httpServer);
  const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
  try {
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport);
    await fn(client);
    await client.close();
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

test("streamable HTTP transport lists tools and calls health_check", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    if (String(url).endsWith("/api/projects")) return jsonResponse({ items: [], included: { boards: [] } });
    return jsonResponse({ error: "unexpected" }, 404);
  };

  await withClient(fetchImpl as typeof fetch, async (client) => {
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "health_check"));
    assert.ok(tools.tools.some((tool) => tool.name === "get_capabilities"));
    assert.ok(tools.tools.some((tool) => tool.name === "create_project"));
    assert.ok(tools.tools.some((tool) => tool.name === "create_board"));
    assert.ok(tools.tools.some((tool) => tool.name === "list_users"));
    assert.ok(tools.tools.some((tool) => tool.name === "get_board"));
    assert.ok(tools.tools.some((tool) => tool.name === "planka_get_board"));
    const result = await client.callTool({ name: "health_check", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.match(JSON.stringify(result.content), /planka\.local/);
  });
});

test("capability tool reports current Planka role", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    if (String(url).endsWith("/api/users/me")) return jsonResponse({ item: { id: "u1", email: "admin@example.invalid", role: "admin", name: "Admin" } });
    return jsonResponse({ error: "unexpected" }, 404);
  };

  await withClient(fetchImpl as typeof fetch, async (client) => {
    const result = await client.callTool({ name: "get_capabilities", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.match(JSON.stringify(result.content), /admin@example\.invalid/);
    assert.match(JSON.stringify(result.content), /create_user/);
    assert.match(JSON.stringify(result.content), /allowed/);
  });
});

test("create_board sends Planka multipart form data", async () => {
  let sawFormData = false;
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    if (String(url).endsWith("/api/projects/p1/boards")) {
      sawFormData = init?.body instanceof FormData;
      return jsonResponse({ item: { id: "b1", projectId: "p1", name: "Board" } });
    }
    return jsonResponse({ error: "unexpected", url: String(url) }, 404);
  };

  await withClient(fetchImpl as typeof fetch, async (client) => {
    const result = await client.callTool({ name: "create_board", arguments: { projectId: "p1", name: "Board" } });
    assert.equal(result.isError, undefined);
    assert.equal(sawFormData, true);
  });
});

test("create_list defaults type to active for Planka 2.x", async () => {
  let requestBody: string | undefined;
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    if (String(url).endsWith("/api/boards/b1/lists")) {
      requestBody = typeof init?.body === "string" ? init.body : undefined;
      return jsonResponse({ item: { id: "l1", boardId: "b1", name: "Done", type: "active", position: 8 } });
    }
    return jsonResponse({ error: "unexpected", url: String(url) }, 404);
  };

  await withClient(fetchImpl as typeof fetch, async (client) => {
    const result = await client.callTool({ name: "create_list", arguments: { boardId: "b1", name: "Done", position: 8 } });
    assert.equal(result.isError, undefined);
  });

  assert.ok(requestBody);
  assert.deepEqual(JSON.parse(requestBody!), { name: "Done", position: 8, type: "active" });
});

test("create_card computes append position when omitted", async () => {
  let posted: any;
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    if (String(url).endsWith("/api/lists/l1")) return jsonResponse({ included: { cards: [{ position: 65536 }, { position: 131072 }] } });
    if (String(url).endsWith("/api/lists/l1/cards")) {
      posted = JSON.parse(String(init?.body));
      return jsonResponse({ item: { id: "c1", listId: "l1", ...posted } });
    }
    return jsonResponse({ error: "unexpected", url: String(url) }, 404);
  };

  await withClient(fetchImpl as typeof fetch, async (client) => {
    const result = await client.callTool({ name: "create_card", arguments: { listId: "l1", name: "Card" } });
    assert.equal(result.isError, undefined);
    assert.equal(posted.position, 196608);
    assert.equal(posted.type, "project");
  });
});

test("move_card computes append position when omitted and preserves explicit positions", async () => {
  const seen: string[] = [];
  const patches: any[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    seen.push(String(url));
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    if (String(url).endsWith("/api/lists/l2")) return jsonResponse({ included: { cards: [{ position: 32768 }, { position: 98304 }] } });
    if (String(url).endsWith("/api/cards/c1")) {
      patches.push(JSON.parse(String(init?.body)));
      return jsonResponse({ item: { id: "c1", ...patches.at(-1) } });
    }
    return jsonResponse({ error: "unexpected", url: String(url) }, 404);
  };

  await withClient(fetchImpl as typeof fetch, async (client) => {
    const omitted = await client.callTool({ name: "move_card", arguments: { cardId: "c1", listId: "l2" } });
    assert.equal(omitted.isError, undefined);
    assert.equal(patches[0].position, 163840);

    seen.length = 0;
    const explicit = await client.callTool({ name: "move_card", arguments: { cardId: "c1", listId: "l2", position: 42 } });
    assert.equal(explicit.isError, undefined);
    assert.equal(patches[1].position, 42);
    assert.equal(seen.some((url) => url.endsWith("/api/lists/l2")), false);
  });
});

test("tool path parameters are encoded before calling Planka", async () => {
  const seen: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    seen.push(String(url));
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    if (String(url).endsWith("/api/boards/id%2Fwith%20space")) return jsonResponse({ item: { id: "ok" }, included: {} });
    return jsonResponse({ error: "unexpected", url: String(url) }, 404);
  };

  await withClient(fetchImpl as typeof fetch, async (client) => {
    const result = await client.callTool({ name: "get_board", arguments: { boardId: "id/with space" } });
    assert.equal(result.isError, undefined);
    assert.ok(seen.some((url) => url.endsWith("/api/boards/id%2Fwith%20space")));
  });
});

test("tool failures are marked as MCP errors", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    return jsonResponse({ message: "missing" }, 404);
  };

  await withClient(fetchImpl as typeof fetch, async (client) => {
    const result = await client.callTool({ name: "get_board", arguments: { boardId: "missing" } });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /HTTP 404/);
    assert.doesNotMatch(JSON.stringify(result.content), /responseBody|\"message\"/);
  });
});

test("debug error payloads are opt-in", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    return jsonResponse({ message: "missing" }, 404);
  };

  await withClient(
    fetchImpl as typeof fetch,
    async (client) => {
      const result = await client.callTool({ name: "get_board", arguments: { boardId: "missing" } });
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result.content), /missing/);
    },
    { ...baseConfig, debugErrors: true },
  );
});

test("HTTP mode reuses one Planka client token cache", async () => {
  let tokenCalls = 0;
  const fetchImpl = async (url: string | URL | Request) => {
    if (String(url).endsWith("/api/access-tokens")) {
      tokenCalls += 1;
      return jsonResponse({ item: "jwt-token" });
    }
    if (String(url).endsWith("/api/projects")) return jsonResponse({ items: [], included: { boards: [] } });
    return jsonResponse({ error: "unexpected" }, 404);
  };

  await withClient(fetchImpl as typeof fetch, async (client) => {
    await client.callTool({ name: "health_check", arguments: {} });
    await client.callTool({ name: "health_check", arguments: {} });
  });
  assert.equal(tokenCalls, 1);
});

test("HTTP server refuses non-loopback bind unless explicitly allowed", async () => {
  await assert.rejects(
    () => runHttp({ ...baseConfig, host: "0.0.0.0", port: 33333 }),
    /Refusing to bind Planka MCP to non-loopback host/,
  );
});
