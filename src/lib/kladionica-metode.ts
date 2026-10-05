/**
 * Metode kladionica za BTTS i Over/Under analizu (Shin, Shading, Negativna binomna).
 */

import { broj, ispravnaKvota, pct, type IndikatorId, type RadarUlaz } from "./radar-analitika";

export type KladionicaMetodeRezultat = {
  shinFairA: number | null;
  shinFairB: number | null;
  shinMarza: number | null;
  zInsajder: number | null;
  shadingDetektiran: boolean;
  shadingPoruka: string | null;
  konzistentnostOk: boolean;
  konzistentnostRazlika: number | null;
  konzistentnostPoruka: string | null;
  negBinomVjerojatnost: number | null;
  signali: string[];
  upozorenja: string[];
};

export function shinDeMarza(kvotaA: number, kvotaB: number): {
  fairA: number;
  fairB: number;
  z: number;
  marza: number;
} | null {
  if (!ispravnaKvota(kvotaA) || !ispravnaKvota(kvotaB)) return null;

  const piA = 1 / kvotaA;
  const piB = 1 / kvotaB;
  const sumaPi = piA + piB;
  const marza = sumaPi - 1;

  if (marza <= 0) {
    return { fairA: piA / sumaPi, fairB: piB / sumaPi, z: 0, marza };
  }

  let lo = 0;
  let hi = Math.min(0.35, marza);
  let z = 0.02;

  const izracunajP = (pi: number, zVal: number): number => {
    const diskr = Math.pow(zVal, 2) + 4 * (1 - zVal) * (Math.pow(pi, 2) / sumaPi);
    return (Math.sqrt(Math.max(0, diskr)) - zVal) / (2 * (1 - zVal));
  };

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const pA = izracunajP(piA, mid);
    const pB = izracunajP(piB, mid);
    const sumP = pA + pB;

    if (Math.abs(sumP - 1) < 0.00001) {
      z = mid;
      break;
    }
    if (sumP > 1) lo = mid;
    else hi = mid;
    z = mid;
  }

  const fairA = Math.max(0.01, Math.min(0.99, izracunajP(piA, z)));
  const fairB = 1 - fairA;

  return { fairA, fairB, z, marza };
}

export function provjeriShading(
  nazivGlavnog: string,
  trzisnaKvota: number | null,
  modelVjerojatnost: number | null,
): { detektiran: boolean; poruka: string | null } {
  if (!trzisnaKvota || !modelVjerojatnost || !ispravnaKvota(trzisnaKvota)) {
    return { detektiran: false, poruka: null };
  }

  const impliciranaTrziste = 1 / trzisnaKvota;
  const razlika = impliciranaTrziste - modelVjerojatnost;

  if (razlika >= 0.08) {
    return {
      detektiran: true,
      poruka: `SHADING KLADIONICE: Kvota na ${nazivGlavnog} (${trzisnaKvota.toFixed(2)}) je skraćena zbog pritiska javnosti (model procjenjuje ${pct(modelVjerojatnost)} vs tržišnih ${pct(impliciranaTrziste)}).`,
    };
  }

  return { detektiran: false, poruka: null };
}

export function negBinomnaVjerojatnostGola(k: number, mu: number, r = 4.5): number {
  if (mu <= 0) return k === 0 ? 1 : 0;
  const p = r / (r + mu);
  let coeff = 1;
  for (let i = 0; i < k; i++) {
    coeff *= (i + r) / (i + 1);
  }
  return coeff * Math.pow(p, r) * Math.pow(1 - p, k);
}

export function negBinomZbrojGolova(lambdaTotal: number, uvjet: (golovi: number) => boolean, maxGolova = 12): number {
  let suma = 0;
  for (let g = 0; g <= maxGolova; g++) {
    if (uvjet(g)) {
      suma += negBinomnaVjerojatnostGola(g, lambdaTotal);
    }
  }
  return Math.min(1, Math.max(0, suma));
}

export function provjeriKonzistentnost(
  fairBttsTrziste: number | null,
  modelBttsIzRezultata: number | null,
): { ok: boolean; razlika: number | null; poruka: string | null } {
  if (fairBttsTrziste === null || modelBttsIzRezultata === null) {
    return { ok: true, razlika: null, poruka: null };
  }

  const razlika = Math.abs(fairBttsTrziste - modelBttsIzRezultata);

  if (razlika > 0.12) {
    return {
      ok: false,
      razlika,
      poruka: `NEKONZISTENTNOST TRŽIŠTA: Tržište BTTS (${pct(fairBttsTrziste)}) se ne podudara s točnim rezultatima (${pct(modelBttsIzRezultata)}) — razlika ${pct(razlika)}.`,
    };
  }

  return { ok: true, razlika, poruka: null };
}

