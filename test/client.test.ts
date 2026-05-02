import assert from "node:assert/strict";
import test from "node:test";
import { PlankaClient } from "../src/planka-client.js";

type FetchCall = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("authenticates and performs an API request", async () => {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: "jwt-token" });
    return jsonResponse({ items: [{ id: "p1" }], included: { boards: [] } });
  };
  const client = new PlankaClient(
    { baseUrl: "http://planka.local", email: "agent@example.invalid", password: "pw", timeoutMs: 1000 },
    fetchImpl as typeof fetch,
  );

  const data = await client.get("/api/projects");
  assert.deepEqual(data, { items: [{ id: "p1" }], included: { boards: [] } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers && (calls[1].init.headers as Record<string, string>).Authorization, "Bearer jwt-token");
});

test("rejects non-api paths", async () => {
  const client = new PlankaClient({ baseUrl: "http://planka.local", token: "t", timeoutMs: 1000 }, async () => jsonResponse({}) as any);
  await assert.rejects(() => client.get("/swagger.json"), /Refusing non-API/);
});

test("retries once on expired token when credentials are available", async () => {
  let projectCalls = 0;
  const fetchImpl = async (url: string | URL | Request) => {
    if (String(url).endsWith("/api/access-tokens")) return jsonResponse({ item: `jwt-${projectCalls}` });
    projectCalls += 1;
    if (projectCalls === 1) return jsonResponse({ error: "expired" }, 401);
    return jsonResponse({ ok: true });
  };
  const client = new PlankaClient(
    { baseUrl: "http://planka.local", email: "agent@example.invalid", password: "pw", timeoutMs: 1000 },
    fetchImpl as typeof fetch,
  );
  assert.deepEqual(await client.get("/api/projects"), { ok: true });
  assert.equal(projectCalls, 2);
});
