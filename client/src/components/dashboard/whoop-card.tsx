import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { connectWhoop, disconnectWhoop, getWhoopStatus, syncWhoop, type WhoopStatus } from "@/lib/whoop";

export const WHOOP_CHANGED_EVENT = "spar-whoop-changed";

/** Settings → Health: connect, sync or disconnect the athlete's own WHOOP. */
export function WhoopCard({ onSynced }: { onSynced?: () => void }) {
  const [status, setStatus] = useState<WhoopStatus | "unavailable" | null>(null);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => setStatus(await getWhoopStatus()), []);
  useEffect(() => {
    void load();
    const again = () => void load();
    window.addEventListener(WHOOP_CHANGED_EVENT, again);
    return () => window.removeEventListener(WHOOP_CHANGED_EVENT, again);
  }, [load]);

  const run = async (kind: "connect" | "sync" | "disconnect", fn: () => Promise<string | null>) => {
    setBusy(kind);
    setError(null);
    const err = await fn();
    setBusy(null);
    setConfirmDisconnect(false);
    if (err) setError(err);
    if (kind !== "connect") {
      await load();
      onSynced?.();
    }
  };

  if (status === "unavailable") return null; // database update not run yet

  const connected = status?.connected === true;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-foreground" />
        <span className="text-xs font-semibold">WHOOP</span>
        {connected && <span className="text-xs text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded-full font-medium">Connected</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {connected
          ? "Your WHOOP recovery, HRV, resting heart rate, sleep and strain sync into SPAR each day."
          : "Connect your WHOOP to bring its recovery, HRV, sleep and strain into your daily readiness. Read-only — SPAR never changes your WHOOP."}
      </p>

      {connected ? (
        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            {status?.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}` : "Not synced yet"}
          </p>
          {status?.lastError && <p className="text-xs text-destructive">Last sync had a problem. Try Sync now.</p>}
          {confirmDisconnect ? (
            <div role="alertdialog" aria-label="Confirm disconnect" className="space-y-2 text-xs">
              <p>Disconnect WHOOP? SPAR deletes your WHOOP sign-in and the WHOOP data it saved.</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void run("disconnect", disconnectWhoop)}
                  className="h-11 flex-1 rounded-lg bg-red-600 text-sm font-bold text-white disabled:opacity-60">
                  {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
                </button>
                <button type="button" onClick={() => setConfirmDisconnect(false)} className="h-11 rounded-lg border border-muted px-4 text-sm font-bold">
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" disabled={busy !== null} onClick={() => void run("sync", syncWhoop)}
                className="h-11 flex-1 rounded-lg border border-muted text-sm font-bold disabled:opacity-60">
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => setConfirmDisconnect(true)}
                className="h-11 rounded-lg px-3 text-sm font-bold text-destructive disabled:opacity-60">
                Disconnect
              </button>
            </div>
          )}
        </div>
      ) : (
        <button type="button" disabled={busy !== null || status === null} onClick={() => void run("connect", connectWhoop)}
          className={cn("h-11 w-full rounded-lg bg-foreground text-sm font-bold text-background disabled:opacity-60")}>
          {busy === "connect" ? "Opening WHOOP…" : "Connect WHOOP"}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
