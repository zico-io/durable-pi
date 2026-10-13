import { useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  Activity,
  Braces,
  ChevronDown,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Puzzle,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { THINKING_LEVELS, type ThinkingLevel } from "@sdk/api";
import type { StateChange } from "@sdk/app-state";
import StateEditor from "./StateEditor";
import TasksPanel from "./TasksPanel";
import ExtensionsPanel from "./ExtensionsPanel";
import ContextBar from "./ContextBar";
import { message } from "../client/hub";
import { toolSignature } from "../client/signature";
import {
  agentHandleAtom,
  agentStateAtom,
  busyAtom,
  configure,
  currentModelAtom,
  detailAtom,
  deviceAtom,
  deviceFeed,
  hideInspector,
  icon,
  inspectorExpandedAtom,
  inspectorOverlayAtom,
  json,
  modelsAtom,
  notify,
  number,
  openDialog,
  panelKeys,
  sessionHandleAtom,
  sessionSummaryAtom,
  showInspector,
  tabAtom,
  tasksAtom,
  usageAtom,
} from "../client/store";
import type { SharedState } from "../client/feeds";
import { store } from "../client/state";
import { cx } from "../client/cx";
import { useBound } from "../client/useBound";

const tabs = [
  { id: "session", label: "Session", icon: FolderOpen },
  { id: "state", label: "State", icon: Braces },
  { id: "tasks", label: "Tasks", icon: Activity },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "extensions", label: "Extend", icon: Puzzle },
];

