import { useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { ArrowUp, ChevronDown, Octagon } from "lucide-react";
import { THINKING_LEVELS, type ThinkingLevel, type WhenBusy } from "@sdk/api";
import { newId } from "../client/ids";
import { commands, parseCommand, type SlashCommand } from "../client/commands";
import {
  agentHandleAtom,
  agentStateAtom,
  attempt,
  busyAtom,
  composerAtom,
  configure,
  currentModelAtom,
  interrupt,
  interruptingAtom,
  modelsAtom,
  onlineAtom,
  selectedAtom,
} from "../client/store";
import { store } from "../client/state";
import { Button } from "@/components/motion/button";
import { AgentChatComposer } from "@/components/premium/agent-chat-input/composer";
import { QueuedMessageLayer } from "@/components/premium/agent-chat-input/queue";
import { ToolbarButton } from "@/components/premium/agent-chat-input/toolbar-button";
import {
  AnimatedDropdown,
  AnimatedDropdownContent,
  AnimatedDropdownItemDescription,
  AnimatedDropdownItemText,
  AnimatedDropdownLabel,
  AnimatedDropdownRadioGroup,
  AnimatedDropdownRadioItem,
  AnimatedDropdownSeparator,
  AnimatedDropdownSub,
  AnimatedDropdownSubContent,
  AnimatedDropdownSubTrigger,
  AnimatedDropdownTrigger,
} from "@/components/premium/animated-dropdown";
import { SPRING_PRESS } from "@/lib/ease";
import { cn } from "@/lib/utils";

const MODES: { id: WhenBusy; label: string; description: string }[] = [
  { id: "followUp", label: "Follow-up", description: "Waits for the current run" },
  { id: "steer", label: "Steer", description: "Joins after the next tool round" },
  { id: "reject", label: "Reject if busy", description: "Refused while the agent works" },
];

const NO_SKILLS = [] as const;

const pill =
  "group h-9 gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-primary/5 hover:text-foreground";
const chevron =
  "size-4 shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-180";

function caretToEnd(editor: HTMLElement | null) {
  if (!editor) return;
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function ModelMenu({ disabled }: { disabled: boolean }) {
  const models = useAtomValue(modelsAtom);
  const current = useAtomValue(currentModelAtom);
  const agent = useAtomValue(agentStateAtom).agent;
  const thinking = agent.thinkingLevel ?? "low";
  const modelKey = agent.model ? `${agent.model.provider}/${agent.model.modelId}` : "";
  return (
    <AnimatedDropdown>
      <AnimatedDropdownTrigger asChild>
        <Button
          variant="ghost"
          disabled={disabled}
          aria-label="Change model and thinking"
          className={cn(pill, "min-w-0 max-w-[16rem]")}
        >
          <span className="truncate text-foreground">
            {current?.name ?? agent.model?.modelId ?? "Model"}
          </span>
          <span className="hidden shrink-0 sm:inline">{thinking}</span>
          <ChevronDown className={chevron} />
        </Button>
      </AnimatedDropdownTrigger>
      <AnimatedDropdownContent side="top" align="start" className="w-60">
        <AnimatedDropdownLabel>Thinking</AnimatedDropdownLabel>
        <AnimatedDropdownRadioGroup
          value={thinking}
          onValueChange={(level) =>
            configure(
              { thinkingLevel: level as ThinkingLevel },
              `Thinking ${level}. Used on the next turn.`,
            )
          }
        >
          {THINKING_LEVELS.map((level) => (
            <AnimatedDropdownRadioItem key={level} value={level}>
              <AnimatedDropdownItemText>{level}</AnimatedDropdownItemText>
            </AnimatedDropdownRadioItem>
          ))}
        </AnimatedDropdownRadioGroup>
        <AnimatedDropdownSeparator />
        <AnimatedDropdownSub>
          <AnimatedDropdownSubTrigger disabled={!models.length}>
            <AnimatedDropdownItemText>{current?.name ?? "Model"}</AnimatedDropdownItemText>
          </AnimatedDropdownSubTrigger>
          <AnimatedDropdownSubContent alignOffset={-12} className="max-h-80 w-72 overflow-y-auto">
            <AnimatedDropdownLabel>Model</AnimatedDropdownLabel>
            <AnimatedDropdownRadioGroup
              value={modelKey}
              onValueChange={(key) => {
                const m = models.find((x) => `${x.provider}/${x.id}` === key);
                if (m)
                  configure(
                    { model: { provider: m.provider, modelId: m.id } },
                    "Model saved. Used on the next turn.",
                  );
              }}
            >
              {models.map((m) => (
                <AnimatedDropdownRadioItem
                  key={`${m.provider}/${m.id}`}
                  value={`${m.provider}/${m.id}`}
                  textValue={m.name}
                >
                  <AnimatedDropdownItemText>
                    {m.name}
                    <AnimatedDropdownItemDescription>
                      {m.tier} / {m.provider}
                    </AnimatedDropdownItemDescription>
                  </AnimatedDropdownItemText>
                </AnimatedDropdownRadioItem>
              ))}
            </AnimatedDropdownRadioGroup>
          </AnimatedDropdownSubContent>
        </AnimatedDropdownSub>
      </AnimatedDropdownContent>
    </AnimatedDropdown>
  );
}

export default function Composer() {
  const [text, setText] = useAtom(composerAtom);
  const agentState = useAtomValue(agentStateAtom);
  const busy = useAtomValue(busyAtom);
  const interrupting = useAtomValue(interruptingAtom);
  const online = useAtomValue(onlineAtom);
  const [mode, setMode] = useState<WhenBusy>("followUp");
  const [pending, setPending] = useState(false);
  const [focused, setFocused] = useState(false);
  const sending = useRef(false);
  const editorId = "composer-editor";

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
    if (!runNow) {
      setText(`/${command.name} `);
      requestAnimationFrame(() => caretToEnd(document.getElementById(editorId)));
    } else {
      setText(`/${command.name}`);
      await send(`/${command.name}`);
    }
  }

  function menuKey(e: React.KeyboardEvent) {
    if (!matches.length) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const n = matches.length;
      setMenuIndex((menuIndex + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))
      void pick(matches[menuIndex], e.key === "Enter");
    else if (e.key === "Escape") setMenuClosed(true);
    else return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
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

  const canSend = !!text.trim() && !pending && agentState.ready && online;
  const modeLabel = MODES.find((m) => m.id === mode)!.label;

  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pt-3 pb-4 max-[760px]:px-3 max-[760px]:pb-3">
      {agentState.inbox.length > 0 && (
        <div className="queue mb-2">
          <QueuedMessageLayer
            messages={agentState.inbox.map((item) => ({
              id: String(item.id),
              text: `${item.mode === "steer" ? "Steer" : "Queued"}: ${item.content ?? "Context update"}`,
            }))}
            onRemove={(item) =>
              void attempt(() => store.get(agentHandleAtom)!.withdraw(Number(item.id)))
            }
          />
        </div>
      )}
      <div
        className="relative rounded-3xl border border-border bg-background transition-colors data-[focused=true]:border-border-strong"
        data-focused={focused}
      >
        {matches.length > 0 && (
          <ul
            className="absolute right-2 bottom-full left-2 z-[70] mb-2 max-h-80 list-none overflow-y-auto rounded-2xl border border-border-strong/50 bg-background/80 p-1.5 backdrop-blur-xl"
            role="listbox"
            aria-label="Slash commands"
          >
            {matches.map((c, i) => (
              <li
                key={c.name}
                role="option"
                aria-selected={i === menuIndex}
                className={cn(
                  "flex min-h-9 cursor-pointer items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm",
                  i === menuIndex && "bg-primary/5",
                )}
                onPointerEnter={() => setMenuIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(c);
                }}
              >
                <code className="shrink-0 font-mono text-foreground">/{c.name}</code>
                {c.args && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.args}</span>
                )}
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {c.description}
                </span>
              </li>
            ))}
          </ul>
        )}
        <AgentChatComposer
          id={editorId}
          aria-label="Message your agent"
          value={text}
          skills={NO_SKILLS}
          placeholder="Give your agent something to do, or type / for commands…"
          minRows={2}
          maxRows={8}
          onChange={(v) => setText(v.text)}
          onNavKeyDown={menuKey}
          onSubmit={() => void send(store.get(composerAtom))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="text-base! leading-7"
        />
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-1">
            <AnimatedDropdown>
              <AnimatedDropdownTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label="When busy"
                  title="Follow-up waits for this run. Steer joins after a tool round."
                  className={cn(pill, "shrink-0")}
                >
                  <span className="text-foreground">{modeLabel}</span>
                  <ChevronDown className={chevron} />
                </Button>
              </AnimatedDropdownTrigger>
              <AnimatedDropdownContent side="top" align="start" className="w-64">
                <AnimatedDropdownLabel>When the agent is busy</AnimatedDropdownLabel>
                <AnimatedDropdownRadioGroup
                  value={mode}
                  onValueChange={(v) => setMode(v as WhenBusy)}
                >
                  {MODES.map((m) => (
                    <AnimatedDropdownRadioItem key={m.id} value={m.id} textValue={m.label}>
                      <AnimatedDropdownItemText>
                        {m.label}
                        <AnimatedDropdownItemDescription>
                          {m.description}
                        </AnimatedDropdownItemDescription>
                      </AnimatedDropdownItemText>
                    </AnimatedDropdownRadioItem>
                  ))}
                </AnimatedDropdownRadioGroup>
              </AnimatedDropdownContent>
            </AnimatedDropdown>
            <ModelMenu disabled={!online || !agentState.ready} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ToolbarButton
              label="Interrupt"
              disabled={!busy || interrupting}
              onClick={interrupt}
              className="gap-1.5 px-3 text-foreground disabled:opacity-40"
            >
              <Octagon className="size-4 text-destructive" fill="currentColor" />
              <span title="Stop foreground work and owned subagents (Escape). Background jobs continue.">
                Interrupt
              </span>
            </ToolbarButton>
            <Button
              variant="plain"
              type="button"
              aria-label="Send message"
              disabled={!canSend}
              onClick={() => void send(text)}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_PRESS}
              className={cn(
                "grid size-9 place-items-center rounded-full bg-primary text-primary-foreground transition-colors",
                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-45",
              )}
            >
              <ArrowUp className="size-4.5" />
            </Button>
          </div>
        </div>
      </div>
      <p className="mt-2.5 flex items-center gap-2 px-3 text-xs text-muted-foreground">
        <i className="size-1 rounded-full bg-primary" />
        Closing this window never interrupts your agent.
      </p>
    </div>
  );
}
