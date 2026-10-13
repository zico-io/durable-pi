import { useState } from "react";
import { Copy, Loader, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import type { NetworkDevice } from "@sdk/api";
import { hub, message } from "../client/hub";
import { ago, notify } from "../client/store";
import { Button } from "@/components/motion/button";
import { ErrorText, Eyebrow, Hint } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** The exact fix for this device's state. Device setup happens in the terminal, never in this UI. */
function fixFor(d: NetworkDevice): { title: string; text: string; command?: string; alt?: string } {
  const config = d.source === "config";
  switch (d.status) {
    case "checking":
      return {
        title: `Checking ${d.id}…`,
        text: "Probing the device. This view fills in as soon as it answers.",
      };
    case "unauthorized":
      return {
        title: d.hasToken ? `${d.id} rejected its token` : `No token for ${d.id}`,
        text: d.hasToken
          ? "The device's DPI_TOKEN changed (a rotate or a rebuilt device). Copy the current token into this hub's registry, then check again."
          : "This hub has no token for the device yet. Register it, then check again.",
        command:
          config && d.kind !== "url"
            ? `just net register ${d.id}`
            : `just net register ${d.id} --token <token>`,
      };
    case "mismatch":
      return {
        title: `${d.id} answers as a different device`,
        text: "The URL now reaches a backend with another identity (a rebuilt VM or a new data directory). If that is expected, register it again: that trusts the identity it answers with now.",
        command:
          d.kind === "url"
            ? `just net register ${d.id} --token <token>`
            : `just net register ${d.id}`,
      };
    case "incompatible":
      return {
        title: `${d.id} speaks another API version`,
        text: "Update the device's dpi-backend.",
        command: config ? `just net deploy ${d.id}` : undefined,
      };
    default:
      return {
        title: `${d.id} is offline`,
        text: `Last seen ${ago(d.lastSeenAt)}. Its agents keep their state on the device and resume when its backend starts again. The tree shows the last known sessions.`,
        command: !config
          ? undefined
          : d.kind === "local"
            ? "just backend run"
            : d.kind === "url"
              ? undefined
              : `just net restart ${d.id}`,
        alt: config && d.kind !== "local" && d.kind !== "url" ? `just net up ${d.id}` : undefined,
      };
  }
}

export default function OfflinePanel({ device }: { device: NetworkDevice }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fix = fixFor(device);

  async function check() {
    setBusy(true);
    setError("");
    try {
      const d = await hub.check(device.id);
      if (d.status === "online") notify(`${d.id} is online.`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied.");
    } catch {
      notify("Clipboard needs localhost or HTTPS. Select the text to copy.");
    }
  }

  const Icon =
    device.status === "checking"
      ? Loader
      : device.status === "mismatch" || device.status === "unauthorized"
        ? ShieldAlert
        : WifiOff;

  return (
    <section
      className={cn("offline-panel flex min-w-0 flex-1 overflow-y-auto", device.status)}
      aria-live="polite"
    >
      <div className="m-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-12 text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-border bg-card text-muted-foreground">
          <Icon className={cn("size-6", device.status === "checking" && "animate-spin")} />
        </span>
        <Eyebrow className="normal-case tracking-normal">
          <span className="uppercase tracking-[0.14em]">{device.kind}</span> ·{" "}
          <span className="font-mono">{device.url}</span>
        </Eyebrow>
        <h2 className="font-heading text-2xl font-bold tracking-tight">{fix.title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{fix.text}</p>
        {device.error && (
          <p className="w-full rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs leading-5 break-words text-muted-foreground">
            {device.error}
          </p>
        )}
        {fix.command && (
          <div className="offline-command flex w-full items-center gap-2 rounded-xl border border-border bg-background py-1.5 pr-1.5 pl-4 text-left">
            <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
              {fix.command}
            </code>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy command"
              onClick={() => copy(fix.command!)}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        )}
        {fix.command && <Hint>Run it in this repo&apos;s terminal, then press Check now.</Hint>}
        {fix.alt && (
          <Hint>
            Never deployed or rebuilt?{" "}
            <code className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-[13px] text-foreground">
              {fix.alt}
            </code>{" "}
            provisions it from scratch.
          </Hint>
        )}
        <Button variant="secondary" className="mt-2" disabled={busy} onClick={check}>
          <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          {busy ? "Checking…" : "Check now"}
        </Button>
        {error && <ErrorText role="alert">{error}</ErrorText>}
      </div>
    </section>
  );
}
