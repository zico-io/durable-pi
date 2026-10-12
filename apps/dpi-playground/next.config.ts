import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// The hub and the client import the SDK from ../dpi-sdk/src, outside this app.
const root = fileURLToPath(new URL("..", import.meta.url));

export default {
  turbopack: { root },
  outputFileTracingRoot: root,
  poweredByHeader: false,
  devIndicators: false,
  // The SSE stream must reach the browser frame by frame.
  compress: false,
} satisfies NextConfig;
