import { useEffect, useRef, useState } from "react";
import { message } from "../client/hub";
import type { Dialog } from "../client/store";
import { Button } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { ErrorText, Hint } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// One dialog for every name/note/confirm prompt: rename, fork, reset, archive, remove.
export default function PromptDialog({
  dialog,
  open,
  onClose,
  onExited,
}: {
  dialog: Extract<Dialog, { kind: "prompt" }>;
  open: boolean;
  onClose: () => void;
  onExited: () => void;
}) {
  const [value, setValue] = useState(dialog.value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const hasInput = !!dialog.label;
  const close = () => !busy && onClose();

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
    <Modal open={open} onClose={close} onExited={onExited}>
      <form className="grid gap-5" onSubmit={submit}>
        <ModalHeader
          title={dialog.title}
          closeLabel="Close dialog"
          disabled={busy}
          onClose={close}
        />
        {dialog.hint && <Hint>{dialog.hint}</Hint>}
        {hasInput &&
          (dialog.multiline ? (
            <Label>
              <span>
                {dialog.label}{" "}
                {dialog.optional && <span className="text-muted-foreground">(optional)</span>}
              </span>
              <Textarea
                ref={input}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={4}
                placeholder={dialog.placeholder}
                disabled={busy}
                className="rounded-xl text-sm"
              />
            </Label>
          ) : (
            <div className="grid gap-2">
              <span className="text-sm font-medium">
                {dialog.label}{" "}
                {dialog.optional && <span className="text-muted-foreground">(optional)</span>}
              </span>
              <Input
                ref={input}
                value={value}
                onChange={setValue}
                maxLength={100}
                required={!dialog.optional}
                placeholder={dialog.placeholder}
                aria-label={dialog.label}
                disabled={busy}
                classNames={{ input: "text-sm" }}
              />
            </div>
          ))}
        {error && <ErrorText role="alert">{error}</ErrorText>}
        <ModalFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            className={cn(
              dialog.danger && "bg-destructive text-background hover:bg-destructive/90",
            )}
            disabled={busy || (hasInput && !dialog.optional && !value.trim())}
          >
            {busy ? "Working…" : dialog.submit}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
