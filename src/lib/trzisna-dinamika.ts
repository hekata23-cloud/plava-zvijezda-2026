/**
 * Tržišna dinamika i varijanca kvota.
 *
 * Analizira logiku formiranja cijena kladionica:
 * 1. Razlika između kvote (cijene) i stvarne vjerojatnosti (bez marže)
 * 2. Detekcija režima: Uravnotežena knjiga (Balanced Book 50:50) vs Asimetrični favorit
 * 3. Detektor lažne sigurnosti favorita (upozorenje da autsajder s kvotom 2.20 prolazi u preko 40% slučajeva)
 * 4. Filter "nejasnih utakmica" (preširoka marža kao obrana kladionice)
 */

import {
  broj,
  fairVjerojatnosti,
  ispravnaKvota,
  marza,
  pct,
  type IndikatorId,
  type RadarUlaz,
} from "./radar-analitika";

export type TrzisniRezim = "BALANCED_BOOK" | "ASIMETRICNI_FAVORIT" | "NEPOTPUNO";

export type TrzisnaDinamikaRezultat = {
  rezim: TrzisniRezim;
  nazivFavorita: string | null;
  kvotaFavorita: number | null;
  pravaVjerojatnostFavorita: number | null;
  nazivAutsajdera: string | null;
  kvotaAutsajdera: number | null;
  pravaVjerojatnostAutsajdera: number | null;
  marzaTrzista: number | null;
  upozorenjeVarijance: string | null;
  signali: string[];
  upozorenja: string[];
};

export function analizirajTrzisnuDinamiku(id: IndikatorId, ulaz: RadarUlaz): TrzisnaDinamikaRezultat {
  const { odds } = ulaz;
  const signali: string[] = [];
  const upozorenja: string[] = [];

  let kA: number | null = null;
  let kB: number | null = null;
  let nazivA = "";
  let nazivB = "";

  if (id === "1") {
    kA = broj(odds["bttsDa"]);
    kB = broj(odds["bttsNe"]);
    nazivA = "BTTS DA";
    nazivB = "BTTS NE";
  } else if (id === "2") {
    kA = broj(odds["o15"]);
    kB = broj(odds["u15"]);
    nazivA = "Over 1.5";
    nazivB = "Under 1.5";
  } else if (id === "3") {
    kA = broj(odds["o25"]);
    kB = broj(odds["u25"]);
    nazivA = "Over 2.5";
    nazivB = "Under 2.5";
  } else if (id === "5") {
    kA = broj(odds["u35"]);
    kB = broj(odds["o35"]);
    nazivA = "Under 3.5";
    nazivB = "Over 3.5";
  } else if (id === "7") {
    kA = broj(odds["pen"]);
    kB = broj(odds["penDa"]);
    nazivA = "Penal NE";
    nazivB = "Penal DA";
  }

  if (!kA || !kB || !ispravnaKvota(kA) || !ispravnaKvota(kB)) {
    return {
      rezim: "NEPOTPUNO",
      nazivFavorita: null,
      kvotaFavorita: null,
      pravaVjerojatnostFavorita: null,
      nazivAutsajdera: null,
      kvotaAutsajdera: null,
      pravaVjerojatnostAutsajdera: null,
      marzaTrzista: null,
      upozorenjeVarijance: null,
      signali,
      upozorenja,
    };
  }

  const m = marza([kA, kB]);
  const [fairA, fairB] = fairVjerojatnosti([kA, kB]);

  const jeAFavorit = kA <= kB;
  const kFav = jeAFavorit ? kA : kB;
  const kAut = jeAFavorit ? kB : kA;
  const nazFav = jeAFavorit ? nazivA : nazivB;
  const nazAut = jeAFavorit ? nazivB : nazivA;
  const pFav = jeAFavorit ? fairA! : fairB!;
  const pAut = jeAFavorit ? fairB! : fairA!;

  const razlikaKvote = Math.abs(kA - kB);
  let rezim: TrzisniRezim = "ASIMETRICNI_FAVORIT";
  let upozorenjeVarijance: string | null = null;

  // 1. REŽIM: Uravnotežena knjiga (Balanced Book npr. 1.85 / 1.95 ili 1.90 / 1.90)
  if (razlikaKvote <= 0.15) {
    rezim = "BALANCED_BOOK";
    signali.push(
      `⚖️ Uravnoteženo tržište (Balanced Book): kvote ${kA.toFixed(2)} vs ${kB.toFixed(2)} (kladionica cilja na podjelu uplate 50:50 i zaradu isključivo na marži od ${pct(m)}).`,
    );
  } else {
    // 2. REŽIM: Asimetrični favorit (npr. 1.60 vs 2.20)
    rezim = "ASIMETRICNI_FAVORIT";
    signali.push(
      `🎯 Tržišna cijena: Favorit je ${nazFav} @ ${kFav.toFixed(2)} (prava vjerojatnost bez marže: ${pct(pFav)}).`,
    );
    signali.push(
      `🎲 Varijanca autsajdera: ${nazAut} @ ${kAut.toFixed(2)} ima čak ${pct(pAut)} stvarne vjerojatnosti.`,
    );

    // Detektor lažne sigurnosti: autsajder prolazi u više od 38% slučajeva
    if (pAut >= 0.38) {
      upozorenjeVarijance = `⚠️ LAŽNA SIGURNOST FAVORITA: Kvota ${kFav.toFixed(2)} na ${nazFav} izgleda privlačno, ali autsajder (${nazAut} @ ${kAut.toFixed(2)}) statistički prolazi u čak ${pct(pAut)} utakmica. Ovo nije zicer, pad favorita je očekivana varijanca!`;
      upozorenja.push(upozorenjeVarijance);
    }
  }

  // 3. Provjera širine marže ("Nejasna utakmica")
  if (m > 0.075) {
    upozorenja.push(
      `🛡️ Široka marža kladionice (${pct(m)}): Kladionica se štiti od neizvjesnosti ili manjka informacija višom provizijom.`,
    );
  }

  return {
    rezim,
    nazivFavorita: nazFav,
    kvotaFavorita: kFav,
    pravaVjerojatnostFavorita: pFav,
    nazivAutsajdera: nazAut,
    kvotaAutsajdera: kAut,
    pravaVjerojatnostAutsajdera: pAut,
    marzaTrzista: m,
    upozorenjeVarijance,
    signali,
    upozorenja,
  };
}

