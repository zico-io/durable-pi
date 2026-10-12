import { useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { Network, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { TreeNode } from "@sdk/models";
import DeviceIcon from "./DeviceIcon";
import TreeRow, { statusDot, type TreeAction } from "./TreeRow";
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
  depth: number;
  parent?: string;
}

export default function NetworkSidebar() {
  const devices = useAtomValue(network.devices);
  const tree = useAtomValue(network.tree);
  const expanded = useAtomValue(expandedAtom);
  const selected = useAtomValue(selectedAtom);
  const layout = useAtomValue(layoutAtom);
  const drawer = useAtomValue(drawerAtom);
  const [focusKey, setFocusKey] = useState<string>();
  const [scrollTo, setScrollTo] = useState<{ key: string }>();
  const list = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (nodes: TreeNode[], depth: number, parent?: string) => {
      for (const node of nodes) {
        out.push({ node, depth, parent });
        if (node.children.length && expanded.has(node.key))
          walk(node.children, depth + 1, node.key);
      }
    };
    walk(tree, 0);
    return out;
  }, [tree, expanded]);

  useEffect(() => {
    if (scrollTo)
      list.current
        ?.querySelector(`[data-key="${CSS.escape(scrollTo.key)}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [scrollTo]);

  const deviceOf = (node: TreeNode) =>
    devices.find((d) => d.id === (node.type === "device" ? node.device.id : node.deviceId));
  const isSelected = (node: TreeNode) =>
    node.type === "agent" &&
    selected?.deviceId === node.deviceId &&
    selected.sessionId === node.sessionId &&
    selected.agentId === node.agent.id;

  function activate(node: TreeNode) {
    setFocusKey(node.key);
    if (node.type === "device") return toggle(node.key);
    if (node.type === "agent")
      return select({ deviceId: node.deviceId, sessionId: node.sessionId, agentId: node.agent.id });
    const root = node.session.agents.find((a) => a.kind === "root") ?? node.session.agents[0];
    toggle(node.key, true);
    if (root) select({ deviceId: node.deviceId, sessionId: node.session.id, agentId: root.id });
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

  function move(delta: number) {
    const i = rows.findIndex((r) => r.node.key === focusKey);
    const next = rows[Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + delta))];
    if (!next) return;
    setFocusKey(next.node.key);
    setScrollTo({ key: next.node.key });
  }

  function keydown(e: React.KeyboardEvent) {
    const row = rows.find((r) => r.node.key === focusKey);
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "ArrowRight" && row) {
      if (!row.node.children.length) return;
      if (expanded.has(row.node.key)) move(1);
      else toggle(row.node.key, true);
    } else if (e.key === "ArrowLeft" && row) {
      if (row.node.children.length && expanded.has(row.node.key)) toggle(row.node.key, false);
      else if (row.parent) setFocusKey(row.parent);
    } else if ((e.key === "Enter" || e.key === " ") && row) activate(row.node);
    else return;
    e.preventDefault();
  }

  return (
    <aside
      className={cx("network-sidebar", drawer && "open", !layout.tree && !drawer && "collapsed")}
      aria-label="Network"
    >
      {layout.tree || drawer ? (
        <>
          <header className="tree-head">
            <span>
              <Network size={16} />
              NETWORK
            </span>
            <button
              className="icon-button panel-toggle"
              aria-label="Collapse network"
              title={`Collapse network (${panelKeys.tree})`}
              onClick={() => {
                setLayout({ tree: false });
                store.set(drawerAtom, false);
              }}
            >
              <PanelLeftClose size={18} />
            </button>
          </header>
          <div
            ref={list}
            className="tree-list"
            role="tree"
            tabIndex={0}
            aria-label="Devices, sessions and agents"
            onKeyDown={keydown}
            onFocus={() => setFocusKey((key) => key ?? rows[0]?.node.key)}
          >
            {rows.map((row) => (
              <TreeRow
                key={row.node.key}
                node={row.node}
                depth={row.depth}
                open={expanded.has(row.node.key)}
                selected={isSelected(row.node)}
                focused={focusKey === row.node.key}
                online={deviceOf(row.node)?.status === "online"}
                onToggle={() => toggle(row.node.key)}
                onActivate={() => activate(row.node)}
                onAction={(name) => void action(row.node, name)}
              />
            ))}
            {!rows.length && (
              <p className="hint tree-empty">
                No devices yet. Declare them in <code>dpi-network.yaml</code> (start from{" "}
                <code>dpi-network.example.yaml</code>), then run <code>just net up &lt;id&gt;</code>
                .
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="panel-rail" aria-label="Network (collapsed)">
          <button
            className="icon-button panel-toggle"
            aria-label="Expand network"
            title={`Expand network (${panelKeys.tree})`}
            onClick={() => setLayout({ tree: true })}
          >
            <PanelLeftOpen size={18} />
          </button>
          {devices.map((d) => (
            <button
              key={d.id}
              className="rail-device"
              title={`${d.id} · ${d.status}`}
              aria-label={`Show ${d.id}`}
              onClick={() => {
                setLayout({ tree: true });
                toggle(d.id, true);
              }}
            >
              <DeviceIcon device={d} size={20} />
              <i className={cx("dot", statusDot(d.status))} />
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
