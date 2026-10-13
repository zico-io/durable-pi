import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Provider, useAtom, useAtomValue } from "jotai";
import {
  Activity,
  CircleHelp,
  Database,
  GitFork,
  Info,
  Network,
  PanelLeft,
  PanelRight,
  Plus,
} from "lucide-react";
import NetworkSidebar from "./components/NetworkSidebar";
import AgentView from "./components/AgentView";
import Inspector from "./components/Inspector";
import OfflinePanel from "./components/OfflinePanel";
import NewSessionDialog from "./components/NewSessionDialog";
import PromptDialog from "./components/PromptDialog";
import ModelPicker from "./components/ModelPicker";
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
  type Dialog,
} from "./client/store";
import { store } from "./client/state";
import { Button } from "@/components/motion/button";
import { Alert, AlertClose, AlertContent, AlertIcon } from "@/components/motion/alert";
import { AnimatedToastStack } from "@/components/motion/animated-toast-stack";
import { Modal, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { Eyebrow } from "@/components/ui/text";
import { cn } from "@/lib/utils";

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
  // An open menu or picker takes its own Escape.
  if ((e.target as Element | null)?.closest?.('[aria-expanded="true"]')) return;
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
  const [drawer, setDrawer] = useAtom(drawerAtom);
  const inspectorOverlay = useAtomValue(inspectorOverlayAtom);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const onlineCount = devices.filter((d) => d.status === "online").length;
  const live = streamState === "live";

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
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="z-10 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-topbar pr-4 pl-3 max-[760px]:h-14 max-[760px]:px-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle network"
            title="Network"
            className="min-[768px]:hidden"
            onClick={() => setDrawer(!drawer)}
          >
            <PanelLeft className="size-[18px]" />
          </Button>
          <img className="ml-1 h-6 w-11 shrink-0" src="/icons/durable-pi.svg" alt="Durable Pi" />
          <strong className="font-heading text-base font-bold tracking-tight whitespace-nowrap">
            Durable Pi
          </strong>
          <span
            className="network-summary ml-1 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[13px] whitespace-nowrap text-muted-foreground max-[760px]:hidden"
            title={`${onlineCount} of ${devices.length} devices online`}
          >
            <Network className="size-3.5" />
            {onlineCount} of {devices.length} online
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="mr-1 inline-flex items-center gap-2 text-[13px] text-muted-foreground max-[760px]:hidden"
            role="status"
          >
            <i className={cn("dot", live ? "on" : "chk")} />
            {live ? "Connected" : "Reconnecting"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            title="How this works"
            aria-label="How this works"
            onClick={() => openDialog({ kind: "help" })}
          >
            <CircleHelp className="size-[18px]" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-9 px-3.5 text-sm max-[760px]:hidden"
            disabled={!selected || !online || creatingAgent}
            title="Start a fresh agent in this session"
            onClick={newAgent}
          >
            <Plus className="size-4" />
            New agent
          </Button>
          <Button size="sm" className="h-9 px-3.5 text-sm font-semibold" onClick={openNewSession}>
            <Plus className="size-4" />
            New session
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle inspector"
            title="Inspector"
            className="min-[1101px]:hidden"
            disabled={!selected || !online}
            onClick={() => (inspectorOverlay ? hideInspector() : showInspector())}
          >
            <PanelRight className="size-[18px]" />
          </Button>
        </div>
      </header>
      <ErrorBanner />
      <main
        className="relative flex min-h-0 flex-1"
        style={{ "--tree-w": `${treeWidth}px` } as CSSProperties}
      >
        <NetworkSidebar />
        {layout.tree && (
          <div
            className="relative z-[5] -mx-[3px] w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-primary/20 max-[767px]:hidden"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize network tree"
            onPointerDown={resize}
          />
        )}
        {selected && device && online ? (
          <>
            <Inspector />
            {inspectorOverlay && (
              <div
                className="absolute inset-0 z-[29] bg-black/60 min-[1101px]:hidden"
                onClick={hideInspector}
              />
            )}
            <AgentView key={`${selected.deviceId}/${selected.sessionId}`} />
          </>
        ) : selected && device ? (
          <OfflinePanel device={device} />
        ) : (
          <Welcome
            onlineCount={onlineCount}
            deviceCount={devices.length}
            onCreate={openNewSession}
          />
        )}
      </main>
      <Dialogs />
      <Toast />
    </div>
  );
}

function ErrorBanner() {
  const [error, setError] = useAtom(errorAtom);
  // Keep the text while the banner animates out.
  const last = useRef(error);
  if (error) last.current = error;
  return (
    <div className={cn("px-4", error && "pt-3")}>
      <Alert
        variant="destructive"
        open={!!error}
        onOpenChange={(open) => !open && setError("")}
        className="error-banner border border-destructive/30 py-3"
      >
        <AlertIcon />
        <AlertContent className="text-foreground">{last.current}</AlertContent>
        <AlertClose aria-label="Dismiss error" />
      </Alert>
    </div>
  );
}

