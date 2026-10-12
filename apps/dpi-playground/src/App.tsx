import { useEffect, useState, type CSSProperties } from "react";
import { Provider, useAtom, useAtomValue } from "jotai";
import {
  Activity,
  Check,
  CircleHelp,
  Database,
  GitFork,
  Info,
  Network,
  PanelLeft,
  PanelRight,
  Plus,
  X,
} from "lucide-react";
import NetworkSidebar from "./components/NetworkSidebar";
import AgentView from "./components/AgentView";
import Inspector from "./components/Inspector";
import OfflinePanel from "./components/OfflinePanel";
import NewSessionDialog from "./components/NewSessionDialog";
import PromptDialog from "./components/PromptDialog";
import ModelPicker from "./components/ModelPicker";
import Backdrop from "./components/Backdrop";
import {
  attempt,
  boot,
  busyAtom,
  closeDialog,
  deviceAtom,
  dialogAtom,
  drawerAtom,
  errorAtom,
  hideInspector,
  inspectorOverlayAtom,
  interrupt,
  layoutAtom,
  network,
  notify,
  onlineAtom,
  openDialog,
  panelHotkey,
  select,
  selectedAtom,
  sessionHandleAtom,
  showInspector,
  stream,
  streamStateAtom,
  toastAtom,
  toggleInspector,
  toggleTree,
  treeWidthAtom,
} from "./client/store";
import { store } from "./client/state";
import { cx } from "./client/cx";

export default function App() {
  return (
    <Provider store={store}>
      <Shell />
    </Provider>
  );
}

function keydown(e: KeyboardEvent) {
  const panel = store.get(dialogAtom) ? undefined : panelHotkey(e);
  if (panel) {
    e.preventDefault();
    return panel === "tree" ? toggleTree() : toggleInspector();
  }
  if (e.key !== "Escape") return;
  if (store.get(dialogAtom)) return closeDialog();
  if (!e.repeat && !e.isComposing && store.get(busyAtom)) {
    e.preventDefault();
    void interrupt();
  }
  store.set(drawerAtom, false);
  store.set(inspectorOverlayAtom, false);
}

// Drag the tree's right edge; the width persists in the hub's ui_state.
function resize(e: React.PointerEvent) {
  e.preventDefault();
  const start = e.clientX;
  const width = store.get(treeWidthAtom);
  const move = (m: PointerEvent) =>
    store.set(treeWidthAtom, Math.max(220, Math.min(560, width + m.clientX - start)));
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function Shell() {
  const devices = useAtomValue(network.devices);
  const selected = useAtomValue(selectedAtom);
  const device = useAtomValue(deviceAtom);
  const online = useAtomValue(onlineAtom);
  const streamState = useAtomValue(streamStateAtom);
  const treeWidth = useAtomValue(treeWidthAtom);
  const layout = useAtomValue(layoutAtom);
  const dialog = useAtomValue(dialogAtom);
  const [error, setError] = useAtom(errorAtom);
  const [drawer, setDrawer] = useAtom(drawerAtom);
  const inspectorOverlay = useAtomValue(inspectorOverlayAtom);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const onlineCount = devices.filter((d) => d.status === "online").length;

  useEffect(() => {
    document.addEventListener("keydown", keydown);
    stream.start();
    void boot();
    return () => {
      stream.stop();
      document.removeEventListener("keydown", keydown);
    };
  }, []);

  async function newAgent() {
    const handle = store.get(sessionHandleAtom);
    if (!handle || !selected || creatingAgent) return;
    setCreatingAgent(true);
    const created = await attempt(() => handle.createAgent({}));
    setCreatingAgent(false);
    if (created) {
      select({ ...selected, agentId: created.id });
      notify("New agent. Same session, same shared App State.");
    }
  }

  const openNewSession = () => openDialog({ kind: "new-session", deviceId: selected?.deviceId });

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <button
            className="icon-button tree-toggle"
            aria-label="Toggle network"
            title="Network"
            onClick={() => setDrawer(!drawer)}
          >
            <PanelLeft size={19} />
          </button>
          <img className="brandmark" src="/icons/durable-pi.svg" alt="Durable Pi" />
          <strong>Durable Pi</strong>
          <span
            className="network-summary"
            title={`${onlineCount} of ${devices.length} devices online`}
          >
            <Network size={16} />
            {onlineCount} of {devices.length} online
          </span>
        </div>
        <div className="top-actions">
          <span className="connection">
            <i className={cx(streamState === "live" && "online")} />
            {streamState === "live" ? "Connected" : "Reconnecting"}
          </span>
          <button
            className="icon-button"
            title="How this works"
            aria-label="How this works"
            onClick={() => openDialog({ kind: "help" })}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="secondary small new-agent-button"
            disabled={!selected || !online || creatingAgent}
            title="Start a fresh agent in this session"
            onClick={newAgent}
          >
            <Plus size={18} />
            New agent
          </button>
          <button className="primary small" onClick={openNewSession}>
            <Plus size={18} />
            New session
          </button>
          <button
            className="icon-button inspector-toggle"
            aria-label="Toggle inspector"
            title="Inspector"
            disabled={!selected || !online}
            onClick={() => (inspectorOverlay ? hideInspector() : showInspector())}
          >
            <PanelRight size={19} />
          </button>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <Info size={18} />
          <span>{error}</span>
          <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <main className="net-workspace" style={{ "--tree-w": `${treeWidth}px` } as CSSProperties}>
        <NetworkSidebar />
        {layout.tree && (
          <div
            className="tree-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize network tree"
            onPointerDown={resize}
          />
        )}
        {drawer && <div className="tree-backdrop" onClick={() => setDrawer(false)} />}
        {selected && device && online ? (
          <>
            <Inspector />
            {inspectorOverlay && <div className="inspector-backdrop" onClick={hideInspector} />}
            <AgentView key={`${selected.deviceId}/${selected.sessionId}`} />
          </>
        ) : selected && device ? (
          <OfflinePanel device={device} />
        ) : (
          <section className="welcome">
            <img className="welcome-symbol" src="/icons/durable-pi.svg" alt="Durable Pi" />
            <span className="eyebrow">THE DURABLE AGENT NETWORK</span>
            <h1>
              Close the tab.
              <br />
              The work continues.
            </h1>
            <p>Agents run on your devices. This page is only a window into them.</p>
            <button className="primary" disabled={!onlineCount} onClick={openNewSession}>
              <Plus size={18} />
              {devices.length ? "Create a session" : "Add a device to dpi-network.yaml"}
            </button>
            <div className="welcome-features">
              <span>
                <Database size={18} />
                SQLite on each device
              </span>
              <span>
                <GitFork size={18} />
                Branch any agent
              </span>
              <span>
                <Activity size={18} />
                Watch from anywhere
              </span>
            </div>
          </section>
        )}
      </main>

      {dialog?.kind === "new-session" ? (
        <NewSessionDialog deviceId={dialog.deviceId} onClose={closeDialog} />
      ) : dialog?.kind === "prompt" ? (
        <PromptDialog dialog={dialog} onClose={closeDialog} />
      ) : dialog?.kind === "models" ? (
        <ModelPicker onClose={closeDialog} />
      ) : dialog?.kind === "path" ? (
        <Backdrop onClose={closeDialog}>
          <section
            className="modal path-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="path-title"
          >
            <header>
              <h2 id="path-title">Working directory</h2>
              <button
                className="icon-button"
                aria-label="Close working directory"
                onClick={closeDialog}
              >
                <X size={18} />
              </button>
            </header>
            <code className="full-directory">{dialog.path}</code>
            <footer>
              <button className="secondary" onClick={closeDialog}>
                Close
              </button>
            </footer>
          </section>
        </Backdrop>
      ) : dialog?.kind === "help" ? (
        <HelpDialog />
      ) : null}
      <Toast />
    </div>
  );
}

