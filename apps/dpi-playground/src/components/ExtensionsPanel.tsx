// Custom harness extensions for the selected agent: a switch per extension, and for system-prompts a checklist of
// built-in prompts. A change edits the agent's stored selection, so the next request runs with it.
import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { Puzzle } from "lucide-react";
import type { AgentExtensions } from "@sdk/api";
import {
  agentHandleAtom,
  agentStateAtom,
  attempt,
  onlineAtom,
  refreshDetail,
} from "../client/store";
import { cx } from "../client/cx";
import { useBound } from "../client/useBound";

function Checkbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [shown, setShown] = useBound(checked);
  return (
    <input
      type="checkbox"
      checked={shown}
      disabled={disabled}
      onChange={(e) => {
        setShown(e.target.checked);
        onChange(e.target.checked);
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
    <div className="extensions-panel">
      <div className="panel-heading">
        <h2>Extensions</h2>
        <Puzzle size={18} />
      </div>
      <p className="hint">
        Custom harness capabilities for this agent. Turn one on and the next request uses it. The
        choice is stored with the agent, so it survives restarts.
      </p>
      {!data && <p className="task-empty">Loading extensions…</p>}
      {data?.extensions.map((ext) => (
        <article
          key={ext.name}
          className={cx("ext-card", ext.enabled && "on")}
          data-extension={ext.name}
        >
          <div className="ext-head">
            <div>
              <strong>{ext.title}</strong>
              <code>{ext.name}</code>
            </div>
            <button
              className={cx("switch", ext.enabled && "on")}
              role="switch"
              aria-checked={ext.enabled}
              aria-label={ext.title}
              disabled={busy}
              onClick={() => set({ name: ext.name, enabled: !ext.enabled })}
            >
              <span />
            </button>
          </div>
          <p>{ext.description}</p>
          {ext.prompts && (
            <ul className={cx("ext-prompts", !ext.enabled && "off")}>
              {ext.prompts.map((p) => (
                <li key={p.id}>
                  <label>
                    <Checkbox
                      checked={p.enabled}
                      disabled={busy}
                      onChange={(enabled) => set({ prompt: p.id, enabled })}
                    />
                    <code>{p.id}</code>
                  </label>
                  <span>{p.description}</span>
                  <details>
                    <summary>View prompt</summary>
                    <pre>{p.text}</pre>
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
