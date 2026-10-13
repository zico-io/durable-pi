// Custom harness extensions for the selected agent: a switch per extension, and for system-prompts a checklist of
// built-in prompts. A change edits the agent's stored selection, so the next request runs with it.
import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { ChevronRight, Puzzle } from "lucide-react";
import type { AgentExtensions } from "@sdk/api";
import {
  agentHandleAtom,
  agentStateAtom,
  attempt,
  onlineAtom,
  refreshDetail,
} from "../client/store";
import { useBound } from "../client/useBound";
import { Checkbox as BeCheckbox } from "@/components/motion/checkbox";
import { Switch } from "@/components/motion/switch";
import { Hint, PanelHeading } from "@/components/ui/text";
import { cn } from "@/lib/utils";

function Checkbox({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  const [shown, setShown] = useBound(checked);
  return (
    <BeCheckbox
      checked={shown}
      disabled={disabled}
      label={label}
      description={description}
      className="[&>span]:gap-1 [&>span>span:first-child]:font-mono [&>span>span:first-child]:text-[13px] [&>span>span:last-child]:text-sm [&>span>span:last-child]:leading-6"
      onCheckedChange={(next) => {
        setShown(next);
        onChange(next);
      }}
    />
  );
}

export default function ExtensionsPanel() {
  const handle = useAtomValue(agentHandleAtom);
  const online = useAtomValue(onlineAtom);
  const stored = JSON.stringify(useAtomValue(agentStateAtom).agent.extensions ?? null);
  const [data, setData] = useState<AgentExtensions>();
  const [busy, setBusy] = useState(false);

  // Reload on a new selection, and when the agent's stored extension selection changes from any client.
  useEffect(() => {
    if (!handle || !online) return void setData(undefined);
    let current = true;
    void handle
      .extensions()
      .catch(() => undefined)
      .then((next) => current && next && setData(next));
    return () => {
      current = false;
    };
  }, [handle, online, stored]);

  async function set(
    patch: { name: string; enabled: boolean } | { prompt: string; enabled: boolean },
  ) {
    if (!handle || busy) return;
    setBusy(true);
    try {
      const next = await attempt(() => handle.setExtension(patch));
      if (next) setData(next);
      void refreshDetail();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="extensions-panel flex flex-col gap-4">
      <PanelHeading>
        <h2>Extensions</h2>
        <Puzzle />
      </PanelHeading>
      <Hint>
        Custom harness capabilities for this agent. Turn one on and the next request uses it. The
        choice is stored with the agent, so it survives restarts.
      </Hint>
      {!data && (
        <Hint className="rounded-xl border border-dashed border-border px-4 py-3">
          Loading extensions…
        </Hint>
      )}
      {data?.extensions.map((ext) => (
        <article
          key={ext.name}
          className={cn(
            "ext-card flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors duration-200",
            ext.enabled ? "on border-primary/35" : "border-border",
          )}
          data-extension={ext.name}
        >
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <strong className="font-heading text-[15px] leading-snug font-semibold">
                {ext.title}
              </strong>
              <code className="truncate font-mono text-xs text-muted-foreground">{ext.name}</code>
            </div>
            <Switch
              checked={ext.enabled}
              ariaLabel={ext.title}
              disabled={busy}
              onCheckedChange={(enabled) => set({ name: ext.name, enabled })}
            />
          </div>
          <p className="text-sm leading-6 text-foreground/85">{ext.description}</p>
          {ext.prompts && (
            <ul
              className={cn(
                "flex flex-col gap-4 border-t border-border pt-4 transition-opacity duration-200",
                !ext.enabled && "opacity-55",
              )}
            >
              {ext.prompts.map((p) => (
                <li key={p.id} className="flex flex-col gap-1.5">
                  <Checkbox
                    checked={p.enabled}
                    disabled={busy}
                    label={p.id}
                    description={p.description}
                    onChange={(enabled) => set({ prompt: p.id, enabled })}
                  />
                  <details className="group pl-8">
                    <summary className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-sm text-primary underline-offset-4 outline-none select-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                      <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                      View prompt
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground">
                      {p.text}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
