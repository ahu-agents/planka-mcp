export type TransportMode = "streamable-http" | "stdio";

export type Config = {
  baseUrl: string;
  email?: string;
  password?: string;
  token?: string;
  timeoutMs: number;
  enableRaw: boolean;
  transport: TransportMode;
  host: string;
  port: number;
  path: string;
};

function readNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function normalizeBaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error("PLANKA_BASE_URL is required");
  const url = new URL(raw);
  return url.toString().replace(/\/$/, "");
}

export function loadConfig(env = process.env): Config {
  const token = env.PLANKA_TOKEN;
  const email = env.PLANKA_AGENT_EMAIL ?? env.PLANKA_EMAIL;
  const password = env.PLANKA_AGENT_PASSWORD ?? env.PLANKA_PASSWORD;

  if (!token && (!email || !password)) {
    throw new Error(
      "Set PLANKA_TOKEN or PLANKA_AGENT_EMAIL/PLANKA_AGENT_PASSWORD",
    );
  }

  const transport = (env.PLANKA_MCP_TRANSPORT ?? "streamable-http") as TransportMode;
  if (transport !== "streamable-http" && transport !== "stdio") {
    throw new Error("PLANKA_MCP_TRANSPORT must be streamable-http or stdio");
  }

  return {
    baseUrl: normalizeBaseUrl(env.PLANKA_BASE_URL),
    email,
    password,
    token,
    timeoutMs: readNumber(env, "PLANKA_MCP_REQUEST_TIMEOUT_MS", 30_000),
    enableRaw: env.PLANKA_MCP_ENABLE_RAW === "1" || env.PLANKA_MCP_ENABLE_RAW === "true",
    transport,
    host: env.PLANKA_MCP_HOST ?? "127.0.0.1",
    port: readNumber(env, "PLANKA_MCP_PORT", 3333),
    path: env.PLANKA_MCP_PATH ?? "/mcp",
  };
}
