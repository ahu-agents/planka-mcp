import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Config } from "./config.js";
import { PlankaClient } from "./planka-client.js";
import { createMcpServer } from "./tools.js";

export async function runStdio(config: Config): Promise<void> {
  const client = new PlankaClient(config);
  const server = createMcpServer(client, config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createHttpApp(config: Config, fetchImpl: typeof fetch = fetch): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, name: "planka-mcp" });
  });

  app.post(config.path, async (req, res) => {
    const client = new PlankaClient(config, fetchImpl);
    const server = createMcpServer(client, config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    } finally {
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    }
  });

  app.get(config.path, (_req, res) => {
    res.status(405).json({ error: "Use POST for MCP streamable-http requests" });
  });

  app.delete(config.path, (_req, res) => {
    res.status(405).json({ error: "Stateless transport has no server-side session to delete" });
  });

  return app;
}

export async function runHttp(config: Config): Promise<void> {
  const app = createHttpApp(config);
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, config.host, () => resolve());
    server.on("error", reject);
  });
  console.error(`planka-mcp listening on http://${config.host}:${config.port}${config.path}`);
}
