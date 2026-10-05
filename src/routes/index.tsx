import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Utakmice, type Loaded } from "@/components/Utakmice";
import {
  analiziraj,
  detektorZamke,
  izracunajValueBet,
  pokrivenost,
  primijeniRadar,
  type IndikatorId,
} from "@/lib/radar-analitika";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kvote Radar — Kalkulator 6 Indikatora" },
      {
        name: "description",
        content:
          "Brzi kalkulator za 6 elitnih protokola analize kvota: BTTS, Over 1.5, Over 2.5, zona otpora na kornerima, Under 3.5 lockdown i željezna disciplina.",
      },
      { property: "og:title", content: "Kvote Radar — Kalkulator 6 Indikatora" },
      {
        property: "og:description",
        content:
          "Dekodiraj logiku platformi u 5 sekundi: unesi kvote, pritisni Izračunaj i dobij signal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Result = { ok: boolean; warn?: boolean; title: string; detail: string; extra?: string | undefined } | null;

const INVALID = "Kvota mora biti broj od 1.01 naviše.";

function parseOdd(v: string): number | null {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 1.01 ? n : null;
}
const p = (k: number) => 1 / k;
const f2 = (n: number) => n.toFixed(2);

const PROTOKOLI = [
  { id: "1", naziv: "BTTS" },
  { id: "2", naziv: "Over 1.5" },
  { id: "3", naziv: "Over 2.5" },
  { id: "4", naziv: "Korneri" },
  { id: "5", naziv: "Under 3.5" },
];

function OddInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "npr. 8.50"}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-lg font-semibold tabular-nums text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/50 focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
    </label>
  );
}

