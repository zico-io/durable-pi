// One durable job run, live: its named phases as a stepper, every step each phase took (commands, a subagent's
// tool calls, App State writes, checkpoints), the approval when it waits, and how it is owned.
import { useAtomValue } from "jotai";
import {
  Bot,
  Braces,
  Check,
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
import { jobRunDone, type JobPhaseRun, type JobRun, type JobStep } from "@sdk/jobs";
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

const statusText: Record<JobRun["status"], string> = {
  running: "Running",
  waiting: "Waiting for you",
  completed: "Completed",
  failed: "Failed",
  aborted: "Stopped",
  declined: "Declined",
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

/** One step: what kind, what ran, how it ended, how long it took. */
function JobStepLine({ step: s }: { step: JobStep }) {
  const Kind = stepIcon[s.kind];
  return (
    <>
      <Kind size={16} className="job-step-kind" />
      {["command", "tool", "state"].includes(s.kind) ? (
        <code title={stepTitle(s)}>{s.label}</code>
      ) : (
        <span className="job-step-text">{s.label}</span>
      )}
      {s.kind === "tool" && s.detail ? (
        <span className="job-step-args" title={s.detail}>
          {s.detail}
        </span>
      ) : null}
      <span className="job-step-state">
        {s.status === "running" ? (
          <LoaderCircle size={15} className="spin" />
        ) : s.status === "done" ? (
          <Check size={15} />
        ) : s.status === "waiting" ? (
          <Hand size={15} />
        ) : (
          <X size={15} />
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
      className={`job-run is-${run.status}`}
      data-job-run={run.id}
      aria-label={`${run.title} run ${run.run}: ${statusText[run.status]}`}
    >
      <header className="job-run-head">
        <span className="job-run-icon">
          <Workflow size={22} />
        </span>
        <div className="job-run-titles">
          <div className="job-run-eyebrow">
            <span>DURABLE JOB</span>
            <span className="job-run-repeat">
              <Repeat size={15} />
              Repeatable workflow, run #{run.run}
            </span>
          </div>
          <h3>{run.title}</h3>
        </div>
        <span className={`job-run-status ${run.status}`}>
          <i />
          {statusText[run.status]}
        </span>
      </header>
      {def && <p className="job-run-about">{def.summary}</p>}
      <div className="job-run-meta">
        <span>task #{run.id}</span>
        <span>{run.startedBy === "agent" ? "started by the agent" : "started by you"}</span>
        <span>{seconds((run.endedAt ?? now) - run.startedAt)}</span>
        {Object.entries(run.input).map(([k, v]) => (
          <span key={k} className="job-run-input">
            {k}={display(v)}
          </span>
        ))}
        {run.resumed ? (
          <span className="job-run-resumed">resumed {run.resumed}× after restart</span>
        ) : null}
      </div>

      <ol className="job-stepper" aria-label="Phases">
        {run.phases.map((phase, i) => (
          <li
            key={phase.id}
            className={`ph-${phase.status}`}
            aria-current={run.phase === phase.id && !done ? "step" : undefined}
          >
            <span className="job-chip">
              <span className="job-step-dot">
                {phase.status === "done" ? (
                  <Check size={15} />
                ) : phase.status === "running" ? (
                  <LoaderCircle size={15} className="spin" />
                ) : phase.status === "waiting" ? (
                  <Hand size={15} />
                ) : ["failed", "aborted"].includes(phase.status) ? (
                  <X size={15} />
                ) : (
                  i + 1
                )}
              </span>
              <span className="job-step-label">{phase.label}</span>
              {phase.progress && (
                <span className="job-step-progress">
                  {phase.progress.done}/{phase.progress.total}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="job-phases">
        {run.phases.map((phase, i) => (
          <details key={phase.id} className={`job-phase ph-${phase.status}`} open={opened(phase)}>
            <summary>
              <span className="job-phase-n">{i + 1}</span>
              <strong>{phase.label}</strong>
              <span className="job-phase-summary">
                {phase.summary ??
                  (phase.status === "pending"
                    ? phaseSpec(phase.id)?.summary
                    : phase.status === "skipped"
                      ? "Skipped"
                      : "")}
              </span>
              <span className="job-phase-time">{phaseTime(phase)}</span>
            </summary>
            {phase.status !== "done" && (
              <p className="job-phase-about">{phaseSpec(phase.id)?.summary}</p>
            )}
            {phase.steps.length ? (
              <ul className="job-steps">
                {phase.steps.map((step) => (
                  <li key={step.id} className={`k-${step.kind} st-${step.status}`}>
                    {step.detail && step.kind !== "tool" ? (
                      <details open={step.status === "error"}>
                        <summary>
                          <JobStepLine step={step} />
                        </summary>
                        <pre>{step.detail}</pre>
                      </details>
                    ) : (
                      <div className="job-step-line">
                        <JobStepLine step={step} />
                      </div>
                    )}
                    {step.kind === "agent" && step.conversationId ? (
                      <button
                        className="text-button job-step-link"
                        onClick={() => openAgent(step.conversationId!)}
                      >
                        Open subagent #{step.conversationId}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : phase.status === "pending" ? (
              <p className="job-phase-empty">Not started yet.</p>
            ) : null}
          </details>
        ))}
      </div>

      {run.approval === "pending" && (
        <div className="job-approval" role="group" aria-label="Approval">
          <div>
            <ShieldCheck size={20} />
            <strong>Approve to continue</strong>
          </div>
          <p>
            {approvalPhase ? phaseSpec(approvalPhase.id)?.summary : "This run waits for you"}. It is
            paused on a saved checkpoint: close the browser or restart the device and the decision
            will still be waiting.
          </p>
          <div className="job-approval-buttons">
            <button
              className="primary small"
              disabled={!!pending}
              onClick={() => decide(run, true)}
            >
              <Check size={18} />
              Approve &amp; continue
            </button>
            <button className="secondary" disabled={!!pending} onClick={() => decide(run, false)}>
              Decline
            </button>
          </div>
        </div>
      )}
      {run.error && run.status !== "aborted" && <p className="message-error">{run.error}</p>}

      <footer className="job-run-foot">
        <span>
          {run.background
            ? "Runs in the background: the conversation owns it, so Interrupt leaves it running."
            : "Owned by this tool call: Interrupt stops it."}{" "}
          Each phase saves a checkpoint, so a restart resumes the current phase.
        </span>
        {!done && (
          <button className="secondary danger" disabled={!!pending} onClick={() => stopRun(run)}>
            <Octagon size={16} />
            Stop
          </button>
        )}
      </footer>
    </article>
  );
}
