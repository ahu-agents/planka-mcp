#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { runHttp, runStdio } from "./server.js";

const config = loadConfig();

if (config.transport === "stdio") {
  await runStdio(config);
} else {
  await runHttp(config);
}
