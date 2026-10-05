import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plava Zvijezda 2026 — Nogometna analiza" },
      {
        name: "description",
        content:
          "Plava Zvijezda 2026 objedinjuje Kvote Radar i napredni nogometni prediktor.",
      },
      {
        property: "og:title",
        content: "Plava Zvijezda 2026 — Nogometna analiza",
      },
      {
        property: "og:description",
        content:
          "Kvote Radar i napredni nogometni prediktor na jednom mjestu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pocetna,
});

function Pocetna() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-primary/25 bg-card p-6 shadow-sm sm:p-10">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">
            Nogometna analiza
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
            Plava Zvijezda 2026
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Dva povezana alata za analizu nogometnih utakmica, kvota i statističkih
            vjerojatnosti. Odaberi modul koji želiš koristiti.
          </p>
        </header>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <Link
            to="/radar"
            className="group rounded-3xl border border-border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg sm:p-8"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-3xl text-primary-foreground">
              📡
            </div>
            <h2 className="mt-6 text-2xl font-black">Kvote Radar</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Provjeri BTTS, Over 1.5, Over 2.5, kornere, Under 3.5 i disciplinu
              kroz jasne protokole i tržišne kvote.
            </p>
            <span className="mt-6 inline-flex font-bold text-primary">
              Otvori Kvote Radar →
            </span>
          </Link>

          <Link
            to="/prediktor"
            className="group rounded-3xl border border-border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg sm:p-8"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-3xl text-primary-foreground">
              ⭐
            </div>
            <h2 className="mt-6 text-2xl font-black">Napredni prediktor</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Unesi očekivane golove i kvote, zatim dobiješ vjerojatnosti za rezultat,
              1X2, golove, BTTS i value bet procjenu.
            </p>
            <span className="mt-6 inline-flex font-bold text-primary">
              Otvori prediktor →
            </span>
          </Link>
        </section>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Analize su informativne i nisu jamstvo ishoda.
        </p>
      </div>
    </main>
  );
}
