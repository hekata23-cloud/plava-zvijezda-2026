/**
 * Radar analitika — "mozak" sustava.
 *
 * Čiste funkcije (bez mreže, bez stanja) koje se koriste i na serveru i u pregledniku.
 * Sadrži:
 * - Provjeru kvalitete podataka i marže (overround)
 * - Dixon-Coles model & Konsenzus (tržište + točan rezultat + Dixon-Coles + forma)
 * - Kvantitativne metode kladionica (Shin de-maržiranje, Shading detektor, Negativna binomna)
 * - Tržišnu dinamiku i varijancu (Balanced Book vs Asimetrični favorit, detektor lažne sigurnosti)
 * - Automatski Detektor zamki kvota kladionice (lažni signali i mamci)
 * - Automatski Value Bet kalkulator za oba smjera tržišta (matematički edge)
 * - Konkretan prijedlog tipa za svaki od 6 indikatora
 */

import { primijeniMetodeKladionica } from "./kladionica-metode";
import { analizirajTrzisnuDinamiku } from "./trzisna-dinamika";

export type Verdikt = "PROLAZI" | "GRANIČNO" | "PRESKOČI";
export type Pouzdanost = "visoka" | "srednja" | "niska";
export type IndikatorId = "1" | "2" | "3" | "4" | "5" | "7";

export type RadarUlaz = {
  odds: Record<string, string>;
  corners?: { line: number; over: number; under: number } | null;
};

export type RadarIzlaz = {
  verdikt: Verdikt;
  pouzdanost: Pouzdanost;
  razlozi: string[];
  signali: string[];
  nedostaje: string[];
};

// ---------- Osnovni izračuni ----------

export const MIN_KVOTA = 1.01;
export const MAX_KVOTA_TRZISTE = 50;
export const MAX_KVOTA_REZULTAT = 1000;

