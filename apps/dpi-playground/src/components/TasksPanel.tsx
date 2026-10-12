import { useMemo, useState, type CSSProperties } from "react";
import { useAtomValue } from "jotai";
import {
  Activity,
  Bot,
  Clock3,
  Layers,
  Octagon,
  Play,
  Repeat,
  ShieldCheck,
  Workflow,
  Wrench,
} from "lucide-react";
import type { JobDef } from "@sdk/jobs";
import type { TaskNode, TaskOutcome } from "@sdk/api";
import { jobRunDone } from "@sdk/jobs";
import { message } from "../client/hub";
import {
  agentHandleAtom,
  display,
  sessionHandleAtom,
  tasksAtom,
  type AgentTask,
} from "../client/store";
import {
  decide,
  jobDef,
  jobDefsAtom,
  jobRunsAtom,
  openAgent,
  pendingAtom,
  revealRun,
  startJob,
} from "../client/jobs";
import { store } from "../client/state";

const status = (value: string) =>
  ({
    running: "Running",
    waiting: "Waiting",
    completed: "Completed",
    aborted: "Stopped",
    declined: "Declined",
    failed: "Failed",
    pending: "Queued",
    completing: "Finishing",
    terminal: "Finished",
  })[value] ?? value;

function kindOf(defs: JobDef[], t: TaskNode) {
  if (t.kind === "pi.tool")
    return { Icon: Wrench, name: t.label ?? "Tool call", what: "tool call" };
  if (t.kind === "pi.generation") return { Icon: Bot, name: "Model response", what: "generation" };
  if (t.kind === "pi.compaction") return { Icon: Layers, name: "Compaction", what: "compaction" };
  if (t.kind.startsWith("demo.job."))
    return {
      Icon: Workflow,
      name: t.label ?? jobDef(defs, t.kind.slice(9))?.title ?? t.kind,
      what: "durable job",
    };
  if (t.kind === "demo.job-approval")
    return { Icon: ShieldCheck, name: "Approval", what: "waits for you" };
  return { Icon: Activity, name: t.label ?? t.kind, what: t.kind };
}

function phaseOf(defs: JobDef[], t: TaskNode) {
  if (!t.state.phase) return "";
  if (t.kind.startsWith("demo.job."))
    return (
      jobDef(defs, t.kind.slice(9))?.phases.find((p) => p.id === t.state.phase)?.label ??
      t.state.phase
    );
  return t.state.phase;
}

type Row = { task: AgentTask; depth: number };