function ResultBox({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <div
      className={`mt-4 rounded-xl border p-4 ${
        result.warn
          ? "border-primary/60 bg-primary/10"
          : result.ok
          ? "glow-success border-success/50 bg-success/10"
          : "glow-destructive border-destructive/50 bg-destructive/10"
      }`}
    >
      <p className={`text-base font-bold ${result.warn ? "text-primary" : result.ok ? "text-success" : "text-destructive"}`}>
        {result.warn ? "⚠️ " : result.ok ? "✅ " : "⛔ "}
        {result.title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{result.detail}</p>
      {result.extra && (
        <p className="mt-2 whitespace-pre-line rounded-lg bg-secondary/60 px-3 py-2 text-sm text-foreground">
          {result.extra}
        </p>
      )}
    </div>
  );
}

function Card({
  broj,
  naslov,
  opis,
  pravilo,
  children,
  onCalc,
  result,
  istaknuto,
}: {
  broj: string;
  naslov: string;
  opis: string;
  pravilo: string;
  children?: ReactNode;
  onCalc?: () => void;
  result?: Result;
  istaknuto?: boolean;
}) {
  return (
    <section
      className={`relative rounded-2xl border bg-card p-5 transition-shadow sm:p-6 ${
        istaknuto
          ? "border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/30"
          : "border-border shadow-sm hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-base font-black text-primary">
          {broj}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">{naslov}</h2>
            {istaknuto && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-bold text-primary">
                MOJ IZBOR
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{opis}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-muted/40 p-3.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pravilo protokola</p>
        <p className="mt-1 font-mono text-xs text-foreground/90">{pravilo}</p>
      </div>

      <div className="mt-4 flex flex-col gap-4">{children}</div>

      {onCalc && (
        <button
          onClick={onCalc}
          className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-base font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.99] hover:opacity-95"
        >
          ⚡ Izračunaj
        </button>
      )}

      <ResultBox result={result ?? null} />
    </section>
  );
}

const SVI_REZ = [
  "0:0", "1:0", "0:1", "1:1", "2:0", "0:2", "2:1", "1:2", "2:2",
  "3:0", "0:3", "3:1", "1:3", "3:2", "2:3", "3:3",
  "4:0", "0:4", "4:1", "1:4", "4:2", "2:4",
];
const NISKI = ["0:0", "1:0", "0:1", "1:1", "2:0", "0:2"];

function KvalitetaPanel({ info }: { info: Loaded["info"] }) {
  const { izvori, nedostaje, upozorenja } = info;
  const nemaNista = !Object.keys(izvori).length && !nedostaje.length && !upozorenja.length;
  if (nemaNista) return null;

  return (
    <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm sm:p-5">
      <div className="flex items-center gap-2 font-bold text-primary">
        <span>🧠 Kvaliteta podataka iz API-ja</span>
      </div>

      {Object.keys(izvori).length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <strong className="text-foreground">Izvori:</strong>{" "}
          {Object.entries(izvori)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </p>
      )}

      {nedostaje.length > 0 && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {nedostaje.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                n.nedostaje.length
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-success/40 bg-success/10 text-success"
              }`}
            >
              <span>{n.nedostaje.length ? "⛔" : "✅"}</span>
              <div>
                <strong className="font-semibold">{n.naziv}</strong>
                {n.nedostaje.length > 0 && (
                  <p className="text-muted-foreground">nedostaje: {n.nedostaje.join(", ")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {upozorenja.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {upozorenja.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Index() {
  const [mojProtokol, setMojProtokol] = useState<string>("1");
  const [odds, setOdds] = useState<Record<string, string>>({});
  const [kL, setKL] = useState("");
  const [kO, setKO] = useState("");
  const [kU, setKU] = useState("");
  const [rez5, setRez5] = useState("1:0");
  const [idx5, setIdx5] = useState("");
  const [k00, setK00] = useState("");
  const [kPen, setKPen] = useState("");
  const [utakmica, setUtakmica] = useState<string | null>(null);
  const [info, setInfo] = useState<Loaded["info"] | null>(null);

  const [r1, setR1] = useState<Result>(null);
  const [r2, setR2] = useState<Result>(null);
  const [r3, setR3] = useState<Result>(null);
  const [r4, setR4] = useState<Result>(null);
  const [r5, setR5] = useState<Result>(null);
  const [r7, setR7] = useState<Result>(null);

  useEffect(() => {
    try {
      const sp = localStorage.getItem("kr-moj-protokol");
      if (sp) setMojProtokol(sp);
    } catch {
      // ignore
    }
  }, []);

  const o = (k: string) => odds[k] ?? "";
  const setO = (k: string) => (v: string) => setOdds((prev) => ({ ...prev, [k]: v }));
  const num = (k: string) => parseOdd(o(k));

  const ucitajUtakmicu = (l: Loaded) => {
    setOdds(l.odds);
    if (l.corners) {
      setKL(String(l.corners.line));
      setKO(String(l.corners.over));
      setKU(String(l.corners.under));
    } else {
      setKL(""); setKO(""); setKU("");
    }
    setK00(l.odds["0:0"] ?? "");
    setKPen(l.odds["pen"] ?? "");
    setUtakmica(l.match);
    setInfo(l.info);

    let minR = "1:0", minV = Infinity;
    for (const [k, v] of Object.entries(l.odds)) {
      if (!k.includes(":")) continue;
      const n = parseOdd(v);
      if (n !== null && n < minV) { minV = n; minR = k; }
    }
    if (Number.isFinite(minV)) { setRez5(minR); setIdx5(String(minV)); }

    setR1(null); setR2(null); setR3(null); setR4(null); setR5(null); setR7(null);
  };

  const ocistiSve = () => {
    setOdds({});
    setKL(""); setKO(""); setKU("");
    setRez5("1:0"); setIdx5("");
    setK00(""); setKPen("");
    setUtakmica(null); setInfo(null);
    setR1(null); setR2(null); setR3(null); setR4(null); setR5(null); setR7(null);
  };

  const FORMA: Record<string, { a: string; b: string; ok: (a: number, b: number) => boolean; txt: string }> = {
    "1": { a: "Domaćin: BTTS u zadnjih 5", b: "Gost: BTTS u zadnjih 5", ok: (a, b) => a >= 3 && b >= 3, txt: "oba tima ≥ 3/5 BTTS" },
    "2": { a: "Domaćin: 2+ gola u zadnjih 5", b: "Gost: 2+ gola u zadnjih 5", ok: (a, b) => a + b >= 7, txt: "zbroj ≥ 7/10 utakmica s 2+ gola" },
    "3": { a: "Domaćin: 3+ gola u zadnjih 5", b: "Gost: 3+ gola u zadnjih 5", ok: (a, b) => a + b >= 6, txt: "zbroj ≥ 6/10 utakmica s 3+ gola" },
    "4": { a: "Prosjek kornera domaćin", b: "Prosjek kornera gost", ok: () => true, txt: "" },
    "5": { a: "Domaćin: ≤3 gola u zadnjih 5", b: "Gost: ≤3 gola u zadnjih 5", ok: (a, b) => a + b >= 8, txt: "zbroj ≥ 8/10 utakmica s ≤ 3 gola" },
    "7": { a: "Penali domaćin (zadnjih 5)", b: "Penali gost (zadnjih 5)", ok: (a, b) => a + b <= 1, txt: "ukupno ≤ 1 penal u 10 utakmica" },
  };

  const forma = (r: Result, id: string): Result => {
    if (!r || r.title === "Neispravan unos") return r;
    const a = parseFloat(o(`f${id}a`).replace(",", ".")), b = parseFloat(o(`f${id}b`).replace(",", "."));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return r;
    let t: string; let pad = false;
    if (id === "4") {
      const L = parseFloat(kL.replace(",", ".")); const zb = a + b;
      const under = r.title.includes("Manje");
      pad = Number.isFinite(L) && (under ? zb > L + 1 : zb < L - 1);
      t = pad ? `📊 FORMA PROTIV: prosjek ${f2(zb)} kornera ne podržava tip.` : `📊 FORMA POTVRĐUJE: prosjek ${f2(zb)} kornera.`;
    } else {
      const F = FORMA[id]!; pad = !F.ok(a, b);
      t = pad ? `📊 FORMA PROTIV (${F.txt} nije ispunjeno).` : `📊 FORMA POTVRĐUJE (${F.txt}).`;
    }
    const nr = { ...r, extra: r.extra ? `${r.extra}\n${t}` : t };
    if (pad && r.ok && !r.warn) nr.warn = true;
    return nr;
  };

  const ulaz = () => {
    const L = parseFloat(kL.replace(",", ".")), ov = parseOdd(kO), un = parseOdd(kU);
    return {
      odds: { ...odds, "0:0": k00 || o("0:0"), pen: kPen || o("pen") },
      corners: Number.isFinite(L) && ov !== null && un !== null ? { line: L, over: ov, under: un } : null,
    };
  };

  const radar = (r: Result, id: IndikatorId): Result => {
    const u = ulaz();
    const rad = analiziraj(id, u);
    const zam = detektorZamke(id, u);
    const val = izracunajValueBet(id, u, zam);
    return primijeniRadar(r, rad, zam, val);
  };

  const sR1 = (r: Result) => setR1(radar(forma(r, "1"), "1"));
  const sR2 = (r: Result) => setR2(radar(forma(r, "2"), "2"));
  const sR3 = (r: Result) => setR3(radar(forma(r, "3"), "3"));
  const sR4 = (r: Result) => setR4(radar(forma(r, "4"), "4"));
  const sR5 = (r: Result) => setR5(radar(forma(r, "5"), "5"));
  const sR7 = (r: Result) => setR7(radar(forma(r, "7"), "7"));

  const calc1 = () => {
    const k22 = num("2:2"), k11 = num("1:1"), k10 = num("1:0"), k01 = num("0:1");
    if ([k22, k11, k10, k01].some((v) => v === null))
      return sR1({ ok: false, title: "Neispravan unos", detail: "Upiši 2:2, 1:1, 1:0 i 0:1. " + INVALID });
    const m = Math.min(k10!, k01!);
    const pregled = `2:2 = ${k22} · 1:1 = ${k11} · min(1:0, 0:1) = ${m}`;
    if (k22! <= 13 && k11! <= 8 && m >= 7)
      return sR1({ ok: true, title: "PROLAZI — BTTS (oba tima zabijaju)", detail: "2:2 ≤ 13.00, 1:1 ≤ 8.00 i min(1:0, 0:1) ≥ 7.00.", extra: pregled });
    if (k22! <= 13.5 && k11! <= 8.5 && m >= 6.5)
      return sR1({ ok: true, warn: true, title: "GRANIČNO — BTTS", detail: "Uvjeti su unutar tolerancije (2:2 ≤ 13.50, 1:1 ≤ 8.50, min ≥ 6.50).", extra: pregled });
    sR1({ ok: false, title: "NE PROLAZI — BTTS", detail: "Barem jedan uvjet točnog rezultata je izvan tolerancije.", extra: pregled });
  };

  const over15 = () => {
    const v = ["1:0", "0:0", "0:1"].map((k) => [k, num(k)] as const);
    if (v.some(([, x]) => x === null)) return null;
    const A = v.filter(([, x]) => x! >= 10).length;
    const B = v.filter(([, x]) => x! >= 9.5 && x! < 10).length;
    const S = v.reduce((s, [, x]) => s + p(x!), 0);
    const pregled = v.map(([k, x]) => `${k} (${x}) ${x! >= 10 ? "✓" : x! >= 9.5 ? "~" : "✗"}`).join(" · ") + ` · S = ${f2(S)}`;
    const status = A >= 2 && S <= 0.3 ? "p" : A + B >= 2 || (A >= 2 && S <= 0.33) ? "g" : "n";
    return { A, B, S, pregled, status };
  };

  const calc2 = () => {
    const r = over15();
    if (!r) return sR2({ ok: false, title: "Neispravan unos", detail: "Upiši sve tri kvote (1:0, 0:0, 0:1). " + INVALID });
    if (r.status === "p")
      return sR2({ ok: true, title: `PROLAZI — Over 1.5 golova (${r.A}/3)`, detail: `Barem 2 indeksa ≥ 10.00 i zbroj vjerojatnosti S = ${f2(r.S)} ≤ 0.30.`, extra: r.pregled });
    if (r.status === "g")
      return sR2({ ok: true, warn: true, title: "GRANIČNO — Over 1.5 golova", detail: `A = ${r.A}, B = ${r.B}, S = ${f2(r.S)}. Unutar tolerancije.`, extra: r.pregled });
    sR2({ ok: false, title: "NE PROLAZI — Over 1.5", detail: `A = ${r.A}, S = ${f2(r.S)}. Algoritam očekuje zatvorenu utakmicu.`, extra: r.pregled });
  };

  const calc3 = () => {
    const vals = [...NISKI, "2:2"].map((k) => [k, num(k)] as const);
    if (vals.some(([, x]) => x === null))
      return sR3({ ok: false, title: "Neispravan unos", detail: "Upiši svih 7 kvota (0:0, 1:0, 0:1, 1:1, 2:0, 0:2, 2:2). " + INVALID });
    const S2 = vals.slice(0, 6).reduce((s, [, x]) => s + p(x!), 0);
    const k22 = vals[6]![1]!;
    const pregled = `S2 = ${f2(S2)} · 2:2 = ${k22}`;
    if (S2 <= 0.45 && k22 <= 12)
      return sR3({ ok: true, title: "PROLAZI — Over 2.5 golova", detail: "S2 ≤ 0.45 i 2:2 ≤ 12.00.", extra: pregled });
    if (S2 <= 0.5 && k22 <= 13)
      return sR3({ ok: true, warn: true, title: "GRANIČNO — Over 2.5 golova", detail: "S2 ≤ 0.50 i 2:2 ≤ 13.00.", extra: pregled });
    const r = over15();
    sR3({
      ok: false,
      title: "NE PROLAZI — Over 2.5",
      detail: pregled,
      extra: r?.status === "p" ? "➕ Pravilo 2 prolazi — alternativa: Over 1.5 golova." : undefined,
    });
  };

  const calc4 = () => {
    const L = parseFloat(kL.replace(",", "."));
    const ov = parseOdd(kO), un = parseOdd(kU);
    if (!Number.isFinite(L) || L <= 0 || ov === null || un === null)
      return sR4({ ok: false, title: "Neispravan unos", detail: "Upiši liniju, kvotu za više i kvotu za manje. " + INVALID });
    const d = Math.abs(ov - un);
    const upoz = "⚠️ Kvota na pomaknutoj liniji bit će znatno niža, provjeri je prije opklade.";
    if (d > 0.15)
      return sR4({ ok: false, title: "NE PROLAZI — nije zona otpora", detail: `Razlika d = ${f2(d)} (> 0.15). Potraži simetričniju liniju.` });
    if (ov === un)
      return sR4({ ok: false, warn: true, title: "Nema smjera", detail: `Kvote su jednake (${ov}). Ne predlažem liniju.` });
    const warn = d > 0.1;
    const status = warn ? "GRANIČNO" : "PROLAZI";
    const prijedlog = un < ov ? `Manje od ${L + 2} ili ${L + 3} kornera` : `Više od ${L - 2} ili ${L - 3} kornera`;
    sR4({
      ok: true,
      warn,
      title: `${status} — ${prijedlog}`,
      detail: `d = ${f2(d)} (${warn ? "0.10–0.15" : "≤ 0.10"}). Niža kvota je na ${un < ov ? "MANJE" : "VIŠE"}.`,
      extra: upoz,
    });
  };

  const calc5 = () => {
    const v = parseOdd(idx5);
    if (v === null) return sR5({ ok: false, title: "Neispravan unos", detail: INVALID });
    const G = rez5.split(":").reduce((s, x) => s + Number(x), 0);
    if (G >= 4)
      return sR5({ ok: false, title: "NE PROLAZI — Under 3.5", detail: `Najniži indeks je ${rez5} (${G} golova). Algoritam očekuje puno golova.` });
    const extra = v <= 5 && NISKI.includes(rez5) ? "➕ Dodatno: i Under 2.5 golova je stabilan." : undefined;
    if (v <= 6)
      return sR5({ ok: true, title: "PROLAZI — Under 3.5 golova", detail: `Najniži indeks ${rez5} = ${v} (≤ 6.00).`, extra });
    if (v <= 6.3)
      return sR5({ ok: true, warn: true, title: "GRANIČNO — Under 3.5 golova", detail: `Najniži indeks ${rez5} = ${v} (6.00–6.30).`, extra });
    sR5({ ok: false, title: "NE PROLAZI — Under 3.5", detail: `Najniži indeks ${rez5} = ${v}, iznad 6.30.` });
  };

  const calc7 = () => {
    const z = parseOdd(k00), pen = parseOdd(kPen);
    if (z === null || pen === null)
      return sR7({ ok: false, title: "Neispravan unos", detail: "Upiši kvotu za 0:0 i kvotu za Kazneni udarac — NE. " + INVALID });
    const pregled = `0:0 = ${z} · Kazneni udarac NE = ${pen}`;
    if (z! > 7.5)
      return sR7({ ok: false, title: "NE PROLAZI — preskoči utakmicu", detail: `Indeks 0:0 je ${z} (> 7.50). Tržište je previše nestabilno.`, extra: pregled });
    const penOk = pen! >= 1.2 && pen! <= 1.5;
    const penWarn = pen! >= 1.15 && pen! < 1.2;
    if (z! <= 7 && penOk)
      return sR7({ ok: true, title: "PROLAZI — Kazneni udarac: NE", detail: `0:0 = ${z} (≤ 7.00) i kvota NE = ${pen} (1.20–1.50).`, extra: pregled });
    if (z! <= 7.5 && (penOk || penWarn))
      return sR7({ ok: true, warn: true, title: "GRANIČNO — Kazneni udarac: NE", detail: `0:0 = ${z}, NE = ${pen}. Unutar tolerancije.`, extra: pregled });
    sR7({ ok: false, title: "NE PROLAZI — Kazneni udarac", detail: `Kvota NE = ${pen} je izvan raspona (ispod 1.15 ili iznad 1.50).`, extra: pregled });
  };

  const moj = PROTOKOLI.find((p) => p.id === mojProtokol);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-16 pt-8">
      <header className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <img src="/icon-192.png" alt="Kvote Radar logo" width={56} height={56} className="rounded-xl" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          Kvote <span className="text-primary">Radar</span>
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          6 elitnih protokola za dekodiranje logike platformi. Upiši kvote, pritisni{" "}
          <strong className="text-foreground">Izračunaj</strong> i u 5 sekundi znaš je li opcija statistički valjana.
        </p>
      </header>

      <Utakmice onLoad={ucitajUtakmicu} />
      {utakmica && <p className="mb-4 text-center text-sm font-bold text-primary">Učitano: {utakmica}</p>}
      {info && <KvalitetaPanel info={info} />}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Moj protokol:{" "}
          <strong className="text-primary">{moj ? `${moj.id}. ${moj.naziv}` : "nije odabran"}</strong>
        </p>
        <button
          onClick={ocistiSve}
          className="rounded-lg border border-input px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-secondary"
        >
          🧹 Očisti sve
        </button>
      </div>

      <div className="flex flex-col gap-6">
        <Card
          broj="1"
          naslov="Oba tima daju gol — BTTS"
          opis="Termometar otvorene utakmice."
          pravilo="PROLAZI: 2:2 ≤ 13.00 i 1:1 ≤ 8.00 i min(1:0, 0:1) ≥ 7.00. GRANIČNO: 13.50 / 8.50 / 6.50."
          onCalc={calc1}
          result={r1}
          istaknuto={mojProtokol === "1"}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {["2:2", "1:1", "1:0", "0:1"].map((k) => (
              <OddInput key={k} label={k} value={o(k)} onChange={setO(k)} placeholder="—" />
            ))}
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              ⚖️ Dvostrano tržište BTTS:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="BTTS DA" value={o("bttsDa")} onChange={setO("bttsDa")} placeholder="npr. 1.75" />
              <OddInput label="BTTS NE" value={o("bttsNe")} onChange={setO("bttsNe")} placeholder="npr. 2.05" />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Forma (broj utakmica s BTTS u zadnjih 5):</p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="Domaćin (0–5)" value={o("f1a")} onChange={setO("f1a")} placeholder="npr. 4" />
              <OddInput label="Gost (0–5)" value={o("f1b")} onChange={setO("f1b")} placeholder="npr. 3" />
            </div>
          </div>
        </Card>

        <Card
          broj="2"
          naslov="Over 1.5 golova"
          opis="Sigurnosni filter — eliminacija 0:0 i 1:0 zamki."
          pravilo="PROLAZI: barem 2 od 3 indeksa (1:0, 0:0, 0:1) ≥ 10.00 i zbroj vjerojatnosti S ≤ 0.30. GRANIČNO: tolerancija do 9.50 / S ≤ 0.33."
          onCalc={calc2}
          result={r2}
          istaknuto={mojProtokol === "2"}
        >
          <div className="grid grid-cols-3 gap-3">
            {["1:0", "0:0", "0:1"].map((k) => (
              <OddInput key={k} label={k} value={o(k)} onChange={setO(k)} placeholder="—" />
            ))}
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              ⚖️ Dvostrano tržište Over/Under 1.5:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="Više 1.5" value={o("o15")} onChange={setO("o15")} placeholder="npr. 1.30" />
              <OddInput label="Manje 1.5" value={o("u15")} onChange={setO("u15")} placeholder="npr. 3.40" />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Forma (broj utakmica s 2+ gola u zadnjih 5):</p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="Domaćin (0–5)" value={o("f2a")} onChange={setO("f2a")} placeholder="npr. 4" />
              <OddInput label="Gost (0–5)" value={o("f2b")} onChange={setO("f2b")} placeholder="npr. 4" />
            </div>
          </div>
        </Card>

        <Card
          broj="3"
          naslov="Over 2.5 golova"
          opis="Suma vjerojatnosti svih rezultata s ≤ 2 gola (S2) mora biti niska."
          pravilo="PROLAZI: S2 ≤ 0.45 i 2:2 ≤ 12.00. GRANIČNO: S2 ≤ 0.50 i 2:2 ≤ 13.00."
          onCalc={calc3}
          result={r3}
          istaknuto={mojProtokol === "3"}
        >
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {["0:0", "1:0", "0:1", "1:1", "2:0", "0:2", "2:2"].map((k) => (
              <OddInput key={k} label={k} value={o(k)} onChange={setO(k)} placeholder="—" />
            ))}
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              ⚖️ Dvostrano tržište Over/Under 2.5:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="Više 2.5" value={o("o25")} onChange={setO("o25")} placeholder="npr. 1.85" />
              <OddInput label="Manje 2.5" value={o("u25")} onChange={setO("u25")} placeholder="npr. 1.95" />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Forma (broj utakmica s 3+ gola u zadnjih 5):</p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="Domaćin (0–5)" value={o("f3a")} onChange={setO("f3a")} placeholder="npr. 3" />
              <OddInput label="Gost (0–5)" value={o("f3b")} onChange={setO("f3b")} placeholder="npr. 3" />
            </div>
          </div>
        </Card>

        <Card
          broj="4"
          naslov="Korneri — Zona otpora"
          opis="Simetrija linije kornera. Manja razlika kvota označava uravnoteženo tržište."
          pravilo="d = |više − manje|. PROLAZI: d ≤ 0.10. GRANIČNO: 0.10–0.15. Manje niže → Manje od L+2/L+3; Više niže → Više od L−2/L−3."
          onCalc={calc4}
          result={r4}
          istaknuto={mojProtokol === "4"}
        >
          <div className="grid grid-cols-3 gap-3">
            <OddInput label="Linija" value={kL} onChange={setKL} placeholder="npr. 9.5" />
            <OddInput label="Više" value={kO} onChange={setKO} placeholder="npr. 1.85" />
            <OddInput label="Manje" value={kU} onChange={setKU} placeholder="npr. 1.95" />
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Forma (prosjek izvedenih kornera u zadnjih 5):</p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="Prosjek domaćin" value={o("f4a")} onChange={setO("f4a")} placeholder="npr. 5.4" />
              <OddInput label="Prosjek gost" value={o("f4b")} onChange={setO("f4b")} placeholder="npr. 4.2" />
            </div>
          </div>
        </Card>

        <Card
          broj="5"
          naslov="Manje od 3.5 gola — Lockdown"
          opis="Odaberi točan rezultat s najnižom kvotom na tržištu."
          pravilo="Rezultat s 4+ gola = NE PROLAZI. PROLAZI: indeks ≤ 6.00. GRANIČNO: ≤ 6.30."
          onCalc={calc5}
          result={r5}
          istaknuto={mojProtokol === "5"}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Najniži rezultat
              </span>
              <select
                value={rez5}
                onChange={(e) => setRez5(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-lg font-semibold text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                {SVI_REZ.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <OddInput label="Indeks (kvota)" value={idx5} onChange={setIdx5} placeholder="npr. 5.50" />
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              ⚖️ Dvostrano tržište Under/Over 3.5:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="Manje 3.5" value={o("u35")} onChange={setO("u35")} placeholder="npr. 1.35" />
              <OddInput label="Više 3.5" value={o("o35")} onChange={setO("o35")} placeholder="npr. 3.10" />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Forma (broj utakmica s ≤ 3 gola u zadnjih 5):</p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="Domaćin (0–5)" value={o("f5a")} onChange={setO("f5a")} placeholder="npr. 4" />
              <OddInput label="Gost (0–5)" value={o("f5b")} onChange={setO("f5b")} placeholder="npr. 4" />
            </div>
          </div>
        </Card>

        <Card
          broj="7"
          naslov="Kazneni udarac — NE"
          opis="Filter 0:0 iz točnog rezultata odlučuje je li utakmica zatvorena za penal: NE."
          pravilo="PROLAZI: 0:0 ≤ 7.00 (idealno 4–6) i kvota NE 1.20–1.50. GRANIČNO: 0:0 ≤ 7.50 ili NE 1.15–1.20. 0:0 > 7.50 = preskoči."
          onCalc={calc7}
          result={r7}
        >
          <div className="grid grid-cols-2 gap-3">
            <OddInput label="0:0 indeks" value={k00} onChange={setK00} placeholder="npr. 6.50" />
            <OddInput label="Kazneni udarac NE" value={kPen} onChange={setKPen} placeholder="npr. 1.35" />
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Forma (broj dosuđenih penala u zadnjih 5):</p>
            <div className="grid grid-cols-2 gap-3">
              <OddInput label="Domaćin (0–5)" value={o("f7a")} onChange={setO("f7a")} placeholder="npr. 0" />
              <OddInput label="Gost (0–5)" value={o("f7b")} onChange={setO("f7b")} placeholder="npr. 1" />
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}

