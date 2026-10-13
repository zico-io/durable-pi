import { useMemo, type CSSProperties } from "react";
import { useAtomValue } from "jotai";
import { Bot, FolderOpen, Network, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { TreeNode } from "@sdk/models";
import { DeviceRow, type TreeAction, type TreeContext } from "./TreeRow";
import {
  AnimatedSidebar,
  AnimatedSidebarClose,
  AnimatedSidebarContent,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuItem,
  AnimatedSidebarProvider,
  AnimatedSidebarTrigger,
} from "@/components/motion/animated-sidebar";
import { MorphingSearch, type MorphingSearchItem } from "@/components/motion/morphing-search";
import { deviceClient, hub } from "../client/hub";
import {
  attempt,
  drawerAtom,
  expandedAtom,
  layoutAtom,
  network,
  notify,
  openDialog,
  panelKeys,
  select,
  selectedAtom,
  setLayout,
  toggle,
} from "../client/store";
import { store } from "../client/state";
import { cx } from "../client/cx";

interface Row {
  node: TreeNode;
  parent?: string;
}

const flatten = (nodes: TreeNode[], keep: (node: TreeNode) => boolean, parent?: string): Row[] =>
  nodes.flatMap((node) => [
    { node, parent },
    ...(keep(node) ? flatten(node.children, keep, node.key) : []),
  ]);

const rowButton = (key: string) =>
  document.querySelector<HTMLElement>(`.network-sidebar [data-key="${CSS.escape(key)}"] > button`);

export default function NetworkSidebar() {
  const devices = useAtomValue(network.devices);
  const tree = useAtomValue(network.tree);
  const expanded = useAtomValue(expandedAtom);
  const selected = useAtomValue(selectedAtom);
  const layout = useAtomValue(layoutAtom);
  const drawer = useAtomValue(drawerAtom);

  const rows = useMemo(() => flatten(tree, (n) => expanded.has(n.key)), [tree, expanded]);

  const searchItems = useMemo<MorphingSearchItem[]>(
    () =>
      flatten(tree, () => true)
        .map(({ node }) => node)
        .filter((node) => node.type !== "device")
        .map((node) =>
          node.type === "session"
            ? {
                id: node.key,
                title: node.session.name,
                description: `${node.deviceId} · ${node.session.cwd}`,
                keywords: [node.deviceId, node.session.cwd],
                icon: FolderOpen,
              }
            : {
                id: node.key,
                title: node.agent.name,
                description: `${node.deviceId} · agent`,
                keywords: [node.deviceId],
                icon: Bot,
              },
        ),
    [tree],
  );

  const deviceOf = (node: TreeNode) =>
    devices.find((d) => d.id === (node.type === "device" ? node.device.id : node.deviceId));

  function activate(node: TreeNode) {
    if (node.type === "device") {
      // From the rail, a device opens the panel on itself.
      if (!layout.tree) setLayout({ tree: true });
      return toggle(node.key, layout.tree ? undefined : true);
    }
    if (node.type === "agent")
      return select({ deviceId: node.deviceId, sessionId: node.sessionId, agentId: node.agent.id });
    const root = node.session.agents.find((a) => a.kind === "root") ?? node.session.agents[0];
    toggle(node.key, true);
    if (root) select({ deviceId: node.deviceId, sessionId: node.session.id, agentId: root.id });
  }

  // Search reaches nodes inside folded branches: unfold the path to them first.
  function reveal(key: string) {
    const path = flatten(tree, () => true);
    const byKey = new Map(path.map((r) => [r.node.key, r]));
    for (let row = byKey.get(key); row?.parent; row = byKey.get(row.parent))
      toggle(row.parent, true);
    const target = byKey.get(key);
    if (target) activate(target.node);
  }

  async function action(node: TreeNode, name: TreeAction) {
    const device = deviceOf(node);
    if (!device) return;
    const client = deviceClient(device.id);
    if (node.type === "device") {
      if (name === "new-session") openDialog({ kind: "new-session", deviceId: device.id });
      else if (name === "check") await attempt(() => hub.check(device.id));
      return;
    }
    if (node.type === "session") {
      const s = node.session;
      if (name === "new-agent") {
        const created = await attempt(() => client.session(s.id).createAgent({}));
        if (created) {
          select({ deviceId: device.id, sessionId: s.id, agentId: created.id });
          notify("New agent. Same session, same shared App State.");
        }
      } else if (name === "rename")
        openDialog({
          kind: "prompt",
          title: "Rename session",
          label: "Session name",
          value: s.name,
          submit: "Save name",
          run: (value) => client.session(s.id).rename(value),
        });
      else if (name === "archive")
        openDialog({
          kind: "prompt",
          title: `Archive ${s.name}?`,
          hint: `Stops all of its work and moves its files to archive/ on ${device.id}. Nothing is deleted.`,
          submit: "Archive session",
          danger: true,
          run: async () => {
            await client.session(s.id).archive();
            if (store.get(selectedAtom)?.sessionId === s.id) select(undefined);
          },
        });
      return;
    }
    const a = node.agent;
    if (name === "rename")
      openDialog({
        kind: "prompt",
        title: "Rename agent",
        label: "Agent name",
        value: a.named ? a.name : "",
        placeholder: a.name,
        submit: "Save name",
        run: (value) => client.agent(node.sessionId, a.id).rename(value),
      });
  }

  const ctx: TreeContext = {
    expanded,
    collapsed: !layout.tree && !drawer,
    isSelected: (node) =>
      node.type === "agent" &&
      selected?.deviceId === node.deviceId &&
      selected.sessionId === node.sessionId &&
      selected.agentId === node.agent.id,
    isOnline: (node) => deviceOf(node)?.status === "online",
    toggle: (node) => toggle(node.key),
    activate,
    action: (node, name) => void action(node, name),
  };

  // Rows are real buttons, so Tab works; the arrows walk the visible tree like a file explorer.
  function keydown(e: React.KeyboardEvent) {
    const key = (document.activeElement?.closest("[data-key]") as HTMLElement | null)?.dataset.key;
    const i = rows.findIndex((r) => r.node.key === key);
    const row = rows[i];
    const focus = (k?: string) => k && rowButton(k)?.focus();
    if (e.key === "ArrowDown") focus(rows[i < 0 ? 0 : Math.min(rows.length - 1, i + 1)]?.node.key);
    else if (e.key === "ArrowUp") focus(rows[Math.max(0, i - 1)]?.node.key);
    else if (e.key === "ArrowRight" && row?.node.children.length) {
      if (expanded.has(row.node.key)) focus(rows[i + 1]?.node.key);
      else toggle(row.node.key, true);
    } else if (e.key === "ArrowLeft" && row) {
      if (row.node.children.length && expanded.has(row.node.key)) toggle(row.node.key, false);
      else focus(row.parent);
    } else return;
    e.preventDefault();
  }

  const collapse = layout.tree ? "Collapse network" : "Expand network";

  return (
    <AnimatedSidebarProvider
      open={layout.tree}
      onOpenChange={(tree) => setLayout({ tree })}
      openMobile={drawer}
      onOpenMobileChange={(open) => store.set(drawerAtom, open)}
      className="min-h-0 w-auto shrink-0"
      style={
        {
          "--sidebar-width": "var(--tree-w)",
          "--sidebar-width-icon": "var(--rail-w)",
        } as CSSProperties
      }
    >
      <AnimatedSidebar
        ariaLabel="Network"
        collapsible="icon"
        className={cx("network-sidebar h-full", !layout.tree && "collapsed", drawer && "open")}
        panelClassName="static h-full bg-[#181213]"
      >
        <AnimatedSidebarHeader className="flex-row items-center gap-2 px-2.5 pt-2.5 pb-1">
          <span
            className={cx(
              "flex min-w-0 flex-1 items-center gap-2 px-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground",
              ctx.collapsed && "hidden",
            )}
          >
            <Network className="size-4 shrink-0" />
            NETWORK
          </span>
          <AnimatedSidebarTrigger
            aria-label={collapse}
            title={`${collapse} (${panelKeys.tree})`}
            className="mx-auto size-9 text-muted-foreground hover:bg-muted hover:text-foreground max-md:hidden"
          >
            {layout.tree ? (
              <PanelLeftClose className="size-[18px]" />
            ) : (
              <PanelLeftOpen className="size-[18px]" />
            )}
          </AnimatedSidebarTrigger>
          <AnimatedSidebarClose className="size-9 text-muted-foreground hover:bg-muted md:hidden">
            <X className="size-4" />
          </AnimatedSidebarClose>
        </AnimatedSidebarHeader>

        <AnimatedSidebarContent
          className={cx("tree-list", ctx.collapsed ? "px-0" : "px-1.5")}
          onKeyDown={keydown}
        >
          {searchItems.length > 0 && (
            <AnimatedSidebarGroup className={cx("pb-1", ctx.collapsed && "px-0")}>
              <AnimatedSidebarMenu>
                <AnimatedSidebarMenuItem>
                  <MorphingSearch
                    items={searchItems}
                    placeholder="Search sessions and agents"
                    shortcut="/"
                    iconOnly={ctx.collapsed}
                    onSelect={(item) => reveal(item.id)}
                    className={ctx.collapsed ? "mx-auto size-9" : "h-9 w-full"}
                  />
                </AnimatedSidebarMenuItem>
              </AnimatedSidebarMenu>
            </AnimatedSidebarGroup>
          )}
          <AnimatedSidebarGroup className={cx(ctx.collapsed && "px-0")}>
            <AnimatedSidebarGroupLabel>Devices</AnimatedSidebarGroupLabel>
            <AnimatedSidebarGroupContent>
              <AnimatedSidebarMenu aria-label="Devices, sessions and agents">
                {tree.map(
                  (node) =>
                    node.type === "device" && <DeviceRow key={node.key} node={node} ctx={ctx} />,
                )}
              </AnimatedSidebarMenu>
              {!tree.length && !ctx.collapsed && (
                <p className="hint tree-empty px-2 text-sm text-muted-foreground">
                  No devices yet. Declare them in <code>dpi-network.yaml</code> (start from{" "}
                  <code>dpi-network.example.yaml</code>), then run{" "}
                  <code>just net up &lt;id&gt;</code>.
                </p>
              )}
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>
        </AnimatedSidebarContent>
      </AnimatedSidebar>
    </AnimatedSidebarProvider>
  );
}
