import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as danPost } from "@/app/api/smjene/zatvori-dan/route";
import { GET } from "@/app/api/izvjestaji/z/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { naplataU } from "./pomocnici-faza5";
import { ocisti, osoblje, pripremiOkruzenje, zahtjev, type Osoba } from "./pomocnici";

type Z = {
  datum: string;
  zatvoren: boolean;
  zatvorenoU: string | null;
  zatvorila: string | null;
  promijenjenoNakonZatvaranja: boolean;
  pdv: null;
  racuni: number;
  bruto: number;
  popust: number;
  ukupno: number;
  naplaceno: number;
  gotovina: number;
  kartica: number;
  baksis: number;
  noviDug: number;
  naplaceniDugovi: { broj: number; gotovina: number; kartica: number };
  poNacinu: { nacin: string; broj: number; ukupno: number; baksis: number }[];
  storna: { razlog: string; broj: number; vrijednost: number }[];
  popusti: { razlog: string; broj: number; iznos: number }[];
};

const DAN = "2026-01-15";
// Midday in Sarajevo on that day.
const U_DANU = "2026-01-15T11:00:00.000Z";

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

const url = (datum?: string) => `/api/izvjestaji/z${datum ? `?datum=${datum}` : ""}`;

async function z(datum = DAN) {
  const odgovor = await GET(zahtjev(url(datum), { kolacici: [ljudi.sefica.kolacic] }));
  expect(odgovor.status).toBe(200);
  return ((await odgovor.json()) as { izvjestaj: Z }).izvjestaj;
}

async function popunjenDan() {
  const db = await demoBaza();
  const k = ljudi.konobar.id;
  await naplataU(k, U_DANU, { ukupno: 20, nacin: "gotovina", gotovina: 50, kusur: 28 }); // tip 2
  await naplataU(k, U_DANU, { ukupno: 30, nacin: "kartica", kartica: 33 }); // tip 3
  const sPopustom = await naplataU(k, U_DANU, { bruto: 40, ukupno: 34, nacin: "gotovina" });
  await db.query("update public.racuni set popust_procenat = 15, popust_razlog = 'Stalni gost' where id = $1", [sPopustom]);
  await naplataU(k, U_DANU, { ukupno: 12, nacin: "dug", duznik: "Tajni Gost" });
  // An old debt collected today.
  const stari = await naplataU(k, "2026-01-10T11:00:00.000Z", { ukupno: 7, nacin: "dug", duznik: "Drugi Gost" });
  await db.query("update public.racuni set status = 'placen' where id = $1", [stari]);
  await db.query(
    "insert into public.naplate_dugova (racun_id, request_id, nacin, iznos, zaposlenik_id, vrijeme) values ($1, $2, 'kartica', 7, $3, $4::text::timestamptz)",
    [stari, randomUUID(), ljudi.sefica.id, U_DANU],
  );
  await db.query(
    `insert into public.dnevnik_radnji (zaposlenik_id, radnja, detalji, vrijeme) values
       ($1, 'storno', '{"razlog":"Gost odustao","stavke":[{"vrijednost":5},{"vrijednost":1.5}]}', $2::text::timestamptz),
       ($1, 'storno', '{"razlog":"Drugo","stavke":[{"vrijednost":9}]}', $2::text::timestamptz)`,
    [k, U_DANU],
  );
}

describe("access and shape", () => {
  it("needs a session", async () => {
    expect((await GET(zahtjev(url(DAN)))).status).toBe(401);
  });

  it.each(["konobar", "kuhinja", "pecenjara", "mesnica"] as const)("refuses %s", async (uloga) => {
    expect((await GET(zahtjev(url(DAN), { kolacici: [ljudi[uloga].kolacic] }))).status).toBe(403);
    await expect(demoRpc("z_izvjestaj", { p_sefica: ljudi[uloga].id, p_datum: DAN })).rejects.toThrow("Nemate pravo na ovu radnju.");
  });

  it.each(["03.11.2026", "2026-02-30", "sutra"])("rejects the date %s", async (datum) => {
    expect((await GET(zahtjev(url(datum), { kolacici: [ljudi.sefica.kolacic] }))).status).toBe(400);
  });

  it("refuses a day that has not started", async () => {
    const odgovor = await GET(zahtjev(url("2999-01-01"), { kolacici: [ljudi.sefica.kolacic] }));
    expect(odgovor.status).toBe(422);
    expect(((await odgovor.json()) as { greska: string }).greska).toBe("Taj dan još nije počeo.");
  });

  it("with no date, reports today", async () => {
    const odgovor = await GET(zahtjev(url(), { kolacici: [ljudi.sefica.kolacic] }));
    const { rows } = await (await demoBaza()).query<{ d: string }>("select public.danas_u_sarajevu()::text as d");
    expect(((await odgovor.json()) as { izvjestaj: Z }).izvjestaj.datum).toBe(rows[0].d);
  });

  it("returns exactly the agreed fields, with zeros on an empty day", async () => {
    expect(await z()).toEqual({
      datum: DAN,
      zatvoren: false,
      zatvorenoU: null,
      zatvorila: null,
      promijenjenoNakonZatvaranja: false,
      pdv: null,
      racuni: 0,
      bruto: 0,
      popust: 0,
      ukupno: 0,
      naplaceno: 0,
      gotovina: 0,
      kartica: 0,
      baksis: 0,
      noviDug: 0,
      naplaceniDugovi: { broj: 0, gotovina: 0, kartica: 0 },
      poNacinu: [],
      storna: [],
      popusti: [],
    });
  });
});

