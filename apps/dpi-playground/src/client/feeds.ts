// Atoms over the SDK models. Each model stays a plain object; a version atom bumps on every change
// so derived atoms recompute once per frame.
import { atom, type Atom } from "jotai";
import { AgentModel, NetworkModel, SessionModel } from "@sdk/models";
import type { Activity, Frame } from "@sdk/api";
import type { AppState } from "@sdk/app-state";
import type { HubStream } from "./stream";
import { store, watch } from "./state";

export interface SessionTarget {
  deviceId: string;
  sessionId: string;
}
export interface AgentTarget extends SessionTarget {
  agentId: number;
}
export type FeedStatus = "idle" | "connecting" | "live" | "reconnecting" | "fault";

export const AGENT_DOCS = ["demo.job-runs", "demo.workspace"];
export const agentSub = (t: AgentTarget) =>
  `${t.deviceId}/agent/${t.sessionId}/${t.agentId}?docs=${AGENT_DOCS.join(",")}`;
export const sessionSub = (t: SessionTarget) => `${t.deviceId}/session/${t.sessionId}`;
export const deviceSub = (id: string) => `${id}/device?docs=app.shared-state`;

/** Shared bookkeeping for one stream slot: hello → live, disconnected → reconnecting, fault. */
function feed(
  stream: HubStream,
  slot: "device" | "session" | "agent",
  apply: (frame: Frame) => void,
) {
  const status = atom<FeedStatus>("idle");
  const fault = atom("");
  stream.route(slot, (frame) => {
    if (frame.type === "hello") store.set(status, "live");
    else if (frame.type === "disconnected") store.set(status, "reconnecting");
    else if (frame.type === "fault") {
      store.set(status, "fault");
      store.set(fault, frame.error.message);
    } else apply(frame);
  });
  const select = (key?: string) => {
    store.set(fault, "");
    store.set(status, key ? "connecting" : "idle");
    stream.set(slot, key);
  };
  return { status: status as Atom<FeedStatus>, fault: fault as Atom<string>, select };
}

function versioned(model: { subscribe(fn: () => void): unknown }) {
  const version = atom(0);
  model.subscribe(() => store.set(version, (v) => v + 1));
  return version;
}

export function networkFeed(stream: HubStream) {
  const model = new NetworkModel();
  const version = versioned(model);
  stream.onNetwork((devices) => model.apply({ type: "network", devices }));
  const devices = atom((get) => (get(version), model.devices));
  const tree = atom((get) => (get(version), model.tree()));
  return { model, devices, tree };
}

export interface SharedState {
  value: AppState;
  revision: number;
}

export function deviceFeed(stream: HubStream, deviceId: Atom<string | undefined>) {
  const sharedState = atom<SharedState | undefined>(undefined);
  const activity = atom<Activity[]>([]);
  const { status, select } = feed(stream, "device", (frame) => {
    if (frame.type === "doc" && frame.kind === "app.shared-state")
      store.set(sharedState, { value: frame.value as AppState, revision: frame.revision ?? 0 });
    else if (frame.type === "activity")
      store.set(activity, (items) => [...items, ...frame.items].slice(-50));
  });
  watch(
    deviceId,
    (id) => {
      store.set(sharedState, undefined);
      select(id ? deviceSub(id) : undefined);
    },
    { immediate: true },
  );
  return { sharedState: sharedState as Atom<SharedState | undefined>, activity, status };
}

export function sessionFeed(stream: HubStream, target: Atom<SessionTarget | undefined>) {
  const model = new SessionModel();
  const version = versioned(model);
  const { status, fault, select } = feed(stream, "session", (frame) => model.apply(frame));
  const key = atom((get) => {
    const t = get(target);
    return t ? sessionSub(t) : undefined;
  });
  watch(
    key,
    (k) => {
      model.clear();
      select(k);
    },
    { immediate: true },
  );
  const state = atom((get) => (get(version), model.state));
  return { model, state, status, fault };
}

export function agentFeed(stream: HubStream, target: Atom<AgentTarget | undefined>) {
  const model = new AgentModel();
  const version = versioned(model);
  const { status, fault, select } = feed(stream, "agent", (frame) => model.apply(frame));
  const key = atom((get) => {
    const t = get(target);
    return t ? agentSub(t) : undefined;
  });
  watch(
    key,
    (k) => {
      model.clear();
      select(k);
    },
    { immediate: true },
  );
  // A fresh object per version: the model mutates its state in place.
  const state = atom((get) => (get(version), { ...model.state }));
  return { model, state, status, fault, version: version as Atom<number> };
}
