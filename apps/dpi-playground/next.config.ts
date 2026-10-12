import type { NextConfig } from "next";

export default {
  poweredByHeader: false,
  devIndicators: false,
  // The SSE stream must reach the browser frame by frame.
  compress: false,
  // The SDK lives in ../dpi-sdk and uses NodeNext imports (./errors.js for ./errors.ts), which
  // Turbopack cannot resolve; webpack's extensionAlias can. Hence `--webpack` in package.json.
  experimental: { externalDir: true },
  webpack(config) {
    config.resolve.extensionAlias = { ".js": [".ts", ".js"] };
    return config;
  },
} satisfies NextConfig;
