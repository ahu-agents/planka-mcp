import type { Config } from "./config.js";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type FetchLike = typeof fetch;

export class PlankaApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    public readonly responseBody: unknown,
  ) {
    super(`Planka API ${method} ${path} failed with HTTP ${status}`);
  }
}

export class PlankaClient {
  private token?: string;
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: Pick<Config, "baseUrl" | "email" | "password" | "token" | "timeoutMs">,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.token = config.token;
    this.tokenExpiresAt = config.token ? Number.MAX_SAFE_INTEGER : 0;
  }

  async health(): Promise<{ ok: true; baseUrl: string }> {
    await this.request("GET", "/api/projects");
    return { ok: true, baseUrl: this.config.baseUrl };
  }

  async get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async postForm(path: string, fields: Record<string, string | number | boolean | null | undefined>): Promise<unknown> {
    return this.requestForm("POST", path, fields);
  }

  async patch(path: string, body?: unknown): Promise<unknown> {
    return this.request("PATCH", path, body);
  }

  async delete(path: string): Promise<unknown> {
    return this.request("DELETE", path);
  }

  async request(method: HttpMethod, path: string, body?: unknown, retry = false): Promise<unknown> {
    if (!path.startsWith("/api/")) {
      throw new Error(`Refusing non-API Planka path: ${path}`);
    }

    const token = await this.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await this.fetchWithTimeout(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 204) return { ok: true };
    const payload = await safeJson(response);

    if (response.status === 401 && !retry && !this.config.token) {
      this.token = undefined;
      this.tokenExpiresAt = 0;
      return this.request(method, path, body, true);
    }

    if (!response.ok) {
      throw new PlankaApiError(method, path, response.status, payload);
    }

    return payload;
  }

  async requestForm(
    method: Extract<HttpMethod, "POST">,
    path: string,
    fields: Record<string, string | number | boolean | null | undefined>,
    retry = false,
  ): Promise<unknown> {
    if (!path.startsWith("/api/")) {
      throw new Error(`Refusing non-API Planka path: ${path}`);
    }

    const token = await this.getToken();
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      form.append(key, String(value));
    }

    const response = await this.fetchWithTimeout(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: form,
    });

    if (response.status === 204) return { ok: true };
    const payload = await safeJson(response);

    if (response.status === 401 && !retry && !this.config.token) {
      this.token = undefined;
      this.tokenExpiresAt = 0;
      return this.requestForm(method, path, fields, true);
    }

    if (!response.ok) {
      throw new PlankaApiError(method, path, response.status, payload);
    }

    return payload;
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    if (!this.config.email || !this.config.password) {
      throw new Error("PLANKA_TOKEN expired/missing and email/password are unavailable");
    }

    const response = await this.fetchWithTimeout(`${this.config.baseUrl}/api/access-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        emailOrUsername: this.config.email,
        password: this.config.password,
      }),
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new PlankaApiError("POST", "/api/access-tokens", response.status, payload);
    }
    const item = (payload as { item?: unknown } | null)?.item;
    if (typeof item !== "string" || !item) {
      throw new Error("Planka auth response did not contain item token");
    }
    this.token = item;
    this.tokenExpiresAt = Date.now() + 25 * 60_000;
    return item;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
