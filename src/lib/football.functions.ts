import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sastaviKvote, izracunajFormu, type FormaStat } from "./kvote-servis.server";

const BASE = "https://v3.football.api-sports.io";
const TZ = "Europe/Zagreb";

function resolveKey(clientKey?: string | null): string | null {
  const k = clientKey?.trim() || process.env["API_FOOTBALL_KEY"]?.trim() || null;
  if (!k) return null;
  return k.replace(/^["']|["']$/g, "").trim();
}

async function call(path: string, clientKey?: string | null) {
  const key = resolveKey(clientKey);
  if (!key) {
    return {
      error: "Nedostaje API ključ. Unesi ga u Postavkama (⚙️) ili u .env.",
      data: null as unknown,
      remaining: -1,
    };
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "x-apisports-key": key,
      },
    });

    const remaining = Number(res.headers.get("x-ratelimit-requests-remaining") ?? "-1");

    if (res.status === 429) {
      return { error: "Dnevni limit API-ja dosegnut (429) — pokušaj sutra.", data: null, remaining };
    }
    if (!res.ok) {
      return { error: `API greška ${res.status}`, data: null, remaining };
    }

    const json = (await res.json()) as { errors?: unknown; response?: unknown };
    const errs =
      json.errors && Object.keys(json.errors as object).length
        ? JSON.stringify(json.errors)
        : null;

    if (errs) {
      return { error: errs, data: null, remaining };
    }

    return { error: null, data: json.response, remaining };
  } catch (err: any) {
    return {
      error: `Mrežna greška: ${err?.message || "Neuspjelo povezivanje"}`,
      data: null,
      remaining: -1,
    };
  }
}

// 1. Testiranje API ključa
export const testApiKey = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const key = resolveKey(data.apiKey);
    if (!key) return { ok: false, error: "Nije unesen API ključ." };

    try {
      const res = await fetch(`${BASE}/status`, {
        headers: { "x-apisports-key": key },
      });

      if (!res.ok) return { ok: false, error: `API greška ${res.status}` };

      const json = (await res.json()) as any;
      if (json.errors && Object.keys(json.errors).length > 0) {
        return { ok: false, error: JSON.stringify(json.errors) };
      }

      const resp = json.response;
      return {
        ok: true,
        plan: resp?.subscription?.plan ?? "Free",
        active: resp?.subscription?.active ?? true,
        current: resp?.requests?.current ?? 0,
        limit: resp?.requests?.limit_day ?? 100,
        email: resp?.account?.email ?? "",
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Greška pri testiranju" };
    }
  });

const fixtureQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  apiKey: z.string().optional(),
});

// 2. Dohvat svih utakmica dana
export const getFixtures = createServerFn({ method: "GET" })
  .inputValidator((d) => fixtureQuerySchema.parse(d))
  .handler(async ({ data }) => {
    const r = await call(
      `/fixtures?date=${data.date}&timezone=${encodeURIComponent(TZ)}`,
      data.apiKey
    );

    const list = ((r.data as any[]) ?? []).map((f) => ({
      id: f.fixture.id as number,
      time: f.fixture.date as string,
      league: `${f.league.country} — ${f.league.name}`,
      home: f.teams.home.name as string,
      away: f.teams.away.name as string,
      homeId: f.teams.home.id as number,
      awayId: f.teams.away.id as number,
    }));

    return { error: r.error, remaining: r.remaining ?? -1, fixtures: list };
  });

// 3. Dohvat kvota — bira najpotpuniju kladionicu, provjerava obje strane tržišta
const oddsSchema = z.object({ id: z.number().int().positive(), apiKey: z.string().optional() });

async function dohvatiKvote(id: number, apiKey?: string) {
  const bookmakers: any[] = [];
  let error: string | null = null;
  for (let page = 1; page <= 3; page++) {
    const r = await call(`/odds?fixture=${id}&page=${page}&timezone=${encodeURIComponent(TZ)}`, apiKey);
    if (r.error) { error = r.error; break; }
    const resp = (r.data as any[]) ?? [];
    for (const item of resp) bookmakers.push(...(item?.bookmakers ?? []));
    if (resp.length === 0 || page >= 3) break;
    if (bookmakers.length >= 8) break;
  }
  if (error && !bookmakers.length) return { error, ...sastaviKvote([]) };
  return { error: null as string | null, ...sastaviKvote(bookmakers) };
}

async function dohvatiFormu(teamId: number, apiKey?: string) {
  const r = await call(`/fixtures?team=${teamId}&last=5`, apiKey);
  if (r.error) return { error: r.error, stats: null };
  const stats = izracunajFormu((r.data as any[]) ?? []);
  return stats ? { error: null, stats } : { error: "Nema završenih utakmica za ovaj tim.", stats: null };
}

export const getFixtureOdds = createServerFn({ method: "GET" })
  .inputValidator((d) => oddsSchema.parse(d))
  .handler(async ({ data }) => dohvatiKvote(data.id, data.apiKey));

// 4. Forma zadnjih 5 utakmica
export const getTeamFormStats = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ teamId: z.number().int().positive(), apiKey: z.string().optional() }).parse(d))
  .handler(async ({ data }) => dohvatiFormu(data.teamId, data.apiKey));

// 5. Servis: sve kvote + forma obaju timova u jednom pozivu
export const getMatchBundle = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      id: z.number().int().positive(),
      homeId: z.number().int().positive().optional(),
      awayId: z.number().int().positive().optional(),
      apiKey: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const [kv, dom, gos] = await Promise.all([
      dohvatiKvote(data.id, data.apiKey),
      data.homeId ? dohvatiFormu(data.homeId, data.apiKey) : Promise.resolve({ error: "Nema ID domaćina", stats: null }),
      data.awayId ? dohvatiFormu(data.awayId, data.apiKey) : Promise.resolve({ error: "Nema ID gosta", stats: null }),
    ]);
    const odds = { ...kv.odds };
    const upozorenja = [...kv.upozorenja];
    const upisi = (s: FormaStat | null, suf: "a" | "b", ime: string) => {
      if (!s) { upozorenja.push(`Forma (${ime}) nije dostupna.`); return; }
      odds[`f1${suf}`] = String(s.btts);
      odds[`f2${suf}`] = String(s.over15);
      odds[`f3${suf}`] = String(s.over25);
      odds[`f5${suf}`] = String(s.under35);
      odds[`f7${suf}`] = String(s.penali); // Automatski upis za Kazneni udarac — NE (Kartica 7)
      if (s.odigrano < 5) upozorenja.push(`Forma (${ime}) temelji se na samo ${s.odigrano} utakmica.`);
    };
    upisi(dom.stats, "a", "domaćin");
    upisi(gos.stats, "b", "gost");
    return { ...kv, odds, upozorenja };
  });
