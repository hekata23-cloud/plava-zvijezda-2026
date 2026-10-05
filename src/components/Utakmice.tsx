import { useEffect, useState } from "react";
import { getFixtures, getMatchBundle } from "@/lib/football.functions";
import { SettingsModal } from "./SettingsModal";

type Fixture = {
  id: number;
  time: string;
  league: string;
  home: string;
  away: string;
  homeId?: number;
  awayId?: number;
};

export type Loaded = {
  odds: Record<string, string>;
  corners: { line: number; over: number; under: number } | null;
  izvori?: Record<string, string>;
  upozorenja?: string[];
  bookmaker?: string | null;
};

const dan = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zagreb" });

export function Utakmice({ onLoad }: { onLoad: (d: Loaded, naziv: string) => void }) {
  const [list, setList] = useState<Fixture[]>([]);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  const checkKey = () => {
    const k = localStorage.getItem("kr-football-api-key");
    setHasKey(Boolean(k));
  };

  useEffect(() => {
    checkKey();
    const c = localStorage.getItem(`kr-fix-v3-${dan()}`);
    if (c) {
      const parsed = JSON.parse(c);
      if (parsed.length > 0 && parsed[0].homeId) {
        setList(parsed);
      }
    }
  }, []);

  const getKey = () => localStorage.getItem("kr-football-api-key") || undefined;

  const ucitaj = async (force = false) => {
    const key = `kr-fix-v3-${dan()}`;
    const cached = localStorage.getItem(key);
    if (cached && !force) {
      const parsed = JSON.parse(cached);
      if (parsed.length > 0 && parsed[0].homeId) {
        setList(parsed);
        return setMsg("Učitane već spremljene današnje utakmice (0 novih poziva).");
      }
    }

    setBusy(true);
    setMsg("Dohvaćam današnje utakmice...");
    const r = await getFixtures({ data: { date: dan(), apiKey: getKey() } });
    setBusy(false);

    if (r.error) return setMsg(r.error);
    localStorage.setItem(key, JSON.stringify(r.fixtures));

    // Briše starije verzije cachea
    Object.keys(localStorage)
      .filter((k) => (k.startsWith("kr-fix-") || k.startsWith("kr-form-") || k.startsWith("kr-odds-")) && !k.includes("v3"))
      .forEach((k) => localStorage.removeItem(k));

    setList(r.fixtures);
    setMsg(`Učitano ${r.fixtures.length} utakmica. Preostalo API poziva danas: ${r.remaining}`);
  };

  const otvori = async (f: Fixture) => {
    const naziv = `${f.home} — ${f.away}`;
    // Uvijek svježe kvote i forma (stari cache s pogrešnim kvotama se ne koristi).
    Object.keys(localStorage)
      .filter((k) => k.startsWith("kr-odds-") || k.startsWith("kr-form-"))
      .forEach((k) => localStorage.removeItem(k));

    setBusy(true);
    setMsg(`Učitavam kvote i formu za ${naziv}...`);
    try {
      const r = await getMatchBundle({
        data: { id: f.id, homeId: f.homeId, awayId: f.awayId, apiKey: getKey() },
      });
      if (r.error && !Object.keys(r.odds).length) return setMsg(r.error);
      if (!Object.keys(r.odds).some((k) => !k.startsWith("f"))) {
        return setMsg("⚠️ Za ovu utakmicu API još nema dovoljno kvalitetnih kvota.");
      }
      setMsg("");
      onLoad(
        { odds: r.odds, corners: r.corners, izvori: r.izvori, upozorenja: r.upozorenja, bookmaker: r.bookmaker },
        naziv,
      );
    } catch (err: any) {
      setMsg(`Greška: ${err?.message || "Neuspjelo učitavanje"}`);
    } finally {
      setBusy(false);
    }
  };

  const vidljive = list.filter((f) =>
    `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <section className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-card-foreground">⚽ Utakmice dana ({dan()})</h2>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-input bg-secondary/60 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              ⚙️ {hasKey ? "Ključ unesen" : "Postavi ključ"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => ucitaj(true)}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Učitavam..." : "Učitaj utakmice"}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
        {list.length > 0 && (
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Traži tim ili ligu…"
              className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            <ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-border">
              {vidljive.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => otvori(f)}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="font-bold text-primary">
                      {new Date(f.time).toLocaleTimeString("hr-HR", {
                        timeZone: "Europe/Zagreb",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>{" "}
                    <span className="text-foreground">
                      {f.home} — {f.away}
                    </span>
                    <span className="block text-xs text-muted-foreground">{f.league}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          checkKey();
        }}
      />
    </>
  );
}
