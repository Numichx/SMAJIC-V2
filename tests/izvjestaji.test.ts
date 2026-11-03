import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as dugPost } from "@/app/api/administracija/dugovi/route";
import { uCsv } from "@/lib/domain/csv";
import { GET as csvGet } from "@/app/api/izvjestaji/csv/route";
import { GET as izvjestajGet } from "@/app/api/izvjestaji/route";
import { POST as stornoRuta } from "@/app/api/narudzbe/stavka/[id]/storno/route";
import { POST as popustRuta } from "@/app/api/racuni/[id]/popust/route";
import { GET as danGet, POST as danPost } from "@/app/api/smjene/zatvori-dan/route";
import { POST as smjenaPost } from "@/app/api/smjene/route";
import { GET as statistikaGet } from "@/app/api/statistika-konobara/route";
import { POST as prodajaPost } from "@/app/api/zaliha/prodaja/route";
import { POST as prometPost } from "@/app/api/zaliha/promet/route";
import { KOLACIC_UREDJAJA } from "@/lib/auth/pinOgranicenje";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza } from "@/lib/demo/store";
import { brojRadnji, jelo, naplataU, naruci, plati, pomjeri, racunStola } from "./pomocnici-faza5";
import { ocisti, osoblje, PIN_SEFICE, postaviPin, pripremiOkruzenje, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type Izvjestaj = {
  od: string;
  do: string;
  dani: number;
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
  popusti: { razlog: string; broj: number; iznos: number }[];
  storna: { razlog: string; broj: number; vrijednost: number }[];
  poKonobaru: { ime: string; racuni: number; naplaceno: number; dug: number; popust: number; baksis: number }[];
  poProizvodu: { naziv: string; kolicina: number; iznos: number }[];
  poDanu: { datum: string; racuni: number; bruto: number; popust: number; ukupno: number; baksis: number }[];
  mesnica: { broj: number; iznos: number };
  otvoreniRacuni: number;
  otvoreniDugovi: { broj: number; ukupno: number };
};
type Zakljucak = { datum: string; zatvorila: string; izvjestaj: Izvjestaj };

const DUZNIK = "Gost Testni";

let ljudi: Record<Uloga, Osoba>;
let id: Record<string, string>;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
  id = await proizvodi();
  await postaviPin(ljudi.sefica.id, PIN_SEFICE);
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => ocisti());

const k = (uloga: Uloga) => [ljudi[uloga].kolacic];

async function json<T>(odgovor: Response, status = 200) {
  const tijelo = (await odgovor.json()) as T & { greska?: string };
  expect(odgovor.status, tijelo.greska).toBe(status);
  return tijelo;
}

async function greska(odgovor: Response, status = 422) {
  return (await json<{ greska: string }>(odgovor, status)).greska;
}

const izvjestaj = async (dani = 1) =>
  (await json<{ izvjestaj: Izvjestaj }>(await izvjestajGet(zahtjev(`/api/izvjestaji?dani=${dani}`, { kolacici: k("sefica") })))).izvjestaj;

async function racunGotov(stavke: unknown[], sto = 1) {
  for (const n of await naruci(ljudi, stavke, sto)) await pomjeri(ljudi, n);
  return racunStola(ljudi, sto);
}

// Boundaries of today and of other days, as the database sees them. Real time, so tests hold at any hour.
async function pomak(izraz: string) {
  const { rows } = await (await demoBaza()).query<{ t: string }>(
    `select to_json((date_trunc('day', now() at time zone 'Europe/Sarajevo') ${izraz}) at time zone 'Europe/Sarajevo')#>>'{}' as t`,
  );
  return rows[0].t;
}

async function sql<T>(upit: string, parametri: unknown[] = []) {
  return (await (await demoBaza()).query<T & Record<string, unknown>>(upit, parametri)).rows;
}

const izvjestajRaspona = async (od: string, doDatuma: string) =>
  (await sql<{ v: Izvjestaj }>("select public.izvjestaj_raspona($1::text::date, $2::text::date) as v", [od, doDatuma]))[0].v;

const sifraDana = async (vrijeme: string) =>
  (await sql<{ d: string }>("select to_char((($1::text::timestamptz) at time zone 'Europe/Sarajevo')::date, 'YYYY-MM-DD') as d", [vrijeme]))[0].d;

