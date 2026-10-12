import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { delay, freePort } from "../../dpi-backend/tests/helpers.js";

type Peer = "owner" | "stranger" | "tagged" | "outsider" | "broken";

const whoisReplies: Record<Peer, [number, unknown]> = {
  owner: [200, { UserProfile: { LoginName: "Nico@Bask.Health" }, Node: {} }],
  stranger: [200, { UserProfile: { LoginName: "kiera@bask.health" }, Node: {} }],
  tagged: [200, { UserProfile: { LoginName: "nico@bask.health" }, Node: { Tags: ["tag:server"] } }],
  outsider: [404, {}],
  broken: [500, {}],
};

// One connection per request, so every request gets its own whois lookup.
function get(port: number, path: string, host = `127.0.0.1:${port}`) {
  return new Promise<{ status: number; body: string }>((done, fail) => {
    const req = request(
      { host: "127.0.0.1", port, path, agent: false, headers: { host } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => done({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", fail);
    req.end();
  });
}

test("tailnet gate: admits only allowed, untagged tailnet users and fails closed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dpi-tailnet-"));
  const socketPath = join(dir, "tailscaled.sock");
  let peer: Peer = "owner";
  const lookups: string[] = [];
  const tailscaled = createServer((req, res) => {
    const url = new URL(req.url ?? "", "http://local-tailscaled.sock");
    if (url.pathname === "/localapi/v0/status")
      return void res.end(JSON.stringify({ Self: { DNSName: "hub.example.ts.net." } }));
    lookups.push(url.searchParams.get("addr") ?? "");
    const [status, body] = whoisReplies[peer];
    res.writeHead(status).end(JSON.stringify(body));
  });
  tailscaled.listen(socketPath);
  await once(tailscaled, "listening");

  const networkFile = join(dir, "dpi-network.yaml");
  writeFileSync(networkFile, "devices:\n  box:\n    kind: url\n    url: http://127.0.0.1:9\n");
  const port = await freePort();
  const hub = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve(import.meta.dirname, "../apps/dpi-playground-hub/src/main.ts"),
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        DPI_HOME: dir,
        DPI_NETWORK_FILE: networkFile,
        DPI_HUB_TAILNET_ALLOW: "nico@bask.health",
        DPI_TAILSCALED_SOCKET: socketPath,
        NODE_NO_WARNINGS: "1",
      },
      cwd: resolve(import.meta.dirname, ".."),
      stdio: "ignore",
    },
  );
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await get(port, "/api/network")).status === 200) break;
      } catch {}
      await delay(100);
    }

    assert.equal((await get(port, "/api/network")).status, 200);
    assert.match(lookups.at(-1)!, /^127\.0\.0\.1:\d+$/, "whois gets the peer's ip:port");
    assert.equal(
      (await get(port, "/api/network", `hub.example.ts.net:${port}`)).status,
      200,
      "MagicDNS name passes the Host guard",
    );
    assert.equal((await get(port, "/")).status, 200, "the web UI is behind the same gate");

    const denied: [Peer, number, RegExp][] = [
      ["stranger", 403, /kiera@bask\.health is not allowed/],
      ["tagged", 403, /nico@bask\.health is not allowed/],
      ["outsider", 403, /Only tailnet users/],
      ["broken", 503, /Cannot verify tailnet identity/],
    ];
    for (const [who, status, body] of denied) {
      peer = who;
      for (const path of ["/", "/api/network"]) {
        const res = await get(port, path);
        assert.equal(res.status, status, `${who} ${path}`);
        assert.match(res.body, body);
      }
    }

    peer = "owner";
    assert.equal(
      (await get(port, "/api/network")).status,
      200,
      "recovers once tailscaled answers again",
    );
  } finally {
    hub.kill("SIGTERM");
    await once(hub, "exit");
    tailscaled.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