export default function Inspector() {
  const [tab, setTab] = useAtom(tabAtom);
  const expanded = useAtomValue(inspectorExpandedAtom);
  const overlay = useAtomValue(inspectorOverlayAtom);
  const tasks = useAtomValue(tasksAtom);
  // The App State draft outlives tab switches, so it lives here rather than in StateTab.
  const stateDraft = useStateDraft();

  return (
    <aside className={cx("inspector", !expanded && "collapsed", overlay && "overlay")}>
      {!expanded ? (
        <div className="panel-rail" aria-label="Inspector (collapsed)">
          <button
            className="icon-button panel-toggle"
            aria-label="Expand inspector"
            title={`Expand inspector (${panelKeys.inspector})`}
            onClick={() => showInspector()}
          >
            <PanelLeftOpen size={18} />
          </button>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={cx("rail-tab", tab === t.id && "active")}
              aria-label={`Open ${t.label}`}
              title={t.label}
              onClick={() => showInspector(t.id)}
            >
              <t.icon size={20} />
              {t.id === "tasks" && tasks.length > 0 && (
                <span className="count">{tasks.length}</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="inspector-tabs" role="tablist" aria-label="Session details">
            {tabs.map((t) => (
              <button
                id={`inspector-tab-${t.id}`}
                key={t.id}
                role="tab"
                aria-controls="inspector-panel"
                aria-selected={tab === t.id}
                className={cx(tab === t.id && "active")}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={18} />
                {t.label}
                {t.id === "tasks" && tasks.length > 0 && (
                  <span className="count">{tasks.length}</span>
                )}
              </button>
            ))}
            <button
              className="icon-button panel-toggle"
              aria-label="Collapse inspector"
              title={`Collapse inspector (${panelKeys.inspector})`}
              onClick={hideInspector}
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
          <div
            id="inspector-panel"
            className={cx("inspector-body", tab === "session" && "session-panel")}
            role="tabpanel"
            aria-labelledby={`inspector-tab-${tab}`}
          >
            {tab === "session" && <SessionTab />}
            {tab === "state" && <StateTab draft={stateDraft} />}
            {tab === "tasks" && <TasksPanel />}
            {tab === "extensions" && <ExtensionsPanel />}
            {tab === "tools" && <ToolsTab />}
          </div>
        </>
      )}
    </aside>
  );
}

function SessionTab() {
  const sessionSummary = useAtomValue(sessionSummaryAtom);
  const busy = useAtomValue(busyAtom);
  const device = useAtomValue(deviceAtom);
  const agentState = useAtomValue(agentStateAtom);
  const currentModel = useAtomValue(currentModelAtom);
  const models = useAtomValue(modelsAtom);
  const usage = useAtomValue(usageAtom);
  const detail = useAtomValue(detailAtom);
  const tasks = useAtomValue(tasksAtom);
  const [thinking, setThinking] = useBound(agentState.agent.thinkingLevel ?? "low");
  const background = tasks.filter((t) => t.background).length;
  const usageRows = [
    { label: "Input", tokens: usage.input, cost: usage.inputCost },
    { label: "Output", tokens: usage.output, cost: usage.outputCost },
    { label: "Cache read", tokens: usage.cacheRead, cost: usage.cacheReadCost },
    { label: "Cache write", tokens: usage.cacheWrite, cost: usage.cacheWriteCost },
  ];

  function renameSession() {
    const handle = store.get(sessionHandleAtom);
    if (!handle) return;
    openDialog({
      kind: "prompt",
      title: "Rename session",
      label: "Session name",
      value: sessionSummary?.name ?? "",
      submit: "Save name",
      run: (name) => handle.rename(name),
    });
  }

  return (
    <>
      <section className="session-heading">
        <h1>
          <span>{sessionSummary?.name ?? "Loading session"}</span>
          <button
            className="icon-button"
            title="Rename session"
            aria-label="Rename session"
            onClick={renameSession}
          >
            <Pencil size={18} />
          </button>
        </h1>
        <button
          className="path cwd-button"
          title={sessionSummary?.cwd}
          aria-label="Show full working directory"
          onClick={() => openDialog({ kind: "path", path: sessionSummary?.cwd ?? "" })}
        >
          <FolderOpen size={18} />
          <span className="cwd-trail" dir="rtl">
            <bdi dir="ltr">{sessionSummary?.cwd}</bdi>
          </span>
        </button>
        <div className="session-status">
          <span className={cx("status-pill", busy && "working")}>
            <i />
            {busy ? "Working" : "Idle"}
          </span>
          {background > 0 && <span className="background-pill">{background} background</span>}
          <span className="saved">
            <Server size={18} />
            {device?.id}
          </span>
        </div>
      </section>
      <section className="model-section">
        <div className="section-label">
          <span>AGENT</span>
        </div>
        <button className="model-button" onClick={() => openDialog({ kind: "models" })}>
          <img src={icon(models, agentState.agent.model?.modelId)} alt="" />
          <div>
            <strong>{currentModel?.name ?? agentState.agent.model?.modelId ?? "Loading…"}</strong>
            <small>
              {currentModel?.tier ?? ""} / {agentState.agent.model?.provider ?? ""}
            </small>
          </div>
          <ChevronDown size={18} />
        </button>
        <div className="thinking-row">
          <span>Thinking</span>
          <select
            aria-label="Thinking level"
            value={thinking}
            onChange={(e) => {
              setThinking(e.target.value as ThinkingLevel);
              configure(
                { thinkingLevel: e.target.value as ThinkingLevel },
                `Thinking ${e.target.value}. Used on the next turn.`,
              );
            }}
          >
            {THINKING_LEVELS.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </div>
        <ContextBar />
        <section className="stats-section" aria-labelledby="stats-title">
          <div className="section-label">
            <span id="stats-title">STATS</span>
          </div>
          <div className="metrics">
            <div title={`${usage.tokens.toLocaleString("en-US")} total tokens`}>
              <span>{number(usage.tokens)}</span>
              <small>total tokens</small>
            </div>
            <div>
              <span>${usage.cost.toFixed(4)}</span>
              <small>agent cost</small>
            </div>
            <div>
              <span>{detail?.tools.length ?? 0}</span>
              <small>tools</small>
            </div>
          </div>
          <table className="usage-breakdown" aria-label="Agent token and cost breakdown">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Tokens</th>
                <th scope="col">Cost (USD)</th>
              </tr>
            </thead>
            <tbody>
              {usageRows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.tokens.toLocaleString("en-US")}</td>
                  <td>${row.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}

// ------------------------------------------------------------ App State (device-wide document)

function useStateDraft() {
  const shared = useAtomValue(deviceFeed.sharedState);
  const [draft, setDraft] = useState(() => json(shared?.value ?? {}));
  const [baseline, setBaseline] = useState(draft);
  const [draftRevision, setDraftRevision] = useState(shared?.revision ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [seen, setSeen] = useState(shared);
  const dirty = draft !== baseline;
  const conflict = dirty && shared?.revision !== draftRevision;

  function resetDraft(from: SharedState | undefined = shared) {
    const text = json(from?.value ?? {});
    setDraft(text);
    setBaseline(text);
    setDraftRevision(from?.revision ?? 0);
    setError("");
  }
  // A new shared value replaces the draft unless the reader is editing it.
  if (seen !== shared) {
    setSeen(shared);
    if (!dirty) resetDraft(shared);
  }

  async function editState(change: StateChange) {
    const handle = store.get(agentHandleAtom);
    if (saving || !handle) return;
    setSaving(true);
    setError("");
    try {
      await handle.demo("state", change);
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveJson() {
    const handle = store.get(agentHandleAtom);
    if (saving || !handle) return;
    setError("");
    setSaving(true);
    try {
      const value = JSON.parse(draft);
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw Error("App State must be a JSON object.");
      const saved = await handle.demo<{ value: unknown; revision: number }>("state", {
        operation: "update",
        path: "",
        value,
        expectedRevision: draftRevision,
      });
      const text = json(saved.value);
      setDraft(text);
      setBaseline(text);
      setDraftRevision(saved.revision);
      notify("Shared App State saved.");
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }

  return {
    shared,
    draft,
    setDraft,
    dirty,
    conflict,
    saving,
    error,
    resetDraft,
    editState,
    saveJson,
  };
}

function StateTab({ draft: d }: { draft: ReturnType<typeof useStateDraft> }) {
  const device = useAtomValue(deviceAtom);
  const {
    shared,
    draft,
    setDraft,
    dirty,
    conflict,
    saving,
    error,
    resetDraft,
    editState,
    saveJson,
  } = d;
  return (
    <>
      <div className="panel-heading">
        <h2>App State</h2>
        <Braces size={18} />
      </div>
      <p className="hint app-state-description">
        One shared JSON object for every agent, session and fork on {device?.id}. You and your
        agents can read, create, update or delete values and fields. Changes appear live and persist
        across closed browsers, interrupted agents and backend restarts.
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="app-state-json"
        aria-label="App State JSON"
        spellCheck={false}
        disabled={saving || !shared}
        rows={12}
      />
      <div className="state-json-actions">
        {conflict && (
          <span className="hint">State changed elsewhere. Load the latest JSON before saving.</span>
        )}
        {dirty && (
          <button className="secondary" disabled={saving} onClick={() => resetDraft()}>
            {conflict ? "Load latest" : "Reset"}
          </button>
        )}
        <button
          className="primary small"
          disabled={!dirty || saving || conflict}
          onClick={saveJson}
        >
          {saving ? "Saving…" : "Save JSON"}
        </button>
      </div>
      {error && (
        <p className="message-error" role="alert">
          {error}
        </p>
      )}
      <StateEditor
        value={shared?.value ?? {}}
        disabled={saving || dirty || !shared}
        onChange={editState}
      />
    </>
  );
}

function ToolsTab() {
  const detail = useAtomValue(detailAtom);
  // Each tool's parameters as a highlighted TypeScript declaration, rebuilt only when the tools change.
  const signatures = useMemo(
    () => new Map(detail?.tools.map((t) => [t.name, toolSignature(t.name, t.parameters)])),
    [detail],
  );
  const readOnly = detail?.config.readOnly === true;
  const offered = detail?.tools.filter((t) => t.offered).length ?? 0;

  return (
    <>
      <div className="panel-heading">
        <h2>Tools</h2>
        <span className="tag">
          {offered} / {detail?.tools.length ?? 0}
        </span>
      </div>
      <p className="hint">
        Every tool this agent&apos;s extensions provide. Open one to see its definition.
      </p>
      <div className="hook-card">
        <div>
          <ShieldCheck size={18} />
          <strong>Read only</strong>
          <button
            className={cx("switch", readOnly && "on")}
            role="switch"
            aria-checked={readOnly}
            aria-label="Read only"
            onClick={() =>
              configure(
                { readOnly: !readOnly },
                readOnly
                  ? "Read only off. Every tool is back."
                  : "Read only on. Tools that write are disabled.",
              )
            }
          >
            <span />
          </button>
        </div>
        <p>
          Offers this agent only tools that read. Tools that create, update or delete leave its next
          request, and the choice is stored with the agent.
        </p>
      </div>
      {detail?.tools.map((tool) => (
        <details key={tool.name} className={cx("tool-row", !tool.offered && "disabled")}>
          <summary>
            <Wrench size={18} />
            <strong>{tool.name}</strong>
            {!tool.offered && <span className="tag tool-disabled">disabled</span>}
            <span className="tag">
              {tool.replay === "safe" ? "replay safe" : "interrupt on crash"}
            </span>
          </summary>
          <p>{tool.description}</p>
          {tool.parameters ? (
            <pre className="tool-signature" aria-label={`${tool.name} TypeScript definition`}>
              <code>
                {signatures.get(tool.name)?.map((t, i) => (
                  <span key={i} className={`tk-${t.kind}`}>
                    {t.text}
                  </span>
                ))}
              </code>
            </pre>
          ) : null}
          <small>
            {tool.replay === "safe"
              ? "An interrupted execution may run again after recovery."
              : "A crash records an interrupted result instead of rerunning this effect."}
          </small>
        </details>
      ))}
    </>
  );
}