describe("a day is a Sarajevo calendar day", () => {
  it.each([
    ["winter midnight, UTC+1", "2026-01-15", "2026-01-14T23:00:00.000Z"],
    ["summer midnight, UTC+2", "2026-07-15", "2026-07-14T22:00:00.000Z"],
    ["the day the clocks go forward starts on winter time", "2026-03-29", "2026-03-28T23:00:00.000Z"],
    ["the day after it starts on summer time", "2026-03-30", "2026-03-29T22:00:00.000Z"],
    ["the day the clocks go back starts on summer time", "2026-10-25", "2026-10-24T22:00:00.000Z"],
    ["the day after it starts on winter time", "2026-10-26", "2026-10-25T23:00:00.000Z"],
  ])("%s", async (_, datum, ocekivano) => {
    const { rows } = await (await demoBaza()).query<{ t: Date }>("select public.pocetak_dana($1::text::date) as t", [datum]);
    expect(new Date(rows[0].t).toISOString()).toBe(ocekivano);
  });

  it("holds whatever time zone the database session is in", async () => {
    const db = await demoBaza();
    await db.exec("set time zone 'America/New_York'");
    try {
      const { rows } = await db.query<{ t: Date }>("select public.pocetak_dana('2026-07-15') as t");
      expect(new Date(rows[0].t).toISOString()).toBe("2026-07-14T22:00:00.000Z");
    } finally {
      await db.exec("reset time zone");
    }
  });

  it("a payment just after midnight UTC+1 counts on the Sarajevo date, not the UTC date", async () => {
    await naplataU(ljudi.konobar.id, "2026-01-14T23:30:00.000Z", { ukupno: 7 });
    await naplataU(ljudi.konobar.id, "2026-01-14T22:59:59.000Z", { ukupno: 3 });
    expect((await izvjestajRaspona("2026-01-15", "2026-01-15")).ukupno).toBe(7);
    expect((await izvjestajRaspona("2026-01-14", "2026-01-14")).ukupno).toBe(3);
  });

  it("the 25-hour day holds all its hours, and neighbours keep theirs", async () => {
    const konobar = ljudi.konobar.id;
    await naplataU(konobar, "2026-10-24T21:59:59.000Z", { ukupno: 1 }); // 23:59:59 on the 24th, summer time
    await naplataU(konobar, "2026-10-24T22:00:00.000Z", { ukupno: 2 }); // 00:00:00 on the 25th
    await naplataU(konobar, "2026-10-25T00:30:00.000Z", { ukupno: 4 }); // 02:30, summer time
    await naplataU(konobar, "2026-10-25T01:30:00.000Z", { ukupno: 8 }); // 02:30 again, winter time
    await naplataU(konobar, "2026-10-25T22:59:59.000Z", { ukupno: 16 }); // 23:59:59 on the 25th, winter time
    await naplataU(konobar, "2026-10-25T23:00:00.000Z", { ukupno: 32 }); // 00:00:00 on the 26th

    expect((await izvjestajRaspona("2026-10-24", "2026-10-24")).ukupno).toBe(1);
    expect((await izvjestajRaspona("2026-10-25", "2026-10-25")).ukupno).toBe(30);
    expect((await izvjestajRaspona("2026-10-26", "2026-10-26")).ukupno).toBe(32);
    expect((await izvjestajRaspona("2026-10-24", "2026-10-26")).poDanu.map((d) => [d.datum, d.ukupno])).toEqual([
      ["2026-10-24", 1],
      ["2026-10-25", 30],
      ["2026-10-26", 32],
    ]);
  });

  it("the 23-hour day holds its hours, and neighbours keep theirs", async () => {
    const konobar = ljudi.konobar.id;
    await naplataU(konobar, "2026-03-28T22:59:59.000Z", { ukupno: 1 }); // 23:59:59 on the 28th, winter time
    await naplataU(konobar, "2026-03-28T23:00:00.000Z", { ukupno: 2 }); // 00:00:00 on the 29th
    await naplataU(konobar, "2026-03-29T21:59:59.000Z", { ukupno: 4 }); // 23:59:59 on the 29th, summer time
    await naplataU(konobar, "2026-03-29T22:00:00.000Z", { ukupno: 8 }); // 00:00:00 on the 30th

    expect((await izvjestajRaspona("2026-03-28", "2026-03-28")).ukupno).toBe(1);
    expect((await izvjestajRaspona("2026-03-29", "2026-03-29")).ukupno).toBe(6);
    expect((await izvjestajRaspona("2026-03-30", "2026-03-30")).ukupno).toBe(8);
  });

  it("voids and debt collections go by the same boundaries", async () => {
    const racun = await naplataU(ljudi.konobar.id, "2026-01-10T12:00:00.000Z", { nacin: "dug", ukupno: 20 });
    const db = await demoBaza();
    await db.query(
      "insert into public.naplate_dugova (racun_id, request_id, nacin, iznos, zaposlenik_id, vrijeme) values ($1, $2, 'gotovina', 20, $3, '2026-01-14T23:30:00.000Z')",
      [racun, randomUUID(), ljudi.sefica.id],
    );
    await db.query(
      `insert into public.dnevnik_radnji (zaposlenik_id, radnja, detalji, vrijeme)
       values ($1, 'storno', '{"razlog":"Drugo","stavke":[{"vrijednost":5}]}', '2026-01-14T22:59:59.000Z'),
              ($1, 'storno', '{"razlog":"Drugo","stavke":[{"vrijednost":9}]}', '2026-01-14T23:00:00.000Z')`,
      [ljudi.konobar.id],
    );
    const dan = await izvjestajRaspona("2026-01-15", "2026-01-15");
    expect(dan.naplaceniDugovi.gotovina).toBe(20);
    expect(dan.storna).toEqual([{ razlog: "Drugo", broj: 1, vrijednost: 9 }]);
    expect((await izvjestajRaspona("2026-01-14", "2026-01-14")).naplaceniDugovi.gotovina).toBe(0);
  });
});

