import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAtomValue } from "jotai";
import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FolderOpen,
  GitFork,
  MessageSquare,
  Pencil,
} from "lucide-react";
import type { AgentSummary } from "@sdk/api";
import { lineage } from "@sdk/models";
import TranscriptItem, { messageLabel, Streaming, Typing } from "./TranscriptItem";
import DeviceIcon from "./DeviceIcon";
import Composer from "./Composer";
import {
  activeLineageAtom,
  agent,
  agentHandleAtom,
  agentStateAtom,
  deviceAtom,
  notify,
  openDialog,
  preset,
  select,
  selectedAtom,
  sessionAgentsAtom,
  sessionSummaryAtom,
  setLayout,
  toggle,
} from "../client/store";
import { store } from "../client/state";
import { Button } from "@/components/motion/button";
import { ErrorText, Eyebrow, Hint } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const source = (a: AgentSummary) =>
  a.kind === "fork"
    ? `Forked from agent #${a.parentId} at entry #${a.forkedAt}`
    : a.kind === "subagent"
      ? `Owned by agent #${a.ownerAgentId}`
      : "Root agent";

const kindLabel = (a: AgentSummary) => (a.kind === "root" ? "agent" : a.kind);

const kindIcon = (a: AgentSummary) =>
  a.kind === "fork" ? (
    <GitFork aria-hidden="true" />
  ) : a.kind === "subagent" ? (
    <CornerDownRight aria-hidden="true" />
  ) : (
    <MessageSquare aria-hidden="true" />
  );

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Crumb({
  kind,
  current,
  title,
  onClick,
  children,
}: {
  kind: string;
  current?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "crumb flex max-w-[260px] shrink-0 flex-col items-start gap-1 rounded-lg px-2.5 py-1.5 text-left transition-colors",
        focusRing,
        current ? "current bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
      )}
      aria-current={current ? "page" : undefined}
      title={title}
      onClick={onClick}
    >
      <span
        className={cn(
          "crumb-kind text-[10px] leading-none font-semibold tracking-[0.14em] uppercase max-sm:hidden",
          current ? "text-primary/70" : "text-muted-foreground",
        )}
      >
        {kind}
      </span>
      <span
        className={cn(
          "crumb-main flex max-w-full min-w-0 items-center gap-1.5 font-heading text-[15px] leading-5 font-semibold [&>svg]:size-4",
          !current && "[&>svg]:text-muted-foreground",
        )}
      >
        {children}
      </span>
    </button>
  );
}

const Sep = () => (
  <ChevronRight
    className="crumb-sep mb-2 size-4 shrink-0 self-end text-muted-foreground/60"
    aria-hidden="true"
  />
);

function StarterCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-border-strong hover:bg-accent",
        focusRing,
      )}
    >
      <span className="mb-3 grid size-8 place-items-center rounded-lg bg-muted text-primary [&>svg]:size-4">
        {icon}
      </span>
      <strong className="text-sm font-semibold">{title}</strong>
      <span className="text-sm text-muted-foreground">{hint}</span>
      <ArrowUpRight
        className="absolute top-4 right-4 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground motion-reduce:transition-none"
        aria-hidden="true"
      />
    </button>
  );
}

