import type { CSSProperties } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FolderOpen,
  GitFork,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { NetworkDevice } from "@sdk/api";
import type { TreeNode } from "@sdk/models";
import DeviceIcon from "./DeviceIcon";
import { ago } from "../client/store";
import { cx } from "../client/cx";

export type TreeAction = "new-session" | "check" | "new-agent" | "rename" | "archive";

function statusText(d: NetworkDevice) {
  const count = d.tree?.sessions.length ?? 0;
  switch (d.status) {
    case "online":
      return `${count} session${count === 1 ? "" : "s"}`;
    case "checking":
      return "checking…";
    case "unauthorized":
      return d.hasToken ? "token rejected" : "no token";
    case "mismatch":
      return "identity changed";
    case "incompatible":
      return "incompatible";
    default:
      return `offline · ${ago(d.lastSeenAt)}`;
  }
}

export const statusDot = (status?: NetworkDevice["status"]) =>
  status === "online" ? "on" : status === "checking" ? "chk" : status === "offline" ? "off" : "err";

export default function TreeRow({
  node,
  depth,
  open,
  selected,
  focused,
  online,
  onToggle,
  onActivate,
  onAction,
}: {
  node: TreeNode;
  depth: number;
  open: boolean;
  selected: boolean;
  focused: boolean;
  online: boolean;
  onToggle: () => void;
  onActivate: () => void;
  onAction: (name: TreeAction) => void;
}) {
  const hasChildren = node.children.length > 0;
  const device = node.type === "device" ? node.device : undefined;
  const session = node.type === "session" ? node.session : undefined;
  const agent = node.type === "agent" ? node.agent : undefined;
  const background = session
    ? session.agents.reduce((n, a) => n + a.background, 0)
    : (agent?.background ?? 0);
  const busy = session?.busy || agent?.busy;
  const dot = statusDot(device?.status);
  const label = device?.id ?? session?.name ?? agent?.name ?? "";
  const title = device
    ? `${device.name} · ${device.url}${device.error ? `\n${device.error}` : ""}`
    : session
      ? `${session.name}\n${session.cwd}`
      : agent!.kind === "fork"
        ? `Fork of agent #${agent!.parentId} at entry #${agent!.forkedAt}`
        : agent!.kind === "subagent"
          ? `Subagent owned by agent #${agent!.ownerAgentId}`
          : "Root agent";
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={cx(
        "tree-row",
        node.type,
        selected && "sel",
        focused && "focus",
        node.stale && "stale",
      )}
      style={{ "--depth": depth } as CSSProperties}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? open : undefined}
      aria-selected={selected}
      data-key={node.key}
      title={title}
      onClick={onActivate}
    >
      {hasChildren ? (
        <button
          className="chev"
          tabIndex={-1}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      ) : (
        <span className="chev" />
      )}
      {device ? (
        <>
          <i className={cx("dot", dot)} />
          <DeviceIcon device={device} size={16} />
          <b className="name">{label}</b>
          <span className="badge">{device.kind}</span>
          <span className={cx("meta", dot === "err" && "err")}>{statusText(device)}</span>
          <span className="acts" onClick={stop}>
            <button
              className="icon-button"
              disabled={!online}
              aria-label={`New session on ${label}`}
              title="New session on this device"
              onClick={() => onAction("new-session")}
            >
              <Plus size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Check ${label}`}
              title="Check connection now"
              onClick={() => onAction("check")}
            >
              <RefreshCw size={16} />
            </button>
          </span>
        </>
      ) : session ? (
        <>
          <FolderOpen className="ico" size={16} />
          <b className="name">{label}</b>
          <span className="path">…/{session.cwd.split("/").filter(Boolean).at(-1)}</span>
          {busy && <i className="dot work" title="Working" />}
          {background > 0 && (
            <span className="bg-count" title={`${background} background task(s)`}>
              <i className="dot bg" />
              {background} bg
            </span>
          )}
          <span className="acts" onClick={stop}>
            <button
              className="icon-button"
              disabled={!online}
              aria-label={`New agent in ${label}`}
              title="New agent in this session"
              onClick={() => onAction("new-agent")}
            >
              <Plus size={16} />
            </button>
            <button
              className="icon-button"
              disabled={!online}
              aria-label={`Rename session ${label}`}
              title="Rename session"
              onClick={() => onAction("rename")}
            >
              <Pencil size={16} />
            </button>
            <button
              className="icon-button"
              disabled={!online}
              aria-label={`Archive session ${label}`}
              title="Archive session"
              onClick={() => onAction("archive")}
            >
              <Archive size={16} />
            </button>
          </span>
        </>
      ) : agent ? (
        <>
          {agent.kind === "fork" ? (
            <GitFork className="ico" size={16} />
          ) : agent.kind === "subagent" ? (
            <CornerDownRight className="ico" size={16} />
          ) : (
            <MessageSquare className="ico root" size={16} />
          )}
          <span className="name">{label}</span>
          {agent.kind === "fork" && agent.forkedAt !== undefined && (
            <span className="meta">@ #{agent.forkedAt}</span>
          )}
          {busy && <i className="dot work" title="Working" />}
          {background > 0 && (
            <span className="bg-count" title={`${background} background task(s)`}>
              <i className="dot bg" />
              {background}
            </span>
          )}
          <span className="acts" onClick={stop}>
            <button
              className="icon-button"
              disabled={!online}
              aria-label={`Rename agent ${label}`}
              title="Rename agent"
              onClick={() => onAction("rename")}
            >
              <Pencil size={16} />
            </button>
          </span>
        </>
      ) : null}
    </div>
  );
}