describe("the 1, 7 and 30 day periods", () => {
  it("start at the Sarajevo midnight of today, 6 and 29 days back, and stop at this day's end", async () => {
    const konobar = ljudi.konobar.id;
    await naplataU(konobar, await pomak(""), { ukupno: 1 });
    await naplataU(konobar, await pomak("- interval '1 second'"), { ukupno: 2 });
    await naplataU(konobar, await pomak("- interval '6 days'"), { ukupno: 4 });
    await naplataU(konobar, await pomak("- interval '6 days 1 second'"), { ukupno: 8 });
    await naplataU(konobar, await pomak("- interval '29 days'"), { ukupno: 16 });
    await naplataU(konobar, await pomak("- interval '29 days 1 second'"), { ukupno: 32 });

    expect((await izvjestaj(1)).ukupno).toBe(1);
    expect((await izvjestaj(7)).ukupno).toBe(1 + 2 + 4);
    expect((await izvjestaj(30)).ukupno).toBe(1 + 2 + 4 + 8 + 16);
  });

  it("today is one day even in the database's other time zone", async () => {
    const db = await demoBaza();
    await naplataU(ljudi.konobar.id, await pomak(""), { ukupno: 1 });
    await db.exec("set time zone 'Pacific/Auckland'");
    try {
      expect((await izvjestaj(1)).ukupno).toBe(1);
    } finally {
      await db.exec("reset time zone");
    }
  });

  it("today is the Sarajevo date in any database session's time zone", async () => {
    const db = await demoBaza();
    const danas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sarajevo" }).format(new Date());
    // Between these two, at least one is on another calendar date at any hour.
    for (const zona of ["Pacific/Auckland", "Pacific/Honolulu"]) {
      await db.exec(`set time zone '${zona}'`);
      try {
        const prije = danas();
        const { rows } = await db.query<{ d: string }>("select to_char(public.danas_u_sarajevu(), 'YYYY-MM-DD') as d");
        // Tolerates the test itself crossing midnight.
        expect([prije, danas()]).toContain(rows[0].d);
      } finally {
        await db.exec("reset time zone");
      }
    }
  });

  it("names the dates it covers", async () => {
    const i = await izvjestaj(7);
    const danas = await sifraDana(new Date().toISOString());
    expect(i.do).toBe(danas);
    expect(i.dani).toBe(7);
    const razlika = (Date.parse(i.do) - Date.parse(i.od)) / 86_400_000;
    expect(razlika).toBe(6);
  });
});