describe("a day still open", () => {
  it("reports every figure, live", async () => {
    await popunjenDan();
    expect(await z()).toMatchObject({
      zatvoren: false,
      pdv: null,
      racuni: 4,
      bruto: 102,
      popust: 6,
      ukupno: 96,
      naplaceno: 84,
      gotovina: 56,
      kartica: 33,
      baksis: 5,
      noviDug: 12,
      naplaceniDugovi: { broj: 1, gotovina: 0, kartica: 7 },
      poNacinu: [
        { nacin: "gotovina", broj: 2, ukupno: 54, baksis: 2 },
        { nacin: "kartica", broj: 1, ukupno: 30, baksis: 3 },
        { nacin: "dug", broj: 1, ukupno: 12, baksis: 0 },
      ],
      storna: [
        { razlog: "Drugo", broj: 1, vrijednost: 9 },
        { razlog: "Gost odustao", broj: 2, vrijednost: 6.5 },
      ],
      popusti: [{ razlog: "Stalni gost", broj: 1, iznos: 6 }],
    });
  });

  it("uses the one report formula, field for field", async () => {
    await popunjenDan();
    const { rows } = await (await demoBaza()).query<{ v: Record<string, unknown> }>(
      "select public.izvjestaj_raspona($1::text::date, $1::text::date) as v",
      [DAN],
    );
    const izvjestaj = await z();
    for (const polje of ["racuni", "bruto", "popust", "ukupno", "naplaceno", "gotovina", "kartica", "baksis", "noviDug", "naplaceniDugovi", "poNacinu", "storna", "popusti"]) {
      expect(izvjestaj[polje as keyof Z], polje).toEqual(rows[0].v[polje]);
    }
  });

  it("names no guest and no menu line", async () => {
    await popunjenDan();
    const tekst = JSON.stringify(await z());
    expect(tekst).not.toContain("Tajni Gost");
    expect(tekst).not.toContain("poKonobaru");
    expect(tekst).not.toContain(ljudi.konobar.ime);
  });

  it("cuts at midnight in Sarajevo, not UTC", async () => {
    await naplataU(ljudi.konobar.id, "2026-01-14T22:59:59.000Z", { ukupno: 5 });
    await naplataU(ljudi.konobar.id, "2026-01-14T23:00:00.000Z", { ukupno: 7 });
    await naplataU(ljudi.konobar.id, "2026-01-15T22:59:59.000Z", { ukupno: 11 });
    await naplataU(ljudi.konobar.id, "2026-01-15T23:00:00.000Z", { ukupno: 13 });
    expect(await z()).toMatchObject({ racuni: 2, ukupno: 18 });
  });
});

describe("a closed day", () => {
  async function zatvori() {
    const odgovor = await danPost(zahtjev("/api/smjene/zatvori-dan", { tijelo: { datum: DAN }, kolacici: [ljudi.sefica.kolacic] }));
    expect(odgovor.status).toBe(200);
  }

  it("says it is closed, and by whom", async () => {
    await popunjenDan();
    await zatvori();
    const izvjestaj = await z();
    expect(izvjestaj).toMatchObject({ zatvoren: true, zatvorila: ljudi.sefica.ime, promijenjenoNakonZatvaranja: false, ukupno: 96, pdv: null });
    expect(izvjestaj.zatvorenoU).toEqual(expect.any(String));
  });

  it("shows the stored figures, not a new calculation", async () => {
    await popunjenDan();
    await zatvori();
    await naplataU(ljudi.konobar.id, U_DANU, { ukupno: 100 });
    const izvjestaj = await z();
    expect(izvjestaj).toMatchObject({ zatvoren: true, racuni: 4, ukupno: 96, promijenjenoNakonZatvaranja: true });
  });

  it("shows a stored figure even where the live one could never produce it", async () => {
    await zatvori();
    await (await demoBaza()).query("update public.dnevni_zakljucci set izvjestaj = izvjestaj || '{\"ukupno\": 1234.5}' where datum = $1::text::date", [DAN]);
    expect((await z()).ukupno).toBe(1234.5);
  });

  it("does not call a day changed because a waiter was renamed", async () => {
    await popunjenDan();
    await zatvori();
    const { id, ime } = ljudi.konobar;
    const db = await demoBaza();
    await db.query("update public.zaposlenici set ime = 'Novo Ime' where id = $1", [id]);
    try {
      expect((await z()).promijenjenoNakonZatvaranja).toBe(false);
    } finally {
      await db.query("update public.zaposlenici set ime = $1 where id = $2", [ime, id]);
    }
  });

  it("clears the warning once she closes it again", async () => {
    await zatvori();
    await naplataU(ljudi.konobar.id, U_DANU, { ukupno: 100 });
    await zatvori();
    expect(await z()).toMatchObject({ ukupno: 100, promijenjenoNakonZatvaranja: false });
  });
});
