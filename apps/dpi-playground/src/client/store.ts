// App-wide state: one hub stream, the network, the selected agent and its session/device feeds,
// plus the command helpers every component shares.
import { atom } from "jotai";
import type { AgentDetail, ModelInfo, NetworkDevice, TaskNode } from "@sdk/api";
import { sumUsage } from "@sdk/transcript";
import { lineage } from "@sdk/models";
import { HubStream, type StreamState } from "./stream";
import { deviceClient, hub, message } from "./hub";
import {
  agentFeed,
  deviceFeed as openDeviceFeed,
  networkFeed,
  sessionFeed,
  type AgentTarget,
} from "./feeds";
import { store, watch } from "./state";

export const stream = new HubStream();
export const streamStateAtom = atom<StreamState>(stream.state);
stream.onState((s) => store.set(streamStateAtom, s));
export const network = networkFeed(stream);
export const configFileAtom = atom<string | undefined>(undefined);

// ------------------------------------------------------------------ selection + persisted UI state

export interface Layout {
  tree: boolean;
  inspector: boolean;
}

export const selectedAtom = atom<AgentTarget | undefined>(undefined);
export const expandedAtom = atom(new Set<string>());
export const treeWidthAtom = atom(300);
/** Which side panels are expanded (persisted). Collapsed panels shrink to an icon rail. */
export const layoutAtom = atom<Layout>({ tree: true, inspector: true });
let uiLoaded = false;

export const deviceIdAtom = atom((get) => get(selectedAtom)?.deviceId);
export const deviceAtom = atom((get) =>
  get(network.devices).find((d) => d.id === get(deviceIdAtom)),
);
export const onlineAtom = atom((get) => get(deviceAtom)?.status === "online");
const sessionTargetAtom = atom((get) => {
  const t = get(selectedAtom);
  return t ? { deviceId: t.deviceId, sessionId: t.sessionId } : undefined;
});
export const session = sessionFeed(stream, sessionTargetAtom);
export const agent = agentFeed(stream, selectedAtom);
export const deviceFeed = openDeviceFeed(stream, deviceIdAtom);

export const sessionSummaryAtom = atom((get) =>
  get(deviceAtom)?.tree?.sessions.find((s) => s.id === get(selectedAtom)?.sessionId),
);
const clientAtom = atom((get) => {
  const id = get(deviceIdAtom);
  return id ? deviceClient(id) : undefined;
});
export const agentHandleAtom = atom((get) => {
  const t = get(selectedAtom);
  return t && get(clientAtom)?.agent(t.sessionId, t.agentId);
});
export const sessionHandleAtom = atom((get) => {
  const t = get(selectedAtom);
  return t && get(clientAtom)?.session(t.sessionId);
});

export function select(target: AgentTarget | undefined) {
  store.set(selectedAtom, target);
  store.set(drawerAtom, false);
  pendingReveal = !!target;
  reveal();
}

// Expand the selected agent's device, session and ancestors once it shows up in the tree (a new
// fork or agent appears a moment after the call that created it).
let pendingReveal = false;
function reveal() {
  const t = store.get(selectedAtom);
  if (!pendingReveal || !t) return;
  const agents = store
    .get(network.devices)
    .find((d) => d.id === t.deviceId)
    ?.tree?.sessions.find((s) => s.id === t.sessionId)?.agents;
  const byId = new Map((agents ?? []).map((a) => [a.id, a]));
  const keys = [
    t.deviceId,
    `${t.deviceId}/s/${t.sessionId}`,
    `${t.deviceId}/s/${t.sessionId}/a/${t.agentId}`,
  ];
  let current = byId.get(t.agentId);
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = current.parentId ?? current.ownerAgentId;
    if (parent === undefined) break;
    keys.push(`${t.deviceId}/s/${t.sessionId}/a/${parent}`);
    current = byId.get(parent);
  }
  const expanded = store.get(expandedAtom);
  if (keys.some((k) => !expanded.has(k))) store.set(expandedAtom, new Set([...expanded, ...keys]));
  if (byId.has(t.agentId)) pendingReveal = false;
}
watch(network.devices, reveal);

export function toggle(key: string, open?: boolean) {
  const next = new Set(store.get(expandedAtom));
  if (open ?? !next.has(key)) next.add(key);
  else next.delete(key);
  store.set(expandedAtom, next);
}

export const setLayout = (patch: Partial<Layout>) =>
  store.set(layoutAtom, (l) => ({ ...l, ...patch }));

const saveLater = (() => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return (key: string, value: unknown) => {
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => void hub.uiSet(key, value).catch(() => {}), 300),
    );
  };
})();
// Selection saves at once so a quick reload restores it; drags (width) debounce.
watch(selectedAtom, (v) => uiLoaded && void hub.uiSet("tree.selected", v ?? null).catch(() => {}));
watch(treeWidthAtom, (v) => uiLoaded && saveLater("tree.width", v));
watch(layoutAtom, (v) => uiLoaded && saveLater("layout.panels", v));

