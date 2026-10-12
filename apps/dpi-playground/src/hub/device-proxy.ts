// REST proxy: /api/devices/:id/v1/... → <device url>/v1/... with the device token injected.
// Streams never go through here; browsers get them from the mux (one connection per tab).
import type { NetworkRegistry } from "@sdk/node/registry";
import type { DeviceMonitor } from "./monitor";
import { err, readJson } from "./http";

const NO_BODY = new Set([101, 204, 205, 304]);

export async function proxyDevice(
  request: Request,
  id: string,
  registry: NetworkRegistry,
  monitor: DeviceMonitor,
): Promise<Response> {
  const device = registry.get(id);
  if (!device) return Response.json(err("not_found", `No device ${id}`), { status: 404 });
  const live = monitor.state(id);
  if (live?.status !== "online" || !device.token)
    return Response.json(
      err(
        "unavailable",
        `${device.name} is ${live?.status ?? "checking"}${live?.error ? `: ${live.error}` : ""}`,
      ),
      { status: 503 },
    );
  const url = new URL(request.url);
  const prefix = `/api/devices/${encodeURIComponent(id)}`;
  const path =
    (url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname) +
    url.search;
  if (/\/events(\?|$)/.test(path))
    return Response.json(err("invalid", "Streams are served by /api/stream"), { status: 400 });
  const hasBody = !["GET", "HEAD", "DELETE"].includes(request.method);
  const idempotencyKey = request.headers.get("idempotency-key");
  try {
    const upstream = await fetch(device.url + path, {
      method: request.method,
      headers: {
        authorization: `Bearer ${device.token}`,
        "x-dpi-token": device.token,
        ...(hasBody ? { "content-type": "application/json" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: hasBody ? JSON.stringify((await readJson(request)) ?? {}) : undefined,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(330_000)]),
    });
    const text = await upstream.text();
    return new Response(NO_BODY.has(upstream.status) ? null : text, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    if ((e as { status?: number }).status) throw e;
    if (!request.signal.aborted) monitor.check(id);
    return Response.json(err("offline", `${device.name} did not answer: ${(e as Error).message}`), {
      status: 502,
    });
  }
}
