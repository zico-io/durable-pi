import type { NextRequest } from "next/server";
import { allowedHosts, guard } from "./hub/guard";

let hosts: Set<string> | undefined;

export function proxy(request: NextRequest) {
  return guard(request, (hosts ??= allowedHosts()));
}

export const config = { matcher: "/api/:path*" };