let booted = false;
/** Load the persisted selection and layout once per page. */
export async function boot() {
  if (booted) return;
  booted = true;
  try {
    const [net, sel, width, panels] = await Promise.all([
      hub.network(),
      hub.uiGet<AgentTarget>("tree.selected"),
      hub.uiGet<number>("tree.width"),
      hub.uiGet<Layout>("layout.panels"),
    ]);
    if (panels) setLayout(panels);
    store.set(configFileAtom, net.configFile);
    if (!network.model.devices.length)
      network.model.apply({ type: "network", devices: net.devices });
    // Every device starts folded; select() opens only the active device, workspace and agent.
    store.set(expandedAtom, new Set<string>());
    if (width) store.set(treeWidthAtom, width);
    if (sel && net.devices.some((d) => d.id === sel.deviceId)) select(sel);
    else autoSelect(net.devices);
  } catch (e) {
    store.set(errorAtom, message(e));
  } finally {
    uiLoaded = true;
  }
}

/** With nothing saved, open the first agent on the first online device that has a session. */
function autoSelect(devices: NetworkDevice[]) {
  for (const d of devices) {
    const s = d.status === "online" ? d.tree?.sessions[0] : undefined;
    const a = s?.agents.find((x) => x.kind === "root") ?? s?.agents[0];
    if (s && a) return select({ deviceId: d.id, sessionId: s.id, agentId: a.id });
  }
}

// The device answered "not found" for the selected agent and its session left the tree: it was archived.
const archivedAtom = atom(
  (get) => get(agent.status) === "fault" && !get(sessionSummaryAtom) && get(onlineAtom),
);
watch(archivedAtom, (archived) => {
  if (!archived) return;
  notify("That session was archived on its device.");
  select(undefined);
});

// ------------------------------------------------------------------ derived agent views

export const modelsAtom = atom<ModelInfo[]>((get) => get(deviceAtom)?.info?.models ?? []);
export const agentStateAtom = agent.state;
export const sessionAgentsAtom = atom((get) => {
  const agents = get(session.state).agents;
  return agents.length ? agents : (get(sessionSummaryAtom)?.agents ?? []);
});
export const agentSummaryAtom = atom((get) =>
  get(sessionAgentsAtom).find((a) => a.id === get(selectedAtom)?.agentId),
);
export const activeLineageAtom = atom((get) => {
  const t = get(selectedAtom);
  return t ? lineage(get(sessionAgentsAtom), t.agentId) : [];
});

export type AgentTask = TaskNode & { effectiveBackground: boolean };

/** Tasks of this agent and every subagent it owns (transitively), with inherited background. */
export const tasksAtom = atom((get): AgentTask[] => {
  const id = get(selectedAtom)?.agentId;
  if (id === undefined) return [];
  const agents = get(sessionAgentsAtom);
  const owned = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const a of agents)
      if (a.ownerAgentId !== undefined && owned.has(a.ownerAgentId) && !owned.has(a.id)) {
        owned.add(a.id);
        changed = true;
      }
  }
  const all = get(session.state).tasks;
  const byId = new Map(all.map((t) => [t.id, t]));
  const ownerTask = new Map(agents.map((a) => [a.id, a.ownerTaskId]));
  return all
    .filter((t) => owned.has(t.conversationId))
    .map((task) => {
      let current: TaskNode | undefined = task;
      let effectiveBackground = false;
      const seen = new Set<number>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        if (current.background) {
          effectiveBackground = true;
          break;
        }
        const ownerId: number | undefined = current.owner ?? ownerTask.get(current.conversationId);
        current = ownerId === undefined ? undefined : byId.get(ownerId);
      }
      return { ...task, effectiveBackground };
    });
});
export const busyAtom = atom(
  (get) =>
    get(agentStateAtom).running ||
    get(tasksAtom).some(
      (t) => !t.effectiveBackground && t.conversationId === get(selectedAtom)?.agentId,
    ),
);
export const usageAtom = atom((get) => sumUsage(get(agentStateAtom).usage));
export const currentModelAtom = atom((get) => {
  const m = get(agentStateAtom).agent.model;
  return get(modelsAtom).find((x) => x.provider === m?.provider && x.id === m?.modelId);
});

/** Tools and extensions come from GET agent (not streamed); refresh on selection and config changes. */
export const detailAtom = atom<AgentDetail | undefined>(undefined);
let detailSeq = 0;
export async function refreshDetail() {
  const handle = store.get(agentHandleAtom);
  const seq = ++detailSeq;
  if (!handle || !store.get(onlineAtom)) return void store.set(detailAtom, undefined);
  try {
    const d = await handle.get();
    if (seq === detailSeq) store.set(detailAtom, d);
  } catch {
    if (seq === detailSeq) store.set(detailAtom, undefined);
  }
}
watch(agentHandleAtom, () => void refreshDetail(), { immediate: true });
watch(onlineAtom, () => void refreshDetail());

