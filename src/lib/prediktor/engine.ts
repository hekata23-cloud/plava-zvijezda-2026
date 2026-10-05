// Plava Zvijezda 2026 — matematički motor prediktora (Poisson model).
// Preneseno iz "Golden Tip" aplikacije i ispravljeno (vidi ISPRAVCI.md).
import { t, type Lang, type Settings, EVENT_BASE, STAT_BASE } from "./data";

export type Inp = Record<string, string>;
export type Stat = { value: string; label: string; variant?: "gold" | "green" | "red" };
export type ConfLevel = "safe" | "vly" | "ly" | "ry" | "hrk";
export type Conf = { level: ConfLevel; text: string; cls: string };
export type Val = {
  fair: number;
  odds: number;
  value: number;
  isV: boolean;
  trap: boolean;
  stake: number | null;
};
export type Res = {
  tip: string;
  /** vjerojatnost preporučenog ishoda, 0..1 */
  prob: number;
  conf: Conf;
  stats: Stat[];
  val?: Val | null;
  /** kvota preporučenog ishoda (ako ju je korisnik unio) */
  odds?: number;
  notes?: string[];
  lambda?: { h: number; a: number };
};

// ───────────────────────── osnovne funkcije ─────────────────────────

/** Vrijednost polja kao broj; prazno/neispravno → undefined. */
export function n(i: Inp, k: string): number | undefined {
  const raw = i[k];
  if (raw === undefined || raw === null || String(raw).trim() === "") return undefined;
  const v = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
}
const nd = (i: Inp, k: string, d: number) => n(i, k) ?? d;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const pct = (p: number, d = 1) => (p * 100).toFixed(d);

/** Poissonova vjerojatnost P(X = k) — iterativno, bez prelijevanja faktorijela. */
export function pois(k: number, l: number): number {
  if (k < 0) return 0;
  if (l <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}
/** P(X ≤ k) */
export function cdf(k: number, l: number): number {
  if (k < 0) return 0;
  let s = 0;
  for (let i = 0; i <= Math.min(k, 60); i++) s += pois(i, l);
  return Math.min(1, s);
}
/** P(X ≥ k) */
export const atLeast = (k: number, l: number) => 1 - cdf(k - 1, l);

export function conf(p: number, lang: Lang): Conf {
  if (p >= 0.65) return { level: "safe", text: t("safe", lang), cls: "badge-safe" };
  if (p >= 0.5) return { level: "vly", text: t("vly", lang), cls: "badge-vly" };
  if (p >= 0.35) return { level: "ly", text: t("ly", lang), cls: "badge-ly" };
  if (p >= 0.2) return { level: "ry", text: t("ry", lang), cls: "badge-rs" };
  return { level: "hrk", text: t("hrk", lang), cls: "badge-rs" };
}

/** Kelly ulog: f* = (p·k − 1)/(k − 1), skaliran frakcijom (kel %). */
export function kelly(p: number, odds: number, bank: number, frac: number): number {
  if (odds <= 1 || p <= 0 || bank <= 0) return 0;
  const f = (p * odds - 1) / (odds - 1);
  return f > 0 ? bank * f * (frac / 100) : 0;
}

/** Vrijednost oklade: fer kvota = 1/p, vrijednost = p·kvota − 1. */
export function value(p: number, odds: number | undefined, i?: Inp): Val | null {
  if (!odds || odds < 1.01 || p <= 0) return null;
  const v = p * odds - 1;
  const bank = i ? nd(i, "bank", 0) : 0;
  const kel = i ? nd(i, "kel", 25) : 25;
  return {
    fair: 1 / p,
    odds,
    value: v * 100,
    isV: v >= 0.05,
    trap: odds < (1 / p) * 0.88,
    stake: bank > 0 ? kelly(p, odds, bank, kel) : null,
  };
}

type Grid = { p: number[][]; max: number };
export function grid(lh: number, la: number, max = 10): Grid {
  const p: number[][] = [];
  let s = 0;
  for (let h = 0; h <= max; h++) {
    p[h] = [];
    for (let a = 0; a <= max; a++) {
      const v = pois(h, lh) * pois(a, la);
      p[h]![a] = v;
      s += v;
    }
  }
  for (let h = 0; h <= max; h++) for (let a = 0; a <= max; a++) p[h]![a]! /= s;
  return { p, max };
}
function sumGrid(g: Grid, f: (h: number, a: number) => boolean) {
  let s = 0;
  for (let h = 0; h <= g.max; h++) for (let a = 0; a <= g.max; a++) if (f(h, a)) s += g.p[h]![a]!;
  return s;
}
function hda(lh: number, la: number, max = 10) {
  const g = grid(lh, la, max);
  return { h: sumGrid(g, (x, y) => x > y), d: sumGrid(g, (x, y) => x === y), a: sumGrid(g, (x, y) => x < y) };
}

// ───────────────────────── očekivani golovi (λ) ─────────────────────────

export const HT_SHARE_DEFAULT = 0.44;

/**
 * Očekivani golovi domaćina i gosta. Svaki napredni faktor primjenjuje se SAMO ako je unesen,
 * a domaćinski faktori (forma, ELO, zamah, ozljede…) djeluju suprotno na gosta.
 */
export function lambdas(i: Inp, st: Settings): { lh: number; la: number } {
  let h = nd(i, "hg", 0) / 5;
  let a = nd(i, "ag", 0) / 5;
  const hg10 = n(i, "hg10"), ag10 = n(i, "ag10");
  if (hg10 !== undefined && hg10 > 0) h = 0.5 * h + 0.5 * (hg10 / 10);
  if (ag10 !== undefined && ag10 > 0) a = 0.5 * a + 0.5 * (ag10 / 10);

  const fw = clamp(st.formW, 0, 100) / 100;
  const xg = n(i, "xg"), xga = n(i, "xga");
  if (xg !== undefined && xg > 0) h = fw * h + (1 - fw) * (xg / 5);
  if (xga !== undefined && xga > 0) a = fw * a + (1 - fw) * (xga / 5);

  const lavg = n(i, "lavg");
  if (lavg !== undefined && lavg > 0) {
    // regresija prema prosjeku lige (po timu = pola ukupnog prosjeka)
    h = 0.75 * h + 0.25 * (lavg / 2);
    a = 0.75 * a + 0.25 * (lavg / 2);
  }

  const adv = clamp(st.homeAdv, 0, 40) / 100;
  h *= 1 + adv / 2;
  a *= 1 - adv / 2;

  const h2hh = nd(i, "h2hh", 0), h2ha = nd(i, "h2ha", 0);
  if (h2hh + h2ha > 0) {
    const sh = h2hh / (h2hh + h2ha);
    const w = clamp(st.h2hW, 0, 100) / 100;
    h *= 1 + w * (sh - 0.5) * 0.6;
    a *= 1 + w * (0.5 - sh) * 0.6;
  }
  const elo = n(i, "elo");
  if (elo !== undefined) {
    const e = clamp(elo, -400, 400) / 400;
    h *= 1 + e * 0.12;
    a *= 1 - e * 0.12;
  }
  const fat = n(i, "fat");
  if (fat !== undefined) { h *= 1 - clamp(fat, 0, 5) * 0.03; a *= 1 + clamp(fat, 0, 5) * 0.01; }
  const inj = n(i, "inj");
  if (inj !== undefined) h *= 1 - clamp(inj, 0, 5) * 0.05;
  const susp = n(i, "susp");
  if (susp !== undefined) h *= 1 - clamp(susp, 0, 5) * 0.04;
  const mom = n(i, "mom");
  if (mom !== undefined) { const m = clamp(mom, -10, 10); h *= 1 + m * 0.02; a *= 1 - m * 0.01; }
  const prs = n(i, "prs");
  if (prs !== undefined) { const f = 1 + (clamp(prs, 0, 10) - 5) * 0.01; h *= f; a *= f; }
  const sp = n(i, "sp");
  if (sp !== undefined) { const f = 1 + (clamp(sp, 0, 10) - 5) * 0.007; h *= f; a *= f; }
  const poss = n(i, "poss");
  if (poss !== undefined) { const d = clamp(poss, 0, 100) - 50; h *= 1 + d * 0.0025; a *= 1 - d * 0.0025; }
  const shots = n(i, "shots");
  if (shots !== undefined) h *= 1 + (shots - 12) * 0.008;
  const sot = n(i, "shotsOT");
  if (sot !== undefined) h *= 1 + (sot - 4.5) * 0.02;

  if (st.weatherOn) {
    const wea = i["wea"];
    const wf = wea === "rain" ? 0.93 : wea === "snow" ? 0.85 : wea === "wind" ? 0.94 : wea === "hot" ? 0.95 : 1;
    h *= wf; a *= wf;
    const tmp = n(i, "tmp");
    if (tmp !== undefined && tmp > 32) { h *= 0.91; a *= 0.91; }
    if (tmp !== undefined && tmp < 3) { h *= 0.92; a *= 0.92; }
    const wnd = n(i, "wnd");
    if (wnd !== undefined && wnd > 30) { h *= 0.93; a *= 0.93; }
  }
  const imp = i["imp"];
  const imf = imp === "final" ? 0.93 : imp === "derby" ? 0.97 : imp === "cup" ? 0.99 : imp === "friendly" ? 1.05 : 1;
  h *= imf; a *= imf;
  return { lh: Math.max(0.05, h), la: Math.max(0.05, a) };
}

function htShare(i: Inp) {
  const p = n(i, "htP");
  return p !== undefined && p > 10 && p < 90 ? p / 100 : HT_SHARE_DEFAULT;
}

// ───────────────────────── tržišta ─────────────────────────

type Ctx = { i: Inp; st: Settings; lang: Lang };
const hr = (c: Ctx) => c.lang === "hr";
const mk = (c: Ctx, tip: string, prob: number, stats: Stat[], extra: Partial<Res> = {}): Res => ({
  tip,
  prob,
  conf: conf(prob, c.lang),
  stats,
  ...extra,
});
const yesNo = (c: Ctx, p: number) => (p > 0.5 ? t("da", c.lang) : t("ne", c.lang));

function binary(c: Ctx, label: string, p: number, more: Stat[] = [], oddsKey?: string): Res {
  p = clamp(p, 0.001, 0.999);
  const yes = p >= 0.5;
  const pick = yes ? p : 1 - p;
  const odds = oddsKey ? n(c.i, oddsKey) : undefined;
  return mk(c, `${yes ? "✅" : "❌"} ${label} – ${yesNo(c, p)} (${pct(pick)}%)`, pick, [
    { value: pct(p) + "%", label: t("da", c.lang), variant: "green" },
    { value: pct(1 - p) + "%", label: t("ne", c.lang), variant: "red" },
    { value: "@" + (1 / p).toFixed(2), label: t("fair", c.lang) + " DA" },
    ...more,
  ], { val: yes && odds ? value(p, odds, c.i) : null, odds });
}

export function m1x2(c: Ctx): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const r = hda(lh, la);
  const o = { h: n(c.i, "o1"), d: n(c.i, "oX"), a: n(c.i, "o2") };
  const best = r.h >= r.d && r.h >= r.a ? "h" : r.d >= r.a ? "d" : "a";
  const label = best === "h" ? "htip" : best === "d" ? "dtip" : "atip";
  const stats: Stat[] = [
    { value: pct(r.h, 2) + "%", label: t("hw", c.lang), variant: "gold" },
    { value: pct(r.d, 2) + "%", label: t("dr", c.lang) },
    { value: pct(r.a, 2) + "%", label: t("aw", c.lang) },
    { value: (1 / r.h).toFixed(2), label: t("fair", c.lang) + " 1" },
    { value: (1 / r.d).toFixed(2), label: t("fair", c.lang) + " X" },
    { value: (1 / r.a).toFixed(2), label: t("fair", c.lang) + " 2" },
  ];
  const notes: string[] = [];
  if (o.h && o.d && o.a) {
    const ov = 1 / o.h + 1 / o.d + 1 / o.a;
    notes.push(
      `${hr(c) ? "Marža kladionice" : "Bookmaker margin"}: ${((ov - 1) * 100).toFixed(1)}% · ` +
        `${hr(c) ? "Tržište (bez marže)" : "Market (no margin)"}: 1 ${pct(1 / o.h / ov)}% · X ${pct(1 / o.d / ov)}% · 2 ${pct(1 / o.a / ov)}%`,
    );
  }
  return mk(c, t(label, c.lang), r[best], stats, {
    val: value(r[best], o[best], c.i),
    odds: o[best],
    notes,
    lambda: { h: lh, a: la },
  });
}

