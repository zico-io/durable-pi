// Durable jobs in the web client: the device's job definitions, this agent's runs (the `demo.job-runs`
// document), and the actions a run card or the Tasks tab can take.
import { atom } from "jotai";
import { JOB_RUNS_DOC, type JobDef, type JobRun, type JobRunsDoc } from "@sdk/jobs";
import {
  agentHandleAtom,
  agentStateAtom,
  attempt,
  deviceAtom,
  hideInspector,
  narrowAtom,
  notify,
  select,
  selectedAtom,
  sessionHandleAtom,
} from "./store";
import { store } from "./state";

export const jobDefsAtom = atom<JobDef[]>((get) => get(deviceAtom)?.info?.jobs ?? []);
export const jobDef = (defs: JobDef[], id: string) => defs.find((d) => d.id === id);

/** This agent's runs, newest first. */
export const jobRunsAtom = atom<JobRun[]>((get) => {
  const doc = get(agentStateAtom).docs[JOB_RUNS_DOC] as JobRunsDoc | undefined;
  return Object.values(doc?.items ?? {}).sort((a, b) => b.id - a.id);
});

/** One clock for every elapsed timer on the page. */
export const nowAtom = atom(Date.now());
setInterval(() => store.set(nowAtom, Date.now()), 1000);

export const seconds = (ms: number) =>
  ms < 1000
    ? `${Math.max(0, Math.round(ms))}ms`
    : ms < 60_000
      ? `${(ms / 1000).toFixed(1)}s`
      : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;

export const pendingAtom = atom<string>();

async function act<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (store.get(pendingAtom)) return;
  store.set(pendingAtom, key);
  try {
    return await attempt(fn);
  } finally {
    store.set(pendingAtom, undefined);
  }
}

/** Scroll the chat to a run's card (it renders where the run started). */
export function revealRun(id: number) {
  if (store.get(narrowAtom)) hideInspector();
  setTimeout(() =>
    document
      .querySelector(`[data-job-run="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" }),
  );
}

export async function startJob(def: JobDef) {
  const started = await act(`start:${def.id}`, () =>
    store.get(agentHandleAtom)!.demo<{ taskId: number }>("jobs", { job: def.id }),
  );
  if (started) {
    notify(`${def.title} started. It runs in the chat.`);
    revealRun(started.taskId);
  }
}

export const decide = (run: JobRun, approved: boolean) =>
  act(`decide:${run.id}`, () =>
    store.get(agentHandleAtom)!.demo(`jobs/${run.id}/approval`, { approved }),
  );

export const stopRun = (run: JobRun) =>
  act(`stop:${run.id}`, () => store.get(sessionHandleAtom)!.abortTask(run.id));

export function openAgent(conversationId: number) {
  const selected = store.get(selectedAtom);
  if (selected) select({ ...selected, agentId: conversationId });
}
