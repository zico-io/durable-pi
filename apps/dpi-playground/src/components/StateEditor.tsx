import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { statePath, type JsonValue, type StateChange } from "@sdk/app-state";
import { cx } from "../client/cx";
import { useBound } from "../client/useBound";

const types = ["string", "number", "boolean", "object", "array", "null"];
const defaults: Record<string, () => JsonValue> = {
  string: () => "",
  number: () => 0,
  boolean: () => false,
  object: () => ({}),
  array: () => [],
  null: () => null,
};

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
    <div className={cx("state-field", path === "" && "state-root")} data-state-path={path}>
      {path !== "" && (
        <div className="state-field-heading">
          <strong>{label}</strong>
          <select
            value={shownKind}
            aria-label={`Type of ${path}`}
            disabled={disabled}
            onChange={(e) => {
              setShownKind(e.target.value);
              change("update", defaults[e.target.value]!());
            }}
          >
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label={`Delete ${path}`}
            title="Delete field"
            disabled={disabled}
            onClick={() => change("delete")}
          >
            <Trash2 size={18} />
          </button>
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
              <form className="state-add" onSubmit={add}>
                <select
                  value={newType}
                  aria-label={`New field type in ${path || "/"}`}
                  disabled={disabled}
                  onChange={(e) => setNewType(e.target.value)}
                >
                  {types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <button className="secondary small" disabled={disabled}>
                  Add
                </button>
                <button type="button" className="text-button" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <button
                className="text-button state-add-button"
                disabled={disabled}
                aria-label={`Add item to ${path || "/"}`}
                onClick={() => setAdding(true)}
              >
                <Plus size={18} />
                Add item
              </button>
            ))}
        </>
      ) : kind === "number" ? (
        <div className="state-number">
          <button
            className="secondary"
            aria-label={`Decrement ${path}`}
            disabled={disabled}
            onClick={() => change("increment", -1)}
          >
            <Minus size={18} />
          </button>
          <input
            value={draft}
            type="number"
            step="any"
            aria-label={`Value of ${path}`}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <button
            className="secondary"
            aria-label={`Increment ${path}`}
            disabled={disabled}
            onClick={() => change("increment", 1)}
          >
            <Plus size={18} />
          </button>
        </div>
      ) : kind === "boolean" ? (
        <div className="state-boolean">
          <button
            className={cx("switch", value === true && "on")}
            role="switch"
            aria-label={`Value of ${path}`}
            aria-checked={value === true}
            disabled={disabled}
            onClick={() => change("update", !value)}
          >
            <span />
          </button>
          <span>{String(value)}</span>
        </div>
      ) : kind === "string" ? (
        <textarea
          value={draft}
          rows={2}
          aria-label={`Value of ${path}`}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={save}
        />
      ) : (
        <span className="muted">null</span>
      )}
    </div>
  );
}