export function mBtts(c: Ctx): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const ph = 1 - pois(0, lh), pa = 1 - pois(0, la);
  let p = ph * pa;
  const bH = n(c.i, "bttsH"), bA = n(c.i, "bttsA");
  if (bH !== undefined && bA !== undefined) p = 0.5 * p + 0.5 * ((clamp(bH, 0, 5) + clamp(bA, 0, 5)) / 10);
  const cs = n(c.i, "cs5");
  if (cs !== undefined) p -= (0.16 * clamp(cs, 0, 5)) / 5;
  const fts = n(c.i, "fts5");
  if (fts !== undefined) p -= (0.1 * clamp(fts, 0, 5)) / 5;
  p = clamp(p, 0.02, 0.98);
  const gg = p >= 0.5;
  const pick = gg ? p : 1 - p;
  const odds = gg ? n(c.i, "oGG") : n(c.i, "oNG");
  return mk(c, t(gg ? "ggtip" : "ngtip", c.lang), pick, [
    { value: pct(p, 2) + "%", label: "GG", variant: "green" },
    { value: pct(1 - p, 2) + "%", label: "NG", variant: "red" },
    { value: pct(ph) + "%", label: hr(c) ? "Dom. zabija" : "Home scores" },
    { value: pct(pa) + "%", label: hr(c) ? "Gost zabija" : "Away scores" },
    { value: (1 / p).toFixed(2), label: t("fair", c.lang) + " GG" },
    { value: (1 / (1 - p)).toFixed(2), label: t("fair", c.lang) + " NG" },
  ], { val: value(pick, odds, c.i), odds, lambda: { h: lh, a: la } });
}

function ouRes(c: Ctx, line: number, l: number, pre = ""): Res {
  const pO = atLeast(Math.floor(line) + 1, l);
  const over = pO >= 0.5;
  const pick = over ? pO : 1 - pO;
  const odds = over ? n(c.i, "oO") : n(c.i, "oU");
  const lbl = `${over ? "Over" : "Under"} ${line}`;
  return mk(c, `🎯 ${pre}${lbl}`, pick, [
    { value: pct(pO) + "%", label: "Over", variant: "green" },
    { value: pct(1 - pO) + "%", label: "Under", variant: "red" },
    { value: l.toFixed(2), label: t("lambda", c.lang) },
    { value: (1 / pO).toFixed(2), label: t("fair", c.lang) + " O" },
    { value: (1 / (1 - pO)).toFixed(2), label: t("fair", c.lang) + " U" },
  ], { val: value(pick, odds, c.i), odds });
}

