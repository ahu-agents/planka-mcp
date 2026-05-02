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
    assert.ok(tools.tools.some((tool) => tool.name === "get_board"));
    assert.ok(tools.tools.some((tool) => tool.name === "planka_get_board"));
    const result = await client.callTool({ name: "health_check", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.match(JSON.stringify(result.content), /planka\.local/);
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
