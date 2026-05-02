import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpApp } from "../src/server.js";
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

test("streamable HTTP transport lists tools and calls health_check", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    if (String(url).endsWith("/api/projects")) return jsonResponse({ items: [], included: { boards: [] } });
    return jsonResponse({ error: "unexpected" }, 404);
  };
  const config: Config = {
    baseUrl: "http://planka.local",
    email: "agent@example.invalid",
    password: "pw",
    timeoutMs: 1000,
    enableRaw: false,
    transport: "streamable-http",
    host: "127.0.0.1",
    port: 0,
    path: "/mcp",
  };
  const app = createHttpApp(config, fetchImpl as typeof fetch);
  const httpServer = createServer(app);
  const port = await listen(httpServer);

  try {
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "health_check"));
    assert.ok(tools.tools.some((tool) => tool.name === "get_board"));
    const result = await client.callTool({ name: "health_check", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.match(JSON.stringify(result.content), /planka\.local/);
    await client.close();
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