export function mOU(c: Ctx, line: number): Res {
  const { lh, la } = lambdas(c.i, c.st);
  return { ...ouRes(c, line, lh + la), lambda: { h: lh, a: la } };
}

export function mCS(c: Ctx): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const g = grid(lh, la, 8);
  const list: { h: number; a: number; p: number }[] = [];
  for (let h = 0; h <= 8; h++) for (let a = 0; a <= 8; a++) list.push({ h, a, p: g.p[h]![a]! });
  list.sort((x, y) => y.p - x.p);
  const top = list.slice(0, 6);
  return mk(c, `🎯 ${top[0]!.h}:${top[0]!.a}`, top[0]!.p,
    top.map((x) => ({ value: `${x.h}:${x.a}`, label: pct(x.p, 2) + "% · @" + (1 / x.p).toFixed(1), variant: "gold" as const })),
    { lambda: { h: lh, a: la } });
}

export function mDC(c: Ctx): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const r = hda(lh, la);
  const opts = [
    { n: "1X", p: r.h + r.d, o: n(c.i, "o1X") },
    { n: "12", p: r.h + r.a, o: n(c.i, "o12") },
    { n: "X2", p: r.d + r.a, o: n(c.i, "oX2") },
  ];
  // preporuka: najviša vrijednost ako su kvote unesene, inače najveća vjerojatnost
  const withOdds = opts.filter((x) => x.o);
  const best = withOdds.length === 3
    ? withOdds.reduce((a, b) => (a.p * a.o! > b.p * b.o! ? a : b))
    : opts.reduce((a, b) => (a.p > b.p ? a : b));
  return mk(c, "🎯 " + best.n, best.p,
    opts.map((x) => ({ value: pct(x.p) + "%", label: x.n + " · @" + (1 / x.p).toFixed(2), variant: x === best ? "gold" as const : undefined })),
    { val: value(best.p, best.o, c.i), odds: best.o });
}

/** HT/FT — ISPRAVLJENO: kraj ovisi o rezultatu poluvremena + golovima 2. poluvremena. */
export function mHTFT(c: Ctx): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const s = htShare(c.i);
  const g1 = grid(lh * s, la * s, 7), g2 = grid(lh * (1 - s), la * (1 - s), 7);
  const res = (h: number, a: number) => (h > a ? "1" : h === a ? "X" : "2");
  const acc: Record<string, number> = {};
  for (let h1 = 0; h1 <= 7; h1++) for (let a1 = 0; a1 <= 7; a1++) {
    const p1 = g1.p[h1]![a1]!;
    for (let h2 = 0; h2 <= 7; h2++) for (let a2 = 0; a2 <= 7; a2++) {
      const k = res(h1, a1) + "/" + res(h1 + h2, a1 + a2);
      acc[k] = (acc[k] ?? 0) + p1 * g2.p[h2]![a2]!;
    }
  }
  const all = Object.entries(acc).map(([k, p]) => ({ k, p })).sort((x, y) => y.p - x.p);
  return mk(c, "🎯 " + all[0]!.k, all[0]!.p,
    all.map((x, idx) => ({ value: x.k, label: pct(x.p, 2) + "% · @" + (1 / x.p).toFixed(1), variant: idx === 0 ? "gold" as const : undefined })));
}

export function mHalf1x2(c: Ctx, first: boolean): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const s = first ? htShare(c.i) : 1 - htShare(c.i);
  const r = hda(lh * s, la * s, 8);
  const best = r.h >= r.d && r.h >= r.a ? "1" : r.d >= r.a ? "X" : "2";
  const p = best === "1" ? r.h : best === "X" ? r.d : r.a;
  return mk(c, "🎯 " + best, p, [
    { value: pct(r.h) + "%", label: "1", variant: "gold" },
    { value: pct(r.d) + "%", label: "X" },
    { value: pct(r.a) + "%", label: "2", variant: "green" },
  ]);
}

export function mHalfBtts(c: Ctx, first: boolean): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const s = first ? htShare(c.i) : 1 - htShare(c.i);
  const ph = 1 - pois(0, lh * s), pa = 1 - pois(0, la * s);
  const p = ph * pa;
  const gg = p >= 0.5;
  return mk(c, t(gg ? "ggtip" : "ngtip", c.lang), gg ? p : 1 - p, [
    { value: pct(p) + "%", label: "GG", variant: "green" },
    { value: pct(1 - p) + "%", label: "NG", variant: "red" },
    { value: pct(ph) + "%", label: hr(c) ? "Dom. zabija" : "Home scores" },
    { value: pct(pa) + "%", label: hr(c) ? "Gost zabija" : "Away scores" },
  ]);
}

export function mHalfOU(c: Ctx, line: number, first: boolean): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const s = first ? htShare(c.i) : 1 - htShare(c.i);
  return ouRes(c, line, (lh + la) * s, first ? "1H " : "2H ");
}

/** Azijski hendikep ±X.5 — prikaz obje strane (favorit −X.5 / autsajder +X.5). */
export function mAH(c: Ctx, line: number): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const g = grid(lh, la, 12);
  const homeMinus = sumGrid(g, (h, a) => h - a > line);
  const awayMinus = sumGrid(g, (h, a) => a - h > line);
  const homePlus = 1 - awayMinus, awayPlus = 1 - homeMinus;
  const L = hr(c) ? { h: "Domaćin", a: "Gost" } : { h: "Home", a: "Away" };
  const cands = [
    { n: `${L.h} -${line}`, p: homeMinus },
    { n: `${L.a} +${line}`, p: awayPlus },
    { n: `${L.a} -${line}`, p: awayMinus },
    { n: `${L.h} +${line}`, p: homePlus },
  ];
  // preporuka: strana favorita i njezina suprotnost — biramo vjerojatniju od para favorita
  const fav = lh >= la ? cands.slice(0, 2) : cands.slice(2, 4);
  const best = fav[0]!.p >= fav[1]!.p ? fav[0]! : fav[1]!;
  return mk(c, "🎯 " + best.n, best.p,
    cands.map((x) => ({ value: pct(x.p) + "%", label: x.n, variant: x === best ? "gold" as const : undefined })));
}

function linesRes(c: Ctx, l: number, lines: number[], fixed: number | null, name: string): Res {
  if (fixed !== null) return ouRes(c, fixed, l, name + " ");
  const rows = lines.map((ln) => ({ ln, o: atLeast(Math.floor(ln) + 1, l) }));
  // preporuka: linija čija je jača strana najbliža 70 % (dobra sigurnost uz razumnu kvotu)
  const best = rows.reduce((a, b) => (Math.abs(Math.max(a.o, 1 - a.o) - 0.7) <= Math.abs(Math.max(b.o, 1 - b.o) - 0.7) ? a : b));
  const over = best.o >= 0.5;
  return mk(c, `🎯 ${name} ${over ? "Over" : "Under"} ${best.ln}`, over ? best.o : 1 - best.o, [
    { value: l.toFixed(2), label: t("lambda", c.lang), variant: "gold" },
    ...rows.map((r) => ({ value: `O ${pct(r.o)}% / U ${pct(1 - r.o)}%`, label: `${name} ${r.ln}` })),
  ]);
}

