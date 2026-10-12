// The playground hub's entry: resolves its options, checks tailnet identity per connection and
// serves the Next app (the web UI, the /api routes in src/app/api and the Host guard in
// src/proxy.ts). The tailnet check lives here because it needs the socket's peer address.
import next from "next";
import { EventEmitter } from "node:events";
import { createServer, STATUS_CODES, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { selfDnsName, tailnetGate } from "./src/hub/tailnet.ts";
import { closeHub } from "./src/hub/instance.ts";

const args = process.argv.slice(2);
const option = (key: string, fallback: string) => {
  const i = args.indexOf(key);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith("--")) throw Error(`${key} needs a value`);
  return args[i + 1];
};
const dev = args.includes("--dev");
const port = Number(option("--port", process.env.DPI_HUB_PORT ?? "4781"));
const host = option("--host", process.env.DPI_HUB_HOST ?? "127.0.0.1");
const tailnetAllow = new Set(
  option("--tailnet-allow", process.env.DPI_HUB_TAILNET_ALLOW ?? "")
    .split(",")
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean),
);
const tailscaled = process.env.DPI_TAILSCALED_SOCKET ?? "/run/tailscale/tailscaled.sock";

// The Next side (src/hub/guard.ts) reads the resolved options from the environment.
Object.assign(process.env, {
  NODE_ENV: dev ? "development" : "production",
  DPI_HUB_PORT: String(port),
  DPI_HUB_HOST: host,
});
if (tailnetAllow.size) {
  const dnsName = await selfDnsName(tailscaled);
  if (dnsName) process.env.DPI_HUB_DNS_NAME = dnsName;
}

const gate = tailnetAllow.size ? tailnetGate(tailscaled, tailnetAllow) : undefined;
// Next attaches its upgrade handler (dev hot reload) to `httpServer`. Handing it this emitter
// instead of the real server keeps upgrades behind the gate too.
const upgrades = new EventEmitter();
const app = next({
  dev,
  dir: fileURLToPath(new URL(".", import.meta.url)),
  hostname: host,
  port,
  httpServer: upgrades as Server,
});
const handle = app.getRequestHandler();

const server = createServer(async (req, res) => {
  const refusal = await gate?.(req.socket);
  if (refusal)
    return void res.writeHead(refusal.status, { "content-type": "text/plain" }).end(refusal.text);
  await handle(req, res);
});
server.on("upgrade", async (req, socket, head) => {
  const refusal = await gate?.(req.socket);
  if (refusal)
    return void socket.end(
      `HTTP/1.1 ${refusal.status} ${STATUS_CODES[refusal.status]}\r\ncontent-type: text/plain\r\nconnection: close\r\n\r\n${refusal.text}`,
    );
  upgrades.emit("upgrade", req, socket, head);
});

await app.prepare();
server.listen(port, host, () => {
  console.log(`Durable Pi hub: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  if (tailnetAllow.size) console.log(`tailnet identity required: ${[...tailnetAllow].join(", ")}`);
  else if (host !== "127.0.0.1" && host !== "localhost")
    console.warn(
      `WARNING: the hub is listening on ${host}. Anyone who can reach it can drive every device it holds tokens for.`,
    );
});

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  server.close();
  server.closeAllConnections();
  await app.close();
  closeHub();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
