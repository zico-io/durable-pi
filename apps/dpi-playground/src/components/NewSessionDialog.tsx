import { useState } from "react";
import { useAtomValue } from "jotai";
import { Plus } from "lucide-react";
import type { NetworkDevice } from "@sdk/api";
import DirBrowser from "./DirBrowser";
import { deviceClient, message } from "../client/hub";
import { network, notify, select } from "../client/store";
import { Button } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { Modal, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { ErrorText } from "@/components/ui/text";

const key = (m: { provider: string; id: string }) => `${m.provider}/${m.id}`;

function defaultModel(d?: NetworkDevice) {
  const fallback = d?.info?.models.find((m) => m.id === d.info?.defaultModel) ?? d?.info?.models[0];
  return fallback ? key(fallback) : "";
}

export default function NewSessionDialog({
  deviceId: initial,
  open,
  onClose,
  onExited,
}: {
  deviceId?: string;
  open: boolean;
  onClose: () => void;
  onExited: () => void;
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
    <Modal open={open} onClose={onClose} onExited={onExited} className="max-w-xl">
      <form className="grid gap-5" onSubmit={create}>
        <ModalHeader
          eyebrow="A persistent workspace"
          title="New session"
          closeLabel="Close new session"
          onClose={onClose}
        />
        {!devices.length ? (
          <ErrorText>
            No device is online. Start one with just backend run or just net up &lt;id&gt;, then try
            again.
          </ErrorText>
        ) : (
          <>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Device</span>
              <Select value={deviceId} onValueChange={chooseDevice}>
                <SelectTrigger aria-label="Device" className="h-11 rounded-full px-4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {`${d.id} · ${d.info?.hostname ?? d.url}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Session name"
              value={name}
              onChange={setName}
              autoFocus
              placeholder="My durable agent"
              maxLength={100}
              classNames={{ label: "px-0", input: "text-sm" }}
            />
            <div className="grid gap-2">
              <span className="text-sm font-medium">Working directory on {deviceId}</span>
              <DirBrowser deviceId={deviceId} cwd={cwd} onCwd={setCwd} />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Model</span>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger aria-label="New session model" className="h-11 rounded-full px-4">
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={key(m)} value={key(m)}>
                      {`${m.tier} / ${m.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {error && <ErrorText role="alert">{error}</ErrorText>}
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="font-semibold"
            disabled={pending || !model || !cwd || !device}
          >
            <Plus className="size-4" />
            {pending ? "Creating…" : "Create session"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