function Welcome({
  onlineCount,
  deviceCount,
  onCreate,
}: {
  onlineCount: number;
  deviceCount: number;
  onCreate: () => void;
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12 text-center">
      <img className="mb-7 h-14 w-24" src="/icons/durable-pi.svg" alt="Durable Pi" />
      <Eyebrow>The durable agent network</Eyebrow>
      <h1 className="mt-4 font-heading text-4xl leading-[1.15] font-bold tracking-tight text-balance max-[760px]:text-3xl">
        Close the tab.
        <br />
        The work continues.
      </h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground">
        Agents run on your devices. This page is only a window into them.
      </p>
      <Button className="mt-8 h-11 px-5 font-semibold" disabled={!onlineCount} onClick={onCreate}>
        <Plus className="size-4" />
        {deviceCount ? "Create a session" : "Add a device to dpi-network.yaml"}
      </Button>
      <div className="mt-14 flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground max-[760px]:flex-col max-[760px]:items-center">
        {[
          { icon: Database, text: "SQLite on each device" },
          { icon: GitFork, text: "Branch any agent" },
          { icon: Activity, text: "Watch from anywhere" },
        ].map(({ icon: Icon, text }) => (
          <span key={text} className="inline-flex items-center gap-2">
            <Icon className="size-4 text-primary" />
            {text}
          </span>
        ))}
      </div>
    </section>
  );
}

// A dialog stays mounted while its modal animates out; each dialog object gets its own instance.
const dialogKeys = new WeakMap<Dialog, number>();
let nextDialogKey = 0;
const keyOf = (d: Dialog) => {
  if (!dialogKeys.has(d)) dialogKeys.set(d, nextDialogKey++);
  return dialogKeys.get(d);
};

function Dialogs() {
  const dialog = useAtomValue(dialogAtom);
  const [shown, setShown] = useState(dialog);
  if (dialog && dialog !== shown) setShown(dialog);
  const current = dialog ?? shown;
  if (!current) return null;
  const key = keyOf(current);
  const props = {
    open: dialog === current,
    onClose: closeDialog,
    onExited: () => setShown(undefined),
  };
  switch (current.kind) {
    case "new-session":
      return <NewSessionDialog key={key} {...props} deviceId={current.deviceId} />;
    case "prompt":
      return <PromptDialog key={key} {...props} dialog={current} />;
    case "models":
      return <ModelPicker key={key} {...props} />;
    case "path":
      return (
        <Modal open={props.open} onClose={closeDialog} onExited={props.onExited} key={key}>
          <ModalHeader
            title="Working directory"
            closeLabel="Close working directory"
            onClose={closeDialog}
          />
          <code className="block rounded-xl border border-border bg-background px-3.5 py-3 font-mono text-[13px] leading-6 break-all">
            {current.path}
          </code>
          <ModalFooter>
            <Button variant="secondary" onClick={closeDialog}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      );
    case "help":
      return <HelpDialog key={key} open={props.open} onExited={props.onExited} />;
    default:
      return null;
  }
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

function HelpDialog({ open, onExited }: { open: boolean; onExited: () => void }) {
  return (
    <Modal open={open} onClose={closeDialog} onExited={onExited} className="max-w-xl">
      <ModalHeader
        eyebrow="Learn by doing"
        title="What makes this durable?"
        closeLabel="Close help"
        onClose={closeDialog}
      />
      <ol className="grid gap-4">
        {LESSONS.map(([title, text], i) => (
          <li key={title} className="flex gap-4">
            <span className="mt-0.5 font-mono text-xs text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="grid gap-1">
              <strong className="text-sm font-semibold">{title}</strong>
              <p className="text-sm leading-6 text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex gap-3 rounded-xl border border-border bg-background p-4 text-sm leading-6">
        <Info className="mt-1 size-4 text-primary" />
        <span>
          Durable does not mean exactly-once external effects. Checkpoints protect progress. Tools
          still need their own idempotency.
        </span>
      </div>
    </Modal>
  );
}

/** One notice at a time: a new one replaces the text in place. */
function Toast() {
  const [text, setText] = useAtom(toastAtom);
  return (
    <AnimatedToastStack
      fixed
      position="bottom-center"
      className="toast w-auto max-w-[min(32rem,calc(100vw-2rem))]"
      classNames={{ title: "whitespace-normal" }}
      toasts={text ? [{ id: "notice", title: text, status: "success" }] : []}
      onDismiss={() => setText("")}
    />
  );
}