export function mCorners(c: Ctx, which: "all" | "h" | "a", fixed: number | null): Res {
  let ch = nd(c.i, "ch", 25) / 5, ca = nd(c.i, "ca", 18) / 5;
  const sty = c.i["cstyle"];
  const f = sty === "possession" ? 1.15 : sty === "counter" ? 0.9 : 1;
  ch *= f; ca *= f;
  const l = which === "all" ? ch + ca : which === "h" ? ch : ca;
  const lines = which === "all" ? [7.5, 8.5, 9.5, 10.5, 11.5, 12.5] : [2.5, 3.5, 4.5, 5.5, 6.5];
  return linesRes(c, l, lines, fixed, hr(c) ? "Korneri" : "Corners");
}

export function mCards(c: Ctx, which: "all" | "h" | "a", fixed: number | null): Res {
  let dh = nd(c.i, "cdh", 10) / 5, da = nd(c.i, "cda", 8) / 5;
  const it = c.i["cint"];
  const f1 = it === "high" ? 1.2 : it === "derby" ? 1.3 : it === "low" ? 0.85 : 1;
  const rf = c.i["cref"];
  const f2 = rf === "strict" ? 1.2 : rf === "lenient" ? 0.85 : 1;
  dh *= f1 * f2; da *= f1 * f2;
  const l = which === "all" ? dh + da : which === "h" ? dh : da;
  const lines = which === "all" ? [2.5, 3.5, 4.5, 5.5, 6.5] : [0.5, 1.5, 2.5, 3.5];
  return linesRes(c, l, lines, fixed, hr(c) ? "Kartoni" : "Cards");
}

/**
 * Vrijeme prvog gola — ISPRAVLJENO: intenzitet golova po minuti.
 * fhm/fam = prosječno minuta po postignutom golu (domaćin/gost); bez unosa koristi se λ modela.
 */
function goalRate(c: Ctx) {
  const fhm = n(c.i, "fhm"), fam = n(c.i, "fam");
  if (fhm && fam && fhm > 0 && fam > 0) return 1 / fhm + 1 / fam;
  const { lh, la } = lambdas(c.i, c.st);
  return (lh + la) / 90;
}
export function mFirstGoal(c: Ctx, before: number | null): Res {
  const r = goalRate(c);
  if (before !== null) {
    const p = 1 - Math.exp(-r * before);
    return binary(c, hr(c) ? `Prvi gol prije ${before}. min` : `First goal before ${before}'`, p);
  }
  const bands = [[0, 15], [15, 30], [30, 45], [45, 60], [60, 75], [75, 90]] as const;
  const rows = bands.map(([s, e]) => ({ n: `${s + 1}-${e} min`, p: Math.exp(-r * s) - Math.exp(-r * e) }));
  rows.push({ n: t("ng", c.lang), p: Math.exp(-r * 90) });
  const sorted = [...rows].sort((a, b) => b.p - a.p);
  return mk(c, "🎯 " + sorted[0]!.n, sorted[0]!.p,
    rows.map((x) => ({ value: pct(x.p) + "%", label: x.n, variant: x === sorted[0] ? "gold" as const : undefined })));
}

export function mTeamGoals(c: Ctx, home: boolean, line: number | null): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const l = home ? lh : la;
  if (line !== null) return ouRes(c, line, l, (home ? (hr(c) ? "Domaćin " : "Home ") : hr(c) ? "Gost " : "Away "));
  const dist = [0, 1, 2, 3, 4, 5, 6].map((g) => ({ g: String(g), p: pois(g, l) }));
  dist.push({ g: "7+", p: atLeast(7, l) });
  const best = dist.reduce((a, b) => (a.p > b.p ? a : b));
  return mk(c, `🎯 ${best.g} ${t("golova", c.lang)}`, best.p,
    dist.map((x) => ({ value: pct(x.p) + "%", label: `${x.g} ${t("golova", c.lang)}`, variant: x === best ? "gold" as const : undefined })));
}

export type Player = { n: string; g: number; m: number; pos: "fw" | "mf" | "df"; pen: boolean; mn: number };
export function mScorer(c: Ctx, players: Player[]): Res {
  const rows = players.map((p) => {
    const posF = p.pos === "fw" ? 1 : p.pos === "mf" ? 0.55 : 0.15;
    let l = (p.g / Math.max(p.m, 1)) * posF;
    if (p.pen) l *= 1.25;
    l *= clamp(p.mn || 90, 0, 90) / 90;
    return { ...p, l };
  });
  const listed = rows.reduce((s, r) => s + r.l, 0);
  const total = listed * 1.25; // + ostali igrači (~20 % udjela)
  const pNo = Math.exp(-total);
  const out = rows.map((r) => ({ ...r, pr: total > 0 ? (r.l / total) * (1 - pNo) : 0 })).sort((a, b) => b.pr - a.pr);
  const first = out[0];
  return mk(c, "👑 " + (first?.n || "N/A"), first?.pr ?? 0, [
    ...out.map((r, k) => ({ value: pct(r.pr, 2) + "%", label: r.n || `${t("pn", c.lang)} ${k + 1}`, variant: k === 0 ? "gold" as const : undefined })),
    { value: pct(pNo, 2) + "%", label: t("ng", c.lang) },
  ]);
}

/** Pobjeda bez primljenog gola — ISPRAVLJENO: P(dom. zabija) × P(gost ne zabija). */
export function mWinNil(c: Ctx): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const ph = (1 - pois(0, lh)) * pois(0, la);
  const pa = (1 - pois(0, la)) * pois(0, lh);
  const home = ph >= pa;
  const p = home ? ph : pa;
  return binary(c, hr(c) ? (home ? "Domaćin pobjeđuje bez primljenog" : "Gost pobjeđuje bez primljenog") : home ? "Home win to nil" : "Away win to nil", p, [
    { value: pct(ph) + "%", label: hr(c) ? "🏠 Dom. bez gola" : "🏠 Home to nil" },
    { value: pct(pa) + "%", label: hr(c) ? "✈ Gost bez gola" : "✈ Away to nil" },
  ]);
}

export function mRange(c: Ctx, lo: number, hi: number): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const l = lh + la;
  const p = hi >= 99 ? atLeast(lo, l) : cdf(hi, l) - cdf(lo - 1, l);
  const lbl = hi >= 99 ? `${lo}+ ${t("golova", c.lang)}` : `${lo}-${hi} ${t("golova", c.lang)}`;
  return binary(c, lbl, p, [{ value: l.toFixed(2), label: t("lambda", c.lang) }]);
}

export function mValue(c: Ctx): Res | null {
  const p = nd(c.i, "prob", 0) / 100, o = nd(c.i, "odd", 0);
  if (!(p > 0 && p < 1 && o > 1)) return null;
  const v = value(p, o, c.i)!;
  return mk(c, v.isV ? t("valueYes", c.lang) : t("valueNo", c.lang), p, [
    { value: pct(p) + "%", label: t("prob", c.lang), variant: "gold" },
    { value: "@" + v.fair.toFixed(2), label: t("fair", c.lang) },
    { value: (v.value >= 0 ? "+" : "") + v.value.toFixed(1) + "%", label: t("val", c.lang), variant: v.value >= 0 ? "green" : "red" },
    { value: v.stake !== null ? "€" + v.stake.toFixed(2) : "-", label: t("rbt", c.lang) },
  ], { val: v, odds: o });
}

