import { hostname, networkInterfaces } from "node:os";
import { err } from "./http";

/**
 * The Host headers this hub answers to. server.ts resolves the options into DPI_HUB_PORT,
 * DPI_HUB_HOST and (with the tailnet gate on) DPI_HUB_DNS_NAME before Next starts.
 */
export function allowedHosts(env = process.env) {
  const port = env.DPI_HUB_PORT ?? "4781";
  const host = env.DPI_HUB_HOST ?? "127.0.0.1";
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  if (host !== "127.0.0.1" && host !== "localhost") {
    const name = hostname().toLowerCase();
    hosts.add(`${name}:${port}`);
    hosts.add(`${name.replace(/\.local$/, "")}.local:${port}`);
    for (const addresses of Object.values(networkInterfaces()))
      for (const a of addresses ?? []) if (a.family === "IPv4") hosts.add(`${a.address}:${port}`);
  }
  if (env.DPI_HUB_DNS_NAME) hosts.add(`${env.DPI_HUB_DNS_NAME}:${port}`);
  return hosts;
}

/**
 * The hub holds every device token and has no login of its own, so it only answers requests
 * whose Host is one it serves (blocks DNS rebinding) from its own origin (blocks CSRF), and
 * only accepts JSON writes (forces a CORS preflight that cross-origin pages cannot pass).
 * Returns the refusal, or undefined to let the request through.
 */
export function guard(request: Request, hosts: ReadonlySet<string>): Response | undefined {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (!hosts.has(host))
    return Response.json(err("invalid", `Unknown Host header: ${host}`), { status: 421 });
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {}
    if (originHost !== host)
      return Response.json(err("unauthorized", "Cross-origin requests are not allowed"), {
        status: 403,
      });
  }
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (["POST", "PUT", "PATCH"].includes(request.method) && type !== "application/json")
    return Response.json(err("invalid", "JSON required"), { status: 415 });
  return undefined;
}
