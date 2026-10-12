// The playground hub: the local registry of devices (~/.dpi/network.sqlite), their live status,
// a REST proxy that injects device tokens and one multiplexed SSE stream per browser tab. It runs
// no agents; every agent lives in some device's dpi-backend.
import { NetworkRegistry } from "@sdk/node/registry";
import { DeviceMonitor } from "./monitor";
import { StreamMux } from "./mux";
import { seedFromConfig } from "./seed";
import { HUB_KEY } from "./instance";

export interface Hub {
  registry: NetworkRegistry;
  monitor: DeviceMonitor;
  mux: StreamMux;
  configFile?: string;
  close(): void;
}

function create(): Hub {
  const registry = new NetworkRegistry();
  const configFile = seedFromConfig(registry, process.cwd());
  const monitor = new DeviceMonitor(registry);
  monitor.start();
  return {
    registry,
    monitor,
    mux: new StreamMux(registry, monitor),
    configFile,
    close() {
      monitor.stop();
      registry.close();
    },
  };
}

export function hub(): Hub {
  const g = globalThis as { [HUB_KEY]?: Hub };
  return (g[HUB_KEY] ??= create());
}

export function start() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { registry, configFile } = hub();
  console.log(
    `registry: ${registry.path}${configFile ? `  config: ${configFile}` : "  (no dpi-network.yaml)"}`,
  );
  console.log(
    `devices: ${
      registry
        .list()
        .map((d) => d.id)
        .join(", ") || "none"
    }`,
  );
}
