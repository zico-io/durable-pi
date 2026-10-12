// One SSE connection per browser tab. The tab names the streams it wants (subscription keys);
// the hub opens one authenticated upstream per key and tags every frame with its key.
//   network                                  registry + live status of every device
//   <device>/device[?docs=a,b]               device stream
//   <device>/session/<sessionId>             session stream
//   <device>/agent/<sessionId>/<agentId>[?docs=a,b]
import { randomUUID } from "node:crypto";
import { DpiClient } from "@sdk/client";
import { DpiError } from "@sdk/errors";
import type { MuxFrame } from "@sdk/api";
import type { NetworkRegistry } from "@sdk/node/registry";
import type { DeviceMonitor } from "./monitor";
import { fail } from "./http";

interface BrowserStream {
  send(frame: MuxFrame): void;
  upstreams: Map<string, AbortController>;
}

const KEY =
  /^([a-z0-9][a-z0-9-]{0,31})\/(device|session|agent)(?:\/([^/?]+))?(?:\/([^/?]+))?(?:\?docs=([a-z0-9.,-]*))?$/;

export function parseSubKey(key: string) {
  const m = key.match(KEY);
  if (!m) throw Error(`Invalid subscription key: ${key}`);
  const [, deviceId, scope, a, b, docs] = m;
  const q = docs ? `?docs=${docs}` : "";
  const enc = encodeURIComponent;
  if (scope === "device") return { key, deviceId, path: `/v1/events${q}` };
  if (scope === "session" && a && !b)
    return { key, deviceId, path: `/v1/sessions/${enc(decodeURIComponent(a))}/events` };
  if (scope === "agent" && a && b)
    return {
      key,
      deviceId,
      path: `/v1/sessions/${enc(decodeURIComponent(a))}/agents/${enc(decodeURIComponent(b))}/events${q}`,
    };
  throw Error(`Invalid subscription key: ${key}`);
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

export class StreamMux {
  private streams = new Map<string, BrowserStream>();

  constructor(
    private readonly registry: NetworkRegistry,
    private readonly monitor: DeviceMonitor,
  ) {}

  get size() {
    return this.streams.size;
  }

  /** A tab's stream. It ends when the tab disconnects or falls more than 4 MB behind. */
  open(signal: AbortSignal): Response {
    const streamId = randomUUID();
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let closed = false;
    const write = (text: string) => {
      if (closed) return;
      if ((controller.desiredSize ?? 0) < 0) return close();
      controller.enqueue(encoder.encode(text));
    };
    const stream: BrowserStream = {
      upstreams: new Map(),
      send: (frame) => write(`data: ${JSON.stringify(frame)}\n\n`),
    };
    const body = new ReadableStream<Uint8Array>(
      { start: (c) => void (controller = c), cancel: () => close() },
      new ByteLengthQueuingStrategy({ highWaterMark: 4_000_000 }),
    );
    this.streams.set(streamId, stream);
    stream.send({ sub: "hello", frame: { type: "stream", streamId } });
    const pushNetwork = () =>
      stream.send({ sub: "network", frame: { type: "network", devices: this.monitor.network() } });
    pushNetwork();
    const off = this.monitor.onChange(pushNetwork);
    const ping = setInterval(() => write(": ping\n\n"), 15_000);
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      off();
      for (const ctl of stream.upstreams.values()) ctl.abort();
      this.streams.delete(streamId);
      try {
        controller.close();
      } catch {}
    };
    signal.addEventListener("abort", close, { once: true });
    return new Response(body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  }

  /** Replace a tab's subscription set: open new upstreams, close dropped ones. */
  subscribe(streamId: string, keys: unknown) {
    const stream = this.streams.get(streamId);
    if (!stream) throw fail(404, "Stream closed; reconnect");
    if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string") || keys.length > 20)
      throw fail(400, "subs must be a list of up to 20 keys");
    const wanted = new Map(
      (keys as string[]).filter((k) => k !== "network").map((k) => [k, parseSubKey(k)]),
    );
    for (const [key, ctl] of stream.upstreams)
      if (!wanted.has(key)) {
        ctl.abort();
        stream.upstreams.delete(key);
      }
    for (const [key, sub] of wanted)
      if (!stream.upstreams.has(key)) {
        if (!this.registry.get(sub.deviceId)) throw fail(404, `No device ${sub.deviceId}`);
        const ctl = new AbortController();
        stream.upstreams.set(key, ctl);
        void this.follow(stream, sub, ctl.signal);
      }
    return { subs: ["network", ...wanted.keys()] };
  }

  private async follow(
    stream: BrowserStream,
    sub: ReturnType<typeof parseSubKey>,
    signal: AbortSignal,
  ) {
    let backoff = 1_000;
    while (!signal.aborted) {
      await this.monitor.whenOnline(sub.deviceId, signal);
      if (signal.aborted) return;
      const device = this.registry.get(sub.deviceId);
      if (!device?.token) return;
      try {
        for await (const frame of new DpiClient(device.url, device.token).stream(
          sub.path,
          signal,
        )) {
          stream.send({ sub: sub.key, frame });
          if (frame.type === "hello") backoff = 1_000;
        }
        if (signal.aborted) return;
        stream.send({ sub: sub.key, frame: { type: "disconnected", reason: "Stream ended" } });
      } catch (e) {
        if (signal.aborted) return;
        const err =
          e instanceof DpiError ? e : new DpiError("offline", String((e as Error)?.message ?? e));
        if (err.code === "not_found" || err.code === "invalid" || err.code === "ambiguous") {
          stream.send({
            sub: sub.key,
            frame: { type: "fault", error: { code: err.code, message: err.message } },
          });
          return;
        }
        stream.send({ sub: sub.key, frame: { type: "disconnected", reason: err.message } });
      }
      await sleep(backoff, signal);
      backoff = Math.min(backoff * 2, 15_000);
    }
  }
}
