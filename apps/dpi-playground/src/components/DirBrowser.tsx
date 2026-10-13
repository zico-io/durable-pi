import { useEffect, useRef, useState } from "react";
import { CornerLeftUp, Folder, FolderOpen, Home } from "lucide-react";
import type { DirListing } from "@sdk/api";
import { deviceClient, message } from "../client/hub";
import { Button } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import { ErrorText } from "@/components/ui/text";

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
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Input
          value={cwd}
          onChange={onCwd}
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
          className="min-w-0 flex-1"
          classNames={{ input: "font-mono text-[13px]" }}
        />
        <Button
          type="button"
          variant="secondary"
          className="h-11 px-4"
          disabled={loading || !cwd}
          onClick={() => open(cwd)}
        >
          Go
        </Button>
      </div>
      <div
        className="grid max-h-48 gap-0.5 overflow-y-auto rounded-xl border border-border bg-background p-1.5"
        role="listbox"
        aria-label="Directories"
        aria-busy={loading}
      >
        <button
          type="button"
          className={
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-primary/10 aria-selected:text-primary"
          }
          title="Start directories"
          onClick={() => open("")}
        >
          <Home className="size-4 text-muted-foreground" />
          <span className="truncate">Start dirs</span>
        </button>
        {listing?.parent && (
          <button
            type="button"
            className={
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-primary/10 aria-selected:text-primary"
            }
            title={listing.parent}
            onClick={() => open(listing.parent!)}
          >
            <CornerLeftUp className="size-4 text-muted-foreground" />
            <span className="truncate">..</span>
          </button>
        )}
        {listing?.dirs.map((d) => (
          <button
            key={d.path}
            type="button"
            className={
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-primary/10 aria-selected:text-primary"
            }
            role="option"
            aria-selected={d.path === cwd}
            title={d.path}
            onClick={() => open(d.path)}
          >
            {d.path === cwd ? (
              <FolderOpen className="size-4" />
            ) : (
              <Folder className="size-4 text-muted-foreground" />
            )}
            <span className="truncate">{d.name}</span>
          </button>
        ))}
        {listing && !listing.dirs.length && (
          <p className="px-2.5 py-1.5 text-sm text-muted-foreground">No subdirectories.</p>
        )}
      </div>
      {error && <ErrorText role="alert">{error}</ErrorText>}
    </div>
  );
}