const LESSONS = [
  [
    "Pick a device, start a session",
    "Every device in the tree runs dpi-backend. A session gets its own SQLite database on that device, in the directory you choose.",
  ],
  [
    "Send work, then close the browser",
    "The device owns the run. Reopening restores committed messages, state and live progress.",
  ],
  [
    "Change state and fork",
    "Edit App State by hand or through the agent. Every session and fork on a device shares it.",
  ],
  [
    "Interrupt deliberately",
    "Interrupt stops foreground work and owned subagents. Background jobs continue. Stop all includes them.",
  ],
  [
    "Explore the boundaries",
    "Queue a follow-up, steer after tools, wait for approval, compact context, reset or inspect raw state.",
  ],
  [
    "Restart a device",
    "Its tree dims and shows the restart command. Checkpointed jobs recover on boot. Replay-safe tools may rerun. Other interrupted tools return an error.",
  ],
];

function HelpDialog() {
  return (
    <Backdrop onClose={closeDialog}>
      <section className="modal help-modal">
        <header>
          <div>
            <span className="eyebrow">LEARN BY DOING</span>
            <h2>What makes this durable?</h2>
          </div>
          <button className="icon-button" aria-label="Close help" onClick={closeDialog}>
            <X size={18} />
          </button>
        </header>
        <ol className="learning-list">
          {LESSONS.map(([title, text], i) => (
            <li key={title}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="callout">
          <Info size={18} />
          <span>
            Durable does not mean exactly-once external effects. Checkpoints protect progress. Tools
            still need their own idempotency.
          </span>
        </div>
      </section>
    </Backdrop>
  );
}

/** The toast fades in and out (the .toast-enter-* classes) and keeps its text while fading out. */
function Toast() {
  const text = useAtomValue(toastAtom);
  const [shown, setShown] = useState("");
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (text) {
      setShown(text);
      let frame = requestAnimationFrame(
        () => (frame = requestAnimationFrame(() => setVisible(true))),
      );
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = setTimeout(() => setShown(""), 200);
    return () => clearTimeout(timer);
  }, [text]);
  if (!shown) return null;
  return (
    <div
      className={cx("toast", "toast-enter-active", !visible && "toast-enter-from")}
      role="status"
    >
      <Check size={18} />
      {shown}
    </div>
  );
}