// ── događaji koji su ranije bili fiksne konstante — sada iz modela ──
function sequenceStats(lh: number, la: number) {
  // uz poznat konačni rezultat (h,a) redoslijed golova je slučajna permutacija:
  // P(gost zabija prvi | h,a) = a/(h+a)
  const g = grid(lh, la, 10);
  let hWB = 0, aWB = 0;
  for (let h = 0; h <= 10; h++) for (let a = 0; a <= 10; a++) {
    if (h + a === 0) continue;
    const p = g.p[h]![a]!;
    if (h > a) hWB += p * (a / (h + a));
    if (a > h) aWB += p * (h / (h + a));
  }
  return { hWB, aWB };
}
export function mEvent(c: Ctx, id: string): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const s = htShare(c.i);
  const H = hr(c);
  switch (id) {
    case "comeback":
    case "winFromBehind": {
      const { hWB, aWB } = sequenceStats(lh, la);
      return binary(c, H ? "Pobjeda iz zaostatka (bilo koji tim)" : "Win from behind (any team)", hWB + aWB, [
        { value: pct(hWB) + "%", label: H ? "🏠 Domaćin" : "🏠 Home" },
        { value: pct(aWB) + "%", label: H ? "✈ Gost" : "✈ Away" },
      ]);
    }
    case "loseFromAhead": {
      const { hWB, aWB } = sequenceStats(lh, la);
      return binary(c, H ? "Poraz iz vodstva (bilo koji tim)" : "Lose from ahead (any team)", hWB + aWB, [
        { value: pct(aWB) + "%", label: H ? "🏠 Dom. gubi vodstvo" : "🏠 Home blows lead" },
        { value: pct(hWB) + "%", label: H ? "✈ Gost gubi vodstvo" : "✈ Away blows lead" },
      ]);
    }
    case "bothHalves": {
      const p1 = 1 - pois(0, (lh + la) * s), p2 = 1 - pois(0, (lh + la) * (1 - s));
      return binary(c, H ? "Gol u oba poluvremena" : "Goal in both halves", p1 * p2, [
        { value: pct(p1) + "%", label: t("htLabel", c.lang) }, { value: pct(p2) + "%", label: t("shLabel", c.lang) },
      ]);
    }
    case "domBoth": return mTeamBothHalves(c, true);
    case "gostBoth": return mTeamBothHalves(c, false);
    case "cleanSheetH": return binary(c, H ? "Domaćin bez primljenog gola" : "Home clean sheet", pois(0, la));
    case "cleanSheetA": return binary(c, H ? "Gost bez primljenog gola" : "Away clean sheet", pois(0, lh));
    case "firstHalfWin": {
      const r = hda(lh * s, la * s, 8);
      const home = r.h >= r.a;
      return binary(c, H ? (home ? "Domaćin vodi na poluvremenu" : "Gost vodi na poluvremenu") : home ? "Home leads at HT" : "Away leads at HT", home ? r.h : r.a, [
        { value: pct(r.h) + "%", label: "1" }, { value: pct(r.d) + "%", label: "X" }, { value: pct(r.a) + "%", label: "2" },
      ]);
    }
    case "secondHalfWin": {
      const r = hda(lh * (1 - s), la * (1 - s), 8);
      const home = r.h >= r.a;
      return binary(c, H ? (home ? "Domaćin dobiva 2. poluvrijeme" : "Gost dobiva 2. poluvrijeme") : home ? "Home wins 2nd half" : "Away wins 2nd half", home ? r.h : r.a, [
        { value: pct(r.h) + "%", label: "1" }, { value: pct(r.d) + "%", label: "X" }, { value: pct(r.a) + "%", label: "2" },
      ]);
    }
    case "drawHT": return binary(c, H ? "Neriješeno na poluvremenu" : "Draw at half-time", hda(lh * s, la * s, 8).d);
    case "penalty": {
      const rate = nd(c.i, "pens", 0.25) * (c.i["cint"] === "derby" || c.i["cint"] === "high" ? 1.15 : 1);
      return binary(c, H ? "Hoće li biti penal" : "Penalty awarded", 1 - Math.exp(-rate), [], "oYes");
    }
    case "redCard": {
      const rf = c.i["cref"] === "strict" ? 1.25 : c.i["cref"] === "lenient" ? 0.8 : 1;
      const it = c.i["cint"] === "derby" ? 1.4 : c.i["cint"] === "high" ? 1.2 : c.i["cint"] === "low" ? 0.85 : 1;
      const rate = nd(c.i, "reds", 0.17) * rf * it;
      return binary(c, H ? "Hoće li biti crveni karton" : "Red card shown", 1 - Math.exp(-rate), [], "oYes");
    }
    case "ownGoal": return binary(c, H ? "Vlastiti gol" : "Own goal", 1 - Math.exp(-0.033 * (lh + la)), [], "oYes");
    case "hattrick": {
      // najbolji strijelac tima postiže ~35 % golova momčadi
      const ph = atLeast(3, lh * 0.35), pa = atLeast(3, la * 0.35);
      return binary(c, "Hat-trick", 1 - (1 - ph) * (1 - pa), [], "oYes");
    }
  }
  return binary(c, id, EVENT_BASE[id] ?? 0.5);
}

/** Statistička tržišta (udarci, ofsajdi…) — prosjek se unosi, inače prosjek europskih liga. */
export function mStat(c: Ctx, id: string): Res {
  const b = STAT_BASE[id]!;
  const sh = n(c.i, "stH"), sa = n(c.i, "stA");
  const exp = sh !== undefined && sa !== undefined
    ? (id === "possession" || id === "passAccuracy" ? (sh + (id === "possession" ? 100 - sa : sa)) / 2 : sh + sa)
    : b.base;
  const line = n(c.i, "stLine") ?? b.line;
  let pO: number;
  if (id === "possession" || id === "passAccuracy") {
    // postotne veličine: normalna aproksimacija
    const sd = id === "possession" ? 8 : 4;
    const z = (line - exp) / sd;
    pO = 1 - 0.5 * (1 + erf(z / Math.SQRT2));
  } else {
    pO = atLeast(Math.floor(line) + 1, exp);
  }
  const over = pO >= 0.5;
  const odds = over ? n(c.i, "oO") : n(c.i, "oU");
  return mk(c, `🎯 ${over ? "Over" : "Under"} ${line}`, over ? pO : 1 - pO, [
    { value: pct(pO) + "%", label: "Over", variant: "green" },
    { value: pct(1 - pO) + "%", label: "Under", variant: "red" },
    { value: exp.toFixed(1), label: c.lang === "hr" ? "Očekivano" : "Expected" },
  ], { val: value(over ? pO : 1 - pO, odds, c.i), odds });
}
function erf(x: number) {
  const s = Math.sign(x); x = Math.abs(x);
  const t1 = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t1 - 1.453152027) * t1 + 1.421413741) * t1 - 0.284496736) * t1 + 0.254829592) * t1 * Math.exp(-x * x);
  return s * y;
}

export function mScoreFirst(c: Ctx, last: boolean): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const pn = pois(0, lh) * pois(0, la);
  const ph = (lh / (lh + la)) * (1 - pn), pa = (la / (lh + la)) * (1 - pn);
  const H = hr(c);
  const home = ph >= pa;
  const label = home
    ? (H ? `🏠 Domaćin zabija ${last ? "zadnji" : "prvi"}` : `🏠 Home scores ${last ? "last" : "first"}`)
    : (H ? `✈ Gost zabija ${last ? "zadnji" : "prvi"}` : `✈ Away scores ${last ? "last" : "first"}`);
  return mk(c, (last ? "🏁 " : "🥇 ") + label, home ? ph : pa, [
    { value: pct(ph) + "%", label: H ? "🏠 Domaćin" : "🏠 Home", variant: "gold" },
    { value: pct(pa) + "%", label: H ? "✈ Gost" : "✈ Away", variant: "green" },
    { value: pct(pn) + "%", label: t("ng", c.lang) },
  ]);
}

