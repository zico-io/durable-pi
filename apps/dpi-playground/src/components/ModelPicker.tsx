import { useState } from "react";
import { useAtomValue } from "jotai";
import { Check, X } from "lucide-react";
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
import { cx } from "../client/cx";
import Backdrop from "./Backdrop";

export default function ModelPicker({ onClose }: { onClose: () => void }) {
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
    <Backdrop onClose={onClose}>
      <section className="modal model-modal">
        <header>
          <div>
            <span className="eyebrow">PER AGENT · {device?.id}</span>
            <h2>Choose a model</h2>
          </div>
          <button className="icon-button" aria-label="Close model picker" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models or tiers…"
          aria-label="Search models"
        />
        <div className="model-list">
          {filtered.map((m) => (
            <button
              key={`${m.provider}/${m.id}`}
              className={cx(isCurrent(m) && "selected")}
              onClick={() => choose(m)}
            >
              <img src={icon(models, m.id)} alt="" />
              <div>
                <strong>{m.name}</strong>
                <small>
                  {m.tier} / {m.provider} / {number(m.contextWindow)} context
                </small>
              </div>
              {isCurrent(m) && <Check size={18} />}
            </button>
          ))}
        </div>
        <p className="hint">Models available on {device?.id}. Provider keys stay on the device.</p>
      </section>
    </Backdrop>
  );
}
