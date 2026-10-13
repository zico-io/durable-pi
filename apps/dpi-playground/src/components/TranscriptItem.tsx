import { Fragment, type ReactNode } from "react";
import { useAtomValue } from "jotai";
import {
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  GitFork,
  Info,
  Layers,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import type { ToolCallView, TranscriptItem as Item } from "@sdk/transcript";
import { markdown } from "../client/markdown";
import { json } from "../client/store";
import { jobRunsAtom } from "../client/jobs";
import JobCard from "./JobCard";
import { Button } from "@/components/motion/button";
import { ErrorText } from "@/components/ui/text";
import { cn } from "@/lib/utils";

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

export const messageLabel =
  "message-label mb-2 flex min-h-7 items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase";

const entryId = "font-mono text-xs font-normal tracking-normal text-muted-foreground/80";

export function Streaming({ children }: { children: ReactNode }) {
  return (
    <span className="streaming ml-auto inline-flex items-center gap-1.5 text-xs font-medium tracking-normal text-primary normal-case">
      <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Typing() {
  return (
    <div className="typing flex gap-1.5 py-3" aria-hidden="true">
      {["", "[animation-delay:200ms]", "[animation-delay:400ms]"].map((delay) => (
        <i key={delay} className={cn("size-1.5 animate-pulse rounded-full bg-primary/70", delay)} />
      ))}
    </div>
  );
}

const disclosure =
  "overflow-hidden rounded-xl border bg-card [&[open]>summary]:border-b [&[open]>summary]:border-border";
const disclosureSummary =
  "flex min-h-10 items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";
const sectionLabel =
  "tool-section-label flex min-h-9 items-center gap-2 px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase";
const pre =
  "max-h-[340px] overflow-auto px-3 pb-3 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground/90 [overflow-wrap:anywhere]";
const openChevron =
  "size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none";

function ForkButton({
  entryId,
  title,
  onFork,
  className,
}: {
  entryId: number;
  title?: string;
  onFork: (id: number) => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "fork-button h-7 shrink-0 gap-1 px-2.5 text-xs tracking-normal normal-case opacity-0 transition-opacity group-focus-within/entry:opacity-100 group-hover/entry:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
        className,
      )}
      aria-label={`Fork at entry ${entryId}`}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        onFork(entryId);
      }}
    >
      <GitFork className="size-3.5" />
      Fork
    </Button>
  );
}

