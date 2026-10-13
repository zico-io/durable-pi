// The selected agent's context window: how full it is, where automatic compaction starts in the background, and
// where the next request waits for a summary. Both markers drag (or take arrow keys) and save the session's
// thresholds, which pi-durable reads at its next request.
import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { Info } from "lucide-react";
import {
  compactionThresholds,
  defaultCompaction,
  type CompactionSettings,
  type WireAssistantMessage,
} from "@sdk/api";
import {
  agentStateAtom,
  attempt,
  closeDialog,
  currentModelAtom,
  dialogAtom,
  openDialog,
  sessionHandleAtom,
  sessionSummaryAtom,
} from "../client/store";
import { store } from "../client/state";
import { useBound } from "../client/useBound";
import { Button } from "@/components/motion/button";
import { Checkbox } from "@/components/motion/checkbox";
import { Modal, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { Hint, SectionLabel } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const STEP = 512;
const MIN_AUTO = 4096;
const GAP = 1024;

const k = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : String(n);

type Marker = "auto" | "wait";

export default function ContextBar() {
  const agentState = useAtomValue(agentStateAtom);
  const currentModel = useAtomValue(currentModelAtom);
  const sessionSummary = useAtomValue(sessionSummaryAtom);
  const dialog = useAtomValue(dialogAtom);
  const contextWindow = currentModel?.contextWindow ?? 0;
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef<Marker>(undefined);

  /** The last reply's prompt plus output: what the next request starts from. */
  let used = 0;
  for (let i = agentState.entries.length - 1; i >= 0; i--) {
    const entry = agentState.entries[i];
    if (entry.kind !== "pi.assistant") continue;
    const reply = entry.model?.find((m) => m.role === "assistant") as
      | WireAssistantMessage
      | undefined;
    const u = reply?.usage;
    if (u) {
      used = u.totalTokens || u.input + u.output + u.cacheRead + u.cacheWrite;
      break;
    }
  }
  const compacting = agentState.compactions.length > 0;

  // A saved value shows at once; the stream's session summary confirms it a moment later.
  const [saved, setSaved] = useState<CompactionSettings>();
  const streamed = JSON.stringify(sessionSummary?.compaction);
  useEffect(() => {
    setSaved((s) => (s && streamed === JSON.stringify(s) ? undefined : s));
  }, [streamed]);
  const settings = saved ?? sessionSummary?.compaction ?? defaultCompaction(contextWindow);
  const [enabled, setEnabled] = useBound(settings.enabled);

  const [draft, setDraft] = useState<{ auto?: number; wait: number }>();
  // The details live in an app dialog, so Escape closes them instead of interrupting the agent.
  const detailsOpen = dialog?.kind === "compaction";
  useEffect(
    () => () => {
      if (store.get(dialogAtom)?.kind === "compaction") closeDialog();
    },
    [],
  );
  const marks = draft ?? compactionThresholds(contextWindow, settings);
  const pct = (n: number) => `${Math.min(100, Math.max(0, (100 * n) / (contextWindow || 1)))}%`;
  const fullness = Math.round((100 * used) / (contextWindow || 1));
  /** Labels near either end grow inward so they stay inside the panel. */
  const align = (n: number) => {
    const at = n / (contextWindow || 1);
    return at < 0.35 ? "start" : at > 0.65 ? "end" : "center";
  };

  const clampWait = (w: number, auto?: number) =>
    Math.min(contextWindow - GAP, Math.max((auto ?? MIN_AUTO) + GAP, w));
  const clampAuto = (a: number, wait: number) => Math.min(wait - GAP, Math.max(MIN_AUTO, a));

  function move(which: Marker, tokens: number) {
    const t = Math.round(tokens / STEP) * STEP;
    setDraft(
      which === "wait"
        ? { auto: marks.auto, wait: clampWait(t, marks.auto) }
        : { auto: clampAuto(t, marks.wait), wait: marks.wait },
    );
  }

  async function save(patch: Partial<CompactionSettings>) {
    const handle = store.get(sessionHandleAtom);
    if (!handle) return;
    const result = await attempt(() => handle.setCompaction(patch));
    if (result) setSaved(result);
    setDraft(undefined);
  }

  function commit() {
    if (!draft) return;
    void save({
      reserveTokens: contextWindow - draft.wait,
      ...(draft.auto !== undefined ? { backgroundTokens: draft.wait - draft.auto } : {}),
    });
  }

  function down(which: Marker, e: React.PointerEvent<HTMLElement>) {
    dragging.current = which;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function drag(e: React.PointerEvent) {
    if (!dragging.current || !bar.current) return;
    const rect = bar.current.getBoundingClientRect();
    move(dragging.current, ((e.clientX - rect.left) / rect.width) * contextWindow);
  }
  function up() {
    if (!dragging.current) return;
    dragging.current = undefined;
    commit();
  }
  function key(which: Marker, e: React.KeyboardEvent) {
    const direction =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (!direction) return;
    e.preventDefault();
    move(
      which,
      (which === "auto" ? (marks.auto ?? MIN_AUTO) : marks.wait) +
        (e.shiftKey ? 8192 : 1024) * direction,
    );
  }

  const markerClass = (which: Marker, n: number) =>
    cn(
      "context-marker group/marker absolute top-[-9px] -ml-0.5 h-[26px] w-1 cursor-ew-resize touch-none rounded-full p-0 outline-none",
      "before:absolute before:-inset-x-2.5 before:-inset-y-1 before:content-['']",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-topbar",
      which === "auto" ? "auto bg-warning" : "wait bg-foreground",
      `label-${align(n)}`,
      !settings.enabled && "opacity-45",
    );
  const labelClass = (which: Marker, n: number) =>
    cn(
      "context-marker-label pointer-events-none absolute font-mono text-xs whitespace-nowrap",
      which === "auto"
        ? "bottom-[calc(100%+6px)] text-warning"
        : "top-[calc(100%+6px)] text-foreground",
      align(n) === "start"
        ? "left-[-2px]"
        : align(n) === "end"
          ? "right-[-2px]"
          : "left-1/2 -translate-x-1/2",
    );

  return (
    <>
      <section className="context-section grid gap-2.5" aria-labelledby="context-title">
        <SectionLabel>
          <span id="context-title">Context</span>
          {contextWindow > 0 && (
            <button
              type="button"
              className="context-details-toggle -mr-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium tracking-normal text-primary normal-case outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => openDialog({ kind: "compaction" })}
            >
              <Info className="size-3.5" />
              Details
            </button>
          )}
        </SectionLabel>
        {!contextWindow ? (
          <Hint>Pick a model to see its context window.</Hint>
        ) : (
          <>
            <div className="context-numbers flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <strong className="font-heading text-xl font-semibold tabular-nums">{k(used)}</strong>
              <span className="text-sm text-muted-foreground">of {k(contextWindow)} tokens</span>
              <span className="context-pct font-mono text-xs text-muted-foreground">
                {fullness}%
              </span>
              {compacting && (
                <span className="context-compacting ml-auto inline-flex items-center gap-1.5 self-center text-xs font-medium text-warning">
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" />
                  Compacting
                </span>
              )}
            </div>
            <div
              ref={bar}
              className={cn(
                "context-bar relative mx-1 mt-8 mb-9 h-2.5 touch-none rounded-full border border-border-strong bg-muted",
                !settings.enabled && "off",
              )}
              onPointerMove={drag}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <div
                className={cn(
                  "context-fill absolute inset-y-0 left-0 rounded-l-full bg-linear-to-r from-primary/30 transition-[width] duration-300 motion-reduce:transition-none",
                  marks.auto !== undefined && used >= marks.auto ? "hot to-warning" : "to-primary",
                )}
                style={{ width: pct(used) }}
              />
              <div
                className="context-reserve absolute inset-y-0 right-0 rounded-r-full border-l border-muted-foreground/50 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.08)_0_4px,transparent_4px_8px)]"
                style={{ left: pct(marks.wait) }}
                title="Reserved for the answer"
              />
              {marks.auto !== undefined && (
                <button
                  type="button"
                  className={markerClass("auto", marks.auto)}
                  role="slider"
                  aria-label="Automatic compaction starts at"
                  aria-valuemin={MIN_AUTO}
                  aria-valuemax={marks.wait - GAP}
                  aria-valuenow={marks.auto}
                  aria-valuetext={`${k(marks.auto)} tokens`}
                  style={{ left: pct(marks.auto) }}
                  onPointerDown={(e) => down("auto", e)}
                  onKeyDown={(e) => key("auto", e)}
                  onKeyUp={commit}
                  onBlur={commit}
                >
                  <span className={labelClass("auto", marks.auto)}>
                    Auto-compact at {k(marks.auto)}
                  </span>
                </button>
              )}
              <button
                type="button"
                className={markerClass("wait", marks.wait)}
                role="slider"
                aria-label="The next request waits for a summary at"
                aria-valuemin={(marks.auto ?? MIN_AUTO) + GAP}
                aria-valuemax={contextWindow - GAP}
                aria-valuenow={marks.wait}
                aria-valuetext={`${k(marks.wait)} tokens, ${k(contextWindow - marks.wait)} reserved`}
                style={{ left: pct(marks.wait) }}
                onPointerDown={(e) => down("wait", e)}
                onKeyDown={(e) => key("wait", e)}
                onKeyUp={commit}
                onBlur={commit}
              >
                <span className={labelClass("wait", marks.wait)}>Reserve at {k(marks.wait)}</span>
              </button>
            </div>
            <Hint className="context-hint [&_strong]:font-semibold [&_strong]:text-foreground">
              {settings.enabled ? (
                <>
                  Compacts in the background at <strong>{k(marks.auto ?? marks.wait)}</strong> and
                  waits at <strong>{k(marks.wait)}</strong>.
                </>
              ) : (
                "Automatic compaction is off."
              )}
            </Hint>
          </>
        )}
      </section>
      <Modal open={detailsOpen} onClose={closeDialog} className="compaction-modal">
        <ModalHeader
          title="Context compaction"
          closeLabel="Close context compaction"
          onClose={closeDialog}
        />
        <div className="grid gap-3 text-sm leading-6 [&_code]:rounded [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_strong]:font-semibold">
          <p>
            A summary starts in the background at <strong>{k(marks.auto ?? marks.wait)}</strong>.
            Above <strong>{k(marks.wait)}</strong> the next request waits for it, keeping{" "}
            {k(contextWindow - marks.wait)} free for the answer. Drag a marker on the bar to change
            either point.
          </p>
          <p>
            Older entries stay stored, and <code>search_history</code> still finds them.
          </p>
        </div>
        <div className="context-toggle grid gap-2 rounded-xl border border-border bg-background/60 p-4">
          <Checkbox
            label="Automatic compaction"
            checked={enabled}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              void save({ enabled: checked });
            }}
          />
          <Hint className="pl-8 [&_code]:rounded [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground">
            Applies to every agent in this session. <code>/compact</code> works either way.
          </Hint>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={closeDialog}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
