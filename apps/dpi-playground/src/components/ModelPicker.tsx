import { useState } from "react";
import { useAtomValue } from "jotai";
import { Check, Search } from "lucide-react";
import type { ModelInfo } from "@sdk/api";
import {
  agentHandleAtom,
  agentStateAtom,
  attempt,
  deviceAtom,
  icon,
  modelsAtom,
  notify,
  number,
  refreshDetail,
} from "../client/store";
import { store } from "../client/state";
import { Input } from "@/components/motion/input";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Hint } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export default function ModelPicker({
  open,
  onClose,
  onExited,
}: {
  open: boolean;
  onClose: () => void;
  onExited: () => void;
}) {
  const models = useAtomValue(modelsAtom);
  const device = useAtomValue(deviceAtom);
  const current = useAtomValue(agentStateAtom).agent.model;
  const [search, setSearch] = useState("");
  const filtered = models.filter((m) =>
    `${m.name} ${m.id} ${m.tier}`.toLowerCase().includes(search.toLowerCase()),
  );
  const isCurrent = (m: ModelInfo) => m.id === current?.modelId && m.provider === current?.provider;

  async function choose(m: ModelInfo) {
    const done = await attempt(() =>
      store.get(agentHandleAtom)!.configure({ model: { provider: m.provider, modelId: m.id } }),
    );
    if (done) {
      await refreshDetail();
      notify("Model saved. Used on the next turn.");
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} onExited={onExited} className="model-modal max-w-xl">
      <ModalHeader
        eyebrow={`Per agent · ${device?.id ?? ""}`}
        title="Choose a model"
        closeLabel="Close model picker"
        onClose={onClose}
      />
      <Input
        value={search}
        onChange={setSearch}
        placeholder="Search models or tiers…"
        aria-label="Search models"
        leftIcon={<Search />}
        classNames={{ input: "text-sm" }}
      />
      <div className="model-list -mx-2 grid max-h-[50dvh] gap-1 overflow-y-auto px-2">
        {filtered.map((m) => (
          <button
            key={`${m.provider}/${m.id}`}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
              isCurrent(m) && "selected border-primary/30 bg-primary/10",
            )}
            onClick={() => choose(m)}
          >
            <img src={icon(models, m.id)} alt="" className="size-9 rounded-lg bg-white p-1.5" />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <strong className="truncate text-sm font-semibold">{m.name}</strong>
              <small className="truncate text-xs text-muted-foreground">
                {m.tier} / {m.provider} / {number(m.contextWindow)} context
              </small>
            </div>
            {isCurrent(m) && <Check className="size-4 text-primary" />}
          </button>
        ))}
        {!filtered.length && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No models match.</p>
        )}
      </div>
      <Hint>Models available on {device?.id}. Provider keys stay on the device.</Hint>
    </Modal>
  );
}
