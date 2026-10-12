import { useState } from "react";
import { useAtomValue } from "jotai";
import { Plus, X } from "lucide-react";
import type { NetworkDevice } from "@sdk/api";
import DirBrowser from "./DirBrowser";
import Backdrop from "./Backdrop";
import { deviceClient, message } from "../client/hub";
import { network, notify, select } from "../client/store";

const key = (m: { provider: string; id: string }) => `${m.provider}/${m.id}`;

function defaultModel(d?: NetworkDevice) {
  const fallback = d?.info?.models.find((m) => m.id === d.info?.defaultModel) ?? d?.info?.models[0];
  return fallback ? key(fallback) : "";
}

export default function NewSessionDialog({
  deviceId: initial,
  onClose,
}: {
  deviceId?: string;
  onClose: () => void;
}) {
  const devices = useAtomValue(network.devices).filter((d) => d.status === "online");
  const [deviceId, setDeviceId] = useState(
    () => devices.find((d) => d.id === initial)?.id ?? devices[0]?.id ?? "",
  );
  const device = devices.find((d) => d.id === deviceId);
  const models = device?.info?.models ?? [];
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [model, setModel] = useState(() => defaultModel(device));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // A different device starts over with its default model and its own directories.
  function chooseDevice(id: string) {
    setDeviceId(id);
    setModel(defaultModel(devices.find((d) => d.id === id)));
    setCwd("");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !device) return;
    setPending(true);
    setError("");
    try {
      const chosen = models.find((m) => key(m) === model);
      if (!chosen) throw Error("Choose a model");
      const created = await deviceClient(device.id).createSession({
        name: name.trim() || "New session",
        cwd: cwd.trim(),
        model: { provider: chosen.provider, modelId: chosen.id },
      });
      const root = created.agents.find((a) => a.kind === "root") ?? created.agents[0];
      select({ deviceId: device.id, sessionId: created.id, agentId: root?.id ?? 1 });
      notify(`Session created on ${device.id}.`);
      onClose();
    } catch (err) {
      setError(message(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <form className="modal session-modal" onSubmit={create}>
        <header>
          <div>
            <span className="eyebrow">A PERSISTENT WORKSPACE</span>
            <h2>New session</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close new session"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {!devices.length ? (
          <p className="message-error">
            No device is online. Start one with just backend run or just net up &lt;id&gt;, then try
            again.
          </p>
        ) : (
          <>
            <label>
              Device
              <select
                value={deviceId}
                aria-label="Device"
                onChange={(e) => chooseDevice(e.target.value)}
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id} · {d.info?.hostname ?? d.url}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Session name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="My durable agent"
                maxLength={100}
              />
            </label>
            <div className="field">
              <span>Working directory on {deviceId}</span>
              <DirBrowser deviceId={deviceId} cwd={cwd} onCwd={setCwd} />
            </div>
            <label>
              Model
              <select
                value={model}
                aria-label="New session model"
                onChange={(e) => setModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={key(m)} value={key(m)}>
                    {m.tier} / {m.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {error && (
          <p className="message-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={pending || !model || !cwd || !device}>
            <Plus size={18} />
            {pending ? "Creating…" : "Create session"}
          </button>
        </footer>
      </form>
    </Backdrop>
  );
}