export default function TasksPanel() {
  const tasks = useAtomValue(tasksAtom);
  const defs = useAtomValue(jobDefsAtom);
  const runs = useAtomValue(jobRunsAtom);
  const pending = useAtomValue(pendingAtom);
  const agentHandle = useAtomValue(agentHandleAtom);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [recent, setRecent] = useState<TaskOutcome[]>([]);
  const [inspection, setInspection] = useState<unknown>();

  // ------------------------------------------------------------------ the live task tree

  const rows = useMemo(() => {
    const ids = new Set(tasks.map((t) => t.id));
    const children = new Map<number | undefined, AgentTask[]>();
    for (const t of tasks) {
      const parent = t.owner !== undefined && ids.has(t.owner) ? t.owner : undefined;
      children.set(parent, [...(children.get(parent) ?? []), t]);
    }
    const out: Row[] = [];
    const walk = (parent: number | undefined, depth: number) => {
      for (const task of (children.get(parent) ?? []).sort((a, b) => a.id - b.id)) {
        out.push({ task, depth });
        walk(task.id, depth + 1);
      }
    };
    walk(undefined, 0);
    return out;
  }, [tasks]);

  async function stopAll() {
    const handle = store.get(agentHandleAtom);
    if (stopping || !handle) return;
    setStopping(true);
    setError("");
    try {
      await handle.abort(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setStopping(false);
    }
  }

  // Recent outcomes and recovery inspection are read on demand, not streamed.
  async function loadRuntime(e: React.SyntheticEvent<HTMLDetailsElement>) {
    const handle = store.get(sessionHandleAtom);
    if (!e.currentTarget.open || !handle) return;
    try {
      const [r, i] = await Promise.all([handle.tasks("terminal", 40), handle.inspect()]);
      setRecent(r);
      setInspection(i);
    } catch (err) {
      setError(message(err));
    }
  }
  const outcomes = recent
    .filter((task) => task.state.status === "terminal")
    .slice(-12)
    .reverse();

  return (
    <div className="tasks-panel">
      <div className="panel-heading">
        <h2>Tasks</h2>
        <span className="tag">{tasks.length} active</span>
      </div>
      {error && (
        <p className="message-error" role="alert">
          {error}
        </p>
      )}

      <section className="task-section" aria-label="Durable jobs">
        <h3>
          <Repeat size={18} />
          Durable jobs
        </h3>
        <p className="hint">
          Repeatable workflows with named phases. Every run follows the same phases and saves a
          checkpoint after each one. Start one here, or ask your agent: it finds these with{" "}
          <code>list_durable_jobs</code>, starts them with <code>run_durable_job</code> and checks
          them with <code>check_durable_job</code>. Runs play out live in the chat.
        </p>
        {!defs.length && (
          <p className="task-empty">
            This device has no durable jobs. Deploy the latest backend to it.
          </p>
        )}
        {defs.map((def) => {
          const last = runs.find((r) => r.job === def.id);
          return (
            <article key={def.id} className="job-def" data-job={def.id}>
              <div className="job-def-head">
                <Workflow size={18} />
                <strong>{def.title}</strong>
                {def.approval && <span className="tag">needs approval</span>}
                <span className="tag">~{def.seconds}s</span>
              </div>
              <p>{def.summary}</p>
              <ol className="job-chain" aria-label={`${def.title} phases`}>
                {def.phases.map((phase, i) => (
                  <li key={phase.id} title={phase.summary}>
                    <span>{i + 1}</span>
                    {phase.label}
                    {phase.kind === "repeat" && <Repeat size={13} />}
                    {phase.kind === "approval" && <ShieldCheck size={13} />}
                  </li>
                ))}
              </ol>
              <div className="job-def-meta">
                {def.inputs.map((input) => (
                  <code key={input.name} title={input.description}>
                    {input.name}={display(input.default)}
                  </code>
                ))}
                <code title={`Each run saves its result to App State ${def.resultPath}`}>
                  → {def.resultPath}
                </code>
              </div>
              {last && (
                <div className="job-def-last">
                  <span>
                    Run #{last.run}: <strong>{status(last.status)}</strong>
                    {!jobRunDone(last) && (
                      <> in {last.phases.find((p) => p.id === last.phase)?.label}</>
                    )}
                  </span>
                  <button className="text-button" onClick={() => revealRun(last.id)}>
                    Show in chat
                  </button>
                  {last.approval === "pending" && (
                    <>
                      <button
                        className="primary small"
                        disabled={!!pending}
                        onClick={() => decide(last, true)}
                      >
                        Approve
                      </button>
                      <button
                        className="secondary"
                        disabled={!!pending}
                        onClick={() => decide(last, false)}
                      >
                        Decline
                      </button>
                    </>
                  )}
                </div>
              )}
              <button
                className="secondary job-def-run"
                disabled={!!pending || !agentHandle}
                onClick={() => startJob(def)}
              >
                <Play size={16} />
                Run {def.title}
              </button>
            </article>
          );
        })}
      </section>

      <section className="task-section" aria-label="Agent activity">
        <div className="panel-heading">
          <h3>Agent activity</h3>
          <Activity size={18} />
        </div>
        <p className="hint">
          Every model response and every tool call is its own durable task with an id, an owner and
          a checkpoint. Follow them live here; after a restart each one resumes or reports how it
          ended.
        </p>
        {!rows.length ? (
          <p className="task-empty">Nothing running. Send a message or run a job.</p>
        ) : (
          <ul className="task-tree">
            {rows.map(({ task, depth }) => {
              const { Icon, name, what } = kindOf(defs, task);
              const phase = phaseOf(defs, task);
              return (
                <li
                  key={task.id}
                  className="task-row"
                  style={{ "--depth": depth } as CSSProperties}
                  data-task-kind={task.kind}
                >
                  <Icon size={16} />
                  <strong>{name}</strong>
                  <span className="tag">{status(task.state.status)}</span>
                  {phase && <span className="task-phase">{phase}</span>}
                  <small>
                    #{task.id} {what}, agent #{task.conversationId}
                    {task.effectiveBackground ? ", background" : ""}
                  </small>
                  {task.conversations?.map((cid) => (
                    <button key={cid} className="text-button" onClick={() => openAgent(cid)}>
                      Open agent #{cid}
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
        <p className="hint">
          Interrupt or Esc stops foreground work and what it owns. Stop all also stops background
          runs.
        </p>
        <button className="secondary danger" disabled={!tasks.length || stopping} onClick={stopAll}>
          <Octagon size={18} />
          Stop all
        </button>
      </section>

      <details className="raw task-section" onToggle={loadRuntime}>
        <summary>
          <Clock3 size={18} />
          Runtime details
        </summary>
        <p className="hint">
          Recent task results and recovery records, read from the device when opened.
        </p>
        {outcomes.map((task) => (
          <details key={task.id} className="raw">
            <summary>
              {task.kind} #{task.id}
              <span>{status(task.state.outcome?.status ?? task.state.status)}</span>
            </summary>
            <pre>{JSON.stringify(task.state.outcome, null, 2)}</pre>
          </details>
        ))}
        <details className="raw">
          <summary>Recovery inspection</summary>
          <pre>{JSON.stringify(inspection, null, 2)}</pre>
        </details>
      </details>
    </div>
  );
}
