// One durable job run, live: its named phases as a stepper, every step each phase took (commands, a subagent's
// tool calls, App State writes, checkpoints), the approval when it waits, and how it is owned.
import { useAtomValue } from "jotai";
import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Hand,
  ListChecks,
  LoaderCircle,
  Octagon,
  Repeat,
  ShieldCheck,
  Terminal,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import {
  jobRunDone,
  type JobPhaseRun,
  type JobPhaseStatus,
  type JobRun,
  type JobStep,
} from "@sdk/jobs";
import {
  decide,
  jobDef,
  jobDefsAtom,
  nowAtom,
  openAgent,
  pendingAtom,
  seconds,
  stopRun,
} from "../client/jobs";
import { display } from "../client/store";
import { Button } from "@/components/motion/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ErrorText, Eyebrow } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const statusText: Record<JobRun["status"], string> = {
  running: "Running",
  waiting: "Waiting for you",
  completed: "Completed",
  failed: "Failed",
  aborted: "Stopped",
  declined: "Declined",
};
const statusBadge: Record<JobRun["status"], BadgeVariant> = {
  running: "primary",
  waiting: "warning",
  completed: "success",
  failed: "destructive",
  aborted: "default",
  declined: "destructive",
};
const statusEdge: Record<JobRun["status"], string> = {
  running: "border-l-primary",
  waiting: "border-l-warning",
  completed: "border-l-success",
  failed: "border-l-destructive",
  aborted: "border-l-border-strong",
  declined: "border-l-destructive",
};
const statusTile: Record<JobRun["status"], string> = {
  running: "bg-primary/10 text-primary",
  waiting: "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  aborted: "bg-muted text-muted-foreground",
  declined: "bg-destructive/10 text-destructive",
};
const chipTone: Record<JobPhaseStatus, { chip: string; dot: string }> = {
  done: { chip: "border-success/30 bg-success/10", dot: "bg-success/20 text-success" },
  running: {
    chip: "border-primary/50 bg-primary/10 ring-2 ring-primary/15",
    dot: "bg-primary/20 text-primary",
  },
  waiting: {
    chip: "border-warning/50 bg-warning/10 ring-2 ring-warning/15",
    dot: "bg-warning/20 text-warning",
  },
  failed: {
    chip: "border-destructive/40 bg-destructive/10",
    dot: "bg-destructive/20 text-destructive",
  },
  aborted: { chip: "border-destructive/40 bg-muted", dot: "bg-destructive/15 text-destructive" },
  pending: { chip: "border-border bg-muted", dot: "bg-accent text-muted-foreground" },
  skipped: { chip: "border-border bg-muted opacity-55", dot: "bg-accent text-muted-foreground" },
};
const phaseBorder: Partial<Record<JobPhaseStatus, string>> = {
  running: "border-primary/35",
  waiting: "border-warning/35",
  failed: "border-destructive/35",
  pending: "opacity-70",
  skipped: "opacity-60",
};
const stepIcon = {
  command: Terminal,
  tool: Wrench,
  agent: Bot,
  state: Braces,
  approval: ShieldCheck,
  checkpoint: Flag,
  note: ListChecks,
};
const stepTitle = (s: JobStep) =>
  s.kind === "tool" ? `${s.label}: a subagent tool call, its own durable task` : s.label;

const chip =
  "inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs";

/** One step: what kind, what ran, how it ended, how long it took. */
function JobStepLine({ step: s }: { step: JobStep }) {
  const Kind = stepIcon[s.kind];
  const accent = s.kind === "tool" || s.kind === "agent";
  return (
    <>
      <Kind
        className={cn(
          "job-step-kind size-3.5 shrink-0",
          accent ? "text-primary" : "text-muted-foreground",
        )}
      />
      {["command", "tool", "state"].includes(s.kind) ? (
        <code
          title={stepTitle(s)}
          className={cn(
            "min-w-0 truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground",
            s.kind === "tool" && "shrink-0 border border-primary/25",
          )}
        >
          {s.label}
        </code>
      ) : (
        <span className="job-step-text min-w-0 text-foreground">{s.label}</span>
      )}
      {s.kind === "tool" && s.detail ? (
        <span
          className="job-step-args min-w-0 truncate font-mono text-xs text-muted-foreground"
          title={s.detail}
        >
          {s.detail}
        </span>
      ) : null}
      <span className="job-step-state inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground">
        {s.status === "running" ? (
          <LoaderCircle className="size-3.5 animate-spin text-primary" />
        ) : s.status === "done" ? (
          <Check className="size-3.5 text-success" />
        ) : s.status === "waiting" ? (
          <Hand className="size-3.5 text-warning" />
        ) : (
          <X className="size-3.5 text-destructive" />
        )}
        {s.ms !== undefined && s.kind !== "note" ? <span>{seconds(s.ms)}</span> : null}
      </span>
    </>
  );
}

