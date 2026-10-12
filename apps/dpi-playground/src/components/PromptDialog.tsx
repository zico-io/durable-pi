import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { message } from "../client/hub";
import type { Dialog } from "../client/store";
import { cx } from "../client/cx";
import Backdrop from "./Backdrop";

// One dialog for every name/note/confirm prompt: rename, fork, reset, archive, remove.
export default function PromptDialog({
  dialog,
  onClose,
}: {
  dialog: Extract<Dialog, { kind: "prompt" }>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(dialog.value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const hasInput = !!dialog.label;

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (hasInput && !dialog.optional && !value.trim()) return;
    setBusy(true);
    setError("");
    try {
      await dialog.run(value.trim());
      onClose();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Backdrop onClose={() => !busy && onClose()}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        onSubmit={submit}
      >
        <header>
          <h2 id="prompt-title">{dialog.title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {dialog.hint && <p className="hint">{dialog.hint}</p>}
        {hasInput && (
          <label>
            {dialog.label} {dialog.optional && <span className="muted">(optional)</span>}
            {dialog.multiline ? (
              <textarea
                ref={input}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={4}
                placeholder={dialog.placeholder}
                disabled={busy}
              />
            ) : (
              <input
                ref={input}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={100}
                required={!dialog.optional}
                placeholder={dialog.placeholder}
                aria-label={dialog.label}
                disabled={busy}
              />
            )}
          </label>
        )}
        {error && (
          <p className="message-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className={cx("primary", dialog.danger && "danger")}
            disabled={busy || (hasInput && !dialog.optional && !value.trim())}
          >
            {busy ? "Working…" : dialog.submit}
          </button>
        </footer>
      </form>
    </Backdrop>
  );
}