// ------------------------------------------------------------------ UI chrome

export type Dialog =
  | { kind: "new-session"; deviceId?: string }
  | { kind: "models" }
  | { kind: "help" }
  | { kind: "path"; path: string }
  | { kind: "compaction" }
  | {
      kind: "prompt";
      title: string;
      label?: string;
      value?: string;
      placeholder?: string;
      hint?: string;
      multiline?: boolean;
      optional?: boolean;
      submit: string;
      danger?: boolean;
      run: (value: string) => Promise<unknown>;
    };

export const errorAtom = atom("");
export const toastAtom = atom("");
export const drawerAtom = atom(false);
/** Narrow screens: the inspector opens over the chat instead of taking a column. */
export const inspectorOverlayAtom = atom(false);
export const tabAtom = atom("session");
export const composerAtom = atom("");
export const dialogAtom = atom<Dialog | undefined>(undefined);

export const openDialog = (dialog: Dialog) => store.set(dialogAtom, dialog);
export const closeDialog = () => store.set(dialogAtom, undefined);

let toastTimer: ReturnType<typeof setTimeout>;
export function notify(text: string) {
  store.set(toastAtom, text);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => store.set(toastAtom, ""), 4500);
}

export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  store.set(errorAtom, "");
  try {
    return await fn();
  } catch (e) {
    store.set(errorAtom, message(e));
    return undefined;
  }
}

export function preset(text: string) {
  store.set(composerAtom, text);
  setTimeout(() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus());
}

// ------------------------------------------------------------------ formatting

export const number = (n: number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const json = (v: unknown) => JSON.stringify(v, null, 2);
/** A value as text, the way it reads in a template: nothing for null, JSON for objects. */
export const display = (v: unknown) =>
  v == null ? "" : typeof v === "object" ? json(v) : String(v);
export const icon = (models: ModelInfo[], modelId = "") =>
  `/icons/${models.find((m) => m.id === modelId)?.icon ?? "lab.png"}`;
export const shortPath = (s = "", n = 34) => (s.length > n ? "…" + s.slice(-(n - 1)) : s);
export function ago(ms?: number) {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// ------------------------------------------------------------------ shared agent commands

export const interruptingAtom = atom(false);
/** Escape and the Interrupt button: stop foreground work and owned subagents; background jobs continue. */
export async function interrupt() {
  const handle = store.get(agentHandleAtom);
  if (!store.get(busyAtom) || store.get(interruptingAtom) || !handle) return;
  store.set(interruptingAtom, true);
  const done = await attempt(() => handle.abort(false));
  if (done) notify("Foreground work interrupted. Background jobs continue.");
  store.set(interruptingAtom, false);
}

// ------------------------------------------------------------------ panel layout

const narrowQuery = window.matchMedia("(max-width: 1100px)");
/** Below 1100px the inspector never takes a column; it opens over the chat. */
export const narrowAtom = atom(narrowQuery.matches);
narrowQuery.addEventListener("change", (e) => store.set(narrowAtom, e.matches));
export const inspectorExpandedAtom = atom((get) =>
  get(narrowAtom) ? get(inspectorOverlayAtom) : get(layoutAtom).inspector,
);

/** Show the inspector, optionally on a tab: expand its column, or open it over the chat when narrow. */
export function showInspector(tab?: string) {
  if (tab) store.set(tabAtom, tab);
  if (store.get(narrowAtom)) store.set(inspectorOverlayAtom, true);
  else setLayout({ inspector: true });
}

export function hideInspector() {
  if (store.get(narrowAtom)) store.set(inspectorOverlayAtom, false);
  else setLayout({ inspector: false });
}

export function toggleTree() {
  if (!store.get(narrowAtom)) return setLayout({ tree: !store.get(layoutAtom).tree });
  const open = !store.get(drawerAtom);
  store.set(drawerAtom, open);
  if (open) setLayout({ tree: true });
}

export function toggleInspector() {
  if (store.get(inspectorExpandedAtom)) hideInspector();
  else showInspector();
}

// Panel hotkeys. macOS browsers use Cmd for new window/tab, so Ctrl+N and Ctrl+T reach the page;
// elsewhere browsers reserve Ctrl+N and Ctrl+T, so Alt+Shift takes their place.
const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);
export const panelKeys = mac
  ? { tree: "Ctrl+N", inspector: "Ctrl+T" }
  : { tree: "Alt+Shift+N", inspector: "Alt+Shift+T" };

export function panelHotkey(e: KeyboardEvent): "tree" | "inspector" | undefined {
  const held = mac
    ? e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
    : e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
  if (!held || e.repeat || e.isComposing) return;
  if (e.code === "KeyN") return "tree";
  if (e.code === "KeyT") return "inspector";
}