describe("the report", () => {
  it("starts empty", async () => {
    expect(await izvjestaj()).toMatchObject({
      racuni: 0, bruto: 0, popust: 0, ukupno: 0, naplaceno: 0, gotovina: 0, kartica: 0, baksis: 0, noviDug: 0,
      naplaceniDugovi: { broj: 0, gotovina: 0, kartica: 0 },
      poNacinu: [], popusti: [], storna: [], poKonobaru: [], poProizvodu: [], poDanu: [],
      mesnica: { broj: 0, iznos: 0 },
      otvoreniRacuni: 0,
      otvoreniDugovi: { broj: 0, ukupno: 0 },
    });
  });

  it("shows payment types and tips from real payments, and the amounts reconcile", async () => {
    // Cash: 17 bill, 20 given, 2 back, so a 1 KM tip.
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "gotovina", gotovina: 20, vraceniKusur: 2 });
    // Card: 19 bill, 21 charged, so a 2 KM tip.
    await plati(ljudi, await racunGotov([jelo(id["Bečka šnicla"])], 2), { nacin: "kartica", kartica: 21 });
    // Combined: 19 bill, 10 cash and 10 card, nothing back, so a 1 KM tip.
    await plati(ljudi, await racunGotov([jelo(id["Pariška šnicla"])], 3), { nacin: "kombinovano", gotovina: 10, kartica: 10, vraceniKusur: 0 });
    // Debt: 22 and no money.
    await plati(ljudi, await racunGotov([jelo(id["Teleći medaljoni"])], 4), { nacin: "dug", gostDuznik: DUZNIK });

    const i = await izvjestaj();
    expect(i).toMatchObject({
      racuni: 4,
      bruto: 77,
      popust: 0,
      ukupno: 77,
      naplaceno: 55,
      gotovina: 28,
      kartica: 31,
      baksis: 4,
      noviDug: 22,
    });
    expect(i.poNacinu).toEqual([
      { nacin: "gotovina", broj: 1, ukupno: 17, baksis: 1 },
      { nacin: "kartica", broj: 1, ukupno: 19, baksis: 2 },
      { nacin: "kombinovano", broj: 1, ukupno: 19, baksis: 1 },
      { nacin: "dug", broj: 1, ukupno: 22, baksis: 0 },
    ]);
    expect(i.popusti).toEqual([]);
    // What came in is what was charged, plus tips.
    expect(i.gotovina + i.kartica).toBe(i.naplaceno + i.baksis);
    expect(i.naplaceno + i.noviDug).toBe(i.ukupno);
    expect(i.poKonobaru).toEqual([{ ime: ljudi.konobar.ime, racuni: 4, naplaceno: 55, dug: 22, popust: 0, baksis: 4 }]);
    expect(i.otvoreniDugovi).toEqual({ broj: 1, ukupno: 22 });
  });

  it("shows discounts by reason, gross and payable", async () => {
    const racun = await racunGotov([jelo(id["Natur šnicla"]), jelo(id["Bečka šnicla"])], 1);
    const popust = await popustRuta(
      zahtjev(`/api/racuni/${racun.id}/popust`, { tijelo: { procenat: 10, razlog: "Stalni gost", pin: PIN_SEFICE }, kolacici: [...k("konobar"), `${KOLACIC_UREDJAJA}=x`] }),
      { params: Promise.resolve({ id: racun.id }) },
    );
    expect(popust.status).toBe(200);
    await plati(ljudi, await racunStola(ljudi, 1), { nacin: "gotovina", gotovina: 32.4, vraceniKusur: 0 });

    const komp = await racunGotov([jelo(id["Pariška šnicla"])], 2);
    const drugi = await popustRuta(
      zahtjev(`/api/racuni/${komp.id}/popust`, { tijelo: { procenat: 100, razlog: "Častimo", pin: PIN_SEFICE }, kolacici: [...k("konobar"), `${KOLACIC_UREDJAJA}=x`] }),
      { params: Promise.resolve({ id: komp.id }) },
    );
    expect(drugi.status).toBe(200);
    await plati(ljudi, await racunStola(ljudi, 2), { nacin: "gotovina", gotovina: 0, vraceniKusur: 0 });

    const i = await izvjestaj();
    expect(i).toMatchObject({ racuni: 2, bruto: 55, popust: 22.6, ukupno: 32.4, naplaceno: 32.4 });
    // Either order: where Č sorts depends on the database locale.
    expect(i.popusti).toHaveLength(2);
    expect(i.popusti).toEqual(expect.arrayContaining([
      { razlog: "Častimo", broj: 1, iznos: 19 },
      { razlog: "Stalni gost", broj: 1, iznos: 3.6 },
    ]));
    expect(i.bruto - i.popust).toBeCloseTo(i.ukupno, 2);
    expect(i.poDanu[0]).toMatchObject({ bruto: 55, popust: 22.6, ukupno: 32.4 });
  });

  it("shows voids by reason at their original value, with a dish's sides", async () => {
    const racun = await racunGotov([jelo(id["Natur šnicla"], 1, [id["Pomfrit"], id["Riža"]]), jelo(id["Bečka šnicla"])], 1);
    const stavke = racun.narudzbe.flatMap((n) => n.stavke);
    const storniraj = async (naziv: string, razlog: string) => {
      const stavka = stavke.find((s) => s.naziv === naziv)!;
      const odgovor = await stornoRuta(
        zahtjev(`/api/narudzbe/stavka/${stavka.id}/storno`, { tijelo: { razlog }, kolacici: k("konobar") }),
        { params: Promise.resolve({ id: String(stavka.id) }) },
      );
      expect(odgovor.status).toBe(200);
    };
    await storniraj("Natur šnicla", "Greška kuhinje");

    const i = await izvjestaj();
    // The dish at 17, its free fries at 0 and its paid rice at 4, all under one reason.
    expect(i.storna).toEqual([{ razlog: "Greška kuhinje", broj: 3, vrijednost: 21 }]);

    await storniraj("Bečka šnicla", "Drugo");
    expect((await izvjestaj()).storna).toEqual([
      { razlog: "Drugo", broj: 1, vrijednost: 19 },
      { razlog: "Greška kuhinje", broj: 3, vrijednost: 21 },
    ]);
  });

  it("leaves voided lines out of products, and bills still open out of everything", async () => {
    const racun = await racunGotov([jelo(id["Natur šnicla"], 2), jelo(id["Bečka šnicla"])], 1);
    const becka = racun.narudzbe.flatMap((n) => n.stavke).find((s) => s.naziv === "Bečka šnicla")!;
    await stornoRuta(
      zahtjev(`/api/narudzbe/stavka/${becka.id}/storno`, { tijelo: { razlog: "Drugo" }, kolacici: k("konobar") }),
      { params: Promise.resolve({ id: String(becka.id) }) },
    );
    await plati(ljudi, await racunStola(ljudi, 1), { nacin: "gotovina", gotovina: 34, vraceniKusur: 0 });
    await racunGotov([jelo(id["Pariška šnicla"])], 2);

    const i = await izvjestaj();
    expect(i.ukupno).toBe(34);
    expect(i.poProizvodu).toEqual([{ naziv: "Natur šnicla", jedinica: "porcija", kolicina: 2, iznos: 34 }]);
    expect(i.otvoreniRacuni).toBe(1);
  });

  it("lists every product, biggest first, and the rows add up to the gross", async () => {
    const db = await demoBaza();
    const racun = await racunGotov([jelo(id["Natur šnicla"])], 1);
    await db.query(
      `insert into public.stavke_narudzbe (narudzba_id, proizvod_id, naziv, jedinica, kolicina, cijena)
       select $1, $2, 'Probni ' || i, 'kom', 1, i from generate_series(1, 25) i`,
      [racun.narudzbe[0].id, id["Natur šnicla"]],
    );
    const puni = await racunStola(ljudi, 1);
    await plati(ljudi, puni, { nacin: "gotovina", gotovina: puni.ukupno, vraceniKusur: 0 });

    const i = await izvjestaj();
    expect(i.poProizvodu).toHaveLength(26);
    expect(i.poProizvodu[0]).toMatchObject({ naziv: "Probni 25", iznos: 25 });
    expect(i.poProizvodu.at(-1)).toMatchObject({ naziv: "Probni 1", iznos: 1 });
    expect(i.poProizvodu.reduce((suma, p) => suma + p.iznos, 0)).toBe(i.bruto);

    const csv = await (await csvGet(zahtjev("/api/izvjestaji/csv", { kolacici: k("sefica") }))).text();
    expect(csv.split("\r\n").filter((r) => r.startsWith('"Proizvod"'))).toHaveLength(26);
  });

  it("splits the days of a longer period, and they add up", async () => {
    await naplataU(ljudi.konobar.id, await pomak("+ interval '1 minute'"), { ukupno: 5, bruto: 6 });
    await naplataU(ljudi.konobar.id, await pomak("- interval '1 minute'"), { ukupno: 7 });
    await naplataU(ljudi.konobar.id, await pomak("- interval '2 minutes'"), { ukupno: 1 });
    const i = await izvjestaj(7);
    expect(i.poDanu).toHaveLength(2);
    expect(i.poDanu.map((d) => d.ukupno)).toEqual([8, 5]);
    expect(i.poDanu.map((d) => d.racuni)).toEqual([2, 1]);
    expect(i.poDanu.reduce((s, d) => s + d.ukupno, 0)).toBe(i.ukupno);
    expect(i.poDanu[1].popust).toBe(1);
  });

  it("shows butcher sales", async () => {
    const db = await demoBaza();
    await db.exec("update public.zaliha_artikli set prodajna_cijena = 20 where naziv = 'Biftek'");
    const { rows } = await db.query<{ id: string }>("select id from public.zaliha_artikli where naziv = 'Biftek'");
    try {
      expect((await prometPost(zahtjev("/api/zaliha/promet", { tijelo: { requestId: randomUUID(), zalihaId: rows[0].id, stanje: 5, razlog: "Popis" }, kolacici: k("mesnica") }))).status).toBe(200);
      expect((await prodajaPost(zahtjev("/api/zaliha/prodaja", { tijelo: { requestId: randomUUID(), zalihaId: rows[0].id, kolicina: 1.5 }, kolacici: k("mesnica") }))).status).toBe(200);
      expect((await izvjestaj()).mesnica).toEqual({ broj: 1, iznos: 30 });
    } finally {
      await db.exec("update public.zaliha_artikli set prodajna_cijena = null where naziv = 'Biftek'");
    }
  });

  it("a collected debt counts when it was collected, and leaves the day it was made alone", async () => {
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "dug", gostDuznik: DUZNIK });
    const racun = (await sql<{ id: string }>("select id from public.racuni where status = 'na_dug'"))[0].id;
    const prije = await izvjestaj();

    expect((await dugPost(zahtjev("/api/administracija/dugovi", { tijelo: { requestId: randomUUID(), racunId: racun, nacin: "kartica" }, kolacici: k("sefica") }))).status).toBe(200);
    const poslije = await izvjestaj();
    expect(poslije).toMatchObject({ noviDug: 17, naplaceno: 0, ukupno: 17, naplaceniDugovi: { broj: 1, gotovina: 0, kartica: 17 }, otvoreniDugovi: { broj: 0, ukupno: 0 } });
    expect(poslije.poNacinu).toEqual(prije.poNacinu);
  });

  it("holds no guest name, anywhere", async () => {
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "dug", gostDuznik: DUZNIK });
    const i = await izvjestaj(30);
    expect(i.noviDug).toBe(17);
    expect(JSON.stringify(i)).not.toContain(DUZNIK);
    expect(await (await csvGet(zahtjev("/api/izvjestaji/csv?dani=30", { kolacici: k("sefica") }))).text()).not.toContain(DUZNIK);
    await json(await danPost(zahtjev("/api/smjene/zatvori-dan", { tijelo: {}, kolacici: k("sefica") })));
    const { rows } = await (await demoBaza()).query<{ detalji: unknown }>("select detalji from public.dnevnik_radnji");
    expect(JSON.stringify(rows)).not.toContain(DUZNIK);
    expect(JSON.stringify(await sql("select izvjestaj from public.dnevni_zakljucci"))).not.toContain(DUZNIK);
  });
});

