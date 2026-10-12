import { useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { ArrowUp, ChevronDown, Clock3, Octagon, X } from "lucide-react";
import type { WhenBusy } from "@sdk/api";
import { newId } from "../client/ids";
import { commands, parseCommand, type SlashCommand } from "../client/commands";
import {
  agentHandleAtom,
  agentStateAtom,
  attempt,
  busyAtom,
  composerAtom,
  interrupt,
  interruptingAtom,
  onlineAtom,
  selectedAtom,
} from "../client/store";
import { store } from "../client/state";
import { cx } from "../client/cx";

export default function Composer() {
  const [text, setText] = useAtom(composerAtom);
  const agentState = useAtomValue(agentStateAtom);
  const busy = useAtomValue(busyAtom);
  const interrupting = useAtomValue(interruptingAtom);
  const online = useAtomValue(onlineAtom);
  const [mode, setMode] = useState<WhenBusy>("followUp");
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  // Typing "/" lists the slash commands; arrows pick, Tab or Enter completes.
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuClosed, setMenuClosed] = useState(false);
  const [seen, setSeen] = useState(text);
  if (seen !== text) {
    setSeen(text);
    setMenuIndex(0);
    if (!text.startsWith("/")) setMenuClosed(false);
  }
  const typed = text.match(/^\/(\S*)$/);
  const matches =
    typed && !menuClosed ? commands.filter((c) => c.name.startsWith(typed[1].toLowerCase())) : [];

  // Enter on a fully typed name runs it unless it needs an argument; otherwise the name completes.
  async function pick(command: SlashCommand, enter = false) {
    const runNow =
      !command.args || (enter && command.args.startsWith("[") && text === `/${command.name}`);
    if (!runNow) setText(`/${command.name} `);
    else {
      setText(`/${command.name}`);
      await send(`/${command.name}`);
    }
  }

  function keydown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!matches.length) {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void send(text);
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const n = matches.length;
      setMenuIndex((menuIndex + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))
      void pick(matches[menuIndex], e.key === "Enter");
    else if (e.key === "Escape") setMenuClosed(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function busyWhile<T>(fn: () => Promise<T>) {
    sending.current = true;
    setPending(true);
    return fn().finally(() => {
      sending.current = false;
      setPending(false);
    });
  }

  async function runCommand(content: string) {
    const parsed = parseCommand(content);
    if (!parsed) return false;
    await busyWhile(() =>
      attempt(async () => {
        await parsed.command.run(parsed.arg);
        setText("");
      }),
    );
    return true;
  }

  // A retried send (same agent, text and mode) reuses its requestId, so the device admits it once.
  async function send(raw: string) {
    const content = raw.trim();
    const handle = store.get(agentHandleAtom);
    if (!content || sending.current || !handle) return;
    if (content.startsWith("/") && (await runCommand(content))) return;
    const t = store.get(selectedAtom)!;
    const key = `${t.deviceId}/${t.sessionId}/${t.agentId}`;
    let saved: { key: string; content: string; mode: string; requestId: string } | undefined;
    try {
      saved = JSON.parse(sessionStorage.getItem("dpi.pending-send") ?? "null");
    } catch {}
    const requestId =
      saved?.key === key && saved.content === content && saved.mode === mode
        ? saved.requestId
        : newId();
    sessionStorage.setItem("dpi.pending-send", JSON.stringify({ key, content, mode, requestId }));
    await busyWhile(() =>
      attempt(async () => {
        await handle.send(content, mode, requestId);
        sessionStorage.removeItem("dpi.pending-send");
        setText("");
      }),
    );
  }

  return (
    <div className="composer-region">
      {agentState.inbox.length > 0 && (
        <div className="queue">
          {agentState.inbox.map((item) => (
            <div key={item.id}>
              <Clock3 size={18} />
              <span>
                {item.mode === "steer" ? "Steer" : "Queued"}: {item.content ?? "Context update"}
              </span>
              <button
                className="icon-button"
                aria-label={`Withdraw submission ${item.id}`}
                title="Withdraw queued input"
                onClick={() => void attempt(() => store.get(agentHandleAtom)!.withdraw(item.id))}
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composer">
        {matches.length > 0 && (
          <ul className="slash-menu" role="listbox" aria-label="Slash commands">
            {matches.map((c, i) => (
              <li
                key={c.name}
                role="option"
                aria-selected={i === menuIndex}
                className={cx(i === menuIndex && "active")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(c);
                }}
              >
                <code>/{c.name}</code>
                {c.args && <span className="slash-args">{c.args}</span>}
                <span className="slash-desc">{c.description}</span>
              </li>
            ))}
          </ul>
        )}
        <textarea
          value={text}
          rows={2}
          placeholder="Give your agent something to do, or type / for commands…"
          aria-label="Message your agent"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={keydown}
        />
        <div className="composer-toolbar">
          <div className="composer-left">
            <div className="queue-mode">
              <select
                value={mode}
                aria-label="When busy"
                title="Follow-up waits for this run. Steer joins after a tool round."
                onChange={(e) => setMode(e.target.value as WhenBusy)}
              >
                <option value="followUp">Follow-up</option>
                <option value="steer">Steer</option>
                <option value="reject">Reject if busy</option>
              </select>
              <ChevronDown size={24} aria-hidden="true" />
            </div>
          </div>
          <div className="composer-right">
            <button
              className="interrupt"
              disabled={!busy || interrupting}
              title="Stop foreground work and owned subagents (Escape). Background jobs continue."
              onClick={interrupt}
            >
              <Octagon size={24} className="stop-sign" fill="currentColor" />
              Interrupt
            </button>
            <button
              className="send"
              aria-label="Send message"
              disabled={!text.trim() || pending || !agentState.ready || !online}
              onClick={() => void send(text)}
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </div>
      </div>
      <div className="composer-footnote">
        <span>
          <i className="live-dot" />
          Closing this window never interrupts your agent.
        </span>
      </div>
    </div>
  );
}