export function broj(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function ispravnaKvota(k: number | null, max = MAX_KVOTA_TRZISTE): k is number {
  return k !== null && k >= MIN_KVOTA && k <= max;
}

export const implicirana = (k: number) => 1 / k;

export function marza(kvote: number[]): number {
  return kvote.reduce((s, k) => s + 1 / k, 0) - 1;
}

export function fairVjerojatnosti(kvote: number[]): number[] {
  const sum = kvote.reduce((s, k) => s + 1 / k, 0);
  return kvote.map((k) => 1 / k / sum);
}

export function neuravnotezenost(a: number, b: number): number {
  const [pa, pb] = fairVjerojatnosti([a, b]);
  return Math.abs(pa! - pb!);
}

export type DvostranoTrziste = {
  ok: boolean;
  marza: number;
  fairA: number;
  fairB: number;
  problem?: string;
};

export function provjeriDvostrano(a: number | null, b: number | null): DvostranoTrziste {
  if (!ispravnaKvota(a) || !ispravnaKvota(b))
    return { ok: false, marza: NaN, fairA: NaN, fairB: NaN, problem: "nedostaje jedna strana tržišta ili je kvota izvan raspona" };
  const m = marza([a, b]);
  const [fa, fb] = fairVjerojatnosti([a, b]);
  if (m < -0.01) return { ok: false, marza: m, fairA: fa!, fairB: fb!, problem: `negativna marža (${pct(m)})` };
  if (m > 0.2) return { ok: false, marza: m, fairA: fa!, fairB: fb!, problem: `ekstremna marža (${pct(m)})` };
  return { ok: true, marza: m, fairA: fa!, fairB: fb! };
}

// ---------- Tržište točnog rezultata ----------

export type RezultatnoTrziste = {
  rezultati: { h: number; a: number; k: number }[];
  marza: number;
  pokrivenost: number;
};

export function rezultatnoTrziste(odds: Record<string, string>): RezultatnoTrziste {
  const rezultati: { h: number; a: number; k: number }[] = [];
  for (const [key, v] of Object.entries(odds)) {
    const m = key.match(/^(\d+):(\d+)$/);
    if (!m) continue;
    const k = broj(v);
    if (!ispravnaKvota(k, MAX_KVOTA_REZULTAT)) continue;
    rezultati.push({ h: Number(m[1]), a: Number(m[2]), k });
  }
  return { rezultati, marza: rezultati.length ? marza(rezultati.map((r) => r.k)) : NaN, pokrivenost: rezultati.length };
}

export function vjerojatnostIzRezultata(t: RezultatnoTrziste, uvjet: (h: number, a: number) => boolean): number | null {
  if (t.pokrivenost < 12) return null;
  const fair = fairVjerojatnosti(t.rezultati.map((r) => r.k));
  return t.rezultati.reduce((s, r, i) => (uvjet(r.h, r.a) ? s + fair[i]! : s), 0);
}

// ---------- Potrebni podaci po indikatoru ----------

export const POTREBNO: Record<IndikatorId, { kljucevi: string[]; dvostrano?: [string, string]; naziv: string }> = {
  "1": { naziv: "BTTS", kljucevi: ["2:2", "1:1", "1:0", "0:1"], dvostrano: ["bttsDa", "bttsNe"] },
  "2": { naziv: "Over 1.5", kljucevi: ["1:0", "0:0", "0:1"], dvostrano: ["o15", "u15"] },
  "3": { naziv: "Over 2.5", kljucevi: ["0:0", "1:0", "0:1", "1:1", "2:0", "0:2", "2:2"], dvostrano: ["o25", "u25"] },
  "4": { naziv: "Korneri", kljucevi: [] },
  "5": { naziv: "Under 3.5", kljucevi: ["0:0", "1:0", "0:1", "1:1", "2:0", "0:2", "2:1", "1:2"], dvostrano: ["u35", "o35"] },
  "7": { naziv: "Kazneni udarac", kljucevi: ["0:0", "pen"] },
};

const FORMA_PRAG: Partial<Record<IndikatorId, (a: number, b: number) => boolean>> = {
  "1": (a, b) => a >= 3 && b >= 3,
  "2": (a, b) => a + b >= 7,
  "3": (a, b) => a + b >= 6,
  "5": (a, b) => a + b >= 8,
  "7": (a, b) => a + b <= 1,
};

const TIP_UVJET: Partial<Record<IndikatorId, (h: number, a: number) => boolean>> = {
  "1": (h, a) => h > 0 && a > 0,
  "2": (h, a) => h + a >= 2,
  "3": (h, a) => h + a >= 3,
  "5": (h, a) => h + a <= 3,
};

// ---------- Glavna analiza ----------

export function analiziraj(id: IndikatorId, ulaz: RadarUlaz): RadarIzlaz {
  const { odds } = ulaz;
  const razlozi: string[] = [];
  const signali: string[] = [];
  const nedostaje: string[] = [];
  let tezina = 0;

  const p = POTREBNO[id];
  const t = rezultatnoTrziste(odds);

  for (const k of p.kljucevi) {
    const max = k.includes(":") ? MAX_KVOTA_REZULTAT : MAX_KVOTA_TRZISTE;
    if (!ispravnaKvota(broj(odds[k]), max)) nedostaje.push(k === "pen" ? "Kazneni udarac NE" : k);
  }
  if (id === "4") {
    const c = ulaz.corners;
    if (!c || !Number.isFinite(c.line) || !ispravnaKvota(c.over) || !ispravnaKvota(c.under)) nedostaje.push("korneri linija/više/manje");
  }
  if (nedostaje.length) {
    razlozi.push(`Nepotpune kvote: ${nedostaje.join(", ")}.`);
    tezina = 2;
  }

  if (p.kljucevi.some((k) => k.includes(":"))) {
    if (t.pokrivenost >= 12) {
      signali.push(`Marža točnog rezultata: ${pct(t.marza)} (${t.pokrivenost} rezultata).`);
      if (t.marza > 0.50 && t.pokrivenost < 30) {
        razlozi.push(`Neuobičajeno visoka marža točnog rezultata (${pct(t.marza)}).`);
        tezina = Math.max(tezina, 1);
      }
    } else if (t.pokrivenost > 0) {
      signali.push(`Tržište točnog rezultata ima samo ${t.pokrivenost} rezultata.`);
    }
  }

  if (p.dvostrano) {
    const [ka, kb] = p.dvostrano;
    const d = provjeriDvostrano(broj(odds[ka]), broj(odds[kb]));
    if (!d.ok) {
      signali.push(`Dvostrano tržište (${ka}/${kb}): ${d.problem}.`);
      tezina = Math.max(tezina, nedostaje.length ? 2 : 0);
    } else {
      signali.push(`Fair vjerojatnost tipa: ${pct(d.fairA)} · marža ${pct(d.marza)}.`);
      if (d.marza > 0.12) {
        razlozi.push(`Visoka marža dvostranog tržišta (${pct(d.marza)}).`);
        tezina = Math.max(tezina, 1);
      }
      const uvjet = TIP_UVJET[id];
      const izRez = uvjet ? vjerojatnostIzRezultata(t, uvjet) : null;
      if (izRez !== null) {
        const raz = d.fairA - izRez;
        signali.push(`Točan rezultat procjenjuje ${pct(izRez)} za tip.`);
        if (Math.abs(raz) > 0.20) {
          razlozi.push(`Značajan sukob tržišta: dvostrano ${pct(d.fairA)} vs točan rezultat ${pct(izRez)} (razlika ${pct(Math.abs(raz))}).`);
          tezina = Math.max(tezina, 1);
        }
      }
      if (d.fairA < 0.40) {
        razlozi.push(`Tržište tip ne vidi kao favorita (fair ${pct(d.fairA)}).`);
        tezina = Math.max(tezina, d.fairA < 0.30 ? 2 : 1);
      }
    }
  }

  if (id === "4" && ulaz.corners && ispravnaKvota(ulaz.corners.over) && ispravnaKvota(ulaz.corners.under)) {
    const d = provjeriDvostrano(ulaz.corners.over, ulaz.corners.under);
    if (!d.ok) {
      razlozi.push(`Tržište kornera: ${d.problem}.`);
      tezina = 2;
    } else {
      signali.push(`Korneri: marža ${pct(d.marza)}, asimetrija ${pct(Math.abs(d.fairA - d.fairB))}.`);
    }
  }

  if (id === "7") {
    const ne = broj(odds["pen"]), da = broj(odds["penDa"]);
    if (ispravnaKvota(ne) && ispravnaKvota(da)) {
      const d = provjeriDvostrano(ne, da);
      if (!d.ok) {
        razlozi.push(`Tržište penala: ${d.problem}.`);
        tezina = Math.max(tezina, 1);
      } else signali.push(`Penal NE fair ${pct(d.fairA)} · marža ${pct(d.marza)}.`);
    } else if (ispravnaKvota(ne)) {
      signali.push("Nema kvote za penal DA — marža se ne može provjeriti.");
    }
  }

  const fa = broj(odds[`f${id}a`]), fb = broj(odds[`f${id}b`]);
  const prag = FORMA_PRAG[id];
  if (prag && fa !== null && fb !== null) {
    if (!prag(fa, fb)) {
      razlozi.push(`Forma timova (${fa}/5 i ${fb}/5) ne podržava tip.`);
      tezina = Math.max(tezina, 1);
    } else signali.push(`Forma podržava tip (${fa}/5 i ${fb}/5).`);
  } else if (prag) {
    signali.push("Forma nije dostupna — pouzdanost je niža.");
  }

  // Konsenzus model (Dixon-Coles)
  const k = konsenzus(id, ulaz);
  if (k) {
    signali.push(`🧮 Konsenzus ${k.izvori.length} modela: ${pct(k.prosjek)} (${k.izvori.map((i) => `${i.naziv} ${pct(i.p)}`).join(" · ")}).`);
    if (k.izvori.length >= 2 && k.raspon > 0.25) {
      razlozi.push(`Izvori se razilaze (raspon ${pct(k.raspon)}) — procjena je nestabilna.`);
      tezina = Math.max(tezina, 1);
    }
    if (k.izvori.length >= 2 && k.prosjek < 0.45) {
      razlozi.push(`Konsenzus modela tip daje ispod 45 % (${pct(k.prosjek)}).`);
      tezina = Math.max(tezina, k.prosjek < 0.35 ? 2 : 1);
    }
  }

  // Kvantitativne metode kladionica (Shin, Negativna binomna, Shading detektor)
  const km = primijeniMetodeKladionica(id, ulaz);
  km.signali.forEach((s) => signali.push(`📐 ${s}`));
  km.upozorenja.forEach((u) => {
    razlozi.push(`🚨 ${u}`);
    tezina = Math.max(tezina, 1);
  });

  // Tržišna dinamika & Varijanca kvota
  const td = analizirajTrzisnuDinamiku(id, ulaz);
  td.signali.forEach((s) => signali.push(s));
  td.upozorenja.forEach((u) => {
    razlozi.push(u);
    tezina = Math.max(tezina, 1);
  });

  const verdikt: Verdikt = tezina >= 2 ? "PRESKOČI" : tezina === 1 ? "GRANIČNO" : "PROLAZI";
  const pouzdanost: Pouzdanost =
    nedostaje.length || tezina >= 2 ? "niska" : tezina === 1 || (prag && (fa === null || fb === null)) ? "srednja" : "visoka";
  return { verdikt, pouzdanost, razlozi, signali, nedostaje };
}

export function pokrivenost(ulaz: RadarUlaz): { id: IndikatorId; naziv: string; nedostaje: string[] }[] {
  return (Object.keys(POTREBNO) as IndikatorId[]).map((id) => ({
    id,
    naziv: POTREBNO[id].naziv,
    nedostaje: analiziraj(id, ulaz).nedostaje,
  }));
}

// ---------- Detektor zamke (lažnog tipa) ----------

export type Zamka = {
  aktivna: boolean;
  razlozi: string[];
  protuTip: string | null;
  fairProtu: number | null;
  kvotaProtu: number | null;
};

const PROTU: Record<IndikatorId, { naziv: string; uvjet?: (h: number, a: number) => boolean }> = {
  "1": { naziv: "BTTS NE", uvjet: (h, a) => h === 0 || a === 0 },
  "2": { naziv: "Under 1.5 golova", uvjet: (h, a) => h + a <= 1 },
  "3": { naziv: "Under 2.5 golova", uvjet: (h, a) => h + a <= 2 },
  "4": { naziv: "Korneri — suprotna strana" },
  "5": { naziv: "Over 3.5 golova", uvjet: (h, a) => h + a >= 4 },
  "7": { naziv: "Kazneni udarac DA" },
};

export function detektorZamke(id: IndikatorId, ulaz: RadarUlaz): Zamka {
  const { odds } = ulaz;
  const razlozi: string[] = [];
  let pTip: number | null = null;
  let kvotaProtu: number | null = null;

  const p = POTREBNO[id];
  if (p.dvostrano) {
    const d = provjeriDvostrano(broj(odds[p.dvostrano[0]]), broj(odds[p.dvostrano[1]]));
    if (d.ok) {
      pTip = d.fairA;
      kvotaProtu = broj(odds[p.dvostrano[1]]);
    }
  }
  if (id === "7") {
    const d = provjeriDvostrano(broj(odds["pen"]), broj(odds["penDa"]));
    if (d.ok) {
      pTip = d.fairA;
      kvotaProtu = broj(odds["penDa"]);
    }
  }
  if (id === "4" && ulaz.corners) {
    const d = provjeriDvostrano(ulaz.corners.over, ulaz.corners.under);
    if (d.ok) pTip = Math.max(d.fairA, d.fairB);
  }

  const uvjet = TIP_UVJET[id];
  const t = rezultatnoTrziste(odds);
  const pRez = uvjet ? vjerojatnostIzRezultata(t, uvjet) : null;

  if (pTip !== null && pTip < 0.45) {
    razlozi.push(`Glavno tržište tipu daje samo ${pct(pTip)} — kvota je prividni mamac.`);
  }

  if (pRez !== null && pRez < 0.40) {
    razlozi.push(`Tržište točnog rezultata tipu daje samo ${pct(pRez)}.`);
  }

  if (pTip !== null && pRez !== null && pRez - pTip > 0.18) {
    razlozi.push(`Točan rezultat je nerealno napuhan (${pct(pRez)} vs tržišnih ${pct(pTip)}) — moguća zamka platforme.`);
  }

  const fa = broj(odds[`f${id}a`]), fb = broj(odds[`f${id}b`]);
  const prag = FORMA_PRAG[id];
  if (prag && fa !== null && fb !== null && !prag(fa, fb) && pTip !== null && pTip < 0.50) {
    razlozi.push(`I forma timova (${fa}/5, ${fb}/5) i kvote su protiv ovog tipa.`);
  }

  const aktivna = razlozi.length > 0;
  const pp = pTip !== null ? 1 - pTip : pRez !== null ? 1 - pRez : null;
  const protuTip = aktivna && pp !== null && pp >= 0.55 && id !== "4" ? PROTU[id].naziv : null;

  return {
    aktivna,
    razlozi,
    protuTip,
    fairProtu: protuTip ? pp : null,
    kvotaProtu,
  };
}

// ---------- Value Bet kalkulator ----------

export type OpcijaValue = {
  naziv: string;
  kvota: number;
  fairP: number;
  edge: number;
};

export type ValueBetRezultat = {
  glavni: OpcijaValue | null;
  suprotni: OpcijaValue | null;
  najbolji: OpcijaValue | null;
  imaValue: boolean;
  konkretanTip: string;
  obrazlozenje: string;
};

export function izracunajValueBet(id: IndikatorId, ulaz: RadarUlaz, zamka?: Zamka): ValueBetRezultat {
  const { odds } = ulaz;
  let fairGlavni: number | null = null;
  let kvotaGlavni: number | null = null;
  let nazivGlavni = POTREBNO[id].naziv;

  let fairSuprotni: number | null = null;
  let kvotaSuprotni: number | null = null;
  let nazivSuprotni = PROTU[id]?.naziv ?? "Suprotna opcija";

  const k = konsenzus(id, ulaz);

  if (id === "1") {
    nazivGlavni = "BTTS DA";
    nazivSuprotni = "BTTS NE";
    kvotaGlavni = broj(odds["bttsDa"]);
    kvotaSuprotni = broj(odds["bttsNe"]);
    fairGlavni = k?.prosjek ?? (kvotaGlavni && kvotaSuprotni ? fairVjerojatnosti([kvotaGlavni, kvotaSuprotni])[0]! : null);
    if (fairGlavni !== null) fairSuprotni = 1 - fairGlavni;
  } else if (id === "2") {
    nazivGlavni = "Over 1.5 golova";
    nazivSuprotni = "Under 1.5 golova";
    kvotaGlavni = broj(odds["o15"]);
    kvotaSuprotni = broj(odds["u15"]);
    fairGlavni = k?.prosjek ?? (kvotaGlavni && kvotaSuprotni ? fairVjerojatnosti([kvotaGlavni, kvotaSuprotni])[0]! : null);
    if (fairGlavni !== null) fairSuprotni = 1 - fairGlavni;
  } else if (id === "3") {
    nazivGlavni = "Over 2.5 golova";
    nazivSuprotni = "Under 2.5 golova";
    kvotaGlavni = broj(odds["o25"]);
    kvotaSuprotni = broj(odds["u25"]);
    fairGlavni = k?.prosjek ?? (kvotaGlavni && kvotaSuprotni ? fairVjerojatnosti([kvotaGlavni, kvotaSuprotni])[0]! : null);
    if (fairGlavni !== null) fairSuprotni = 1 - fairGlavni;
  } else if (id === "4") {
    if (ulaz.corners && ispravnaKvota(ulaz.corners.over) && ispravnaKvota(ulaz.corners.under)) {
      const L = ulaz.corners.line;
      nazivGlavni = `Više od ${L} kornera`;
      nazivSuprotni = `Manje od ${L} kornera`;
      kvotaGlavni = ulaz.corners.over;
      kvotaSuprotni = ulaz.corners.under;
      const [fo, fu] = fairVjerojatnosti([kvotaGlavni, kvotaSuprotni]);
      fairGlavni = fo!;
      fairSuprotni = fu!;
    }
  } else if (id === "5") {
    nazivGlavni = "Under 3.5 golova";
    nazivSuprotni = "Over 3.5 golova";
    kvotaGlavni = broj(odds["u35"]);
    kvotaSuprotni = broj(odds["o35"]);
    fairGlavni = k?.prosjek ?? (kvotaGlavni && kvotaSuprotni ? fairVjerojatnosti([kvotaGlavni, kvotaSuprotni])[0]! : null);
    if (fairGlavni !== null) fairSuprotni = 1 - fairGlavni;
  } else if (id === "7") {
    nazivGlavni = "Kazneni udarac: NE";
    nazivSuprotni = "Kazneni udarac: DA";
    kvotaGlavni = broj(odds["pen"]);
    kvotaSuprotni = broj(odds["penDa"]);
    if (kvotaGlavni && kvotaSuprotni) {
      const [fne, fda] = fairVjerojatnosti([kvotaGlavni, kvotaSuprotni]);
      fairGlavni = fne!;
      fairSuprotni = fda!;
    } else if (kvotaGlavni) {
      const z = broj(odds["0:0"]);
      fairGlavni = z ? Math.min(0.85, Math.max(0.65, 1 - 1 / z)) : 0.75;
    }
  }

  let opGlavni: OpcijaValue | null = null;
  if (fairGlavni !== null && kvotaGlavni !== null && ispravnaKvota(kvotaGlavni)) {
    opGlavni = { naziv: nazivGlavni, kvota: kvotaGlavni, fairP: fairGlavni, edge: fairGlavni * kvotaGlavni - 1 };
  }

  let opSuprotni: OpcijaValue | null = null;
  if (fairSuprotni !== null && kvotaSuprotni !== null && ispravnaKvota(kvotaSuprotni)) {
    opSuprotni = { naziv: nazivSuprotni, kvota: kvotaSuprotni, fairP: fairSuprotni, edge: fairSuprotni * kvotaSuprotni - 1 };
  }

  const opcije = [opGlavni, opSuprotni].filter((o): o is OpcijaValue => o !== null);
  const najbolji = opcije.length ? opcije.reduce((a, b) => (b.edge > a.edge ? b : a)) : null;
  const imaValue = najbolji !== null && najbolji.edge >= 0.03;

  let konkretanTip = "NEMA DOVOLJNO PODATAKA";
  let obrazlozenje = "Nedostaju kvote za potpunu matematičku analizu.";

  if (zamka?.aktivna) {
    if (zamka.protuTip && opSuprotni && opSuprotni.fairP >= 0.55) {
      konkretanTip = `${opSuprotni.naziv} @ ${opSuprotni.kvota.toFixed(2)}`;
      obrazlozenje = `Detektirana zamka na glavnom tipu! Suprotna opcija ima fair vjerojatnost ${pct(opSuprotni.fairP)}${opSuprotni.edge > 0 ? ` uz Value prednost +${pct(opSuprotni.edge)}` : ""}.`;
    } else {
      konkretanTip = "PRESKOČI UTAKMICU";
      obrazlozenje = "Detektiran je mamac kladionice i rizik je previsok.";
    }
  } else if (imaValue && najbolji) {
    konkretanTip = `${najbolji.naziv} @ ${najbolji.kvota.toFixed(2)}`;
    obrazlozenje = `Izvrstan omjer! Fair vjerojatnost ${pct(najbolji.fairP)} daje matematičku prednost (Value edge: +${pct(najbolji.edge)}) nad kladionicom.`;
  } else if (opGlavni && opGlavni.fairP >= 0.58) {
    konkretanTip = `${opGlavni.naziv} @ ${opGlavni.kvota.toFixed(2)}`;
    obrazlozenje = `Tip je statistički favorit (${pct(opGlavni.fairP)}), ali kvota nema izražen matematički value (${pct(opGlavni.edge)}). Ulog umjeren.`;
  } else if (najbolji) {
    konkretanTip = "PRESKOČI UTAKMICU";
    obrazlozenje = `Niti jedna opcija nema pozitivan value (najbolji edge je tek ${pct(najbolji.edge)}). Marža kladionice pojela je vrijednost.`;
  }

  return { glavni: opGlavni, suprotni: opSuprotni, najbolji, imaValue, konkretanTip, obrazlozenje };
}

// ---------- Spajanje s postojećim pravilima ----------

export type OsnovniRezultat = { ok: boolean; warn?: boolean; title: string; detail: string; extra?: string | undefined } | null;

export function primijeniRadar(
  r: OsnovniRezultat,
  radar: RadarIzlaz,
  zamka?: Zamka,
  valueBet?: ValueBetRezultat,
): OsnovniRezultat {
  if (!r || r.title === "Neispravan unos") return r;

  const osnovni: Verdikt = !r.ok ? "PRESKOČI" : r.warn ? "GRANIČNO" : "PROLAZI";
  const red = { PROLAZI: 0, "GRANIČNO": 1, "PRESKOČI": 2 } as const;
  let konacni = red[radar.verdikt] > red[osnovni] ? radar.verdikt : osnovni;

  const linije: string[] = [];
  const zamkaPali = zamka?.aktivna;

  if (zamkaPali && zamka) {
    konacni = "PRESKOČI";
    linije.push("🚨 DETEKTOR ZAMKE: Kvote skrivaju zamku kladionice!");
    zamka.razlozi.forEach((x) => linije.push(`🚨 ${x}`));
    linije.push(
      zamka.protuTip
        ? `🎯 Protu-napad kladionici: ${zamka.protuTip} (fair ${pct(zamka.fairProtu!)})`
        : "🎯 Nema sigurnog protu-tipa — preskoči utakmicu.",
    );
  }

  if (valueBet) {
    linije.push("💎 VALUE BET ANALIZA:");
    if (valueBet.glavni) {
      const e = valueBet.glavni.edge;
      const predznak = e > 0 ? "+" : "";
      linije.push(`• ${valueBet.glavni.naziv}: kvota ${valueBet.glavni.kvota.toFixed(2)} · fair ${pct(valueBet.glavni.fairP)} · Edge: ${predznak}${pct(e)} ${e >= 0.03 ? "💎 VALUE!" : ""}`);
    }
    if (valueBet.suprotni) {
      const e = valueBet.suprotni.edge;
      const predznak = e > 0 ? "+" : "";
      linije.push(`• ${valueBet.suprotni.naziv}: kvota ${valueBet.suprotni.kvota.toFixed(2)} · fair ${pct(valueBet.suprotni.fairP)} · Edge: ${predznak}${pct(e)} ${e >= 0.03 ? "💎 VALUE!" : ""}`);
    }
    linije.push(`🎯 KONKRETAN PRIJEDLOG TIPA: ${valueBet.konkretanTip}`);
    linije.push(`ℹ️ ${valueBet.obrazlozenje}`);
  }

  linije.push(`🧠 RADAR: ${radar.verdikt} · pouzdanost ${radar.pouzdanost}`);
  radar.razlozi.forEach((x) => linije.push(`⚠️ ${x}`));
  radar.signali.forEach((x) => linije.push(`• ${x}`));

  const extra = [r.extra, linije.join("\n")].filter(Boolean).join("\n");

  if (konacni === osnovni && !zamkaPali) {
    let t = r.title;
    if (valueBet?.imaValue && valueBet.najbolji) {
      t = `${r.title} 💎 [VALUE +${pct(valueBet.najbolji.edge)}]`;
    }
    return { ...r, title: t, extra };
  }

  let title = r.title.replace(/^(PROLAZI|GRANIČNO|NE PROLAZI)/, konacni === "PRESKOČI" ? "NE PROLAZI" : konacni);
  if (zamkaPali) {
    title = `🚨 ZAMKA — ${zamka!.protuTip ? `igraj ${zamka!.protuTip}` : "preskoči"}`;
  } else if (valueBet?.imaValue && valueBet.najbolji) {
    title = `${title} 💎 [VALUE +${pct(valueBet.najbolji.edge)}]`;
  }

  return konacni === "PRESKOČI"
    ? { ...r, ok: false, warn: false, title, extra }
    : { ...r, ok: true, warn: true, title, extra };
}

// ---------- Dixon-Coles Bivariatni Model & Konsenzus ----------

export function poisson(l: number, n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return (Math.exp(-l) * Math.pow(l, n)) / f;
}

const doN = (l: number, n: number) => {
  let s = 0;
  for (let i = 0; i <= n; i++) s += poisson(l, i);
  return s;
};

export function lambdaIzU25(pU25: number): number {
  let lo = 0.1, hi = 8;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (doN(m, 2) > pU25) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

export function dixonColesTau(x: number, y: number, lambda: number, mu: number, rho = -0.11): number {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

export function dixonColesMatrica(lambdaH: number, muA: number, rho = -0.11, maxGolova = 8): number[][] {
  const grid: number[][] = [];
  let ukupno = 0;
  for (let h = 0; h <= maxGolova; h++) {
    grid[h] = [];
    const ph = poisson(lambdaH, h);
    for (let a = 0; a <= maxGolova; a++) {
      const pa = poisson(muA, a);
      const tau = dixonColesTau(h, a, lambdaH, muA, rho);
      const prob = Math.max(0, ph * pa * tau);
      grid[h][a] = prob;
      ukupno += prob;
    }
  }

  if (ukupno > 0) {
    for (let h = 0; h <= maxGolova; h++) {
      for (let a = 0; a <= maxGolova; a++) {
        grid[h][a] /= ukupno;
      }
    }
  }
  return grid;
}

export type Konsenzus = { prosjek: number; raspon: number; izvori: { naziv: string; p: number }[] };

export function konsenzus(id: IndikatorId, ulaz: RadarUlaz): Konsenzus | null {
  if (id === "4" || id === "7") return null;
  const { odds } = ulaz;
  const izvori: { naziv: string; p: number }[] = [];
  const p = POTREBNO[id];
  if (p.dvostrano) {
    const d = provjeriDvostrano(broj(odds[p.dvostrano[0]]), broj(odds[p.dvostrano[1]]));
    if (d.ok) izvori.push({ naziv: "tržište", p: d.fairA });
  }
  const t = rezultatnoTrziste(odds);
  const uvjet = TIP_UVJET[id];
  const pr = uvjet ? vjerojatnostIzRezultata(t, uvjet) : null;
  if (pr !== null) izvori.push({ naziv: "točan rez.", p: pr });

  const u = provjeriDvostrano(broj(odds["u25"]), broj(odds["o25"]));
  if (u.ok) {
    const L = lambdaIzU25(u.fairA);
    let udio = 0.53;
    if (t.pokrivenost >= 12) {
      const f = fairVjerojatnosti(t.rezultati.map((r) => r.k));
      const eh = t.rezultati.reduce((s, r, i) => s + r.h * f[i]!, 0);
      const ea = t.rezultati.reduce((s, r, i) => s + r.a * f[i]!, 0);
      if (eh + ea > 0) udio = eh / (eh + ea);
    }
    const lh = L * udio, la = L * (1 - udio);
    const matrica = dixonColesMatrica(lh, la, -0.11);

    let pp = 0;
    if (id === "1") {
      for (let h = 1; h < matrica.length; h++) {
        for (let a = 1; a < matrica[h].length; a++) {
          pp += matrica[h][a];
        }
      }
    } else if (id === "2") {
      for (let h = 0; h < matrica.length; h++) {
        for (let a = 0; a < matrica[h].length; a++) {
          if (h + a >= 2) pp += matrica[h][a];
        }
      }
    } else if (id === "3") {
      for (let h = 0; h < matrica.length; h++) {
        for (let a = 0; a < matrica[h].length; a++) {
          if (h + a >= 3) pp += matrica[h][a];
        }
      }
    } else if (id === "5") {
      for (let h = 0; h < matrica.length; h++) {
        for (let a = 0; a < matrica[h].length; a++) {
          if (h + a <= 3) pp += matrica[h][a];
        }
      }
    }

    izvori.push({ naziv: `Dixon-Coles (xG ${lh.toFixed(2)}:${la.toFixed(2)})`, p: pp });
  }

  const fa = broj(odds[`f${id}a`]), fb = broj(odds[`f${id}b`]);
  if (fa !== null && fb !== null) izvori.push({ naziv: "forma", p: (fa + fb) / 10 });

  if (!izvori.length) return null;
  const ps = izvori.map((i) => i.p);
  return { prosjek: ps.reduce((a, b) => a + b, 0) / ps.length, raspon: Math.max(...ps) - Math.min(...ps), izvori };
}

export function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(1)} %` : "—";
}
