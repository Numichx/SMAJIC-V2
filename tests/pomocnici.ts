import { NextRequest } from "next/server";
import { vi } from "vitest";
import { KOLACIC_SESIJE, type Uloga } from "@/lib/auth/session";
import { potpisi } from "@/lib/auth/sessionToken";
import { demoBaza } from "@/lib/demo/store";

// Shared by the phase 2 route tests: real routes, real SQL on PGlite.
const TAJNA = "t".repeat(43);

export const PIN_SEFICE = "4827";
export const PIN_KONOBARA = "5930";

export function pripremiOkruzenje() {
  vi.stubEnv("DEMO_BAZA", "memory://");
  vi.stubEnv("SESSION_SECRET", TAJNA);
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
}

export function zahtjev(
  url: string,
  opcije: { tijelo?: unknown; kolacici?: (string | null | undefined)[]; ip?: string } = {},
) {
  return new NextRequest(`http://localhost${url}`, {
    method: opcije.tijelo === undefined ? "GET" : "POST",
    body: opcije.tijelo === undefined ? undefined : JSON.stringify(opcije.tijelo),
    headers: {
      cookie: (opcije.kolacici ?? []).filter(Boolean).join("; "),
      "x-real-ip": opcije.ip ?? "10.0.0.1",
    },
  });
}

export type Osoba = { id: string; ime: string; kolacic: string };

// A signed session, because the login routes have their own tests and bcrypt is slow here.
export async function osoblje() {
  const db = await demoBaza();
  const { rows } = await db.query<{ id: string; ime: string; uloga: Uloga; sesija_verzija: number }>(
    "select id, ime, uloga, sesija_verzija from public.zaposlenici order by ime",
  );
  const poUlozi = {} as Record<Uloga, Osoba>;
  for (const { id, ime, uloga, sesija_verzija: v } of rows) {
    poUlozi[uloga] ??= {
      id,
      ime,
      kolacic: `${KOLACIC_SESIJE}=${potpisi("sesija", { id, ime, uloga, v }, TAJNA, 3600)}`,
    };
  }
  return poUlozi;
}

export async function proizvodi() {
  const db = await demoBaza();
  const { rows } = await db.query<{ id: string; naziv: string }>("select id, naziv from public.proizvodi");
  return Object.fromEntries(rows.map((r) => [r.naziv, r.id]));
}

export async function ocisti() {
  await (await demoBaza()).exec(`
    delete from public.dopune_sanka;
    delete from public.popisi_sanka;
    delete from public.popisi_pecenjare;
    delete from public.smjene;
    delete from public.uplate_pecenjari;
    delete from public.prometi_zaliha;
    delete from public.zahtjevi_mesnici;
    update public.zaliha_artikli set stanje = 0;
    delete from public.dnevni_zakljucci;
    delete from public.rezervacije;
    delete from public.naplate_dugova;
    delete from public.naplate;
    delete from public.statusi_narudzbe;
    delete from public.stavke_narudzbe;
    delete from public.narudzbe;
    delete from public.racun_stolovi;
    delete from public.racuni;
    delete from public.dnevnik_radnji;
    delete from public.pin_pokusaji;
    update public.proizvodi set aktivan = true;
  `);
}

export async function postaviPin(zaposlenik: string, pin: string) {
  await (await demoBaza()).query(
    "update public.zaposlenici set pin_hash = extensions.crypt($1, extensions.gen_salt('bf', 4)) where id = $2",
    [pin, zaposlenik],
  );
}