export function primijeniMetodeKladionica(id: IndikatorId, ulaz: RadarUlaz): KladionicaMetodeRezultat {
  const { odds } = ulaz;
  const signali: string[] = [];
  const upozorenja: string[] = [];

  let shinFairA: number | null = null;
  let shinFairB: number | null = null;
  let shinMarza: number | null = null;
  let zInsajder: number | null = null;

  let kA: number | null = null;
  let kB: number | null = null;
  let nazivA = "";

  if (id === "1") {
    kA = broj(odds["bttsDa"]);
    kB = broj(odds["bttsNe"]);
    nazivA = "BTTS DA";
  } else if (id === "2") {
    kA = broj(odds["o15"]);
    kB = broj(odds["u15"]);
    nazivA = "Over 1.5";
  } else if (id === "3") {
    kA = broj(odds["o25"]);
    kB = broj(odds["u25"]);
    nazivA = "Over 2.5";
  } else if (id === "5") {
    kA = broj(odds["u35"]);
    kB = broj(odds["o35"]);
    nazivA = "Under 3.5";
  } else if (id === "7") {
    kA = broj(odds["pen"]);
    kB = broj(odds["penDa"]);
    nazivA = "Penal NE";
  }

  if (kA !== null && kB !== null && ispravnaKvota(kA) && ispravnaKvota(kB)) {
    const shin = shinDeMarza(kA, kB);
    if (shin) {
      shinFairA = shin.fairA;
      shinFairB = shin.fairB;
      shinMarza = shin.marza;
      zInsajder = shin.z;

      signali.push(
        `Shinova fer vjerojatnost (${nazivA}): ${pct(shin.fairA)} (insajder faktor z: ${(shin.z * 100).toFixed(1)}%)`,
      );

      if (shin.z > 0.08) {
        upozorenja.push(`Povišen rizik asimetrije na tržištu (Shin z = ${(shin.z * 100).toFixed(1)}%).`);
      }
    }
  }

  let negBinomVjerojatnost: number | null = null;
  const o25 = broj(odds["o25"]), u25 = broj(odds["u25"]);
  if (o25 && u25 && ispravnaKvota(o25) && ispravnaKvota(u25)) {
    const probOver = 1 / o25 / (1 / o25 + 1 / u25);
    const lambdaProcjena = probOver > 0.55 ? 2.9 : probOver < 0.45 ? 2.2 : 2.55;

    if (id === "1") {
      const pNulaA = negBinomnaVjerojatnostGola(0, lambdaProcjena * 0.53);
      const pNulaB = negBinomnaVjerojatnostGola(0, lambdaProcjena * 0.47);
      negBinomVjerojatnost = (1 - pNulaA) * (1 - pNulaB);
    } else if (id === "2") {
      negBinomVjerojatnost = negBinomZbrojGolova(lambdaProcjena, (g) => g >= 2);
    } else if (id === "3") {
      negBinomVjerojatnost = negBinomZbrojGolova(lambdaProcjena, (g) => g >= 3);
    } else if (id === "5") {
      negBinomVjerojatnost = negBinomZbrojGolova(lambdaProcjena, (g) => g <= 3);
    }

    if (negBinomVjerojatnost !== null) {
      signali.push(`Negativna binomna raspodjela: ${pct(negBinomVjerojatnost)}.`);
    }
  }

  const shading = provjeriShading(nazivA, kA, negBinomVjerojatnost ?? shinFairA);
  if (shading.detektiran && shading.poruka) {
    upozorenja.push(shading.poruka);
  }

  let konzistentnostOk = true;
  let konzistentnostRazlika: number | null = null;
  let konzistentnostPoruka: string | null = null;

  if (id === "1" && shinFairA !== null && negBinomVjerojatnost !== null) {
    const kon = provjeriKonzistentnost(shinFairA, negBinomVjerojatnost);
    konzistentnostOk = kon.ok;
    konzistentnostRazlika = kon.razlika;
    konzistentnostPoruka = kon.poruka;
    if (!kon.ok && kon.poruka) {
      upozorenja.push(kon.poruka);
    }
  }

  return {
    shinFairA,
    shinFairB,
    shinMarza,
    zInsajder,
    shadingDetektiran: shading.detektiran,
    shadingPoruka: shading.poruka,
    konzistentnostOk,
    konzistentnostRazlika,
    konzistentnostPoruka,
    negBinomVjerojatnost,
    signali,
    upozorenja,
  };
}



