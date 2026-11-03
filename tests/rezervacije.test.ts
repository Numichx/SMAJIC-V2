import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "@/app/api/rezervacije/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza } from "@/lib/demo/store";
import { brojRadnji } from "./pomocnici-faza5";
import { ocisti, osoblje, pripremiOkruzenje, zahtjev, type Osoba } from "./pomocnici";

type Rezervacija = {
  id: string;
  ime: string;
  brojGostiju: number;
  vrijeme: string;
  stoId: number | null;
  telefon: string | null;
  napomena: string | null;
  status: string;
  kreirao: string;
};

const GOST = "Gost Testni";

let ljudi: Record<Uloga, Osoba>;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => ocisti());

const k = (uloga: Uloga) => [ljudi[uloga].kolacic];
const uskoro = (minuta = 60) => new Date(Date.now() + minuta * 60_000).toISOString();

async function json<T>(odgovor: Response, status = 200) {
  const tijelo = (await odgovor.json()) as T & { greska?: string };
  expect(odgovor.status, tijelo.greska).toBe(status);
  return tijelo;
}

async function greska(odgovor: Response, status = 422) {
  return (await json<{ greska: string }>(odgovor, status)).greska;
}

const nova = (tijelo: Record<string, unknown> = {}, uloga: Uloga = "konobar") =>
  POST(zahtjev("/api/rezervacije", { tijelo: { requestId: randomUUID(), ime: GOST, brojGostiju: 4, vrijeme: uskoro(), ...tijelo }, kolacici: k(uloga) }));

async function napravi(tijelo: Record<string, unknown> = {}) {
  return (await json<{ rezervacija: Rezervacija }>(await nova(tijelo))).rezervacija;
}

const status = (id: string, s: string, uloga: Uloga = "konobar") =>
  PATCH(zahtjev("/api/rezervacije", { tijelo: { id, status: s }, kolacici: k(uloga) }));

const zaDan = async (upit = "", uloga: Uloga = "konobar") =>
  json<{ datum: string; rezervacije: Rezervacija[]; imaJos: boolean }>(await GET(zahtjev(`/api/rezervacije${upit}`, { kolacici: k(uloga) })));

// Puts a reservation at an exact moment, past or future, which the create route would refuse.
async function u(vrijeme: string, ime = GOST) {
  const { rows } = await (await demoBaza()).query<{ id: string }>(
    "insert into public.rezervacije (request_id, ime, broj_gostiju, vrijeme, kreirao_id) values ($1, $2, 2, $3::text::timestamptz, $4) returning id",
    [randomUUID(), ime, vrijeme, ljudi.konobar.id],
  );
  return rows[0].id;
}

describe("creating a reservation", () => {
  it("stores what the waiter typed, trimmed", async () => {
    const vrijeme = uskoro();
    const r = await napravi({ ime: `  ${GOST} `, vrijeme, stoId: 5, telefon: " 061 111 222 ", napomena: " Uz prozor " });
    expect(r).toMatchObject({ ime: GOST, brojGostiju: 4, stoId: 5, telefon: "061 111 222", napomena: "Uz prozor", status: "aktivna", kreirao: ljudi.konobar.ime });
    expect(new Date(r.vrijeme).toISOString()).toBe(vrijeme);
  });

  it("needs only a name, a head count and a time", async () => {
    expect(await napravi()).toMatchObject({ stoId: null, telefon: null, napomena: null });
  });

  it("turns a blank phone or note into nothing", async () => {
    expect(await napravi({ telefon: "  ", napomena: "  " })).toMatchObject({ telefon: null, napomena: null });
  });

  it("the manager can take one too", async () => {
    expect((await json<{ rezervacija: Rezervacija }>(await nova({}, "sefica"))).rezervacija.kreirao).toBe(ljudi.sefica.ime);
  });

  it("a double tap makes one", async () => {
    const requestId = randomUUID();
    const a = await napravi({ requestId });
    const b = await napravi({ requestId, ime: "Neko Drugi" });
    expect(b).toEqual(a);
    expect((await (await demoBaza()).query("select id from public.rezervacije")).rows).toHaveLength(1);
    expect(await brojRadnji("rezervacija_nova")).toBe(1);
  });

  it("refuses the past, and more than a year ahead", async () => {
    expect(await greska(await nova({ vrijeme: uskoro(-1) }))).toBe("Vrijeme rezervacije mora biti u budućnosti.");
    expect(await greska(await nova({ vrijeme: uskoro(60 * 24 * 367) }))).toBe("Rezervacija može biti najviše godinu dana unaprijed.");
  });

  it("refuses bad details", async () => {
    expect(await greska(await nova({ ime: "    " }))).toBe("Ime gosta mora imati od 2 do 100 znakova.");
    expect(await greska(await nova({ ime: "x".repeat(101) }))).toBe("Ime gosta mora imati od 2 do 100 znakova.");
    expect((await nova({ brojGostiju: 0 })).status).toBe(400);
    expect((await nova({ brojGostiju: 201 })).status).toBe(400);
    expect((await nova({ brojGostiju: 1.5 })).status).toBe(400);
    expect((await nova({ stoId: 21 })).status).toBe(400);
    expect((await nova({ vrijeme: "sutra" })).status).toBe(400);
    expect((await nova({ vrijeme: "2026-11-03T20:00:00" })).status).toBe(400);
    expect(await greska(await nova({ telefon: "1".repeat(41) }))).toMatch(/Telefon/);
    expect(await greska(await nova({ napomena: "x".repeat(501) }))).toMatch(/napomena/);
  });

  it("a formula in a name is stored as text and returned as text", async () => {
    expect((await napravi({ ime: "=cmd|' /C calc'!A0" })).ime).toBe("=cmd|' /C calc'!A0");
  });
});

