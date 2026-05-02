import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("package entrypoints point at built files", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.bin["planka-mcp"], "dist/src/index.js");
  assert.equal(pkg.scripts.start, "node dist/src/index.js");
  assert.equal(pkg.scripts["start:stdio"], "PLANKA_MCP_TRANSPORT=stdio node dist/src/index.js");
  assert.ok(existsSync(pkg.bin["planka-mcp"]), `${pkg.bin["planka-mcp"]} should exist after build`);
});
