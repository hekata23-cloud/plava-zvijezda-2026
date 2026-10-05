import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/prediktor")({
  head: () => ({
    meta: [
      { title: "Plava Zvijezda 2026 — Napredni prediktor" },
      {
        name: "description",
        content:
          "Nogometni prediktor vjerojatnosti za 1X2, rezultat, golove, BTTS i value bet.",
      },
      {
        property: "og:title",
        content: "Plava Zvijezda 2026 — Napredni prediktor",
      },
      {
        property: "og:description",
        content:
          "Izračunaj vjerojatnosti utakmice na temelju očekivanih golova.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Prediktor,
});

type Score = {
  home: number;
  away: number;
  probability: number;
};

function poisson(goals: number, lambda: number): number {
  let factorial = 1;

  for (let i = 2; i <= goals; i += 1) {
    factorial *= i;
  }

  return (Math.exp(-lambda) * Math.pow(lambda, goals)) / factorial;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function numberFromInput(value: string, fallback: number): number {
  const numberValue = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback;
}

function Prediktor() {
  const [homeName, setHomeName] = useState("Domaćin");
  const [awayName, setAwayName] = useState("Gost");
  const [homeXg, setHomeXg] = useState("1.55");
  const [awayXg, setAwayXg] = useState("1.10");
  const [homeOdds, setHomeOdds] = useState("");
  const [drawOdds, setDrawOdds] = useState("");
  const [awayOdds, setAwayOdds] = useState("");

  const model = useMemo(() => {
    const homeLambda = numberFromInput(homeXg, 1.55);
    const awayLambda = numberFromInput(awayXg, 1.1);

    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    let bttsYes = 0;
    let over15 = 0;
    let over25 = 0;
    let under35 = 0;
    const scores: Score[] = [];

    for (let home = 0; home <= 8; home += 1) {
      for (let away = 0; away <= 8; away += 1) {
        const probability = poisson(home, homeLambda) * poisson(away, awayLambda);

        if (home > away) homeWin += probability;
        if (home === away) draw += probability;
        if (home < away) awayWin += probability;
        if (home > 0 && away > 0) bttsYes += probability;
        if (home + away >= 2) over15 += probability;
        if (home + away >= 3) over25 += probability;
        if (home + away <= 3) under35 += probability;

        scores.push({ home, away, probability });
      }
    }

    const total = homeWin + draw + awayWin;
    const orderedScores = [...scores]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);

    return {
      homeLambda,
      awayLambda,
      homeWin: homeWin / total,
      draw: draw / total,
      awayWin: awayWin / total,
      bttsYes,
      bttsNo: 1 - bttsYes,
      over15,
      over25,
      under35,
      orderedScores,
    };
  }, [homeXg, awayXg]);

  const valueBet = (probability: number, oddsText: string) => {
    const odds = numberFromInput(oddsText, 0);

    if (odds < 1.01) {
      return "Unesi kvotu za value procjenu";
    }

    const fairOdds = 1 / probability;
    const edge = probability * odds - 1;

    if (edge > 0.05) {
      return `VALUE +${(edge * 100).toFixed(1)}% · fer kvota ${fairOdds.toFixed(2)}`;
    }

    if (edge > 0) {
      return `Mala prednost +${(edge * 100).toFixed(1)}% · fer kvota ${fairOdds.toFixed(2)}`;
    }

    return `Nema valuea · fer kvota ${fairOdds.toFixed(2)}`;
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
              Plava Zvijezda 2026
            </p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">
              Napredni prediktor
            </h1>
          </div>

          <nav className="flex gap-2">
            <Link
              to="/"
              className="rounded-xl border border-input px-4 py-2 text-sm font-bold hover:bg-accent"
            >
              Početna
            </Link>
            <Link
              to="/radar"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              Kvote Radar
            </Link>
          </nav>
        </header>

        <div className="grid gap-6 lg:grid-cols-[390px_1fr]">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Podaci utakmice</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Očekivani golovi (xG) su modelni unos. Unesi vlastitu procjenu na
              temelju forme, sastava i statistike.
            </p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-bold">Domaćin</span>
                <input
                  value={homeName}
                  onChange={(event) => setHomeName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold">xG domaćina</span>
                <input
                  type="number"
                  min="0"
                  step="0.05"
                  inputMode="decimal"
                  value={homeXg}
                  onChange={(event) => setHomeXg(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold">Gost</span>
                <input
                  value={awayName}
                  onChange={(event) => setAwayName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold">xG gosta</span>
                <input
                  type="number"
                  min="0"
                  step="0.05"
                  inputMode="decimal"
                  value={awayXg}
                  onChange={(event) => setAwayXg(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
                />
              </label>
            </div>

            <div className="mt-7 border-t border-border pt-5">
              <h3 className="font-black">Kvote za value bet</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Ovo je matematička usporedba tvoje kvote i procjene modela, ne
                jamstvo dobitka.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <label>
                  <span className="text-xs font-bold">1</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1.01"
                    step="0.01"
                    value={homeOdds}
                    onChange={(event) => setHomeOdds(event.target.value)}
                    placeholder="1.90"
                    className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label>
                  <span className="text-xs font-bold">X</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1.01"
                    step="0.01"
                    value={drawOdds}
                    onChange={(event) => setDrawOdds(event.target.value)}
                    placeholder="3.50"
                    className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label>
                  <span className="text-xs font-bold">2</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1.01"
                    step="0.01"
                    value={awayOdds}
                    onChange={(event) => setAwayOdds(event.target.value)}
                    placeholder="4.20"
                    className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-primary/25 bg-primary/5 p-5 sm:p-6">
              <p className="text-sm font-bold uppercase tracking-wider text-primary">
                Model očekivanih golova
              </p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                {homeName || "Domaćin"} {model.homeLambda.toFixed(2)} —{" "}
                {model.awayLambda.toFixed(2)} {awayName || "Gost"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ukupan očekivani broj golova:{" "}
                <strong className="text-foreground">
                  {(model.homeLambda + model.awayLambda).toFixed(2)}
                </strong>
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                title={`${homeName || "Domaćin"} pobjeda`}
                probability={model.homeWin}
                detail={valueBet(model.homeWin, homeOdds)}
              />
              <StatCard
                title="Neriješeno"
                probability={model.draw}
                detail={valueBet(model.draw, drawOdds)}
              />
              <StatCard
                title={`${awayName || "Gost"} pobjeda`}
                probability={model.awayWin}
                detail={valueBet(model.awayWin, awayOdds)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard title="BTTS — DA" probability={model.bttsYes} />
              <StatCard title="BTTS — NE" probability={model.bttsNo} />
              <StatCard title="Više od 1.5 gola" probability={model.over15} />
              <StatCard title="Više od 2.5 gola" probability={model.over25} />
              <StatCard title="Manje od 3.5 gola" probability={model.under35} />
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Najvjerojatniji rezultati</h2>
              <div className="mt-4 space-y-3">
                {model.orderedScores.map((score) => (
                  <div
                    key={`${score.home}-${score.away}`}
                    className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3"
                  >
                    <span className="font-black">
                      {homeName || "Domaćin"} {score.home} : {score.away}{" "}
                      {awayName || "Gost"}
                    </span>
                    <span className="font-bold text-primary">
                      {percent(score.probability)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
          Prediktor koristi Poissonov model. Rezultati su statističke procjene,
          nisu savjet za klađenje niti jamstvo ishoda.
        </p>
      </div>
    </main>
  );
}

function StatCard({
  title,
  probability,
  detail,
}: {
  title: string;
  probability: number;
  detail?: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-semibold text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-black text-primary">
        {percent(probability)}
      </p>
      {detail ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{detail}</p>
      ) : null}
    </article>
  );
}

