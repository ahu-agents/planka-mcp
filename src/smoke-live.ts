import { loadConfig } from "./config.js";
import { PlankaClient } from "./planka-client.js";

const config = loadConfig();
const client = new PlankaClient(config);
await client.health();
const projects = (await client.get("/api/projects")) as any;
const projectCount = Array.isArray(projects?.items) ? projects.items.length : 0;
const boardCount = Array.isArray(projects?.included?.boards) ? projects.included.boards.length : 0;
console.log(JSON.stringify({ ok: true, projectCount, boardCount }, null, 2));
