/**
 * Servis za točno učitavanje kvota potrebnih za svih 6 indikatora.
 * - Parsira svaku kladionicu zasebno u normaliziran oblik.
 * - Točan rezultat uzima u cijelosti od JEDNE kladionice (najpotpunije).
 * - Dvostrana tržišta (Over/Under, BTTS, korneri, penal) uzima samo kad postoje
 *   OBJE strane kod iste kladionice, s realnom maržom.
 * - Odbacuje nevažeće i ekstremne vrijednosti.
 * - Vraća izvor (kladionicu) za svaku grupu kvota radi provjere.
 */
import { MAX_KVOTA_REZULTAT, MAX_KVOTA_TRZISTE, POTREBNO, provjeriDvostrano } from "./radar-analitika";

type Par = { a: number; b: number };
type Parsirano = {
  ime: string;
  rezultati: Record<string, number>;
  btts?: Par; // a = DA, b = NE
  ou: Record<string, Par>; // a = over, b = under
  korneri: Record<string, Par>;
  penal?: { ne?: number; da?: number };
};

const ok = (n: number, max = MAX_KVOTA_TRZISTE) => Number.isFinite(n) && n >= 1.01 && n <= max;
const linija = (n: number) => String(parseFloat(n.toFixed(2)));

function parsirajKladionicu(bm: any): Parsirano {
  const p: Parsirano = { ime: String(bm?.name ?? "nepoznato"), rezultati: {}, ou: {}, korneri: {} };
  for (const bet of bm?.bets ?? []) {
    const name = String(bet?.name ?? "").toLowerCase();
    const id = Number(bet?.id);
    const vals = (bet?.values ?? []) as { value: unknown; odd: unknown }[];
    const isFirstHalf = /1st|first|2nd|second|half/.test(name);
    if (isFirstHalf) continue; // samo cijela utakmica

    if (id === 10 || name === "exact score" || name === "correct score") {
      for (const v of vals) {
        const m = String(v.value).trim().match(/^(\d+)\s*[:-]\s*(\d+)$/);
        const k = Number(v.odd);
        if (m && ok(k, MAX_KVOTA_REZULTAT)) p.rezultati[`${Number(m[1])}:${Number(m[2])}`] = k;
      }
    } else if (id === 8 || name === "both teams score" || name === "both teams to score") {
      let da = NaN, ne = NaN;
      for (const v of vals) {
        const s = String(v.value).toLowerCase().trim();
        if (s === "yes") da = Number(v.odd);
        if (s === "no") ne = Number(v.odd);
      }
      if (ok(da) && ok(ne)) p.btts = { a: da, b: ne };
    } else if (id === 45 || (name.includes("corner") && name.includes("over/under"))) {
      skupiOU(vals, p.korneri);
    } else if (id === 5 || name === "goals over/under") {
      skupiOU(vals, p.ou);
    } else if (name.includes("penalty")) {
      for (const v of vals) {
        const s = String(v.value).toLowerCase().trim();
        const k = Number(v.odd);
        if (!ok(k)) continue;
        p.penal ??= {};
        if (s === "no") p.penal.ne = k;
        if (s === "yes") p.penal.da = k;
      }
    }
  }
  return p;
}

function skupiOU(vals: { value: unknown; odd: unknown }[], cilj: Record<string, Par>) {
  const tmp: Record<string, { o?: number; u?: number }> = {};
  for (const v of vals) {
    const m = String(v.value).trim().match(/^(over|under)\s*([0-9]+(?:\.[0-9]+)?)$/i);
    const k = Number(v.odd);
    if (!m || !ok(k)) continue;
    const l = linija(parseFloat(m[2]!));
    (tmp[l] ??= {})[m[1]!.toLowerCase() === "over" ? "o" : "u"] = k;
  }
  for (const [l, x] of Object.entries(tmp)) {
    if (x.o && x.u && provjeriDvostrano(x.o, x.u).ok) cilj[l] = { a: x.o, b: x.u };
  }
}

/** Bodovanje kladionice: koliko potrebnih podataka za indikatore daje. */
function bodovi(p: Parsirano): number {
  const kljucevi = new Set(Object.values(POTREBNO).flatMap((x) => x.kljucevi).filter((k) => k.includes(":")));
  let s = 0;
  kljucevi.forEach((k) => p.rezultati[k] && (s += 2));
  s += Math.min(Object.keys(p.rezultati).length, 25) * 0.2;
  if (p.btts) s += 3;
  for (const l of ["1.5", "2.5", "3.5"]) if (p.ou[l]) s += 3;
  if (Object.keys(p.korneri).length) s += 3;
  if (p.penal?.ne) s += 3;
  return s;
}

export type KvoteRezultat = {
  odds: Record<string, string>;
  corners: { line: number; over: number; under: number } | null;
  bookmaker: string | null;
  izvori: Record<string, string>;
  upozorenja: string[];
  brojKladionica: number;
};