export function mWinEitherHalf(c: Ctx, home: boolean): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const s = htShare(c.i);
  const r1 = hda(lh * s, la * s, 8), r2 = hda(lh * (1 - s), la * (1 - s), 8);
  const p1 = home ? r1.h : r1.a, p2 = home ? r2.h : r2.a;
  const p = 1 - (1 - p1) * (1 - p2);
  const H = hr(c);
  return binary(c, home ? (H ? "Domaćin osvaja barem 1 poluvrijeme" : "Home wins either half") : (H ? "Gost osvaja barem 1 poluvrijeme" : "Away wins either half"), p, [
    { value: pct(p1) + "%", label: t("htLabel", c.lang) }, { value: pct(p2) + "%", label: t("shLabel", c.lang) },
  ]);
}

export function mBttsBothHalves(c: Ctx): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const s = htShare(c.i);
  const p1 = (1 - pois(0, lh * s)) * (1 - pois(0, la * s));
  const p2 = (1 - pois(0, lh * (1 - s))) * (1 - pois(0, la * (1 - s)));
  return binary(c, "BTTS " + (hr(c) ? "u oba poluvremena" : "in both halves"), p1 * p2, [
    { value: pct(p1) + "%", label: t("htLabel", c.lang) }, { value: pct(p2) + "%", label: t("shLabel", c.lang) },
  ]);
}

/** Gol u vremenskom prozoru; kasne minute imaju ~15 % veći intenzitet (+ sudačka nadoknada). */
export function mWindow(c: Ctx, from: number, to: number, boost = 1): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const p = 1 - Math.exp((-(lh + la) * (to - from) * boost) / 90);
  return binary(c, hr(c) ? `Gol ${from}-${to}. min` : `Goal ${from}-${to} min`, p);
}

export function mFgMethod(c: Ctx): Res {
  const f = clamp(nd(c.i, "sp", 5), 0, 10) / 10;
  const foot = Math.max(0.5, 0.73 - f * 0.05), head = Math.max(0.1, 0.2 - f * 0.02), pen = Math.min(0.15, 0.04 + f * 0.04), og = 0.03;
  const tot = foot + head + pen + og;
  const H = hr(c);
  const rows = [
    { n: H ? "🦶 Nogom/udarcem" : "🦶 Foot/Shot", p: foot / tot },
    { n: H ? "🧢 Glavom" : "🧢 Header", p: head / tot },
    { n: H ? "⚽ Penal" : "⚽ Penalty", p: pen / tot },
    { n: H ? "😱 Vlastiti gol" : "😱 Own goal", p: og / tot },
  ].sort((a, b) => b.p - a.p);
  return mk(c, `🎯 ${rows[0]!.n} (${pct(rows[0]!.p)}%)`, rows[0]!.p,
    rows.map((r, k) => ({ value: pct(r.p) + "%", label: r.n, variant: k === 0 ? "gold" as const : undefined })));
}

/** Ishod + GG/Over/Under — ISPRAVLJENO: zajednička vjerojatnost iz mreže rezultata (ne umnožak). */
export function mResCombo(c: Ctx, kind: "gg" | "o25" | "u25"): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const g = grid(lh, la, 10);
  const cond = (h: number, a: number) => (kind === "gg" ? h > 0 && a > 0 : kind === "o25" ? h + a >= 3 : h + a <= 2);
  const A = kind === "gg" ? "GG" : kind === "o25" ? "Over 2.5" : "Under 2.5";
  const rows = [
    { n: "1 + " + A, p: sumGrid(g, (h, a) => h > a && cond(h, a)), v: "gold" as const },
    { n: "X + " + A, p: sumGrid(g, (h, a) => h === a && cond(h, a)), v: undefined },
    { n: "2 + " + A, p: sumGrid(g, (h, a) => h < a && cond(h, a)), v: "green" as const },
  ].sort((a, b) => b.p - a.p);
  return mk(c, `🎯 ${rows[0]!.n} (${pct(rows[0]!.p)}%)`, rows[0]!.p,
    rows.map((r) => ({ value: pct(r.p) + "%", label: r.n + " · @" + (1 / r.p).toFixed(2), variant: r.v })));
}

/** Azijski total — ISPRAVLJENO obračunavanje četvrtinskih linija (x.25 / x.75). */
export function mAsianTotal(c: Ctx, line: number): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const l = lh + la;
  const parts = Math.abs((line * 4) % 2) === 1 ? [line - 0.25, line + 0.25] : [line];
  let win = 0, lose = 0, push = 0;
  for (let T = 0; T <= 20; T++) {
    const p = pois(T, l);
    let r = 0; // povrat po dijelu: 1 dobitak, 0 push, -1 gubitak
    for (const L of parts) r += T > L ? 1 : T === L ? 0 : -1;
    r /= parts.length;
    if (r > 0) win += p * r; else if (r < 0) lose += p * -r;
    push += p * (1 - Math.abs(r));
  }
  const over = win >= lose;
  const p = over ? win : lose;
  return mk(c, `🀄 ${over ? "Over" : "Under"} ${line}`, p, [
    { value: pct(win) + "%", label: "Over", variant: "green" },
    { value: pct(lose) + "%", label: "Under", variant: "red" },
    { value: pct(push) + "%", label: "Push" },
    { value: l.toFixed(2), label: t("lambda", c.lang) },
  ]);
}

export function mEuroHand(c: Ctx, hand: number): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const g = grid(lh, la, 12);
  const p1 = sumGrid(g, (h, a) => h + hand - a > 0), pX = sumGrid(g, (h, a) => h + hand - a === 0), p2 = sumGrid(g, (h, a) => h + hand - a < 0);
  const lbl = "1" + (hand > 0 ? "+" + hand : hand < 0 ? String(hand) : "");
  const rows = [{ n: lbl, p: p1 }, { n: "X", p: pX }, { n: "2", p: p2 }].sort((a, b) => b.p - a.p);
  return mk(c, `🇪🇺 ${rows[0]!.n} (hendi ${hand > 0 ? "+" : ""}${hand})`, rows[0]!.p, [
    { value: pct(p1) + "%", label: lbl, variant: "gold" }, { value: pct(pX) + "%", label: "X" }, { value: pct(p2) + "%", label: "2", variant: "green" },
  ]);
}

export function mOddEven(c: Ctx): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const l = lh + la;
  const even = (1 + Math.exp(-2 * l)) / 2; // točna formula za Poissonovu razdiobu
  const odd = 1 - even;
  const H = hr(c);
  const isOdd = odd > even;
  return mk(c, `🔢 ${isOdd ? (H ? "NEPARAN" : "ODD") : H ? "PARAN" : "EVEN"} – ${pct(Math.max(odd, even))}%`, Math.max(odd, even), [
    { value: pct(odd) + "%", label: H ? "Neparan" : "Odd", variant: "gold" },
    { value: pct(even) + "%", label: H ? "Paran" : "Even", variant: "green" },
  ]);
}