describe("CSV cells", () => {
  const redovi = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

  it.each([
    ["=cmd|' /C calc'!A0", `"'=cmd|' /C calc'!A0"`],
    ["+1+1", `"'+1+1"`],
    ["-2+3", `"'-2+3"`],
    ["@SUM(A1)", `"'@SUM(A1)"`],
    ["  =1+1", `"'  =1+1"`],
    ["\t=1+1", `"'\t=1+1"`],
    ["\r=1+1", `"'\r=1+1"`],
    ["\n@x", `"'\n@x"`],
    ["＝1+1", `"'＝1+1"`],
    ["＋1", `"'＋1"`],
    ["－1", `"'－1"`],
    ["＠x", `"'＠x"`],
  ])("neutralises %j", (ulaz, izlaz) => {
    expect(redovi(uCsv([[ulaz]]))[0]).toBe(izlaz);
  });

  it.each([
    ["Haris", `"Haris"`],
    ["Čaj = dobar", `"Čaj = dobar"`],
    ["a-b", `"a-b"`],
    ["Nedžija Smajić", `"Nedžija Smajić"`],
    ["'citat", `"'citat"`],
  ])("leaves %j alone", (ulaz, izlaz) => {
    expect(redovi(uCsv([[ulaz]]))[0]).toBe(izlaz);
  });

  it("quotes a separator, a quote and a line break, so a cell cannot escape its column", () => {
    expect(uCsv([[`a;b`, `re"ci`, "dva\r\nreda"], ["x", null, 1]])).toBe(`﻿"a;b";"re""ci";"dva\r\nreda"\r\n"x";;1\r\n`);
    expect(uCsv([[`";=1+1;"`]])).toBe(`﻿""";=1+1;"""\r\n`);
  });

  it("a formula behind a quote stays inside its cell", () => {
    expect(redovi(uCsv([[`=HYPERLINK("http://x";"y")`]]))[0]).toBe(`"'=HYPERLINK(""http://x"";""y"")"`);
  });

  it("keeps real numbers as numbers, even negative, with a decimal comma", () => {
    expect(uCsv([[-12.5, 0, 1234.56, 7]])).toBe("﻿-12,5;0;1234,56;7\r\n");
  });

  it("starts with a BOM, and writes č ć š ž đ as they are", () => {
    const csv = uCsv([["čćšžđ"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("čćšžđ");
  });
});

describe("the CSV route", () => {
  it("downloads the report's figures, with the filename and no caching", async () => {
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "gotovina", gotovina: 20, vraceniKusur: 2.5 });
    const odgovor = await csvGet(zahtjev("/api/izvjestaji/csv?dani=7", { kolacici: k("sefica") }));
    expect(odgovor.status).toBe(200);
    expect(odgovor.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(odgovor.headers.get("content-disposition")).toBe('attachment; filename="izvjestaj-7-dana.csv"');
    expect(odgovor.headers.get("cache-control")).toBe("no-store");

    // Read as bytes, because Response.text() drops a BOM.
    const bajti = new Uint8Array(await odgovor.arrayBuffer());
    expect([...bajti.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const redovi = new TextDecoder().decode(bajti.slice(3)).split("\r\n");
    expect(redovi[0]).toBe(`"Vrsta";"Naziv";"Broj";"Iznos KM";"Bakšiš KM"`);
    expect(redovi).toContain(`"Sažetak";"Naplaćeno";;17;0,5`);
    expect(redovi).toContain(`"Sažetak";"Gotovina s bakšišem";;17,5;`);
    expect(redovi).toContain(`"Način plaćanja";"gotovina";1;17;0,5`);
    expect(redovi).toContain(`"Proizvod";"Natur šnicla";1;17;`);
    expect(redovi).toContain(`"Konobar";"${ljudi.konobar.ime}";1;17;0,5`);
  });

  it("neutralises a formula that gets in through a name in the database", async () => {
    const db = await demoBaza();
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "gotovina", gotovina: 17, vraceniKusur: 0 });
    await db.exec("update public.stavke_narudzbe set naziv = '=HYPERLINK(\"http://x\")'");
    await db.query("update public.zaposlenici set ime = '@SUM(A1)' where id = $1", [ljudi.konobar.id]);
    try {
      const csv = await (await csvGet(zahtjev("/api/izvjestaji/csv", { kolacici: k("sefica") }))).text();
      expect(csv).toContain(`"Proizvod";"'=HYPERLINK(""http://x"")";1;17;`);
      expect(csv).toContain(`"Konobar";"'@SUM(A1)";1;17;0`);
    } finally {
      await db.query("update public.zaposlenici set ime = $1 where id = $2", [ljudi.konobar.ime, ljudi.konobar.id]);
    }
  });
});

describe("waiter stats", () => {
  const statistika = async (dani = 1, uloga: Uloga = "konobar") =>
    (await json<{ statistika: Record<string, number> }>(await statistikaGet(zahtjev(`/api/statistika-konobara?dani=${dani}`, { kolacici: k(uloga) })))).statistika;

  it("start at zero", async () => {
    expect(await statistika()).toEqual({ dani: 1, brojRacuna: 0, naplaceno: 0, dug: 0, prosjecanRacun: 0, baksis: 0 });
  });

  it("add up this waiter's own bills, and no one else's", async () => {
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "gotovina", gotovina: 20, vraceniKusur: 2 });
    await plati(ljudi, await racunGotov([jelo(id["Bečka šnicla"])], 2), { nacin: "kartica", kartica: 20 });
    await plati(ljudi, await racunGotov([jelo(id["Teleći medaljoni"])], 3), { nacin: "dug", gostDuznik: DUZNIK });

    const { rows } = await (await demoBaza()).query<{ id: string }>("select id from public.zaposlenici where uloga = 'konobar' and id <> $1 limit 1", [ljudi.konobar.id]);
    await naplataU(rows[0].id, new Date().toISOString(), { ukupno: 500 });

    expect(await statistika()).toEqual({ dani: 1, brojRacuna: 3, naplaceno: 36, dug: 22, prosjecanRacun: 18, baksis: 2 });
  });

  it("go by the Sarajevo day", async () => {
    await naplataU(ljudi.konobar.id, await pomak(""), { ukupno: 1 });
    await naplataU(ljudi.konobar.id, await pomak("- interval '1 second'"), { ukupno: 2 });
    await naplataU(ljudi.konobar.id, await pomak("- interval '6 days'"), { ukupno: 4 });
    await naplataU(ljudi.konobar.id, await pomak("- interval '29 days'"), { ukupno: 8 });
    await naplataU(ljudi.konobar.id, await pomak("- interval '30 days'"), { ukupno: 16 });
    expect((await statistika(1)).naplaceno).toBe(1);
    expect((await statistika(7)).naplaceno).toBe(7);
    expect((await statistika(30)).naplaceno).toBe(15);
  });
});

