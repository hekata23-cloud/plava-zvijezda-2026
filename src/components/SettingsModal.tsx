import { useState, useEffect } from "react";
import { testApiKey } from "@/lib/football.functions";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function SettingsModal({ open, onClose, onSaved }: Props) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{
    ok?: boolean;
    msg: string;
    plan?: string;
    used?: number;
    limit?: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      const saved = localStorage.getItem("kr-football-api-key") || "";
      setKey(saved);
      setStatus(null);
    }
  }, [open]);

  if (!open) return null;

  const testiraj = async () => {
    if (!key.trim()) {
      setStatus({ ok: false, msg: "Prvo upiši API ključ." });
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      const res = await testApiKey({ data: { apiKey: key.trim() } });
      if (res.ok) {
        setStatus({
          ok: true,
          msg: `Veza uspješna! Plan: ${res.plan} (${res.active ? "Aktivan" : "Neaktivan"})`,
          plan: res.plan,
          used: res.current,
          limit: res.limit,
        });
      } else {
        setStatus({ ok: false, msg: `Greška: ${res.error}` });
      }
    } catch (e: any) {
      setStatus({ ok: false, msg: `Mrežna greška: ${e.message || "Nepoznato"}` });
    } finally {
      setTesting(false);
    }
  };

  const spremi = () => {
    const k = key.trim();
    if (k) {
      localStorage.setItem("kr-football-api-key", k);
    } else {
      localStorage.removeItem("kr-football-api-key");
    }
    onSaved?.();
    onClose();
  };

  const obrisi = () => {
    localStorage.removeItem("kr-football-api-key");
    setKey("");
    setStatus({ ok: true, msg: "Ključ uklonjen iz memorije." });
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h3 className="text-lg font-bold text-card-foreground">⚙️ Postavke Football API-ja</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              API-Sports / API-Football Ključ
            </label>
            <div className="relative mt-1">
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Unesi svoj API ključ..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground pr-16"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showKey ? "Sakrij" : "Prikaži"}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Besplatan račun i ključ preuzmi na{" "}
              <a href="https://dashboard.api-football.com" target="_blank" rel="noreferrer" className="text-primary underline">
                api-football.com
              </a>{" "}
              (100 besplatnih poziva dnevno).
            </p>
          </div>

          {status && (
            <div
              className={`rounded-lg p-3 text-xs ${
                status.ok ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              <p className="font-semibold">{status.msg}</p>
              {status.limit !== undefined && (
                <p className="mt-1">
                  Iskorišteno danas: <strong>{status.used}</strong> / {status.limit} poziva
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={testiraj}
              disabled={testing}
              className="flex-1 rounded-lg border border-input bg-secondary px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              {testing ? "Testiram..." : "🔍 Testiraj ključ"}
            </button>
            <button
              onClick={spremi}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              💾 Spremi i aktiviraj
            </button>
          </div>

          {key && (
            <button
              onClick={obrisi}
              className="w-full text-center text-xs text-muted-foreground hover:text-destructive"
            >
              Ukloni spremljeni ključ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