const opened = (p: JobPhaseRun) => p.status !== "pending" && p.status !== "skipped";

export default function JobCard({ run }: { run: JobRun }) {
  const defs = useAtomValue(jobDefsAtom);
  const now = useAtomValue(nowAtom);
  const pending = useAtomValue(pendingAtom);
  const def = jobDef(defs, run.job);
  const done = jobRunDone(run);
  const phaseSpec = (id: string) => def?.phases.find((p) => p.id === id);
  const phaseTime = (p: JobPhaseRun) =>
    p.startedAt
      ? seconds(
          (p.endedAt ?? (p.status === "running" || p.status === "waiting" ? now : p.startedAt)) -
            p.startedAt,
        )
      : "";
  const approvalPhase = run.phases.find((p) => p.status === "waiting");

  return (
    <article
      className={cn(
        `job-run is-${run.status}`,
        "my-3 min-w-0 rounded-xl border border-l-[3px] border-border bg-card p-4 sm:p-5",
        statusEdge[run.status],
      )}
      data-job-run={run.id}
      aria-label={`${run.title} run ${run.run}: ${statusText[run.status]}`}
    >
      <header className="job-run-head flex items-center gap-3">
        <span
          className={cn(
            "job-run-icon grid size-10 shrink-0 place-items-center rounded-xl",
            statusTile[run.status],
          )}
        >
          <Workflow className="size-5" />
        </span>
        <div className="job-run-titles min-w-0 flex-1">
          <div className="job-run-eyebrow flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <Eyebrow>DURABLE JOB</Eyebrow>
            <span className="job-run-repeat inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Repeat className="size-3" />
              Repeatable workflow, run #{run.run}
            </span>
          </div>
          <h3 className="mt-0.5 truncate font-heading text-[17px] leading-6 font-bold">
            {run.title}
          </h3>
        </div>
        <Badge
          variant={statusBadge[run.status]}
          className={cn(`job-run-status ${run.status}`, "gap-1.5 px-2.5 py-1")}
        >
          <i
            className={cn(
              "size-1.5 rounded-full bg-current",
              run.status === "running" && "animate-pulse",
            )}
          />
          {statusText[run.status]}
        </Badge>
      </header>
      {def && (
        <p className="job-run-about mt-3 text-sm leading-6 text-foreground/90">{def.summary}</p>
      )}
      <div className="job-run-meta mt-3 flex flex-wrap gap-1.5">
        <span className={cn(chip, "text-muted-foreground")}>task #{run.id}</span>
        <span className={cn(chip, "text-muted-foreground")}>
          {run.startedBy === "agent" ? "started by the agent" : "started by you"}
        </span>
        <span className={cn(chip, "text-muted-foreground tabular-nums")}>
          {seconds((run.endedAt ?? now) - run.startedAt)}
        </span>
        {Object.entries(run.input).map(([k, v]) => (
          <span key={k} className={cn(chip, "job-run-input text-foreground")}>
            {k}={display(v)}
          </span>
        ))}
        {run.resumed ? (
          <span
            className={cn(chip, "job-run-resumed border-warning/30 bg-warning/10 text-warning")}
          >
            resumed {run.resumed}× after restart
          </span>
        ) : null}
      </div>

      <ol
        className="job-stepper mt-4 flex list-none flex-wrap items-center gap-y-2"
        aria-label="Phases"
      >
        {run.phases.map((phase, i) => {
          const tone = chipTone[phase.status];
          return (
            <li
              key={phase.id}
              className={cn(`ph-${phase.status}`, "inline-flex items-center")}
              aria-current={run.phase === phase.id && !done ? "step" : undefined}
            >
              <span
                className={cn(
                  "job-chip inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm",
                  tone.chip,
                )}
              >
                <span
                  className={cn(
                    "job-step-dot grid size-6 place-items-center rounded-full font-mono text-xs",
                    tone.dot,
                  )}
                >
                  {phase.status === "done" ? (
                    <Check className="size-3.5" />
                  ) : phase.status === "running" ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : phase.status === "waiting" ? (
                    <Hand className="size-3.5" />
                  ) : ["failed", "aborted"].includes(phase.status) ? (
                    <X className="size-3.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="job-step-label">{phase.label}</span>
                {phase.progress && (
                  <span className="job-step-progress font-mono text-xs text-muted-foreground">
                    {phase.progress.done}/{phase.progress.total}
                  </span>
                )}
              </span>
              {i < run.phases.length - 1 && (
                <ArrowRight
                  className="mx-1.5 size-3.5 text-muted-foreground/60"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="job-phases mt-3 grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {run.phases.map((phase, i) => (
          <details
            key={phase.id}
            className={cn(
              `job-phase ph-${phase.status}`,
              "group/phase rounded-lg border border-border bg-background/50",
              phaseBorder[phase.status],
            )}
            open={opened(phase)}
          >
            <summary className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
              <span className="job-phase-n w-3.5 font-mono text-xs text-muted-foreground">
                {i + 1}
              </span>
              <strong className="font-semibold">{phase.label}</strong>
              <span className="job-phase-summary min-w-[160px] flex-1 text-muted-foreground">
                {phase.summary ??
                  (phase.status === "pending"
                    ? phaseSpec(phase.id)?.summary
                    : phase.status === "skipped"
                      ? "Skipped"
                      : "")}
              </span>
              <span className="job-phase-time ml-auto inline-flex items-center gap-1.5 self-center font-mono text-xs text-muted-foreground tabular-nums">
                {phaseTime(phase)}
                <ChevronRight className="size-3.5 transition-transform group-open/phase:rotate-90 motion-reduce:transition-none" />
              </span>
            </summary>
            {phase.status !== "done" && (
              <p className="job-phase-about px-3 pb-2 pl-9 text-sm text-muted-foreground">
                {phaseSpec(phase.id)?.summary}
              </p>
            )}
            {phase.steps.length ? (
              <ul className="job-steps grid list-none grid-cols-[minmax(0,1fr)] gap-1 px-3 pb-2.5 pl-9">
                {phase.steps.map((step) => (
                  <li key={step.id} className={cn(`k-${step.kind} st-${step.status}`, "text-sm")}>
                    {step.detail && step.kind !== "tool" ? (
                      <details open={step.status === "error"} className="group/step">
                        <summary className="flex min-h-7 min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <JobStepLine step={step} />
                          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/step:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <pre className="mt-1 mb-0.5 ml-5.5 max-h-[180px] overflow-auto rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
                          {step.detail}
                        </pre>
                      </details>
                    ) : (
                      <div className="job-step-line flex min-h-7 min-w-0 items-center gap-2">
                        <JobStepLine step={step} />
                      </div>
                    )}
                    {step.kind === "agent" && step.conversationId ? (
                      <button
                        type="button"
                        className="text-button job-step-link ml-5.5 rounded-sm text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => openAgent(step.conversationId!)}
                      >
                        Open subagent #{step.conversationId}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : phase.status === "pending" ? (
              <p className="job-phase-empty px-3 pb-2 pl-9 text-sm text-muted-foreground">
                Not started yet.
              </p>
            ) : null}
          </details>
        ))}
      </div>

      {run.approval === "pending" && (
        <div
          className="job-approval mt-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
          role="group"
          aria-label="Approval"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-warning">
            <ShieldCheck className="size-4" />
            <strong className="font-semibold">Approve to continue</strong>
          </div>
          <p className="mt-1.5 text-sm leading-6 text-foreground/90">
            {approvalPhase ? phaseSpec(approvalPhase.id)?.summary : "This run waits for you"}. It is
            paused on a saved checkpoint: close the browser or restart the device and the decision
            will still be waiting.
          </p>
          <div className="job-approval-buttons mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!!pending}
              onClick={() => decide(run, true)}
            >
              <Check className="size-3.5" />
              Approve &amp; continue
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-warning/40 hover:bg-warning/10"
              disabled={!!pending}
              onClick={() => decide(run, false)}
            >
              Decline
            </Button>
          </div>
        </div>
      )}
      {run.error && run.status !== "aborted" && (
        <ErrorText className="message-error mt-3">{run.error}</ErrorText>
      )}

      <footer className="job-run-foot mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        <span className="min-w-[220px] flex-1">
          {run.background
            ? "Runs in the background: the conversation owns it, so Interrupt leaves it running."
            : "Owned by this tool call: Interrupt stops it."}{" "}
          Each phase saves a checkpoint, so a restart resumes the current phase.
        </span>
        {!done && (
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={!!pending}
            onClick={() => stopRun(run)}
          >
            <Octagon className="size-3.5" />
            Stop
          </Button>
        )}
      </footer>
    </article>
  );
}
