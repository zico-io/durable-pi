# Durable Pi Playground: hub + web client

The web interface of the Durable Agent Network. It runs no agents. It is one Next.js 16 app. The **hub** (its route handlers in `src/app/api`) keeps the device registry and tokens, proxies REST calls to each device's [`dpi-backend`](../dpi-backend), and multiplexes every device, session and agent stream into one SSE connection per browser tab. The **web client** (React 19, Jotai) renders those streams through the SDK models in [`../dpi-sdk`](../dpi-sdk).

See the [repository README](../../README.md) for screenshots, the network setup and the demo.

## Run

```bash
just install                         # once, from the repo root: the hub loads apps/dpi-sdk and the tests use apps/dpi-backend
just hub build                       # from the repo root: type-check and build the app (again after changes)
just hub start                       # from the repo root: http://localhost:4781 (stops whatever already holds the port)
# or, from this directory after just install:
npm run build && npm start
npm run dev                          # Next.js dev server with hot reload (no build needed)
```

| Option | Default | Meaning |
|---|---|---|
| `--port` / `DPI_HUB_PORT` | `4781` | hub port |
| `--host` / `DPI_HUB_HOST` | `127.0.0.1` | bind address. Anything else lets the network drive every device the hub holds tokens for, unless the tailnet gate is on |
| `--tailnet-allow` / `DPI_HUB_TAILNET_ALLOW` | | comma-separated Tailscale logins, e.g. `you@example.com`. When set, every request (UI and API) must come from an untagged tailnet node logged in as one of them, as tailscaled's whois reports for the connection's source address. Others get 403; 503 when tailscaled cannot answer. The MagicDNS name joins the allowed Host headers |
| `DPI_TAILSCALED_SOCKET` | `/run/tailscale/tailscaled.sock` | tailscaled's LocalAPI socket, used by the tailnet gate |
| `DPI_HOME` | `~/.dpi` | where `network.sqlite` lives |
| `DPI_NETWORK_FILE` | `dpi-network.yaml`, found by walking up from the app | devices seeded into the registry at boot |

## Hub API

| Route | Purpose |
|---|---|
| `GET /api/network` | devices with live status, device info and the last known tree (never tokens), plus `configFile`, the loaded `dpi-network.yaml` |
| `POST /api/devices/:id/check` | probe a device now. There are no device write routes: devices come from `dpi-network.yaml` and `just net register` |
| `GET`/`PUT /api/ui-state/:key` | selection, panel layout and tree width |
| `GET /api/stream` | the tab's SSE connection. The first frame carries its `streamId` |
| `PUT /api/stream/:streamId {subs}` | `<dev>/device?docs=…`, `<dev>/session/<sid>`, `<dev>/agent/<sid>/<aid>?docs=…`. Up to 20 keys. `network` is always on |
| `ALL /api/devices/:id/v1/*` | REST proxy with the device token injected. Answers 503 while the device is not online and 502 when it does not answer. Paths ending in `/events` answer 400: streams go through `/api/stream` |

`src/proxy.ts` runs `src/hub/guard.ts` on every `/api` request: it rejects unknown Host headers (DNS rebinding), cross-origin requests and non-JSON writes. The tailnet gate lives in `server.ts`, because it needs the connection's peer address, which Next.js does not expose to the app.

## Layout

```text
server.ts                       entry: options, tailnet gate per connection, the Next.js request handler
next.config.ts                  webpack build: the SDK's NodeNext imports (./x.js for ./x.ts) need extensionAlias
src/
  instrumentation.ts            starts the hub with the server
  proxy.ts                      the Host, origin and JSON guard for /api
  hub/                          hub (one instance per process, on globalThis), monitor (status machine per device),
                                device-proxy, mux, guard, tailnet, seed, http
  app/api/                      routes: network, devices/[id]/check, devices/[id]/v1/[...rest], ui-state/[key],
                                stream, stream/[streamId]
  app/                          layout, page (the client app, rendered in the browser only)
  App.tsx                       top bar; network tree | inspector | agent view; help and path dialogs
  client/                       state.ts (the Jotai store), store.ts (atoms and shared commands), feeds.ts (atoms over
                                the SDK models), stream.ts (one EventSource, named slots), hub.ts, commands.ts (slash
                                commands), jobs.ts (durable job runs), signature.ts (tool parameters as a TypeScript
                                declaration), markdown.ts, ids.ts, cx.ts
  components/                   NetworkSidebar + TreeRow + DeviceIcon, OfflinePanel,
                                Inspector tabs: Session (ContextBar), State (StateEditor), Tasks (TasksPanel),
                                  Tools, Extend (ExtensionsPanel),
                                AgentView + TranscriptItem + JobCard + Composer,
                                NewSessionDialog + DirBrowser, PromptDialog, ModelPicker, Backdrop
  styles/                       style.css, network.css, jobs.css, extensions.css
tests/                          hub.test.ts, tailnet.test.ts, network-ui.mjs, device-ui.mjs, agent-features.mjs,
                                browser-close.mjs, e2e-network.mjs
```

## Tests

```bash
npm run build && npm run lint && npm test     # types and Next.js build, Oxlint, hub and tailnet tests (faux devices)
node tests/network-ui.mjs                     # 28 browser checks against two faux devices (after npm run build)
DPI_DEVICE=<id> node tests/device-ui.mjs       # the web UI on one real device: turns, tools, model, App State, jobs, read only, fork, /compact, /reset
DPI_DEVICE=<id> node tests/agent-features.mjs  # steer, dedupe, withdraw, reject, read only, subagent, job, compact, reset
DPI_DEVICE=<id> node tests/browser-close.mjs   # quit Chrome mid-tool; the device finishes; a new browser reattaches
DPI_DEVICE=<id> node tests/e2e-network.mjs     # TUI + web + restart mid-tool + fork + reattach (needs a device that runs as a service)
```

The device suites need the hub running (`DPI_URL`, default `http://localhost:4781`). `DPI_DEVICE` defaults to `local`, except in `e2e-network.mjs`, which requires it and also drives the TUI in tmux. The browser suites use the installed Google Chrome; `HEADED=1` shows the window. Run them one device at a time, because they share the hub's persisted selection.

From the repo root, `just hub check` runs the first line, and `just test ui`, `just test device <id>` (device-ui, agent-features and browser-close), `just test devices` and `just test e2e <id>` run the rest. Build the app (`just hub build`) before the hub test and the browser suites: they run it in production mode.
