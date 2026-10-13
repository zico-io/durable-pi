import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { statePath, type JsonValue, type StateChange } from "@sdk/app-state";
import { useBound } from "../client/useBound";
import { Button } from "@/components/motion/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { Switch } from "@/components/motion/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const types = ["string", "number", "boolean", "object", "array", "null"];
const defaults: Record<string, () => JsonValue> = {
  string: () => "",
  number: () => 0,
  boolean: () => false,
  object: () => ({}),
  array: () => [],
  null: () => null,
};

function TypeSelect({
  value,
  label,
  disabled,
  className,
  onChange,
}: {
  value: string;
  label: string;
  disabled: boolean;
  className?: string;
  onChange: (type: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled} className={className}>
      <SelectTrigger aria-label={label} className="h-8 py-1 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {types.map((type) => (
          <SelectItem key={type} value={type} className="text-xs">
            {type}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const stepButton = "size-9 shrink-0 text-muted-foreground hover:text-foreground";

export default function StateEditor({
  value,
  path = "",
  label = "App State",
  disabled = false,
  onChange,
}: {
  value: JsonValue;
  path?: string;
  label?: string;
  disabled?: boolean;
  onChange: (change: StateChange) => void;
}) {
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const container = kind === "object" || kind === "array";
  const [shownKind, setShownKind] = useBound<string>(kind);
  const [draft, setDraft] = useState(() => String(value ?? ""));
  const [editing, setEditing] = useState(false);
  const [newType, setNewType] = useState("string");
  const [adding, setAdding] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!editing) setDraft(String(value ?? ""));
  }
  // JSON Pointer escapes "/" inside keys, so every slash is one level.
  const depth = path.split("/").length - 1;

  const change = (operation: StateChange["operation"], next?: JsonValue) =>
    onChange({ operation, path, value: next });

  function save() {
    setEditing(false);
    const next = kind === "number" ? Number(draft) : draft;
    if (kind === "number" && (!draft.trim() || !Number.isFinite(next))) {
      setDraft(String(value));
      return;
    }
    if (next !== value) change("update", next);
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    onChange({ operation: "create", path: statePath(path, "-"), value: defaults[newType]!() });
    setAdding(false);
  }

  return (
    <div
      className={cn(
        "state-field grid min-w-0 gap-2.5",
        depth === 0 && "state-root",
        depth === 1 && "rounded-xl border border-border bg-card p-3",
        depth > 1 && "border-l-2 border-border-strong py-0.5 pl-3",
      )}
      data-state-path={path}
    >
      {path !== "" && (
        <div className="state-field-heading flex min-w-0 items-center gap-2">
          <strong className="min-w-0 flex-1 font-mono text-[13px] font-medium [overflow-wrap:anywhere]">
            {label}
          </strong>
          <TypeSelect
            value={shownKind}
            label={`Type of ${path}`}
            disabled={disabled}
            className="w-28 shrink-0"
            onChange={(type) => {
              setShownKind(type);
              change("update", defaults[type]!());
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${path}`}
            title="Delete field"
            disabled={disabled}
            onClick={() => change("delete")}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
      {container ? (
        <>
          {Object.entries(value as Record<string, JsonValue>).map(([childKey, child]) => (
            <StateEditor
              key={childKey}
              value={child}
              path={statePath(path, childKey)}
              label={childKey}
              disabled={disabled}
              onChange={onChange}
            />
          ))}
          {kind === "array" &&
            (adding ? (
              <form className="state-add flex flex-wrap items-center gap-2" onSubmit={add}>
                <TypeSelect
                  value={newType}
                  label={`New field type in ${path || "/"}`}
                  disabled={disabled}
                  className="min-w-28 flex-1"
                  onChange={setNewType}
                />
                <Button type="submit" variant="secondary" size="sm" disabled={disabled}>
                  Add
                </Button>
                <button
                  type="button"
                  className="rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setAdding(false)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="state-add-button inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-primary outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                disabled={disabled}
                aria-label={`Add item to ${path || "/"}`}
                onClick={() => setAdding(true)}
              >
                <Plus className="size-4" />
                Add item
              </button>
            ))}
        </>
      ) : kind === "number" ? (
        <div className="state-number flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            className={stepButton}
            aria-label={`Decrement ${path}`}
            disabled={disabled}
            onClick={() => change("increment", -1)}
          >
            <Minus className="size-4" />
          </Button>
          <input
            value={draft}
            type="number"
            step="any"
            aria-label={`Value of ${path}`}
            disabled={disabled}
            className="h-9 min-w-0 flex-1 [appearance:textfield] rounded-full border border-border bg-background px-3 text-center font-mono text-sm tabular-nums transition-colors outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <Button
            variant="secondary"
            size="icon"
            className={stepButton}
            aria-label={`Increment ${path}`}
            disabled={disabled}
            onClick={() => change("increment", 1)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      ) : kind === "boolean" ? (
        <div className="state-boolean flex items-center gap-3">
          <Switch
            ariaLabel={`Value of ${path}`}
            checked={value === true}
            disabled={disabled}
            onCheckedChange={() => change("update", !value)}
          />
          <span className="font-mono text-xs text-muted-foreground">{String(value)}</span>
        </div>
      ) : kind === "string" ? (
        <Textarea
          value={draft}
          rows={2}
          aria-label={`Value of ${path}`}
          disabled={disabled}
          className="min-h-0 rounded-lg bg-background md:text-sm dark:bg-background"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={save}
        />
      ) : (
        <span className="font-mono text-xs text-muted-foreground">null</span>
      )}
    </div>
  );
}