describe("the day's list", () => {
  it("goes by the Sarajevo calendar day, earliest first", async () => {
    await u("2026-07-14T21:59:59.000Z", "Prije ponoći");
    await u("2026-07-15T18:00:00.000Z", "Veče");
    await u("2026-07-14T22:00:00.000Z", "Ponoć");
    await u("2026-07-15T21:59:59.000Z", "Kraj dana");
    await u("2026-07-15T22:00:00.000Z", "Sutra");

    const { datum, rezervacije } = await zaDan("?datum=2026-07-15");
    expect(datum).toBe("2026-07-15");
    expect(rezervacije.map((r) => r.ime)).toEqual(["Ponoć", "Veče", "Kraj dana"]);
  });

  it("holds all 25 hours of the day the clocks go back", async () => {
    await u("2026-10-24T22:00:00.000Z", "Prvi sat");
    await u("2026-10-25T22:59:59.000Z", "Zadnji sat");
    await u("2026-10-25T23:00:00.000Z", "Sutra");
    expect((await zaDan("?datum=2026-10-25")).rezervacije.map((r) => r.ime)).toEqual(["Prvi sat", "Zadnji sat"]);
  });

  it("with no date, is today in Sarajevo", async () => {
    const r = await napravi({ vrijeme: uskoro(1) });
    const { rows } = await (await demoBaza()).query<{ d: string; poklapa: boolean }>(
      `select to_char(public.danas_u_sarajevu(), 'YYYY-MM-DD') as d,
              ($1::text::timestamptz at time zone 'Europe/Sarajevo')::date = public.danas_u_sarajevu() as poklapa`,
      [r.vrijeme],
    );
    const { datum, rezervacije } = await zaDan();
    expect(datum).toBe(rows[0].d);
    // One minute ahead can cross midnight, and then it is rightly tomorrow's.
    expect(rezervacije.map((x) => x.id)).toEqual(rows[0].poklapa ? [r.id] : []);
  });

  it("shows cancelled and completed ones too", async () => {
    const r = await napravi({ vrijeme: uskoro(1) });
    await json(await status(r.id, "otkazana"));
    const dan = new Date(r.vrijeme);
    const { rows } = await (await demoBaza()).query<{ d: string }>("select to_char(($1::text::timestamptz at time zone 'Europe/Sarajevo')::date, 'YYYY-MM-DD') as d", [dan.toISOString()]);
    expect((await zaDan(`?datum=${rows[0].d}`)).rezervacije[0].status).toBe("otkazana");
  });

  it("pages", async () => {
    await (await demoBaza()).query(
      `insert into public.rezervacije (request_id, ime, broj_gostiju, vrijeme, kreirao_id)
       select gen_random_uuid(), 'Gost ' || i, 2, '2026-07-15T10:00:00Z'::timestamptz + (i || ' seconds')::interval, $1 from generate_series(1, 53) i`,
      [ljudi.konobar.id],
    );
    const prva = await zaDan("?datum=2026-07-15");
    const druga = await zaDan("?datum=2026-07-15&strana=2");
    expect([prva.rezervacije.length, prva.imaJos, druga.rezervacije.length, druga.imaJos]).toEqual([50, true, 3, false]);
    expect(new Set([...prva.rezervacije, ...druga.rezervacije].map((r) => r.id)).size).toBe(53);
  });
});

describe("changing a reservation's status", () => {
  it.each(["realizovana", "otkazana"])("moves an active one to %s, and logs it", async (s) => {
    const r = await napravi();
    expect((await json<{ rezervacija: Rezervacija }>(await status(r.id, s))).rezervacija.status).toBe(s);
    expect(await brojRadnji("rezervacija_status")).toBe(1);
  });

  it("a double tap reports the state and logs once", async () => {
    const r = await napravi();
    await json(await status(r.id, "otkazana"));
    expect((await json<{ rezervacija: Rezervacija }>(await status(r.id, "otkazana"))).rezervacija.status).toBe("otkazana");
    expect(await brojRadnji("rezervacija_status")).toBe(1);
  });

  it("does not move a finished one", async () => {
    const r = await napravi();
    await json(await status(r.id, "otkazana"));
    expect(await greska(await status(r.id, "realizovana"))).toBe("Rezervacija je već obrađena.");
  });

  it("cannot go back to active", async () => {
    const r = await napravi();
    expect((await status(r.id, "aktivna")).status).toBe(400);
  });

  it("refuses an unknown one", async () => {
    expect(await greska(await status(randomUUID(), "otkazana"))).toBe("Rezervacija nije pronađena.");
  });
});

describe("personal data", () => {
  it("keeps the name, phone and note out of the log", async () => {
    const telefon = "061999888";
    const napomena = "Tajna napomena";
    const r = await napravi({ telefon, napomena });
    await json(await status(r.id, "otkazana"));
    const { rows } = await (await demoBaza()).query("select detalji from public.dnevnik_radnji");
    const zapis = JSON.stringify(rows);
    expect(rows).toHaveLength(2);
    expect(zapis).not.toContain(GOST);
    expect(zapis).not.toContain(telefon);
    expect(zapis).not.toContain(napomena);
    expect(zapis).toContain(r.id);
  });
});
