import { useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  Activity,
  Braces,
  ChevronDown,
  ChevronRight,
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
import { toolSignature, type TokenKind } from "../client/signature";
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
import { useBound } from "../client/useBound";
import { Button } from "@/components/motion/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/motion/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { Switch } from "@/components/motion/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorText, Hint, PanelHeading, SectionLabel } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "session", label: "Session", icon: FolderOpen },
  { id: "state", label: "State", icon: Braces },
  { id: "tasks", label: "Tasks", icon: Activity },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "extensions", label: "Extend", icon: Puzzle },
];

const tokenColor: Record<TokenKind, string> = {
  keyword: "text-primary",
  function: "text-amber-200",
  property: "text-teal-200",
  type: "text-blue-300",
  string: "text-orange-200",
  number: "text-purple-300",
  comment: "text-muted-foreground/80 italic",
  punct: "text-foreground/60",
  text: "",
};

export default function Inspector() {
  const [tab, setTab] = useAtom(tabAtom);
  const expanded = useAtomValue(inspectorExpandedAtom);
  const overlay = useAtomValue(inspectorOverlayAtom);
  const tasks = useAtomValue(tasksAtom);
  // The App State draft outlives tab switches, so it lives here rather than in StateTab.
  const stateDraft = useStateDraft();

  return (
    <aside
      className={cn(
        "inspector flex h-full min-h-0 shrink-0 flex-col border-r border-border bg-topbar",
        expanded ? "w-[450px]" : "collapsed w-[52px]",
        // Narrow screens float the expanded inspector over the chat as a drawer.
        overlay &&
          "overlay max-[1100px]:absolute max-[1100px]:inset-y-0 max-[1100px]:left-0 max-[1100px]:z-30 max-[1100px]:w-[min(420px,100%)] max-[1100px]:shadow-[20px_0_60px_rgb(0_0_0/0.55)]",
      )}
    >
      {!expanded ? (
        <div
          className="panel-rail flex h-full flex-col items-center gap-1.5 overflow-y-auto py-2.5 [scrollbar-width:none]"
          aria-label="Inspector (collapsed)"
        >
          <Button
            variant="ghost"
            size="icon"
            className="panel-toggle mb-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Expand inspector"
            title={`Expand inspector (${panelKeys.inspector})`}
            onClick={() => showInspector()}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "rail-tab relative grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.id &&
                  "active bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
              aria-label={`Open ${t.label}`}
              title={t.label}
              onClick={() => showInspector(t.id)}
            >
              <t.icon className="size-[18px]" />
              {t.id === "tasks" && tasks.length > 0 && (
                <span className="count absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums">
                  {tasks.length}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-1 border-b border-border pr-2 pl-1">
            <Tabs variant="underline" value={tab} onValueChange={setTab} className="min-w-0 flex-1">
              <TabsList
                aria-label="Session details"
                className="inspector-tabs w-full gap-0 border-transparent"
              >
                {tabs.map((t) => (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    id={`inspector-tab-${t.id}`}
                    aria-controls="inspector-panel"
                    indicatorClassName="h-0.5 rounded-full"
                    className={cn(
                      "min-h-0 flex-1 flex-col justify-center gap-1 rounded-md px-1 pt-2.5 pb-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      tab === t.id && "active text-primary",
                    )}
                  >
                    <t.icon className="size-4" />
                    <span className="inline-flex items-center gap-1">
                      {t.label}
                      {t.id === "tasks" && tasks.length > 0 && (
                        <span className="count rounded-full bg-primary/15 px-1.5 text-[11px] leading-4 font-semibold text-primary tabular-nums">
                          {tasks.length}
                        </span>
                      )}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="icon"
              className="panel-toggle shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Collapse inspector"
              title={`Collapse inspector (${panelKeys.inspector})`}
              onClick={hideInspector}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>
          <div
            id="inspector-panel"
            className={cn(
              "inspector-body flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-color:var(--color-border-strong)_transparent] [scrollbar-width:thin]",
              tab !== "session" && "gap-4 p-5",
            )}
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
  const metrics = [
    {
      value: number(usage.tokens),
      label: "total tokens",
      title: `${usage.tokens.toLocaleString("en-US")} total tokens`,
    },
    { value: `$${usage.cost.toFixed(4)}`, label: "agent cost" },
    { value: String(detail?.tools.length ?? 0), label: "tools" },
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
      <section className="session-heading grid gap-2.5 p-5 pb-4">
        <h1 className="flex min-w-0 items-center justify-between gap-2 font-heading text-lg font-semibold">
          <span className="truncate">{sessionSummary?.name ?? "Loading session"}</span>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 size-8 shrink-0 text-muted-foreground hover:text-foreground"
            title="Rename session"
            aria-label="Rename session"
            onClick={renameSession}
          >
            <Pencil className="size-4" />
          </Button>
        </h1>
        <button
          type="button"
          className="path cwd-button -mx-1.5 flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left font-mono text-[13px] text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          title={sessionSummary?.cwd}
          aria-label="Show full working directory"
          onClick={() => openDialog({ kind: "path", path: sessionSummary?.cwd ?? "" })}
        >
          <FolderOpen className="size-4 shrink-0" />
          <span className="cwd-trail min-w-0 flex-1 truncate" dir="rtl">
            <bdi dir="ltr">{sessionSummary?.cwd}</bdi>
          </span>
        </button>
        <div className="session-status flex flex-wrap items-center gap-2">
          <Badge
            variant={busy ? "primary" : "default"}
            className={cn("status-pill gap-1.5", busy && "working")}
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full bg-current", busy && "animate-pulse")}
            />
            {busy ? "Working" : "Idle"}
          </Badge>
          {background > 0 && (
            <Badge variant="outline" className="background-pill">
              {background} background
            </Badge>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Server className="size-3.5" />
            {device?.id}
          </span>
        </div>
      </section>
      <section className="model-section grid gap-6 border-t border-border p-5">
        <div className="grid gap-2.5">
          <SectionLabel>
            <span>Agent</span>
          </SectionLabel>
          <button
            type="button"
            className="model-button flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors outline-none hover:border-border-strong hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => openDialog({ kind: "models" })}
          >
            <img
              src={icon(models, agentState.agent.model?.modelId)}
              alt=""
              className="size-8 shrink-0 rounded-lg bg-foreground object-contain p-1"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <strong className="truncate text-sm font-semibold">
                {currentModel?.name ?? agentState.agent.model?.modelId ?? "Loading…"}
              </strong>
              <small className="truncate text-xs text-muted-foreground">
                {currentModel?.tier ?? ""} / {agentState.agent.model?.provider ?? ""}
              </small>
            </div>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
          <div className="thinking-row flex items-center justify-between gap-3">
            <span className="text-sm">Thinking</span>
            <Select
              value={thinking}
              onValueChange={(level) => {
                setThinking(level as ThinkingLevel);
                configure(
                  { thinkingLevel: level as ThinkingLevel },
                  `Thinking ${level}. Used on the next turn.`,
                );
              }}
              className="w-36"
            >
              <SelectTrigger aria-label="Thinking level" className="py-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THINKING_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <ContextBar />
        <section className="stats-section grid gap-2.5" aria-labelledby="stats-title">
          <SectionLabel>
            <span id="stats-title">Stats</span>
          </SectionLabel>
          <div className="metrics grid grid-cols-3 gap-2">
            {metrics.map((m) => (
              <div
                key={m.label}
                title={m.title}
                className="grid min-w-0 gap-0.5 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <span className="truncate font-heading text-base font-semibold tabular-nums">
                  {m.value}
                </span>
                <small className="text-xs text-muted-foreground">{m.label}</small>
              </div>
            ))}
          </div>
          <Table className="usage-breakdown" aria-label="Agent token and cost breakdown">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead
                  scope="col"
                  className="h-9 px-0 text-xs font-medium text-muted-foreground"
                >
                  Type
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-9 text-right text-xs font-medium text-muted-foreground"
                >
                  Tokens
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-9 px-0 text-right text-xs font-medium text-muted-foreground"
                >
                  Cost (USD)
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usageRows.map((row) => (
                <TableRow key={row.label} className="border-border hover:bg-transparent">
                  <TableHead scope="row" className="h-9 px-0 font-normal text-muted-foreground">
                    {row.label}
                  </TableHead>
                  <TableCell className="text-right tabular-nums">
                    {row.tokens.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="px-0 text-right tabular-nums">
                    ${row.cost.toFixed(4)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
      <div className="grid gap-1.5">
        <PanelHeading>
          <h2>App State</h2>
          <Braces />
        </PanelHeading>
        <Hint>
          One shared JSON object for every agent, session and fork on {device?.id}. You and your
          agents can read, create, update or delete values and fields. Changes appear live and
          persist across closed browsers, interrupted agents and backend restarts.
        </Hint>
      </div>
      <div className="grid gap-2.5">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="app-state-json field-sizing-fixed resize-y rounded-xl bg-background px-3.5 py-3 font-mono text-xs leading-5 md:text-xs dark:bg-background"
          aria-label="App State JSON"
          spellCheck={false}
          disabled={saving || !shared}
          rows={12}
        />
        <div className="state-json-actions flex flex-wrap items-center justify-end gap-2">
          {conflict && (
            <span className="mr-auto text-xs text-warning">
              State changed elsewhere. Load the latest JSON before saving.
            </span>
          )}
          {dirty && (
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => resetDraft()}>
              {conflict ? "Load latest" : "Reset"}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || saving || conflict}
            onClick={saveJson}
          >
            {saving ? "Saving…" : "Save JSON"}
          </Button>
        </div>
        {error && <ErrorText role="alert">{error}</ErrorText>}
      </div>
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
      <div className="grid gap-1.5">
        <PanelHeading>
          <h2>Tools</h2>
          <Badge variant="outline" className="tabular-nums">
            {offered} / {detail?.tools.length ?? 0}
          </Badge>
        </PanelHeading>
        <Hint>
          Every tool this agent&apos;s extensions provide. Open one to see its definition.
        </Hint>
      </div>
      <Card size="compact" className="bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-muted-foreground" />
            Read only
          </CardTitle>
          <CardDescription>
            Offers this agent only tools that read. Tools that create, update or delete leave its
            next request, and the choice is stored with the agent.
          </CardDescription>
          <CardAction>
            <Switch
              ariaLabel="Read only"
              checked={readOnly}
              onCheckedChange={() =>
                configure(
                  { readOnly: !readOnly },
                  readOnly
                    ? "Read only off. Every tool is back."
                    : "Read only on. Tools that write are disabled.",
                )
              }
            />
          </CardAction>
        </CardHeader>
      </Card>
      <div className="grid">
        {detail?.tools.map((tool) => (
          <details
            key={tool.name}
            className={cn(
              "tool-row group border-b border-border last:border-b-0",
              !tool.offered && "disabled",
            )}
          >
            <summary className="-mx-2 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 outline-none select-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              <Wrench
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground",
                  !tool.offered && "opacity-50",
                )}
              />
              <strong
                className={cn(
                  "min-w-0 truncate font-mono text-[13px] font-medium",
                  !tool.offered && "text-muted-foreground opacity-70",
                )}
              >
                {tool.name}
              </strong>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {!tool.offered && (
                  <Badge variant="warning" className="tool-disabled">
                    disabled
                  </Badge>
                )}
                <Badge variant={tool.replay === "safe" ? "success" : "default"}>
                  {tool.replay === "safe" ? "replay safe" : "interrupt on crash"}
                </Badge>
              </span>
            </summary>
            <div className={cn("grid gap-3 pt-1 pb-4 pl-6", !tool.offered && "opacity-60")}>
              <p className="text-sm leading-6 text-muted-foreground">{tool.description}</p>
              {tool.parameters ? (
                <pre
                  className="tool-signature overflow-x-auto rounded-lg border border-border bg-background px-3.5 py-3 font-mono text-xs leading-5 [overflow-wrap:anywhere] whitespace-pre-wrap text-foreground"
                  aria-label={`${tool.name} TypeScript definition`}
                >
                  <code>
                    {signatures.get(tool.name)?.map((t, i) => (
                      <span key={i} className={tokenColor[t.kind]}>
                        {t.text}
                      </span>
                    ))}
                  </code>
                </pre>
              ) : null}
              <small className="text-xs leading-5 text-muted-foreground">
                {tool.replay === "safe"
                  ? "An interrupted execution may run again after recovery."
                  : "A crash records an interrupted result instead of rerunning this effect."}
              </small>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