function ToolIcon({ status }: { status: ToolCallView["status"] }) {
  if (status === "error") return <Info className="size-4 text-destructive" />;
  if (status === "done") return <Check className="size-4 text-success" />;
  if (status === "running") return <LoaderCircle className="size-4 animate-spin text-primary" />;
  return <Wrench className="size-4 text-muted-foreground" />;
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

  return (
    <article
      className={cn(
        "entry group/entry relative mb-6",
        entryClass(item),
        item.kind === "tool-result" && "-mt-3",
      )}
    >
      {body()}
    </article>
  );

  function body() {
    if (item.kind === "user")
      return (
        <div className="flex flex-col items-end">
          <div className={cn(messageLabel, "justify-end")}>
            YOU <span className={entryId}>#{item.id}</span>
          </div>
          <div className="user-message w-fit max-w-[85%] rounded-2xl rounded-tr-md border border-border bg-muted px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {item.text}
          </div>
        </div>
      );
    if (item.kind === "assistant")
      return (
        <>
          <div className={messageLabel}>
            AGENT{" "}
            {item.streaming ? (
              <Streaming>Working</Streaming>
            ) : (
              <span className={entryId}>#{item.id}</span>
            )}
            {!item.streaming && (
              <ForkButton
                entryId={item.id as number}
                title="Fork from this entry. App State stays shared."
                onFork={onFork}
                className="ml-auto"
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
                <details key={j} className="thinking group my-2">
                  <summary className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                    Thinking
                  </summary>
                  <div className="mt-2 border-l-2 border-border-strong pl-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                    {b.text}
                  </div>
                </details>
              );
            const run = b.call.name === "run_durable_job" ? runByCall(b.call.callId) : undefined;
            const failed = b.call.status === "error";
            return (
              <Fragment key={j}>
                <details
                  className={cn(
                    "tool-call group my-2.5",
                    disclosure,
                    failed ? "failed border-destructive/50" : "border-border",
                  )}
                  data-call-id={b.call.callId}
                >
                  <summary className={disclosureSummary}>
                    <ToolIcon status={b.call.status} />
                    <strong className="shrink-0 font-medium">{b.call.name}</strong>
                    <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      {json(b.call.args)?.slice(0, 90)}
                    </code>
                    <span
                      className={cn(
                        "tool-status shrink-0 text-xs capitalize",
                        failed ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {statusLabel(b.call)}
                    </span>
                    <ChevronDown className={openChevron} />
                  </summary>
                  <div className={sectionLabel}>Input</div>
                  <pre className={pre}>{json(b.call.args)}</pre>
                  {b.call.result !== undefined ? (
                    <>
                      <div className={cn(sectionLabel, "border-t border-border")}>
                        <span>Result</span>
                        {b.call.resultEntryId !== undefined && (
                          <ForkButton
                            entryId={b.call.resultEntryId}
                            title="Fork after this result"
                            onFork={onFork}
                            className="ml-auto -my-1"
                          />
                        )}
                      </div>
                      <pre className={pre}>{b.call.result}</pre>
                    </>
                  ) : b.call.output ? (
                    <>
                      <div className={cn(sectionLabel, "border-t border-border")}>Live output</div>
                      <pre className={pre}>{b.call.output}</pre>
                    </>
                  ) : null}
                </details>
                {run && <JobCard run={run} />}
              </Fragment>
            );
          })}
          {item.streaming && !item.blocks.length && <Typing />}
          {item.error && <ErrorText className="message-error mt-3">{item.error}</ErrorText>}
        </>
      );
    if (item.kind === "tool-result")
      return (
        <details
          className={cn(
            "tool-result group",
            disclosure,
            item.isError ? "failed border-destructive/50" : "border-border",
          )}
        >
          <summary className={disclosureSummary}>
            {!item.isError ? (
              <Check className="size-4 text-success" />
            ) : (
              <Info className="size-4 text-destructive" />
            )}
            <strong className="font-medium">{item.name}</strong>
            <span
              className={cn("text-xs", item.isError ? "text-destructive" : "text-muted-foreground")}
            >
              {item.isError ? "error" : "result"}
            </span>
            <ForkButton entryId={item.id} onFork={onFork} className="-my-1 ml-auto" />
            <ChevronDown className={openChevron} />
          </summary>
          <pre className={cn(pre, "pt-3")}>{item.text}</pre>
        </details>
      );
    if (item.kind === "tool") {
      const run = item.call.name === "run_durable_job" ? runByCall(item.call.callId) : undefined;
      return (
        <div className="live-tool my-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2.5 text-sm">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            <strong className="font-medium">{item.call.name}</strong>
            <span className="ml-auto text-xs text-muted-foreground capitalize">
              {item.call.status}
            </span>
          </div>
          {item.call.output && (
            <pre className="mt-2.5 max-h-[150px] overflow-auto rounded-lg bg-background/60 p-2.5 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground/90 [overflow-wrap:anywhere]">
              {item.call.output}
            </pre>
          )}
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
        <div className="event-line flex min-h-9 items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground">
          {item.entryKind === "demo.state-change" ? (
            <Braces className="size-4 text-primary" />
          ) : (
            <Layers className="size-4" />
          )}
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{item.text}</span>
          <ForkButton entryId={item.id} onFork={onFork} className="-mr-1.5" />
        </div>
        {item.note && (
          <details className="raw group mt-2">
            <summary className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              Context note
            </summary>
            <pre className="mt-2 max-h-[340px] overflow-auto rounded-lg border border-border bg-card p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground/90 [overflow-wrap:anywhere]">
              {item.note}
            </pre>
          </details>
        )}
      </>
    );
  }
}
