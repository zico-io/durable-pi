// The selected agent's context window: how full it is, where automatic compaction starts in the background, and
// where the next request waits for a summary. Both markers drag (or take arrow keys) and save the session's
// thresholds, which pi-durable reads at its next request.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAtomValue } from "jotai";
import { Info, X } from "lucide-react";
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
import { cx } from "../client/cx";
import { useBound } from "../client/useBound";
import Backdrop from "./Backdrop";

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

  return (
    <>
      <section className="context-section" aria-labelledby="context-title">
        <div className="section-label">
          <span id="context-title">CONTEXT</span>
          {contextWindow > 0 && (
            <button
              className="context-details-toggle"
              onClick={() => openDialog({ kind: "compaction" })}
            >
              <Info size={16} />
              Details
            </button>
          )}
        </div>
        {!contextWindow ? (
          <div className="hint">Pick a model to see its context window.</div>
        ) : (
          <>
            <div className="context-numbers">
              <strong>{k(used)}</strong>
              <span>of {k(contextWindow)} tokens</span>
              <span className="context-pct">{fullness}%</span>
              {compacting && (
                <span className="context-compacting">
                  <i />
                  Compacting
                </span>
              )}
            </div>
            <div
              ref={bar}
              className={cx("context-bar", !settings.enabled && "off")}
              onPointerMove={drag}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <div
                className={cx(
                  "context-fill",
                  marks.auto !== undefined && used >= marks.auto && "hot",
                )}
                style={{ width: pct(used) }}
              />
              <div
                className="context-reserve"
                style={{ left: pct(marks.wait) }}
                title="Reserved for the answer"
              />
              {marks.auto !== undefined && (
                <button
                  className={`context-marker auto label-${align(marks.auto)}`}
                  role="slider"
                  aria-label="Automatic compaction starts at"
                  aria-valuemin={MIN_AUTO}
                  aria-valuemax={marks.wait - GAP}
                  aria-valuenow={marks.auto}
                  aria-valuetext={`${k(marks.auto)} tokens`}
                  style={{ left: pct(marks.auto) } as CSSProperties}
                  onPointerDown={(e) => down("auto", e)}
                  onKeyDown={(e) => key("auto", e)}
                  onKeyUp={commit}
                  onBlur={commit}
                >
                  <span className="context-marker-label">Auto-compact at {k(marks.auto)}</span>
                </button>
              )}
              <button
                className={`context-marker wait label-${align(marks.wait)}`}
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
                <span className="context-marker-label">Reserve at {k(marks.wait)}</span>
              </button>
            </div>
            <p className="hint context-hint">
              {settings.enabled ? (
                <>
                  Compacts in the background at <strong>{k(marks.auto ?? marks.wait)}</strong> and
                  waits at <strong>{k(marks.wait)}</strong>.
                </>
              ) : (
                "Automatic compaction is off."
              )}
            </p>
          </>
        )}
      </section>
      {detailsOpen &&
        createPortal(
          <Backdrop onClose={closeDialog}>
            <section
              className="modal compaction-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="compaction-title"
            >
              <header>
                <h2 id="compaction-title">Context compaction</h2>
                <button
                  className="icon-button"
                  aria-label="Close context compaction"
                  onClick={closeDialog}
                >
                  <X size={18} />
                </button>
              </header>
              <p>
                A summary starts in the background at <strong>{k(marks.auto ?? marks.wait)}</strong>
                . Above <strong>{k(marks.wait)}</strong> the next request waits for it, keeping{" "}
                {k(contextWindow - marks.wait)} free for the answer. Drag a marker on the bar to
                change either point.
              </p>
              <p>
                Older entries stay stored, and <code>search_history</code> still finds them.
              </p>
              <label className="context-toggle">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    setEnabled(e.target.checked);
                    void save({ enabled: e.target.checked });
                  }}
                />
                Automatic compaction
              </label>
              <p className="hint">
                Applies to every agent in this session. <code>/compact</code> works either way.
              </p>
              <footer>
                <button className="secondary" onClick={closeDialog}>
                  Close
                </button>
              </footer>
            </section>
          </Backdrop>,
          document.body,
        )}
    </>
  );
}