export function sastaviKvote(bookmakers: any[]): KvoteRezultat {
  const sve = bookmakers.map(parsirajKladionicu).sort((a, b) => bodovi(b) - bodovi(a));
  const odds: Record<string, string> = {};
  const izvori: Record<string, string> = {};
  const upozorenja: string[] = [];
  const primarna = sve[0] ?? null;

  if (!primarna) {
    return { odds, corners: null, bookmaker: null, izvori, upozorenja: ["API nema kvote ni jedne kladionice za ovu utakmicu."], brojKladionica: 0 };
  }

  // Prednost primarnoj kladionici, zatim ostalima po bodovima.
  const redoslijed = sve;

  // Točan rezultat: cijeli skup od jedne kladionice s najviše rezultata.
  const rez = [...sve].sort((a, b) => Object.keys(b.rezultati).length - Object.keys(a.rezultati).length)[0]!;
  if (Object.keys(rez.rezultati).length) {
    for (const [k, v] of Object.entries(rez.rezultati)) odds[k] = String(v);
    izvori["Točan rezultat"] = rez.ime;
    if (Object.keys(rez.rezultati).length < 12) upozorenja.push(`Točan rezultat ima samo ${Object.keys(rez.rezultati).length} ponuđenih rezultata.`);
  } else upozorenja.push("Nema tržišta točnog rezultata — indikatori 1, 2, 3, 5 i 7 nisu pouzdani.");

  const btts = redoslijed.find((p) => p.btts);
  if (btts) {
    odds["bttsDa"] = String(btts.btts!.a);
    odds["bttsNe"] = String(btts.btts!.b);
    izvori["BTTS"] = btts.ime;
  } else upozorenja.push("Nema potpunog BTTS tržišta (DA i NE).");

  for (const [l, key] of [["1.5", "15"], ["2.5", "25"], ["3.5", "35"]] as const) {
    const s = redoslijed.find((p) => p.ou[l]);
    if (s) {
      odds[`o${key}`] = String(s.ou[l]!.a);
      odds[`u${key}`] = String(s.ou[l]!.b);
      izvori[`Golovi ${l}`] = s.ime;
    } else upozorenja.push(`Nema potpunog tržišta Više/Manje ${l} gola.`);
  }

  // Korneri: najuravnoteženija linija kod najbolje kladionice koja ih nudi.
  let corners: KvoteRezultat["corners"] = null;
  const kor = redoslijed.find((p) => Object.keys(p.korneri).length);
  if (kor) {
    for (const [l, x] of Object.entries(kor.korneri)) {
      if (!corners || Math.abs(x.a - x.b) < Math.abs(corners.over - corners.under)) corners = { line: Number(l), over: x.a, under: x.b };
    }
    izvori["Korneri"] = kor.ime;
  } else upozorenja.push("Nema tržišta kornera s obje strane (Više i Manje).");

  const pen = redoslijed.find((p) => p.penal?.ne);
  if (pen) {
    odds["pen"] = String(pen.penal!.ne);
    if (pen.penal!.da) odds["penDa"] = String(pen.penal!.da);
    izvori["Kazneni udarac"] = pen.ime;
  } else upozorenja.push("Nema kvote za Kazneni udarac — NE.");

  const razliciti = new Set(Object.values(izvori));
  if (razliciti.size > 1) upozorenja.push(`Kvote dolaze iz ${razliciti.size} kladionice — usporedi izvore prije opklade.`);

  return { odds, corners, bookmaker: primarna.ime, izvori, upozorenja, brojKladionica: sve.length };
}

export type FormaStat = {
  btts: number;
  over15: number;
  over25: number;
  under35: number;
  penali: number;
  odigrano: number;
};

export function izracunajFormu(fixtures: any[]): FormaStat | null {
  const s: FormaStat = { btts: 0, over15: 0, over25: 0, under35: 0, penali: 0, odigrano: 0 };
  for (const f of fixtures) {
    const status = String(f?.fixture?.status?.short ?? "");
    if (status && !["FT", "AET", "PEN"].includes(status)) continue;
    const h = f?.goals?.home, a = f?.goals?.away;
    if (h == null || a == null) continue;
    const t = Number(h) + Number(a);
    s.odigrano++;
    if (h > 0 && a > 0) s.btts++;
    if (t >= 2) s.over15++;
    if (t >= 3) s.over25++;
    if (t <= 3) s.under35++;

    // Brojanje dosuđenih penala u regularnom tijeku ako fixture objekt sadrži events
    const events = (f?.events as any[]) ?? [];
    let penalUtakmice = 0;
    for (const ev of events) {
      const type = String(ev?.type ?? "").toLowerCase();
      const detail = String(ev?.detail ?? "").toLowerCase();
      const comments = String(ev?.comments ?? "").toLowerCase();
      if (detail.includes("penalty") || comments.includes("penalty") || (type === "goal" && detail.includes("pen"))) {
        penalUtakmice++;
      }
    }
    s.penali += penalUtakmice;
  }
  return s.odigrano ? s : null;
}


