import { useMemo, useState, type CSSProperties } from "react";
import { useAtomValue } from "jotai";
import {
  Activity,
  ArrowRight,
  Bot,
  ChevronRight,
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
import { Button } from "@/components/motion/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/motion/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ErrorText, Hint, PanelHeading, SectionLabel } from "@/components/ui/text";
import { cn } from "@/lib/utils";

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

const tone = (value: string): BadgeVariant =>
  value === "running" || value === "completing"
    ? "primary"
    : value === "waiting"
      ? "warning"
      : value === "completed"
        ? "success"
        : value === "failed"
          ? "destructive"
          : "default";

const toneText: Record<BadgeVariant, string> = {
  default: "text-foreground",
  outline: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const inlineCode = "rounded-md bg-accent px-1.5 py-0.5 font-mono text-[13px] text-foreground";
const textLink =
  "rounded-sm text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";
const summaryRow =
  "flex cursor-pointer items-center gap-2 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring";

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
    <div className="tasks-panel flex flex-col gap-6">
      <PanelHeading>
        <h2>Tasks</h2>
        <Badge variant={tasks.length ? "primary" : "default"}>{tasks.length} active</Badge>
      </PanelHeading>
      {error && (
        <ErrorText className="message-error" role="alert">
          {error}
        </ErrorText>
      )}

      <section className="flex flex-col gap-3" aria-label="Durable jobs">
        <SectionLabel>
          <h3 className="flex items-center gap-2">
            <Repeat className="size-3.5" />
            Durable jobs
          </h3>
        </SectionLabel>
        <Hint>
          Repeatable workflows with named phases. Every run follows the same phases and saves a
          checkpoint after each one. Start one here, or ask your agent: it finds these with{" "}
          <code className={inlineCode}>list_durable_jobs</code>, starts them with{" "}
          <code className={inlineCode}>run_durable_job</code> and checks them with{" "}
          <code className={inlineCode}>check_durable_job</code>. Runs play out live in the chat.
        </Hint>
        {!defs.length && (
          <Hint className="rounded-xl border border-dashed border-border px-4 py-3">
            This device has no durable jobs. Deploy the latest backend to it.
          </Hint>
        )}
        {defs.map((def) => {
          const last = runs.find((r) => r.job === def.id);
          return (
            <Card key={def.id} size="compact" className="job-def gap-3 bg-card" data-job={def.id}>
              <CardHeader>
                <CardTitle as="h4" className="flex min-w-0 items-center gap-2 font-heading">
                  <Workflow className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{def.title}</span>
                </CardTitle>
                <CardAction className="gap-1.5">
                  {def.approval && <Badge variant="warning">needs approval</Badge>}
                  <Badge className="font-mono">~{def.seconds}s</Badge>
                </CardAction>
                <CardDescription className="col-span-2 leading-6 text-foreground/85">
                  {def.summary}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ol
                  className="flex flex-wrap items-center gap-y-2"
                  aria-label={`${def.title} phases`}
                >
                  {def.phases.map((phase, i) => (
                    <li key={phase.id} title={phase.summary} className="inline-flex items-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 py-0.5 pr-2.5 pl-0.5 text-xs text-foreground">
                        <span className="grid size-5 place-items-center rounded-full bg-accent font-mono text-[11px] text-muted-foreground">
                          {i + 1}
                        </span>
                        {phase.label}
                        {phase.kind === "repeat" && (
                          <Repeat className="size-3 text-muted-foreground" />
                        )}
                        {phase.kind === "approval" && (
                          <ShieldCheck className="size-3 text-warning" />
                        )}
                      </span>
                      {i < def.phases.length - 1 && (
                        <ArrowRight className="mx-1 size-3 text-muted-foreground/60" aria-hidden />
                      )}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-1.5">
                  {def.inputs.map((input) => (
                    <code
                      key={input.name}
                      title={input.description}
                      className="rounded-md bg-accent/70 px-1.5 py-0.5 font-mono text-xs break-all text-muted-foreground"
                    >
                      {input.name}={display(input.default)}
                    </code>
                  ))}
                  <code
                    title={`Each run saves its result to App State ${def.resultPath}`}
                    className="rounded-md bg-accent/70 px-1.5 py-0.5 font-mono text-xs break-all text-muted-foreground"
                  >
                    → {def.resultPath}
                  </code>
                </div>
                {last && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted px-3 py-2 text-sm">
                    <span className="min-w-0">
                      Run #{last.run}:{" "}
                      <strong className={cn("font-semibold", toneText[tone(last.status)])}>
                        {status(last.status)}
                      </strong>
                      {!jobRunDone(last) && (
                        <span className="text-muted-foreground">
                          {" "}
                          in {last.phases.find((p) => p.id === last.phase)?.label}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className={cn(textLink, "ml-auto")}
                      onClick={() => revealRun(last.id)}
                    >
                      Show in chat
                    </button>
                    {last.approval === "pending" && (
                      <div className="flex w-full gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!!pending}
                          onClick={() => decide(last, true)}
                        >
                          <ShieldCheck className="size-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!!pending}
                          onClick={() => decide(last, false)}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={!!pending || !agentHandle}
                  onClick={() => startJob(def)}
                >
                  <Play className="size-4" />
                  Run {def.title}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="flex flex-col gap-3" aria-label="Agent activity">
        <SectionLabel>
          <h3 className="flex items-center gap-2">
            <Activity className="size-3.5" />
            Agent activity
          </h3>
        </SectionLabel>
        <Hint>
          Every model response and every tool call is its own durable task with an id, an owner and
          a checkpoint. Follow them live here; after a restart each one resumes or reports how it
          ended.
        </Hint>
        {!rows.length ? (
          <Hint className="rounded-xl border border-dashed border-border px-4 py-3">
            Nothing running. Send a message or run a job.
          </Hint>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map(({ task, depth }) => {
              const { Icon, name, what } = kindOf(defs, task);
              const phase = phaseOf(defs, task);
              return (
                <li
                  key={task.id}
                  className={cn(
                    "task-row ml-[calc(var(--depth)*16px)] flex flex-col gap-1 rounded-lg border border-l-2 border-border bg-card px-3 py-2",
                    task.kind === "pi.tool"
                      ? "border-l-primary"
                      : task.kind.startsWith("demo.job.")
                        ? "border-l-warning"
                        : "border-l-border-strong",
                  )}
                  style={{ "--depth": depth } as CSSProperties}
                  data-task-kind={task.kind}
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <strong className="min-w-0 truncate font-medium">{name}</strong>
                    {phase && (
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {phase}
                      </span>
                    )}
                    <Badge variant={tone(task.state.status)} className="ml-auto">
                      {status(task.state.status)}
                    </Badge>
                  </div>
                  <small className="font-mono text-xs text-muted-foreground">
                    #{task.id} {what}, agent #{task.conversationId}
                    {task.effectiveBackground ? ", background" : ""}
                  </small>
                  {!!task.conversations?.length && (
                    <div className="flex flex-wrap gap-x-3">
                      {task.conversations.map((cid) => (
                        <button
                          key={cid}
                          type="button"
                          className={cn(textLink, "text-xs")}
                          onClick={() => openAgent(cid)}
                        >
                          Open agent #{cid}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Hint>
          Interrupt or Esc stops foreground work and what it owns. Stop all also stops background
          runs.
        </Hint>
        <Button
          variant="outline"
          size="sm"
          className="self-start border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={!tasks.length || stopping}
          onClick={stopAll}
        >
          <Octagon className="size-3.5" />
          Stop all
        </Button>
      </section>

      <details
        className="raw group/runtime rounded-xl border border-border bg-card"
        onToggle={loadRuntime}
      >
        <summary className={cn(summaryRow, "rounded-xl px-4 py-3 text-sm font-medium")}>
          <Clock3 className="size-4 text-muted-foreground" />
          Runtime details
          <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-open/runtime:rotate-90" />
        </summary>
        <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-4">
          <Hint>Recent task results and recovery records, read from the device when opened.</Hint>
          {outcomes.map((task) => (
            <RawDetails
              key={task.id}
              title={`${task.kind} #${task.id}`}
              meta={status(task.state.outcome?.status ?? task.state.status)}
              json={task.state.outcome}
            />
          ))}
          <RawDetails title="Recovery inspection" json={inspection} />
        </div>
      </details>
    </div>
  );
}

function RawDetails({ title, meta, json }: { title: string; meta?: string; json: unknown }) {
  return (
    <details className="raw group/raw rounded-lg border border-border bg-background/50">
      <summary className={cn(summaryRow, "rounded-lg px-3 py-2 font-mono text-xs")}>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/raw:rotate-90" />
        <span className="min-w-0 truncate">{title}</span>
        {meta && <span className="ml-auto shrink-0 font-sans text-muted-foreground">{meta}</span>}
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-border p-3 font-mono text-xs leading-5 text-foreground">
        {JSON.stringify(json, null, 2)}
      </pre>
    </details>
  );
}
