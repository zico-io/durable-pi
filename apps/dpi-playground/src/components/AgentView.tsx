import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
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
import TranscriptItem from "./TranscriptItem";
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
import { cx } from "../client/cx";

const source = (a: AgentSummary) =>
  a.kind === "fork"
    ? `Forked from agent #${a.parentId} at entry #${a.forkedAt}`
    : a.kind === "subagent"
      ? `Owned by agent #${a.ownerAgentId}`
      : "Root agent";

const kindLabel = (a: AgentSummary) => (a.kind === "root" ? "agent" : a.kind);

const kindIcon = (a: AgentSummary) =>
  a.kind === "fork" ? (
    <GitFork size={18} aria-hidden="true" />
  ) : a.kind === "subagent" ? (
    <CornerDownRight size={18} aria-hidden="true" />
  ) : (
    <MessageSquare size={18} aria-hidden="true" />
  );

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
    <section className="chat-panel">
      <header className="chat-header">
        <div className="lineage-picker">
          <div className="lineage-toolbar">
            <nav
              ref={lineageNav}
              className="crumbs conversation-lineage"
              aria-label="Conversation lineage"
            >
              <button
                className="crumb"
                title={`${device?.name} · ${device?.url}`}
                onClick={revealDevice}
              >
                <span className="crumb-kind">device</span>
                <span className="crumb-main">
                  <DeviceIcon device={device} size={18} />
                  <span className="device-chip">{device?.id}</span>
                </span>
              </button>
              <ChevronRight className="crumb-sep" size={18} aria-hidden="true" />
              <button className="crumb" title={sessionSummary?.cwd} onClick={openWorkspace}>
                <span className="crumb-kind">workspace</span>
                <span className="crumb-main">
                  <FolderOpen size={18} aria-hidden="true" />
                  <span className="crumb-name">{sessionSummary?.name}</span>
                </span>
              </button>
              {activeLineage.map((c) => (
                <Fragment key={c.id}>
                  <ChevronRight className="crumb-sep" size={18} aria-hidden="true" />
                  <button
                    className={cx("crumb", c.id === selected?.agentId && "current")}
                    aria-current={c.id === selected?.agentId ? "page" : undefined}
                    title={source(c)}
                    onClick={() => choose(c.id)}
                  >
                    <span className="crumb-kind">{kindLabel(c)}</span>
                    <span className="crumb-main">
                      {kindIcon(c)}
                      <span className="crumb-name">{c.name}</span>
                    </span>
                  </button>
                </Fragment>
              ))}
            </nav>
            <button
              className="icon-button"
              aria-label="Rename agent"
              title="Rename this agent"
              disabled={!current}
              onClick={renameAgent}
            >
              <Pencil size={18} />
            </button>
            <button
              className="icon-button conversation-menu-toggle"
              aria-label="Browse conversations"
              aria-haspopup="dialog"
              aria-expanded={picker}
              aria-controls="conversation-picker"
              title="Browse roots and forks"
              onClick={() => setPicker(!picker)}
            >
              <ChevronDown size={18} />
            </button>
          </div>
          {current && current.kind !== "root" && (
            <div className="lineage-source">{source(current)}</div>
          )}
          {picker && (
            <>
              <button
                className="conversation-menu-dismiss"
                aria-label="Close conversation picker"
                onClick={() => setPicker(false)}
              />
              <section
                id="conversation-picker"
                className="conversation-picker"
                role="dialog"
                aria-label="Choose conversation"
              >
                <div className="conversation-picker-heading">Roots &amp; forks</div>
                {choices.map((c) => (
                  <button
                    key={c.id}
                    className={cx("conversation-choice", c.id === selected?.agentId && "selected")}
                    aria-label={c.lineage.map((x) => x.name).join(" → ")}
                    aria-current={c.id === selected?.agentId ? "page" : undefined}
                    onClick={() => choose(c.id)}
                  >
                    <div className="conversation-choice-content">
                      <span className="choice-lineage">
                        {c.lineage.map((ancestor, index) => (
                          <Fragment key={ancestor.id}>
                            {index > 0 && <ChevronRight size={18} aria-hidden="true" />}
                            <span className={cx(index < c.lineage.length - 1 && "choice-ancestor")}>
                              {ancestor.name}
                            </span>
                          </Fragment>
                        ))}
                      </span>
                      <span className="choice-source">{source(c)}</span>
                    </div>
                    {c.id === selected?.agentId ? (
                      <Check size={18} aria-hidden="true" />
                    ) : c.kind === "fork" ? (
                      <GitFork size={18} aria-hidden="true" />
                    ) : (
                      <MessageSquare size={18} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </section>
            </>
          )}
        </div>
      </header>
      <div ref={chat} className="chat-scroll" data-testid="chat" onScroll={onScroll}>
        {!agentState.ready ? (
          <div className="chat-empty">
            <Activity size={30} />
            {status === "fault" ? (
              <h2>This agent is unavailable.</h2>
            ) : (
              <h2>Connecting to the agent…</h2>
            )}
            {fault ? (
              <p className="message-error">{fault}</p>
            ) : (
              <p>The agent keeps working on {device?.id} while this view connects.</p>
            )}
          </div>
        ) : (
          <>
            {!items.length && (
              <div className="chat-empty">
                <div className="agent-orb">
                  <img src="/icons/durable-pi.svg" alt="Durable Pi" />
                  <i />
                </div>
                <span className="eyebrow">YOUR DURABLE AGENT IS READY</span>
                <h2>A conversation with continuity.</h2>
                <p>Messages, tools and state live on {device?.id}, beyond this window.</p>
                <div className="starter-grid">
                  <button
                    onClick={() =>
                      preset(
                        "Inspect this directory using your tools and give me a brief overview. Do not modify any files.",
                      )
                    }
                  >
                    <FolderOpen size={18} />
                    <strong>Explore this directory</strong>
                    <span>See coding tools in action</span>
                    <ArrowUpRight size={18} />
                  </button>
                  <button
                    onClick={() =>
                      preset(
                        "Use read_state, then update_state to add a field called progress with value 1 and a boolean called ready with value false.",
                      )
                    }
                  >
                    <Braces size={18} />
                    <strong>Make a state change</strong>
                    <span>Watch the workspace update</span>
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </div>
            )}
            {items.map((item) => (
              <TranscriptItem key={item.id} item={item} onFork={fork} />
            ))}
            {agentState.running && !liveItem && !runningTool && (
              <div className="entry live-generation">
                <div className="message-label">
                  AGENT{" "}
                  <span className="streaming">
                    {agentState.retry ? "Retry scheduled" : "Working"}
                  </span>
                </div>
                <div className="typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
            {agentState.retry && (
              <p className="hint retry-note">Retrying: {agentState.retry.error}</p>
            )}
            {agentState.notices.map((n, i) => (
              <p key={i} className="message-error">
                {n}
              </p>
            ))}
          </>
        )}
      </div>
      <Composer />
    </section>
  );
}