export function mHighHalf(c: Ctx): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const s = htShare(c.i);
  const r = hda((lh + la) * s, (lh + la) * (1 - s), 10);
  const H = hr(c);
  const rows = [
    { n: H ? "⏸ 1. poluvrijeme" : "⏸ 1st Half", p: r.h },
    { n: H ? "▶ 2. poluvrijeme" : "▶ 2nd Half", p: r.a },
    { n: H ? "🤝 Jednako" : "🤝 Equal", p: r.d },
  ];
  const best = rows.reduce((a, b) => (a.p > b.p ? a : b));
  return mk(c, "📊 " + best.n, best.p, rows.map((x) => ({ value: pct(x.p) + "%", label: x.n, variant: x === best ? "gold" as const : undefined })));
}

export function mTeamNPlus(c: Ctx, home: boolean, k: number): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const H = hr(c);
  const who = home ? (H ? "Domaćin" : "Home") : H ? "Gost" : "Away";
  return binary(c, `${who} ${k}+ ${H ? "gola" : "goals"}`, atLeast(k, home ? lh : la));
}

export function mTeamBothHalves(c: Ctx, home: boolean): Res {
  const { lh, la } = lambdas(c.i, c.st);
  const s = htShare(c.i);
  const l = home ? lh : la;
  const p1 = 1 - pois(0, l * s), p2 = 1 - pois(0, l * (1 - s));
  const H = hr(c);
  const who = home ? (H ? "Domaćin" : "Home") : H ? "Gost" : "Away";
  return binary(c, `${who} ${H ? "gol u oba poluvremena" : "scores in both halves"}`, p1 * p2, [
    { value: pct(p1) + "%", label: t("htLabel", c.lang) }, { value: pct(p2) + "%", label: t("shLabel", c.lang) },
  ]);
}

// ───────────────────────── AI prediktori ─────────────────────────

/** AI λ — ISPRAVLJENO: xG po utakmici (ne /5), forma 10 ut., težine se renormaliziraju kad podatak nedostaje. */
export function aiLambdas(i: Inp, st: Settings) {
  const lavg = nd(i, "aiLavg", 2.7);
  const adv = 1 + nd(i, "aiHomeAdv", st.homeAdv) / 100;
  const team = (g5k: string, g10k: string, xgk: string) => {
    const g5 = n(i, g5k), g10 = n(i, g10k), xg = n(i, xgk);
    const parts: [number, number][] = [];
    if (g5 !== undefined) parts.push([g5 / 5, g10 !== undefined ? 0.25 : 0.4]);
    if (g10 !== undefined) parts.push([g10 / 10, 0.15]);
    if (xg !== undefined && xg > 0) parts.push([xg, 0.3]);
    parts.push([lavg / 2, 0.3]);
    const w = parts.reduce((s, [, x]) => s + x, 0);
    return parts.reduce((s, [v, x]) => s + v * x, 0) / w;
  };
  let h = team("aiHg5", "aiHg10", "aiHxg") * Math.sqrt(adv);
  let a = team("aiAg5", "aiAg10", "aiAxg") / Math.sqrt(adv);
  const wea = i["aiWea"];
  const wf = wea === "rain" ? 0.93 : wea === "snow" ? 0.86 : wea === "wind" ? 0.95 : 1;
  h *= wf; a *= wf;
  h *= 1 - Math.min(nd(i, "aiInjH", 0), 5) * 0.05;
  a *= 1 - Math.min(nd(i, "aiInjA", 0), 5) * 0.05;
  const mom = clamp(nd(i, "aiMom", 0), -10, 10);
  h *= 1 + mom * 0.025;
  a *= 1 - mom * 0.01;
  const imp = i["aiImp"];
  const im = imp === "final" ? 0.93 : imp === "derby" ? 0.97 : imp === "cup" ? 0.99 : imp === "friendly" ? 1.05 : 1;
  return { lh: Math.max(0.05, h * im), la: Math.max(0.05, a * im) };
}

export type AiOut = Res & { rows: { k: string; v: string }[] };

function aiValueRows(c: Ctx, p: number, odds: number | undefined, name: string) {
  const rows: { k: string; v: string }[] = [{ k: `${t("fair", c.lang)} ${name}`, v: "@" + (1 / p).toFixed(2) }];
  const v = value(p, odds, c.i);
  if (v) {
    rows.push({ k: `${t("val", c.lang)} ${name}`, v: `${v.value >= 0 ? "+" : ""}${v.value.toFixed(1)}% ${v.trap ? t("valueTrap", c.lang) : v.isV ? t("valuePos", c.lang) : t("valueNeg", c.lang)}` });
    if (v.stake !== null) rows.push({ k: `Kelly ${name}`, v: "€" + v.stake.toFixed(2) });
  }
  return { rows, v };
}

function aiBttsProb(i: Inp, st: Settings) {
  const { lh, la } = aiLambdas(i, st);
  const ph = 1 - Math.exp(-lh), pa = 1 - Math.exp(-la);
  let p = ph * pa;
  const bh = n(i, "aiBttsH"), ba = n(i, "aiBttsA");
  if (bh !== undefined || ba !== undefined) p = 0.65 * p + 0.35 * ((nd(i, "aiBttsH", 2.5) + nd(i, "aiBttsA", 2.5)) / 10);
  p -= ((nd(i, "aiCsH", 0) + nd(i, "aiCsA", 0)) / 10) * 0.15;
  p -= ((nd(i, "aiFtsH", 0) + nd(i, "aiFtsA", 0)) / 10) * 0.1;
  return { p: clamp(p, 0.03, 0.97), lh, la, ph, pa };
}
function aiOverProb(i: Inp, st: Settings) {
  const { lh, la } = aiLambdas(i, st);
  const l = lh + la;
  let p = 1 - cdf(2, l);
  const oh = n(i, "aiOverH5"), oa = n(i, "aiOverA5");
  if (oh !== undefined || oa !== undefined) p = 0.65 * p + 0.35 * ((nd(i, "aiOverH5", 2.5) + nd(i, "aiOverA5", 2.5)) / 10);
  return { p: clamp(p, 0.03, 0.97), lh, la, l };
}

export function aiBtts(c: Ctx): AiOut {
  const r = aiBttsProb(c.i, c.st);
  const gg = r.p >= 0.5;
  const pick = gg ? r.p : 1 - r.p;
  const odds = gg ? n(c.i, "aiOGG") : n(c.i, "aiONG");
  const vr = aiValueRows(c, pick, odds, gg ? "GG" : "NG");
  return {
    ...mk(c, gg ? `✅ GG (${pct(r.p)}%)` : `❌ NG (${pct(1 - r.p)}%)`, pick, [
      { value: pct(r.p) + "%", label: t("aiGG", c.lang), variant: "green" },
      { value: pct(1 - r.p) + "%", label: t("aiNG", c.lang), variant: "red" },
      { value: pct(r.ph) + "%", label: hr(c) ? "Dom. zabija" : "Home scores" },
      { value: pct(r.pa) + "%", label: hr(c) ? "Gost zabija" : "Away scores" },
    ], { val: vr.v, odds }),
    rows: [{ k: t("aiLamH", c.lang), v: r.lh.toFixed(3) }, { k: t("aiLamA", c.lang), v: r.la.toFixed(3) }, ...vr.rows],
  };
}

