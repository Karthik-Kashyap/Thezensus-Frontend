// Thin fetch wrapper for the backend API (via the local-gateway in dev; API Gateway in prod).
//
// Auth is cookie-based: the session lives in an httpOnly cookie set by the backend, so we
// send `credentials: "include"` and the gateway derives the user from it. The browser can't
// read the cookie — current-user state comes from probing /users/me (see lib/session).

// Server-side (SSR) needs an ABSOLUTE origin; the browser prefers the public base.
export const API_BASE =
  typeof window === "undefined"
    ? process.env.API_INTERNAL_URL ?? "http://localhost:8080"
    : process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  // Only declare a JSON content-type when we actually send a body — a bodyless POST
  // (e.g. logout) with content-type:application/json is rejected by Fastify.
  if (init?.body != null) headers["content-type"] = "application/json";

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers,
    credentials: "include", // send/receive the session cookie
    cache: "no-store",
  });

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    const err = new Error(`API ${res.status}: ${path}`) as Error & { status?: number; detail?: unknown };
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
