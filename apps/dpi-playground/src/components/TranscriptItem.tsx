import { Fragment } from "react";
import { useAtomValue } from "jotai";
import { Activity, Braces, Check, GitFork, Info, Layers, Wrench } from "lucide-react";
import type { ToolCallView, TranscriptItem as Item } from "@sdk/transcript";
import { markdown } from "../client/markdown";
import { json } from "../client/store";
import { jobRunsAtom } from "../client/jobs";
import { cx } from "../client/cx";
import JobCard from "./JobCard";

const statusLabel = (call: ToolCallView) =>
  call.status === "error" ? "Error" : call.status === "done" ? "Done" : call.status;

const entryClass = (item: Item) =>
  item.kind === "user"
    ? "pi-user"
    : item.kind === "assistant"
      ? item.streaming
        ? "live-generation"
        : "pi-assistant"
      : item.kind === "tool-result"
        ? "pi-tool-result"
        : item.kind === "tool"
          ? "live-tool-entry"
          : item.entryKind.replaceAll(".", "-");

function ForkButton({
  entryId,
  title,
  onFork,
}: {
  entryId: number;
  title?: string;
  onFork: (id: number) => void;
}) {
  return (
    <button
      className="fork-button"
      aria-label={`Fork at entry ${entryId}`}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        onFork(entryId);
      }}
    >
      <GitFork size={18} />
      Fork
    </button>
  );
}

export default function TranscriptItem({
  item,
  onFork,
}: {
  item: Item;
  onFork: (entryId: number) => void;
}) {
  const runs = useAtomValue(jobRunsAtom);
  const runByCall = (callId: string) => runs.find((r) => r.toolCallId === callId);

  return <article className={`entry ${entryClass(item)}`}>{body()}</article>;

  function body() {
    if (item.kind === "user")
      return (
        <>
          <div className="message-label">
            YOU <span>#{item.id}</span>
          </div>
          <div className="user-message">{item.text}</div>
        </>
      );
    if (item.kind === "assistant")
      return (
        <>
          <div className="message-label">
            AGENT{" "}
            {item.streaming ? <span className="streaming">Working</span> : <span>#{item.id}</span>}
            {!item.streaming && (
              <ForkButton
                entryId={item.id as number}
                title="Fork from this entry. App State stays shared."
                onFork={onFork}
              />
            )}
          </div>
          {item.blocks.map((b, j) => {
            if (b.type === "text")
              return (
                <div
                  key={j}
                  className="markdown"
                  dangerouslySetInnerHTML={{ __html: markdown(b.text) }}
                />
              );
            if (b.type === "thinking")
              return (
                <details key={j} className="thinking">
                  <summary>Thinking</summary>
                  <div>{b.text}</div>
                </details>
              );
            const run = b.call.name === "run_durable_job" ? runByCall(b.call.callId) : undefined;
            return (
              <Fragment key={j}>
                <details
                  className={cx("tool-call", b.call.status === "error" && "failed")}
                  data-call-id={b.call.callId}
                >
                  <summary>
                    {b.call.status === "error" ? (
                      <Info size={18} />
                    ) : b.call.status === "done" ? (
                      <Check size={18} />
                    ) : b.call.status === "running" ? (
                      <Activity size={18} />
                    ) : (
                      <Wrench size={18} />
                    )}
                    <strong>{b.call.name}</strong>
                    <code>{json(b.call.args)?.slice(0, 90)}</code>
                    <span className="tool-status">{statusLabel(b.call)}</span>
                  </summary>
                  <div className="tool-section-label">Input</div>
                  <pre>{json(b.call.args)}</pre>
                  {b.call.result !== undefined ? (
                    <>
                      <div className="tool-section-label">
                        <span>Result</span>
                        {b.call.resultEntryId !== undefined && (
                          <ForkButton
                            entryId={b.call.resultEntryId}
                            title="Fork after this result"
                            onFork={onFork}
                          />
                        )}
                      </div>
                      <pre>{b.call.result}</pre>
                    </>
                  ) : b.call.output ? (
                    <>
                      <div className="tool-section-label">Live output</div>
                      <pre>{b.call.output}</pre>
                    </>
                  ) : null}
                </details>
                {run && <JobCard run={run} />}
              </Fragment>
            );
          })}
          {item.streaming && !item.blocks.length && (
            <div className="typing">
              <i />
              <i />
              <i />
            </div>
          )}
          {item.error && <div className="message-error">{item.error}</div>}
        </>
      );
    if (item.kind === "tool-result")
      return (
        <details className={cx("tool-result", item.isError && "failed")}>
          <summary>
            {!item.isError ? <Check size={18} /> : <Info size={18} />}
            <strong>{item.name}</strong>
            <span>{item.isError ? "error" : "result"}</span>
            <ForkButton entryId={item.id} onFork={onFork} />
          </summary>
          <pre>{item.text}</pre>
        </details>
      );
    if (item.kind === "tool") {
      const run = item.call.name === "run_durable_job" ? runByCall(item.call.callId) : undefined;
      return (
        <div className="live-tool">
          <div>
            <Activity size={18} />
            <strong>{item.call.name}</strong>
            <span>{item.call.status}</span>
          </div>
          {item.call.output && <pre>{item.call.output}</pre>}
          {run && <JobCard run={run} />}
        </div>
      );
    }
    if (item.entryKind === "demo.job") {
      const taskId = (item.data as { taskId: number }).taskId;
      const run = runs.find((r) => r.id === taskId);
      if (run) return <JobCard run={run} />;
    }
    return (
      <>
        <div className="event-line">
          {item.entryKind === "demo.state-change" ? <Braces size={18} /> : <Layers size={18} />}
          <span>{item.text}</span>
          <ForkButton entryId={item.id} onFork={onFork} />
        </div>
        {item.note && (
          <details className="raw">
            <summary>Context note</summary>
            <pre>{item.note}</pre>
          </details>
        )}
      </>
    );
  }
}
