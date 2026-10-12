import type { RequestHandler } from "express";
import { request } from "node:http";
import type { Socket } from "node:net";

export interface TailnetIdentity {
  login: string;
  tagged: boolean;
}

function localApi<T>(socketPath: string, path: string): Promise<{ status: number; body?: T }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path, headers: { Host: "local-tailscaled.sock" }, timeout: 3000 },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: res.statusCode === 200 ? JSON.parse(data) : undefined,
            });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(Error("tailscaled timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** Who tailscaled says is behind a peer address, or undefined when the address is not a tailnet peer. */
export async function whois(socketPath: string, address: string, port: number) {
  const ip = address.replace(/^::ffff:/, "");
  const addr = ip.includes(":") ? `[${ip}]:${port}` : `${ip}:${port}`;
  const { status, body } = await localApi<{
    UserProfile?: { LoginName?: string };
    Node?: { Tags?: string[] };
  }>(socketPath, `/localapi/v0/whois?addr=${encodeURIComponent(addr)}`);
  if (status === 404) return undefined;
  const login = body?.UserProfile?.LoginName;
  if (status !== 200 || !login) throw Error(`tailscaled whois answered ${status}`);
  return {
    login: login.toLowerCase(),
    tagged: (body.Node?.Tags?.length ?? 0) > 0,
  } satisfies TailnetIdentity;
}

/** This machine's MagicDNS name, without the trailing dot. */
export async function selfDnsName(socketPath: string) {
  const { status, body } = await localApi<{ Self?: { DNSName?: string } }>(
    socketPath,
    "/localapi/v0/status?peers=false",
  );
  if (status !== 200) throw Error(`tailscaled status answered ${status}`);
  return body?.Self?.DNSName?.replace(/\.$/, "").toLowerCase() || undefined;
}

/**
 * Admits a request only when tailscaled maps its connection to an untagged node logged in as an
 * allowed user. The identity comes from WireGuard, not from anything the client sends, and is
 * looked up once per connection. Fails closed when tailscaled cannot answer.
 */
export function tailnetGate(socketPath: string, allow: ReadonlySet<string>): RequestHandler {
  const identities = new WeakMap<Socket, Promise<TailnetIdentity | undefined>>();
  return (req, res, next) => {
    const socket = req.socket;
    let identity = identities.get(socket);
    if (!identity) {
      identity = whois(socketPath, socket.remoteAddress ?? "", socket.remotePort ?? 0);
      identities.set(socket, identity);
    }
    identity.then(
      (id) => {
        if (id && !id.tagged && allow.has(id.login)) return next();
        res
          .status(403)
          .type("text")
          .send(
            id
              ? `${id.login} is not allowed on this hub\n`
              : "Only tailnet users can reach this hub\n",
          );
      },
      (e: Error) => {
        identities.delete(socket);
        res.status(503).type("text").send(`Cannot verify tailnet identity: ${e.message}\n`);
      },
    );
  };
}
