// The hub's state lives on globalThis under this key: Next bundles every route on its own, and
// server.ts (outside the bundle) closes it on shutdown.
export const HUB_KEY = Symbol.for("dpi.hub");

export function closeHub() {
  (globalThis as { [HUB_KEY]?: { close(): void } })[HUB_KEY]?.close();
}