export function aiOU25(c: Ctx): AiOut {
  const r = aiOverProb(c.i, c.st);
  const over = r.p >= 0.5;
  const pick = over ? r.p : 1 - r.p;
  const odds = over ? n(c.i, "aiOGG") : n(c.i, "aiONG");
  const vr = aiValueRows(c, pick, odds, over ? "Over" : "Under");
  return {
    ...mk(c, over ? `📈 OVER 2.5 (${pct(r.p)}%)` : `📉 UNDER 2.5 (${pct(1 - r.p)}%)`, pick, [
      { value: pct(r.p) + "%", label: t("aiOver", c.lang), variant: "green" },
      { value: pct(1 - r.p) + "%", label: t("aiUnder", c.lang), variant: "red" },
      { value: pct(pois(0, r.l)) + "%", label: "0 " + t("golova", c.lang) },
      { value: pct(pois(1, r.l)) + "%", label: "1 " + t("golova", c.lang) },
      { value: pct(pois(2, r.l)) + "%", label: "2 " + t("golova", c.lang) },
    ], { val: vr.v, odds }),
    rows: [{ k: t("aiLamH", c.lang), v: r.lh.toFixed(3) }, { k: t("aiLamA", c.lang), v: r.la.toFixed(3) }, { k: t("aiTotal", c.lang), v: r.l.toFixed(3) }, ...vr.rows],
  };
}

/** GG + Over 2.5 — ISPRAVLJENO: zajednička razdioba iz mreže, usklađena s AI marginama (zbroj = 100 %). */
export function aiGgOu(c: Ctx): AiOut {
  const b = aiBttsProb(c.i, c.st), o = aiOverProb(c.i, c.st);
  const g = grid(b.lh, b.la, 10);
  let m = [
    [sumGrid(g, (h, a) => h > 0 && a > 0 && h + a >= 3), sumGrid(g, (h, a) => h > 0 && a > 0 && h + a <= 2)],
    [sumGrid(g, (h, a) => !(h > 0 && a > 0) && h + a >= 3), sumGrid(g, (h, a) => !(h > 0 && a > 0) && h + a <= 2)],
  ];
  // iterativno proporcionalno usklađivanje (IPF) na margine GG = b.p, Over = o.p
  for (let k = 0; k < 50; k++) {
    const r0 = m[0]![0]! + m[0]![1]!, r1 = m[1]![0]! + m[1]![1]!;
    m = [[(m[0]![0]! * b.p) / r0, (m[0]![1]! * b.p) / r0], [(m[1]![0]! * (1 - b.p)) / r1, (m[1]![1]! * (1 - b.p)) / r1]];
    const c0 = m[0]![0]! + m[1]![0]!, c1 = m[0]![1]! + m[1]![1]!;
    m = [[(m[0]![0]! * o.p) / c0, (m[0]![1]! * (1 - o.p)) / c1], [(m[1]![0]! * o.p) / c0, (m[1]![1]! * (1 - o.p)) / c1]];
  }
  const combos = [
    { n: "✅ GG + Over 2.5", p: m[0]![0]! },
    { n: "⚽ GG + Under 2.5", p: m[0]![1]! },
    { n: "🛡 NG + Over 2.5", p: m[1]![0]! },
    { n: "🔒 NG + Under 2.5", p: m[1]![1]! },
  ].sort((x, y) => y.p - x.p);
  return {
    ...mk(c, `${combos[0]!.n} – ${pct(combos[0]!.p)}%`, combos[0]!.p,
      combos.map((x, k) => ({ value: pct(x.p) + "%", label: `${x.n} · @${(1 / x.p).toFixed(2)}`, variant: k === 0 ? "gold" as const : undefined }))),
    rows: [{ k: "GG", v: pct(b.p) + "%" }, { k: "Over 2.5", v: pct(o.p) + "%" }],
  };
}

// ───────────────────────── usmjerivač ─────────────────────────

export function compute(id: string, i: Inp, st: Settings, lang: Lang, players: Player[]): Res | AiOut | null {
  const c: Ctx = { i, st, lang };
  const side = i["teamSide"] !== "away";
  if (id === "aiBtts") return aiBtts(c);
  if (id === "aiOU25") return aiOU25(c);
  if (id === "ggOu25") return aiGgOu(c);
  if (id === "value") return mValue(c);
  if (id === "scorer") return mScorer(c, players);
  if (id.startsWith("corn")) {
    const fx = id.includes("O") ? parseFloat(id.replace(/[^0-9]/g, "")) / 10 : null;
    return mCorners(c, id === "cornH" ? "h" : id === "cornA" ? "a" : "all", fx);
  }
  if (id.startsWith("cards")) {
    const fx = id.includes("O") ? parseFloat(id.replace(/[^0-9]/g, "")) / 10 : null;
    return mCards(c, id === "cardsH" ? "h" : id === "cardsA" ? "a" : "all", fx);
  }
  if (id === "fg" || id === "exactMinute") return mFirstGoal(c, null);
  if (id === "fg15") return mFirstGoal(c, 15);
  if (id === "fg30") return mFirstGoal(c, 30);
  if (STAT_BASE[id]) return mStat(c, id);
  if (EVENT_BASE[id] !== undefined) return mEvent(c, id);
  const map: Record<string, () => Res> = {
    "1x2": () => m1x2(c),
    btts: () => mBtts(c),
    ou05: () => mOU(c, 0.5), ou15: () => mOU(c, 1.5), ou25: () => mOU(c, 2.5), ou35: () => mOU(c, 3.5),
    ou45: () => mOU(c, 4.5), ou55: () => mOU(c, 5.5), ou65: () => mOU(c, 6.5),
    cs: () => mCS(c), dc: () => mDC(c), htft: () => mHTFT(c),
    ht1x2: () => mHalf1x2(c, true), sh1x2: () => mHalf1x2(c, false),
    htbtts: () => mHalfBtts(c, true), shbtts: () => mHalfBtts(c, false),
    htou05: () => mHalfOU(c, 0.5, true), htou15: () => mHalfOU(c, 1.5, true),
    shou05: () => mHalfOU(c, 0.5, false), shou15: () => mHalfOU(c, 1.5, false),
    ah05: () => mAH(c, 0.5), ah15: () => mAH(c, 1.5), ah25: () => mAH(c, 2.5),
    hg: () => mTeamGoals(c, true, null), ag: () => mTeamGoals(c, false, null),
    hgo15: () => mTeamGoals(c, true, 1.5), ago15: () => mTeamGoals(c, false, 1.5), hgo25: () => mTeamGoals(c, true, 2.5),
    winNil: () => mWinNil(c),
    multi23: () => mRange(c, 2, 3), multi46: () => mRange(c, 4, 6), multi01: () => mRange(c, 0, 1), multi7p: () => mRange(c, 7, 99),
    scoreFirst: () => mScoreFirst(c, false), scoreLast: () => mScoreFirst(c, true),
    winEitherHalf: () => mWinEitherHalf(c, side),
    bttsInBothH: () => mBttsBothHalves(c),
    goalFirst10: () => mWindow(c, 0, 10),
    goalLast10: () => mWindow(c, 80, 90, 1.15),
    goalAfter80: () => mWindow(c, 80, 94, 1.15),
    fgMethod: () => mFgMethod(c),
    res_gg: () => mResCombo(c, "gg"), res_o25: () => mResCombo(c, "o25"), res_u25: () => mResCombo(c, "u25"),
    asianTotal: () => mAsianTotal(c, nd(i, "asianLine", 2.5)),
    euroHand: () => mEuroHand(c, nd(i, "hand", 0)),
    oddEven: () => mOddEven(c), highHalf: () => mHighHalf(c),
    team2p: () => mTeamNPlus(c, side, 2), team3p: () => mTeamNPlus(c, side, 3),
    homeBH: () => mTeamBothHalves(c, true), awayBH: () => mTeamBothHalves(c, false),
  };
  return map[id]?.() ?? null;
}
