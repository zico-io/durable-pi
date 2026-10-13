import type { ReactNode } from "react";
import {
  Archive,
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
import {
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
  AnimatedSidebarMenuSub,
  AnimatedSidebarMenuSubButton,
  AnimatedSidebarMenuSubItem,
} from "@/components/motion/animated-sidebar";
import { ago } from "../client/store";
import { cx } from "../client/cx";

export type TreeAction = "new-session" | "check" | "new-agent" | "rename" | "archive";

export interface TreeContext {
  expanded: ReadonlySet<string>;
  collapsed: boolean;
  isSelected: (node: TreeNode) => boolean;
  isOnline: (node: TreeNode) => boolean;
  toggle: (node: TreeNode) => void;
  activate: (node: TreeNode) => void;
  action: (node: TreeNode, name: TreeAction) => void;
}

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

function titleOf(node: TreeNode) {
  if (node.type === "device")
    return `${node.device.name} · ${node.device.url}${node.device.error ? `\n${node.device.error}` : ""}`;
  if (node.type === "session") return `${node.session.name}\n${node.session.cwd}`;
  const a = node.agent;
  return a.kind === "fork"
    ? `Fork of agent #${a.parentId} at entry #${a.forkedAt}`
    : a.kind === "subagent"
      ? `Subagent owned by agent #${a.ownerAgentId}`
      : "Root agent";
}

function Act({
  label,
  title,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled}
      aria-label={label}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// Hover and keyboard-focus reveal the row's actions over its trailing meta.
function Acts({ children }: { children: ReactNode }) {
  return (
    <span className="absolute inset-y-0 right-1 z-20 hidden items-center gap-0.5 rounded-lg bg-muted pl-1 group-hover/row:flex group-focus-within/row:flex">
      {children}
    </span>
  );
}

function Indicators({ node }: { node: TreeNode }) {
  const background =
    node.type === "session"
      ? node.session.agents.reduce((n, a) => n + a.background, 0)
      : node.type === "agent"
        ? node.agent.background
        : 0;
  const busy =
    node.type === "session" ? node.session.busy : node.type === "agent" && node.agent.busy;
  return (
    <>
      {node.type === "agent" && node.agent.kind === "fork" && node.agent.forkedAt !== undefined && (
        <span className="shrink-0 text-muted-foreground/80">@ #{node.agent.forkedAt}</span>
      )}
      {busy && <i className="dot work" title="Working" />}
      {background > 0 && (
        <span
          className="bg-count inline-flex shrink-0 items-center gap-1 text-muted-foreground"
          title={`${background} background task(s)`}
        >
          <i className="dot bg" />
          {background}
          {node.type === "session" && " bg"}
        </span>
      )}
    </>
  );
}

function NodeIcon({ node }: { node: TreeNode }) {
  if (node.type === "session") return <FolderOpen className="size-3.5" />;
  if (node.type !== "agent") return null;
  if (node.agent.kind === "fork") return <GitFork className="size-3.5" />;
  if (node.agent.kind === "subagent") return <CornerDownRight className="size-3.5" />;
  return <MessageSquare className="size-3.5 text-primary" />;
}

function rowClass(node: TreeNode, selected: boolean) {
  return cx(
    "tree-row group/row relative",
    node.type,
    selected && "sel",
    node.stale && "stale opacity-55",
  );
}

/** A device and, when open, its sessions and agents. */
export function DeviceRow({
  node,
  ctx,
}: {
  node: TreeNode & { type: "device" };
  ctx: TreeContext;
}) {
  const d = node.device;
  const dot = statusDot(d.status);
  const online = ctx.isOnline(node);
  const open = ctx.expanded.has(node.key);
  return (
    <AnimatedSidebarMenuItem>
      <div className={rowClass(node, false)} data-key={node.key} title={titleOf(node)}>
        <AnimatedSidebarMenuButton
          icon={
            <span className="relative grid size-5 place-items-center">
              <DeviceIcon device={d} size={18} />
              <i
                className={cx(
                  "dot absolute -right-0.5 -bottom-0.5 size-2! basis-2! shadow-[0_0_0_2px_var(--color-background)]",
                  dot,
                )}
              />
            </span>
          }
          badge={
            <span className={cx("text-[11px]", dot === "err" && "text-destructive")}>
              {statusText(d)}
            </span>
          }
          ariaExpanded={node.children.length && !ctx.collapsed ? open : undefined}
          onSelect={() => ctx.activate(node)}
          className={cx("font-semibold", ctx.collapsed && "px-4")}
        >
          {d.id}
        </AnimatedSidebarMenuButton>
        {!ctx.collapsed && (
          <Acts>
            <Act
              label={`New session on ${d.id}`}
              title="New session on this device"
              disabled={!online}
              onClick={() => ctx.action(node, "new-session")}
            >
              <Plus className="size-3.5" />
            </Act>
            <Act
              label={`Check ${d.id}`}
              title="Check connection now"
              onClick={() => ctx.action(node, "check")}
            >
              <RefreshCw className="size-3.5" />
            </Act>
          </Acts>
        )}
      </div>
      <AnimatedSidebarMenuSub open={open && node.children.length > 0}>
        {node.children.map((child) => (
          <NodeRow key={child.key} node={child} ctx={ctx} />
        ))}
      </AnimatedSidebarMenuSub>
    </AnimatedSidebarMenuItem>
  );
}

/** A session or agent, and its nested agents when open. */
function NodeRow({ node, ctx }: { node: TreeNode; ctx: TreeContext }) {
  const online = ctx.isOnline(node);
  const open = ctx.expanded.has(node.key);
  const hasChildren = node.children.length > 0;
  const label =
    node.type === "session" ? node.session.name : node.type === "agent" ? node.agent.name : "";
  return (
    <AnimatedSidebarMenuSubItem>
      <div
        className={rowClass(node, ctx.isSelected(node))}
        data-key={node.key}
        title={titleOf(node)}
      >
        <AnimatedSidebarMenuSubButton
          icon={<NodeIcon node={node} />}
          isActive={ctx.isSelected(node)}
          onSelect={() => ctx.activate(node)}
          className={cx("pr-8 text-[13px]", node.type === "session" && "font-medium")}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="name truncate">{label}</span>
            {node.type === "session" && (
              <span className="truncate font-mono text-[11px] text-muted-foreground/80">
                …/{node.session.cwd.split("/").filter(Boolean).at(-1)}
              </span>
            )}
            <Indicators node={node} />
          </span>
        </AnimatedSidebarMenuSubButton>
        {hasChildren && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
            onClick={() => ctx.toggle(node)}
            className="absolute inset-y-0 right-1 z-10 my-auto grid size-6 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cx("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        )}
        <Acts>
          {node.type === "session" ? (
            <>
              <Act
                label={`New agent in ${label}`}
                title="New agent in this session"
                disabled={!online}
                onClick={() => ctx.action(node, "new-agent")}
              >
                <Plus className="size-3.5" />
              </Act>
              <Act
                label={`Rename session ${label}`}
                title="Rename session"
                disabled={!online}
                onClick={() => ctx.action(node, "rename")}
              >
                <Pencil className="size-3.5" />
              </Act>
              <Act
                label={`Archive session ${label}`}
                title="Archive session"
                disabled={!online}
                onClick={() => ctx.action(node, "archive")}
              >
                <Archive className="size-3.5" />
              </Act>
            </>
          ) : (
            <Act
              label={`Rename agent ${label}`}
              title="Rename agent"
              disabled={!online}
              onClick={() => ctx.action(node, "rename")}
            >
              <Pencil className="size-3.5" />
            </Act>
          )}
        </Acts>
      </div>
      <AnimatedSidebarMenuSub open={open && hasChildren} className="ml-2.5 pl-2">
        {node.children.map((child) => (
          <NodeRow key={child.key} node={child} ctx={ctx} />
        ))}
      </AnimatedSidebarMenuSub>
    </AnimatedSidebarMenuSubItem>
  );
}
