import { useEffect, useRef, useState } from "react";
import { CornerLeftUp, Folder, FolderOpen, Home } from "lucide-react";
import type { DirListing } from "@sdk/api";
import { deviceClient, message } from "../client/hub";

export default function DirBrowser({
  deviceId,
  cwd,
  onCwd,
}: {
  deviceId: string;
  cwd: string;
  onCwd: (path: string) => void;
}) {
  const [listing, setListing] = useState<DirListing>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Only the latest request may update the view: switching devices mid-load must not show the
  // previous device's listing.
  const seq = useRef(0);

  async function open(path: string, device = deviceId) {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const result = await deviceClient(device).dirs(path);
      if (mine !== seq.current) return undefined;
      setListing(result);
      if (result.path) onCwd(result.path);
      return result;
    } catch (e) {
      if (mine === seq.current) setError(message(e));
      return undefined;
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  useEffect(() => {
    setListing(undefined);
    // Start inside the first root so the list is useful right away.
    void (async () => {
      const roots = await open("", deviceId);
      const first = roots?.dirs[0];
      if (first && !roots.path) await open(first.path, deviceId);
    })();
  }, [deviceId]);

  return (
    <div className="dir-browser">
      <div className="dir-path">
        <input
          value={cwd}
          onChange={(e) => onCwd(e.target.value)}
          aria-label="Working directory"
          required
          placeholder="/path/to/project"
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void open(cwd);
          }}
        />
        <button
          type="button"
          className="secondary small"
          disabled={loading || !cwd}
          onClick={() => open(cwd)}
        >
          Go
        </button>
      </div>
      <div className="dir-list" role="listbox" aria-label="Directories" aria-busy={loading}>
        <button
          type="button"
          className="dir-item"
          title="Start directories"
          onClick={() => open("")}
        >
          <Home size={16} />
          <span>Start dirs</span>
        </button>
        {listing?.parent && (
          <button
            type="button"
            className="dir-item"
            title={listing.parent}
            onClick={() => open(listing.parent!)}
          >
            <CornerLeftUp size={16} />
            <span>..</span>
          </button>
        )}
        {listing?.dirs.map((d) => (
          <button
            key={d.path}
            type="button"
            className="dir-item"
            role="option"
            aria-selected={d.path === cwd}
            title={d.path}
            onClick={() => open(d.path)}
          >
            {d.path === cwd ? <FolderOpen size={16} /> : <Folder size={16} />}
            <span>{d.name}</span>
          </button>
        ))}
        {listing && !listing.dirs.length && <p className="hint">No subdirectories.</p>}
      </div>
      {error && (
        <p className="message-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