export default function AgentView() {
  const selected = useAtomValue(selectedAtom);
  const device = useAtomValue(deviceAtom);
  const sessionSummary = useAtomValue(sessionSummaryAtom);
  const sessionAgents = useAtomValue(sessionAgentsAtom);
  const activeLineage = useAtomValue(activeLineageAtom);
  const agentState = useAtomValue(agentStateAtom);
  const status = useAtomValue(agent.status);
  const fault = useAtomValue(agent.fault);
  const version = useAtomValue(agent.version);
  const chat = useRef<HTMLDivElement>(null);
  const lineageNav = useRef<HTMLElement>(null);
  const pinned = useRef(true);
  const [picker, setPicker] = useState(false);
  const pickerRoot = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const items = agentState.items;
  const liveItem = items.some((i) => i.kind === "assistant" && i.streaming);
  const runningTool = items.some(
    (i) =>
      (i.kind === "tool" && i.call.status === "running") ||
      (i.kind === "assistant" &&
        i.blocks.some((b) => b.type === "tool" && b.call.status === "running")),
  );
  const choices = useMemo(
    () =>
      sessionAgents
        .map((a) => ({ ...a, lineage: lineage(sessionAgents, a.id) }))
        .sort((a, b) => {
          for (let i = 0; i < Math.min(a.lineage.length, b.lineage.length); i++)
            if (a.lineage[i].id !== b.lineage[i].id) return a.lineage[i].id - b.lineage[i].id;
          return a.lineage.length - b.lineage.length;
        }),
    [sessionAgents],
  );
  const current = activeLineage.at(-1);

  useEffect(() => setPicker(false), [selected]);

  // Capture phase, so Escape closes the picker instead of reaching the app's interrupt shortcut.
  useEffect(() => {
    if (!picker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPicker(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!pickerRoot.current?.contains(e.target as Node)) setPicker(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [picker]);

  // Follow the bottom of the transcript unless the reader scrolled up.
  useLayoutEffect(() => {
    if (pinned.current)
      chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: "instant" });
  }, [version]);
  const onScroll = () => {
    const el = chat.current;
    pinned.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useLayoutEffect(() => {
    if (lineageNav.current) lineageNav.current.scrollLeft = lineageNav.current.scrollWidth;
  }, [activeLineage.length]);

  /** Device crumb: show it in the network tree. Workspace crumb: open its root agent. */
  function revealDevice() {
    if (!selected) return;
    setLayout({ tree: true });
    toggle(selected.deviceId, true);
  }
  function openWorkspace() {
    const root = sessionAgents.find((a) => a.kind === "root") ?? sessionAgents[0];
    if (root) choose(root.id);
  }

  function choose(id: number) {
    setPicker(false);
    if (selected) select({ ...selected, agentId: id });
  }

  function fork(entryId: number) {
    const handle = store.get(agentHandleAtom);
    const t = selected;
    if (!handle || !t) return;
    openDialog({
      kind: "prompt",
      title: "Fork conversation",
      hint: `${current?.name ?? `Agent #${t.agentId}`} / entry #${entryId}. Leave the name blank to use Fork #ID.`,
      label: "Fork name",
      optional: true,
      placeholder: "e.g. Alternative approach",
      submit: "Create fork",
      run: async (name) => {
        const created = await handle.fork({ entryId, name: name || undefined });
        select({ ...t, agentId: created.id });
        notify(`Forked at entry #${entryId}. App State stays shared.`);
      },
    });
  }

  function renameAgent() {
    const handle = store.get(agentHandleAtom);
    const a = current;
    if (!handle || !a) return;
    openDialog({
      kind: "prompt",
      title: "Rename agent",
      label: "Agent name",
      value: a.named ? a.name : "",
      placeholder: a.name,
      submit: "Save name",
      run: (name) => handle.rename(name),
    });
  }

  return (
    <section className="chat-panel relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header className="chat-header flex min-h-16 items-center border-b border-border bg-topbar px-3 sm:px-5">
        <div ref={pickerRoot} className="lineage-picker relative min-w-0 flex-1 py-2">
          <div className="lineage-toolbar flex min-w-0 items-center gap-1">
            <nav
              ref={lineageNav}
              className="crumbs conversation-lineage flex min-w-0 items-end gap-0.5 overflow-x-auto py-0.5 [scrollbar-width:thin]"
              aria-label="Conversation lineage"
            >
              <Crumb
                kind="device"
                title={`${device?.name} · ${device?.url}`}
                onClick={revealDevice}
              >
                <DeviceIcon device={device} size={16} />
                <span className="device-chip truncate font-mono text-sm font-medium">
                  {device?.id}
                </span>
              </Crumb>
              <Sep />
              <Crumb kind="workspace" title={sessionSummary?.cwd} onClick={openWorkspace}>
                <FolderOpen aria-hidden="true" />
                <span className="crumb-name truncate">{sessionSummary?.name}</span>
              </Crumb>
              {activeLineage.map((c) => (
                <Fragment key={c.id}>
                  <Sep />
                  <Crumb
                    kind={kindLabel(c)}
                    current={c.id === selected?.agentId}
                    title={source(c)}
                    onClick={() => choose(c.id)}
                  >
                    {kindIcon(c)}
                    <span className="crumb-name truncate">{c.name}</span>
                  </Crumb>
                </Fragment>
              ))}
            </nav>
            <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Rename agent"
                title="Rename this agent"
                disabled={!current}
                onClick={renameAgent}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn("conversation-menu-toggle", picker && "bg-muted/60 text-foreground")}
                aria-label="Browse conversations"
                aria-haspopup="dialog"
                aria-expanded={picker}
                aria-controls="conversation-picker"
                title="Browse roots and forks"
                onClick={() => setPicker(!picker)}
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform motion-reduce:transition-none",
                    picker && "rotate-180",
                  )}
                />
              </Button>
            </div>
          </div>
          {current && current.kind !== "root" && (
            <div className="lineage-source mt-0.5 px-2.5 text-xs text-muted-foreground">
              {source(current)}
            </div>
          )}
          {picker && (
            <motion.section
              id="conversation-picker"
              className="conversation-picker absolute top-full left-0 z-30 mt-1.5 max-h-[min(65vh,620px)] w-[min(540px,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border-strong/60 bg-card p-1.5 shadow-2xl shadow-black/50"
              role="dialog"
              aria-label="Choose conversation"
              initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
            >
              <Eyebrow className="conversation-picker-heading block px-3 pt-2 pb-2">
                Roots &amp; forks
              </Eyebrow>
              {choices.map((c) => {
                const isCurrent = c.id === selected?.agentId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={cn(
                      "conversation-choice flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      focusRing,
                      "focus-visible:ring-inset",
                      isCurrent ? "selected bg-primary/10" : "hover:bg-accent",
                    )}
                    aria-label={c.lineage.map((x) => x.name).join(" → ")}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={() => choose(c.id)}
                  >
                    <div className="conversation-choice-content flex min-w-0 flex-col gap-0.5">
                      <span className="choice-lineage flex flex-wrap items-center gap-1 text-sm font-medium">
                        {c.lineage.map((ancestor, index) => {
                          const last = index === c.lineage.length - 1;
                          return (
                            <Fragment key={ancestor.id}>
                              {index > 0 && (
                                <ChevronRight
                                  className="size-3.5 text-muted-foreground/70"
                                  aria-hidden="true"
                                />
                              )}
                              <span
                                className={cn(
                                  "whitespace-nowrap",
                                  !last && "choice-ancestor font-normal text-muted-foreground",
                                  last && isCurrent && "text-primary",
                                )}
                              >
                                {ancestor.name}
                              </span>
                            </Fragment>
                          );
                        })}
                      </span>
                      <span className="choice-source text-xs text-muted-foreground">
                        {source(c)}
                      </span>
                    </div>
                    {isCurrent ? (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : c.kind === "fork" ? (
                      <GitFork
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <MessageSquare
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </motion.section>
          )}
        </div>
      </header>
      <div
        ref={chat}
        className="chat-scroll min-h-0 flex-1 overflow-y-auto pt-8 pb-5 [scrollbar-color:var(--color-border-strong)_transparent] [scrollbar-width:thin]"
        data-testid="chat"
        onScroll={onScroll}
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 max-[760px]:px-4">
          {!agentState.ready ? (
            <div className="chat-empty flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
              <Activity className="size-7 text-muted-foreground" />
              <h2 className="font-heading text-xl font-semibold">
                {status === "fault" ? "This agent is unavailable." : "Connecting to the agent…"}
              </h2>
              {fault ? (
                <ErrorText className="message-error max-w-md">{fault}</ErrorText>
              ) : (
                <Hint>The agent keeps working on {device?.id} while this view connects.</Hint>
              )}
            </div>
          ) : (
            <>
              {!items.length && (
                <div className="chat-empty flex flex-1 flex-col items-center justify-center py-12 text-center">
                  <div className="agent-orb relative mb-6 grid size-14 place-items-center rounded-2xl border border-border-strong bg-gradient-to-b from-primary/15 to-muted shadow-[0_10px_40px_-10px] shadow-primary/20">
                    <img
                      src="/icons/durable-pi.svg"
                      alt="Durable Pi"
                      className="h-[25px] w-[45px]"
                    />
                    <i className="absolute -right-1 -bottom-1 size-3.5 rounded-full border-[3px] border-background bg-primary" />
                  </div>
                  <Eyebrow className="eyebrow">YOUR DURABLE AGENT IS READY</Eyebrow>
                  <h2 className="mt-3 font-heading text-2xl font-semibold tracking-tight sm:text-[28px]">
                    A conversation with continuity.
                  </h2>
                  <Hint className="mt-2">
                    Messages, tools and state live on {device?.id}, beyond this window.
                  </Hint>
                  <div className="starter-grid mt-8 grid w-full max-w-[480px] gap-3 sm:grid-cols-2">
                    <StarterCard
                      icon={<FolderOpen />}
                      title="Explore this directory"
                      hint="See coding tools in action"
                      onClick={() =>
                        preset(
                          "Inspect this directory using your tools and give me a brief overview. Do not modify any files.",
                        )
                      }
                    />
                    <StarterCard
                      icon={<Braces />}
                      title="Make a state change"
                      hint="Watch the workspace update"
                      onClick={() =>
                        preset(
                          "Use read_state, then update_state to add a field called progress with value 1 and a boolean called ready with value false.",
                        )
                      }
                    />
                  </div>
                </div>
              )}
              {items.map((item) => (
                <TranscriptItem key={item.id} item={item} onFork={fork} />
              ))}
              {agentState.running && !liveItem && !runningTool && (
                <div className="entry live-generation mb-6">
                  <div className={messageLabel}>
                    AGENT <Streaming>{agentState.retry ? "Retry scheduled" : "Working"}</Streaming>
                  </div>
                  <Typing />
                </div>
              )}
              {agentState.retry && (
                <Hint className="hint retry-note mb-3">Retrying: {agentState.retry.error}</Hint>
              )}
              {agentState.notices.map((n, i) => (
                <ErrorText key={i} className="message-error mb-3">
                  {n}
                </ErrorText>
              ))}
            </>
          )}
        </div>
      </div>
      <Composer />
    </section>
  );
}