describe("the daily close", () => {
  const zatvoriDan = (datum?: string) =>
    danPost(zahtjev("/api/smjene/zatvori-dan", { tijelo: datum ? { datum } : {}, kolacici: k("sefica") }));

  const pregled = async (datum?: string) =>
    json<{ danas: string; datum: string; zakljucak: Zakljucak | null; pregled: Izvjestaj; otvoreniRacuni: number; otvorenaSmjena: boolean }>(
      await danGet(zahtjev(`/api/smjene/zatvori-dan${datum ? `?datum=${datum}` : ""}`, { kolacici: k("sefica") })),
    );

  const danas = () => sifraDana(new Date().toISOString());
  const juce = async () => (await sql<{ d: string }>("select to_char(public.danas_u_sarajevu() - 1, 'YYYY-MM-DD') as d"))[0].d;

  it("stores the day's figures with who closed it", async () => {
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "gotovina", gotovina: 20, vraceniKusur: 2 });
    const { zakljucak } = await json<{ zakljucak: Zakljucak }>(await zatvoriDan());
    expect(zakljucak).toMatchObject({ datum: await danas(), zatvorila: ljudi.sefica.ime });
    expect(zakljucak.izvjestaj).toMatchObject({ racuni: 1, naplaceno: 17, gotovina: 18, baksis: 1, poNacinu: [{ nacin: "gotovina", broj: 1 }] });
    expect(await brojRadnji("dan_zatvoren")).toBe(1);

    const { zakljucak: naEkranu, pregled: uzivo, otvoreniRacuni, otvorenaSmjena, datum } = await pregled();
    expect(naEkranu).toEqual(zakljucak);
    expect(uzivo).toEqual(zakljucak.izvjestaj);
    expect(otvoreniRacuni).toBe(0);
    expect(otvorenaSmjena).toBe(false);
    expect(datum).toBe(await danas());
  });

  it("closing again with nothing changed changes nothing and logs nothing", async () => {
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "gotovina", gotovina: 17, vraceniKusur: 0 });
    const prvi = await json<{ zakljucak: Zakljucak }>(await zatvoriDan());
    const drugi = await json<{ zakljucak: Zakljucak }>(await zatvoriDan());
    expect(drugi).toEqual(prvi);
    expect(await brojRadnji("dan_zatvoren")).toBe(1);
    expect(await brojRadnji("dan_ponovo_zatvoren")).toBe(0);
    expect(await sql("select datum from public.dnevni_zakljucci")).toHaveLength(1);
  });

  it("a double tap still gets its answer after someone opens a new bill", async () => {
    const prvi = await json<{ zakljucak: Zakljucak }>(await zatvoriDan());
    await racunGotov([jelo(id["Natur šnicla"])], 1);
    const drugi = await json<{ zakljucak: Zakljucak }>(await zatvoriDan());
    expect(drugi).toEqual(prvi);
  });

  it("a payment after the close leaves the stored figures until she closes again, and the log keeps both", async () => {
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "gotovina", gotovina: 17, vraceniKusur: 0 });
    await json(await zatvoriDan());
    await plati(ljudi, await racunGotov([jelo(id["Bečka šnicla"])], 2), { nacin: "gotovina", gotovina: 19, vraceniKusur: 0 });

    const prije = await pregled();
    expect(prije.zakljucak?.izvjestaj.naplaceno).toBe(17);
    expect(prije.pregled.naplaceno).toBe(36);

    const { zakljucak } = await json<{ zakljucak: Zakljucak }>(await zatvoriDan());
    expect(zakljucak.izvjestaj.naplaceno).toBe(36);
    expect(await brojRadnji("dan_zatvoren")).toBe(1);
    const { rows } = await (await demoBaza()).query<{ detalji: Record<string, unknown> }>("select detalji from public.dnevnik_radnji where radnja = 'dan_ponovo_zatvoren'");
    expect(rows).toHaveLength(1);
    expect(rows[0].detalji).toMatchObject({ naplaceno: 36, racuni: 2, prethodno: { naplaceno: 17, racuni: 1 } });
  });

  it("is refused while a bill from that day is open", async () => {
    await racunGotov([jelo(id["Natur šnicla"])], 1);
    expect(await greska(await zatvoriDan())).toBe("Dan se ne može zatvoriti dok ima otvorenih računa iz tog dana (1).");
    expect((await pregled()).otvoreniRacuni).toBe(1);
    expect(await sql("select datum from public.dnevni_zakljucci")).toEqual([]);
  });

  it("is refused while a shift from that day is open", async () => {
    const { rows } = await (await demoBaza()).query<{ id: string }>("select id from public.proizvodi where stanica = 'sank' and aktivan");
    const popis = rows.map((r) => ({ proizvodId: r.id, kolicina: 0 }));
    expect((await smjenaPost(zahtjev("/api/smjene", { tijelo: { requestId: randomUUID(), oznaka: "I", popis }, kolacici: k("konobar") }))).status).toBe(200);
    expect(await greska(await zatvoriDan())).toBe("Dan se ne može zatvoriti dok je smjena otvorena.");
    expect((await pregled()).otvorenaSmjena).toBe(true);
  });

  it("after midnight she can close yesterday, and today's bill and shift do not hold it back", async () => {
    const db = await demoBaza();
    await naplataU(ljudi.konobar.id, await pomak("- interval '1 second'"), { ukupno: 7 });
    await naplataU(ljudi.konobar.id, await pomak(""), { ukupno: 100 });
    await racunGotov([jelo(id["Natur šnicla"])], 1);
    await db.exec(`update public.racuni set otvoren = (date_trunc('day', now() at time zone 'Europe/Sarajevo') at time zone 'Europe/Sarajevo') where status = 'otvoren'`);

    const { zakljucak } = await json<{ zakljucak: Zakljucak }>(await zatvoriDan(await juce()));
    expect(zakljucak.datum).toBe(await juce());
    expect(zakljucak.izvjestaj.ukupno).toBe(7);
  });

  it("yesterday's bill still open holds yesterday back", async () => {
    const db = await demoBaza();
    await racunGotov([jelo(id["Natur šnicla"])], 1);
    await db.exec(`update public.racuni set otvoren = (date_trunc('day', now() at time zone 'Europe/Sarajevo') at time zone 'Europe/Sarajevo') - interval '1 second' where status = 'otvoren'`);
    expect(await greska(await zatvoriDan(await juce()))).toMatch(/otvorenih računa/);
  });

  it("refuses a day that has not started", async () => {
    const sutra = (await sql<{ d: string }>("select to_char(public.danas_u_sarajevu() + 1, 'YYYY-MM-DD') as d"))[0].d;
    expect(await greska(await zatvoriDan(sutra))).toBe("Taj dan još nije počeo.");
    expect(await greska(await danGet(zahtjev(`/api/smjene/zatvori-dan?datum=${sutra}`, { kolacici: k("sefica") })))).toBe("Taj dan još nije počeo.");
  });

  it("refuses a date that is not a date", async () => {
    expect((await zatvoriDan("03.11.2026")).status).toBe(400);
    expect((await zatvoriDan("2026-02-30")).status).toBe(400);
  });

  it("a debt collected later does not change a closed day", async () => {
    await plati(ljudi, await racunGotov([jelo(id["Natur šnicla"])], 1), { nacin: "dug", gostDuznik: DUZNIK });
    const racun = (await sql<{ id: string }>("select id from public.racuni where status = 'na_dug'"))[0].id;
    await (await demoBaza()).exec(`
      update public.naplate set vrijeme = vrijeme - interval '2 days';
      update public.racuni set otvoren = otvoren - interval '2 days', zatvoren = zatvoren - interval '2 days';
    `);
    const datum = (await sql<{ d: string }>("select to_char(public.danas_u_sarajevu() - 2, 'YYYY-MM-DD') as d"))[0].d;
    const prvi = await json<{ zakljucak: Zakljucak }>(await zatvoriDan(datum));
    expect(prvi.zakljucak.izvjestaj.noviDug).toBe(17);

    expect((await dugPost(zahtjev("/api/administracija/dugovi", { tijelo: { requestId: randomUUID(), racunId: racun, nacin: "gotovina" }, kolacici: k("sefica") }))).status).toBe(200);
    const drugi = await json<{ zakljucak: Zakljucak }>(await zatvoriDan(datum));
    expect(drugi).toEqual(prvi);
    expect(await brojRadnji("dan_ponovo_zatvoren")).toBe(0);
  });
});
