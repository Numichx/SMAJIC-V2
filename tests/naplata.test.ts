import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as stornoRuta } from "@/app/api/narudzbe/stavka/[id]/storno/route";
import { PATCH as pomjeriRuta } from "@/app/api/narudzbe/[id]/route";
import { POST as narudzbaRuta } from "@/app/api/narudzbe/route";
import { POST as naplataRuta } from "@/app/api/racuni/[id]/naplata/route";
import { POST as popustRuta } from "@/app/api/racuni/[id]/popust/route";
import { GET as stampaRuta } from "@/app/api/racuni/[id]/stampa/route";
import { GET as racunStola } from "@/app/api/racuni/sto/[stoId]/route";
import { GET as stoloviRuta } from "@/app/api/stolovi/route";
import { POST as transfer } from "@/app/api/stolovi/transfer/route";
import { KOLACIC_UREDJAJA } from "@/lib/auth/pinOgranicenje";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { pregledNaplate, podjelaPoOsobi, RAZLOZI_POPUSTA } from "@/lib/domain/naplata";
import { ocisti, osoblje, PIN_KONOBARA, PIN_SEFICE, postaviPin, pripremiOkruzenje, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type Stanica = "kuhinja" | "pecenjara" | "sank";
type Popust = { procenat: number; razlog: string; iznos: number } | null;
type Stavka = { id: number; naziv: string; iznos: number };
type Racun = {
  id: string;
  broj: number;
  bruto: number;
  popust: Popust;
  ukupno: number;
  sveIzdato: boolean;
  stolovi: number[];
  narudzbe: { id: string; stanica: Stanica; stavke: Stavka[] }[];
};
type Naplata = {
  racunId: string;
  nacin: string;
  bruto: number;
  popust: number;
  ukupno: number;
  gostDao: number;
  gotovina: number;
  kartica: number;
  kusur: number;
  baksis: number;
  podijeljenoNa: number | null;
  podjela: number[] | null;
  stolovi: number[];
  vrijeme: string;
};
type Stampa = {
  id: string;
  broj: number;
  status: string;
  otvoren: string;
  zatvoren: string | null;
  konobar: string;
  stolovi: number[];
  bruto: number;
  popust: Popust;
  ukupno: number;
  stavke: { naziv: string; jedinica: string; kolicina: number; cijena: number; iznos: number; prilog: boolean }[];
  naplata: Naplata | null;
};

const KO_IZDAJE: Record<Stanica, Uloga> = { kuhinja: "kuhinja", pecenjara: "pecenjara", sank: "konobar" };
const PICE = "Coca-Cola 0,25 l";
const DUZNIK = "Gost Testni";

let ljudi: Record<Uloga, Osoba>;
let id: Record<string, string>;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
  id = await proizvodi();
  await postaviPin(ljudi.sefica.id, PIN_SEFICE);
  await postaviPin(ljudi.konobar.id, PIN_KONOBARA);
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => ocisti());

const parametri = (x: string) => ({ params: Promise.resolve({ id: x }) });
const jelo = (naziv: string, kolicina = 1, prilozi: string[] = []) => ({
  proizvodId: id[naziv],
  kolicina,
  prilozi: prilozi.map((p) => ({ proizvodId: id[p] })),
});

async function naruci(stavke: unknown[], sto = 1) {
  const odgovor = await narudzbaRuta(
    zahtjev("/api/narudzbe", { tijelo: { requestId: randomUUID(), stoId: sto, stavke }, kolacici: [ljudi.konobar.kolacic] }),
  );
  expect(odgovor.status).toBe(201);
  const { narudzbe } = (await odgovor.json()) as { narudzbe: { id: string; stanica: Stanica }[] };
  return narudzbe;
}

async function izdaj(narudzba: string, stanica: Stanica) {
  const kolacici = [ljudi[KO_IZDAJE[stanica]].kolacic];
  const koraci = [{ status: "U pripremi" }, stanica === "pecenjara" ? { status: "Gotovo", cijena: 5, tezine: [] } : { status: "Gotovo" }, { status: "Izdato" }];
  for (const tijelo of koraci) {
    const odgovor = await pomjeriRuta(zahtjev(`/api/narudzbe/${narudzba}`, { tijelo, kolacici }), parametri(narudzba));
    expect(odgovor.status).toBe(200);
  }
}

async function racun(sto = 1) {
  const odgovor = await racunStola(zahtjev(`/api/racuni/sto/${sto}`, { kolacici: [ljudi.konobar.kolacic] }), {
    params: Promise.resolve({ stoId: String(sto) }),
  });
  return ((await odgovor.json()) as { racun: Racun }).racun;
}

// An issued bill for exactly this gross, which the menu's prices cannot always give.
async function racunOd(bruto: string, sto = 1) {
  const [n] = await naruci([jelo(PICE)], sto);
  await (await demoBaza()).query("update public.stavke_narudzbe set cijena = $1::text::numeric where narudzba_id = $2", [bruto, n.id]);
  await izdaj(n.id, "sank");
  return racun(sto);
}

function naplati(racunId: string, tijelo: unknown, kolacic: string | undefined = ljudi.konobar.kolacic) {
  return naplataRuta(zahtjev(`/api/racuni/${racunId}/naplata`, { tijelo, kolacici: [kolacic] }), parametri(racunId));
}

function naplatiRacun(r: Racun, tijelo: Record<string, unknown>) {
  return naplati(r.id, { requestId: randomUUID(), ocekivano: r.ukupno, ...tijelo });
}

async function uspjesno(r: Racun, tijelo: Record<string, unknown>) {
  const odgovor = await naplatiRacun(r, tijelo);
  expect(odgovor.status).toBe(200);
  return ((await odgovor.json()) as { naplata: Naplata }).naplata;
}

async function odbijeno(r: Racun, tijelo: Record<string, unknown>, poruka: string) {
  const odgovor = await naplatiRacun(r, tijelo);
  expect(odgovor.status).toBe(422);
  expect(await odgovor.json()).toEqual({ greska: poruka });
  expect((await redoviNaplate()).length).toBe(0);
}

function popust(racunId: string, tijelo: unknown, opcije: { osoba?: Osoba; uredjaj?: string; ip?: string } = {}) {
  return popustRuta(
    zahtjev(`/api/racuni/${racunId}/popust`, {
      tijelo,
      kolacici: [(opcije.osoba ?? ljudi.konobar).kolacic, opcije.uredjaj],
      ip: opcije.ip,
    }),
    parametri(racunId),
  );
}

async function odobri(racunId: string, procenat: number, razlog?: string) {
  const odgovor = await popust(racunId, { procenat, razlog, pin: PIN_SEFICE });
  expect(odgovor.status).toBe(200);
  return ((await odgovor.json()) as { racun: Racun }).racun;
}

function stampaOdgovor(racunId: string, kolacic: string | undefined = ljudi.konobar.kolacic) {
  return stampaRuta(zahtjev(`/api/racuni/${racunId}/stampa`, { kolacici: [kolacic] }), parametri(racunId));
}

async function stampa(racunId: string) {
  const odgovor = await stampaOdgovor(racunId);
  expect(odgovor.status).toBe(200);
  return ((await odgovor.json()) as { racun: Stampa }).racun;
}

function storniraj(stavka: number, razlog = "Gost odustao") {
  return stornoRuta(zahtjev(`/api/narudzbe/stavka/${stavka}/storno`, { tijelo: { razlog }, kolacici: [ljudi.konobar.kolacic] }), parametri(String(stavka)));
}

function premjesti(radnja: string, stoIz: number, stoU: number) {
  return transfer(zahtjev("/api/stolovi/transfer", { tijelo: { radnja, stoIz, stoU }, kolacici: [ljudi.konobar.kolacic] }));
}

async function redoviNaplate() {
  const { rows } = await (await demoBaza()).query<Record<string, unknown>>("select * from public.naplate");
  return rows;
}

async function dnevnik(radnja: string) {
  const { rows } = await (await demoBaza()).query<{ zaposlenik_id: string; detalji: Record<string, unknown> }>(
    "select zaposlenik_id, detalji from public.dnevnik_radnji where radnja = $1 order by id",
    [radnja],
  );
  return rows;
}

async function bravaRacuna(sql: string, parametriUpita: unknown[]) {
  return (await demoBaza()).transaction(async (tx) => {
    await tx.query(sql, parametriUpita);
    return (
      await tx.query<{ mode: string }>(
        `select mode from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()
         and ((classid::bigint << 32) | objid::bigint) = hashtextextended('racuni', 0)`,
      )
    ).rows;
  });
}

const GOTOVINA = { nacin: "gotovina", gotovina: 20, vraceniKusur: 0 };

describe("POST /api/racuni/[id]/naplata: who and what", () => {
  it("needs a session", async () => {
    const r = await racunOd("10");
    expect((await naplataRuta(zahtjev(`/api/racuni/${r.id}/naplata`, { tijelo: {} }), parametri(r.id))).status).toBe(401);
  });

  it.each(["kuhinja", "pecenjara", "mesnica", "sefica"] as const)("refuses %s", async (uloga) => {
    const r = await racunOd("10");
    const odgovor = await naplati(r.id, { requestId: randomUUID(), ocekivano: 10, ...GOTOVINA }, ljudi[uloga].kolacic);
    expect(odgovor.status).toBe(403);
    expect(await redoviNaplate()).toEqual([]);
  });

  it.each(["kuhinja", "pecenjara", "mesnica", "sefica"] as const)("re-checks in SQL: refuses %s", async (uloga) => {
    const r = await racunOd("10");
    await expect(
      demoRpc("naplati_racun", {
        p_konobar: ljudi[uloga].id,
        p_racun: r.id,
        p_request_id: randomUUID(),
        p_ocekivano: 10,
        p_nacin: "kartica",
        p_gotovina: null,
        p_kartica: null,
        p_kusur: null,
        p_gost_duznik: null,
        p_osoba: null,
      }),
    ).rejects.toMatchObject({ code: "P0001", message: "Nemate pravo na ovu radnju." });
  });

  it.each([
    ["a tip from the client", { baksis: 5 }],
    ["a tip by the old field name", { napojnica: 5 }],
    ["a total from the client", { ukupno: 1 }],
    ["a gross from the client", { bruto: 1 }],
    ["a discount from the client", { popust: 1 }],
    ["change under the column's name", { kusur: 1 }],
    ["gost_dao under its own name", { gostDao: 20 }],
    ["a status", { status: "placen" }],
    ["a stringified amount", { gotovina: "20" }],
    ["a negative amount", { gotovina: -1 }],
    ["an amount past the limit", { gotovina: 1000000 }],
    ["a split of zero", { podijeljenoNa: 0 }],
    ["a split past the limit", { podijeljenoNa: 101 }],
    ["a split in fractions", { podijeljenoNa: 2.5 }],
    ["an unknown method", { nacin: "vaučer" }],
    ["a guest name past the limit", { gostDuznik: "x".repeat(201) }],
  ])("rejects %s", async (_, dodatno) => {
    const r = await racunOd("10");
    const odgovor = await naplatiRacun(r, { ...GOTOVINA, ...dodatno });
    expect(odgovor.status).toBe(400);
    expect(await redoviNaplate()).toEqual([]);
  });

  it.each([
    ["no requestId", { ocekivano: 10, ...GOTOVINA }],
    ["a bad requestId", { requestId: "1", ocekivano: 10, ...GOTOVINA }],
    ["no expected total", { requestId: randomUUID(), ...GOTOVINA }],
    ["no method", { requestId: randomUUID(), ocekivano: 10, gotovina: 20, vraceniKusur: 0 }],
  ])("rejects %s", async (_, tijelo) => {
    const r = await racunOd("10");
    expect((await naplati(r.id, tijelo)).status).toBe(400);
  });

  it("rejects a bad bill id", async () => {
    const odgovor = await naplati("abc", { requestId: randomUUID(), ocekivano: 10, ...GOTOVINA });
    expect(odgovor.status).toBe(400);
  });

  it("says when the bill does not exist", async () => {
    const odgovor = await naplati(randomUUID(), { requestId: randomUUID(), ocekivano: 10, ...GOTOVINA });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun nije pronađen." });
  });

  it("holds the bills lock until it commits", async () => {
    const r = await racunOd("10");
    const brave = await bravaRacuna(
      "select public.naplati_racun($1, $2, gen_random_uuid(), 10, 'kartica', null, null, null, null, null)",
      [ljudi.konobar.id, r.id],
    );
    expect(brave).toEqual([{ mode: "ExclusiveLock" }]);
  });
});

describe("cash", () => {
  it("takes the exact amount", async () => {
    const r = await racunOd("17.30");
    expect(await uspjesno(r, { nacin: "gotovina", gotovina: 17.3, vraceniKusur: 0 })).toMatchObject({
      racunId: r.id,
      nacin: "gotovina",
      bruto: 17.3,
      popust: 0,
      ukupno: 17.3,
      gostDao: 17.3,
      gotovina: 17.3,
      kartica: 0,
      kusur: 0,
      baksis: 0,
      podijeljenoNa: null,
      podjela: null,
      stolovi: [1],
    });
  });

  // 20 - 17.3 is 2.6999999999999993 in floats, which is the case the old app's comment warned about.
  it("gives back 2,70 from 20 on 17,30 with no tip and no float error", async () => {
    const r = await racunOd("17.30");
    expect(await uspjesno(r, { nacin: "gotovina", gotovina: 20, vraceniKusur: 2.7 })).toMatchObject({ kusur: 2.7, baksis: 0 });
  });

  it("computes the tip from what was given and what was returned", async () => {
    const r = await racunOd("17.30");
    expect(await uspjesno(r, { nacin: "gotovina", gotovina: 20, vraceniKusur: 2 })).toMatchObject({ gostDao: 20, kusur: 2, baksis: 0.7 });
  });

  it("counts everything as the tip when no change is returned", async () => {
    const r = await racunOd("17.30");
    expect(await uspjesno(r, { nacin: "gotovina", gotovina: 20, vraceniKusur: 0 })).toMatchObject({ baksis: 2.7 });
  });

  it("refuses less than the total", async () => {
    const r = await racunOd("17.30");
    await odbijeno(r, { nacin: "gotovina", gotovina: 17.29, vraceniKusur: 0 }, "Gost nije dao dovoljno novca za račun.");
  });

  it("refuses more change than the guest is owed", async () => {
    const r = await racunOd("17.30");
    await odbijeno(r, { nacin: "gotovina", gotovina: 20, vraceniKusur: 2.71 }, "Vraćeni kusur nije ispravan.");
  });

  it.each([
    ["no change given", { nacin: "gotovina", gotovina: 20 }],
    ["no cash given", { nacin: "gotovina", vraceniKusur: 0 }],
    ["a card amount too", { nacin: "gotovina", gotovina: 20, vraceniKusur: 0, kartica: 1 }],
  ])("refuses %s, so an empty field cannot become a tip", async (_, tijelo) => {
    const r = await racunOd("17.30");
    await odbijeno(r, tijelo, "Unesite koliko je gost dao i koliki je kusur vraćen.");
  });

  it.each([
    ["cash", { nacin: "gotovina", gotovina: 20.001, vraceniKusur: 0 }],
    ["change", { nacin: "gotovina", gotovina: 20, vraceniKusur: 0.001 }],
    ["a float error", { nacin: "gotovina", gotovina: 0.1 + 0.2, vraceniKusur: 0 }],
  ])("refuses an amount finer than a fening: %s", async (_, tijelo) => {
    const r = await racunOd("0.30");
    await odbijeno(r, tijelo, "Iznos mora biti od 0 do 999.999,99 KM, zaokružen na fening.");
  });
});

describe("card", () => {
  it("charges the total with no gost_dao, no change and no tip", async () => {
    const r = await racunOd("17.30");
    expect(await uspjesno(r, { nacin: "kartica" })).toMatchObject({ gostDao: 17.3, gotovina: 0, kartica: 17.3, kusur: 0, baksis: 0 });
  });

  it("takes a tip when the terminal charged more", async () => {
    const r = await racunOd("17.30");
    expect(await uspjesno(r, { nacin: "kartica", kartica: 20 })).toMatchObject({ gostDao: 20, kartica: 20, baksis: 2.7 });
  });

  it("refuses less than the total", async () => {
    const r = await racunOd("17.30");
    await odbijeno(r, { nacin: "kartica", kartica: 17 }, "Iznos na kartici je manji od računa.");
  });

  it.each([
    ["cash", { nacin: "kartica", gotovina: 1 }],
    ["change", { nacin: "kartica", vraceniKusur: 1 }],
  ])("refuses %s", async (_, tijelo) => {
    const r = await racunOd("17.30");
    await odbijeno(r, tijelo, "Plaćanje karticom ne prima gotovinu ni kusur.");
  });
});

describe("combined", () => {
  it("records both amounts when they add up exactly", async () => {
    const r = await racunOd("50.00");
    expect(await uspjesno(r, { nacin: "kombinovano", gotovina: 20, kartica: 30, vraceniKusur: 0 })).toMatchObject({
      nacin: "kombinovano",
      gostDao: 50,
      gotovina: 20,
      kartica: 30,
      kusur: 0,
      baksis: 0,
    });
  });

  it("gives change from the cash and computes the tip", async () => {
    const r = await racunOd("50.00");
    expect(await uspjesno(r, { nacin: "kombinovano", gotovina: 30, kartica: 30, vraceniKusur: 9.5 })).toMatchObject({
      gostDao: 60,
      kusur: 9.5,
      baksis: 0.5,
    });
  });

  it("refuses amounts that do not cover the bill", async () => {
    const r = await racunOd("50.00");
    await odbijeno(r, { nacin: "kombinovano", gotovina: 20, kartica: 29.99, vraceniKusur: 0 }, "Gotovina i kartica zajedno moraju pokriti račun.");
  });

  it("refuses change above the cash, even if the sum would allow it", async () => {
    const r = await racunOd("50.00");
    await odbijeno(r, { nacin: "kombinovano", gotovina: 5, kartica: 60, vraceniKusur: 6 }, "Vraćeni kusur nije ispravan.");
  });

  it.each([
    ["no cash", { nacin: "kombinovano", kartica: 50, vraceniKusur: 0 }],
    ["zero cash", { nacin: "kombinovano", gotovina: 0, kartica: 50, vraceniKusur: 0 }],
    ["no card", { nacin: "kombinovano", gotovina: 50, vraceniKusur: 0 }],
    ["zero card", { nacin: "kombinovano", gotovina: 50, kartica: 0, vraceniKusur: 0 }],
    ["no change", { nacin: "kombinovano", gotovina: 20, kartica: 30 }],
  ])("refuses %s", async (_, tijelo) => {
    const r = await racunOd("50.00");
    await odbijeno(r, tijelo, "Za kombinovano unesite gotovinu, karticu i vraćeni kusur.");
  });
});

describe("on debt", () => {
  it("needs the guest's name, closes the bill and frees the table", async () => {
    const r = await racunOd("17.30");
    expect(await uspjesno(r, { nacin: "dug", gostDuznik: `  ${DUZNIK}  ` })).toMatchObject({
      nacin: "dug",
      ukupno: 17.3,
      gostDao: 0,
      kusur: 0,
      baksis: 0,
      podijeljenoNa: null,
    });
    const [red] = await redoviNaplate();
    expect(red.gost_duznik).toBe(DUZNIK);
    expect(await stampa(r.id)).toMatchObject({ status: "na_dug", zatvoren: expect.any(String) });
    expect(await racun()).toBeNull();
  });

  it.each([
    ["no name", {}],
    ["a blank name", { gostDuznik: "   " }],
    ["a one-letter name", { gostDuznik: " a " }],
    ["a name past the column's limit", { gostDuznik: "x".repeat(101) }],
  ])("refuses %s", async (_, dodatno) => {
    const r = await racunOd("17.30");
    await odbijeno(r, { nacin: "dug", ...dodatno }, "Za dug unesite ime gosta, od 2 do 100 znakova.");
  });

  it.each([
    ["cash", { gotovina: 5 }],
    ["card", { kartica: 5 }],
    ["change", { vraceniKusur: 0 }],
  ])("refuses money along with it: %s", async (_, dodatno) => {
    const r = await racunOd("17.30");
    await odbijeno(r, { nacin: "dug", gostDuznik: DUZNIK, ...dodatno }, "Račun na dug ne prima uplatu.");
  });

  it("keeps the guest's name out of the response, the receipt and the log", async () => {
    const r = await racunOd("17.30");
    const odgovor = await naplatiRacun(r, { nacin: "dug", gostDuznik: DUZNIK });
    expect(await odgovor.text()).not.toContain(DUZNIK);
    expect(await (await stampaOdgovor(r.id)).text()).not.toContain(DUZNIK);
    expect(JSON.stringify(await dnevnik("naplata"))).not.toContain(DUZNIK);
  });
});

describe("the receipt's amounts are what the server computed", () => {
  it("rounds a kg line and totals with no float error", async () => {
    const [n] = await naruci([jelo("Jagnjetina s ražnja", 0.333)]);
    await (await demoBaza()).query("update public.narudzbe set status = 'Izdato' where id = $1", [n.id]);
    const r = await racun();
    expect(r.ukupno).toBe(16.65);
    expect(await uspjesno(r, { nacin: "kartica" })).toMatchObject({ ukupno: 16.65, baksis: 0 });
  });

  it("adds 0,10 and 0,20 to exactly 0,30", async () => {
    const [n] = await naruci([jelo(PICE), jelo("Fanta 0,25 l")]);
    const db = await demoBaza();
    await db.query("update public.stavke_narudzbe set cijena = case when naziv = $1 then 0.1 else 0.2 end where narudzba_id = $2", [PICE, n.id]);
    await izdaj(n.id, "sank");
    expect((await racun()).ukupno).toBe(0.3);
  });

  it("stores the gross, the discount, the payable total and the tip for the daily report", async () => {
    const r = await racunOd("100.00");
    await odobri(r.id, 25, "Stalni gost");
    await uspjesno({ ...r, ukupno: 75 }, { nacin: "gotovina", gotovina: 80, vraceniKusur: 4 });
    const [red] = await redoviNaplate();
    expect(red).toMatchObject({ bruto: "100.00", popust: "25.00", ukupno: "75.00", gost_dao: "80.00", kusur: "4.00", baksis: "1.00", konobar_id: ljudi.konobar.id });
    const [z] = await dnevnik("naplata");
    expect(z.detalji).toEqual({ racun: r.id, nacin: "gotovina", bruto: 100, popust: 25, ukupno: 75, gotovina: 80, kartica: 0, kusur: 4, baksis: 1 });
    expect(z.zaposlenik_id).toBe(ljudi.konobar.id);
  });
});

describe("the database itself refuses wrong money", () => {
  it.each([
    ["change above the cash", { gotovina: 5, kartica: 20, kusur: 6 }],
    ["a negative tip", { gotovina: 5, kartica: 0, kusur: 0 }],
    ["a payable above the gross", { bruto: 5 }],
    ["money on a debt", { nacin: "dug", gost_duznik: "Ime", gotovina: 10 }],
  ])("%s", async (_, izmjena) => {
    const r = await racunOd("10.00");
    const red = { nacin: "gotovina", bruto: 10, ukupno: 10, gotovina: 10, kartica: 0, kusur: 0, gost_duznik: null, ...izmjena };
    await expect(
      (await demoBaza()).query(
        `insert into public.naplate (racun_id, request_id, nacin, bruto, ukupno, gotovina, kartica, kusur, gost_duznik, stolovi, konobar_id)
         values ($1, gen_random_uuid(), $2::text::public.nacin_naplate, $3, $4, $5, $6, $7, $8, '{1}', $9)`,
        [r.id, red.nacin, red.bruto, red.ukupno, red.gotovina, red.kartica, red.kusur, red.gost_duznik, ljudi.konobar.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("a stale screen", () => {
  it("is refused when a colleague's void changed the total", async () => {
    const [n] = await naruci([jelo(PICE, 2), jelo("Fanta 0,25 l")]);
    await izdaj(n.id, "sank");
    const staro = await racun();
    const odgovor = await storniraj(staro.narudzbe[0].stavke[0].id);
    expect(odgovor.status).toBe(200);
    await odbijeno(staro, { nacin: "kartica" }, "Iznos računa se promijenio. Provjerite novi iznos i pokušajte ponovo.");
  });

  it("is refused when the discount changed", async () => {
    const r = await racunOd("10.00");
    await odobri(r.id, 50, "Reklamacija");
    await odbijeno(r, { nacin: "kartica" }, "Iznos računa se promijenio. Provjerite novi iznos i pokušajte ponovo.");
  });
});

describe("payment waits for the stations", () => {
  it("is blocked until every order is Izdato", async () => {
    const [n] = await naruci([jelo(PICE)]);
    const r = await racun();
    expect(r.sveIzdato).toBe(false);
    await odbijeno(r, { nacin: "kartica" }, "Račun se ne može naplatiti dok stanice ne izdaju sve narudžbe.");
    await izdaj(n.id, "sank");
    expect((await racun()).sveIzdato).toBe(true);
    await uspjesno(r, { nacin: "kartica" });
  });

  it("is blocked by one station out of several", async () => {
    const narudzbe = await naruci([jelo(PICE), jelo("Gulaš")]);
    await izdaj(narudzbe.find((n) => n.stanica === "sank")!.id, "sank");
    const r = await racun();
    expect(r.sveIzdato).toBe(false);
    await odbijeno(r, { nacin: "kartica" }, "Račun se ne može naplatiti dok stanice ne izdaju sve narudžbe.");
  });
});

describe("a double tap or a retry", () => {
  it("charges once and answers the same", async () => {
    const r = await racunOd("17.30");
    const tijelo = { requestId: randomUUID(), ocekivano: 17.3, nacin: "gotovina", gotovina: 20, vraceniKusur: 2 };
    const prvi = await naplati(r.id, tijelo);
    const drugiPut = await naplati(r.id, tijelo);
    expect(prvi.status).toBe(200);
    expect(drugiPut.status).toBe(200);
    expect(await drugiPut.json()).toEqual(await prvi.json());
    expect(await redoviNaplate()).toHaveLength(1);
    expect(await dnevnik("naplata")).toHaveLength(1);
  });

  it("answers with the first result even if the retry says something else", async () => {
    const r = await racunOd("17.30");
    const requestId = randomUUID();
    await naplati(r.id, { requestId, ocekivano: 17.3, nacin: "gotovina", gotovina: 20, vraceniKusur: 2 });
    const odgovor = await naplati(r.id, { requestId, ocekivano: 99, nacin: "kartica" });
    expect(((await odgovor.json()) as { naplata: Naplata }).naplata).toMatchObject({ nacin: "gotovina", baksis: 0.7 });
  });

  it("refuses the same requestId on another bill", async () => {
    const a = await racunOd("10.00", 1);
    const b = await racunOd("10.00", 2);
    const requestId = randomUUID();
    expect((await naplati(a.id, { requestId, ocekivano: 10, nacin: "kartica" })).status).toBe(200);
    const odgovor = await naplati(b.id, { requestId, ocekivano: 10, nacin: "kartica" });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Oznaka zahtjeva je već iskorištena na drugom računu." });
    expect((await racun(2)).id).toBe(b.id);
  });

  it("does not leave a request id behind when refused, so the same tap can succeed after the fix", async () => {
    const r = await racunOd("10.00");
    const requestId = randomUUID();
    expect((await naplati(r.id, { requestId, ocekivano: 10, nacin: "gotovina", gotovina: 5, vraceniKusur: 0 })).status).toBe(422);
    expect((await naplati(r.id, { requestId, ocekivano: 10, nacin: "gotovina", gotovina: 10, vraceniKusur: 0 })).status).toBe(200);
  });
});

describe("a paid bill", () => {
  async function placen(sto = 1) {
    const [n] = await naruci([jelo(PICE)], sto);
    await izdaj(n.id, "sank");
    const r = await racun(sto);
    await uspjesno(r, { nacin: "kartica" });
    return r;
  }

  it("frees the table in the overview", async () => {
    await placen(3);
    const odgovor = await stoloviRuta(zahtjev("/api/stolovi", { kolacici: [ljudi.konobar.kolacic] }));
    const { stolovi } = (await odgovor.json()) as { stolovi: { id: number; racun: unknown }[] };
    expect(stolovi.find((s) => s.id === 3)!.racun).toBeNull();
    expect((await (await demoBaza()).query("select 1 from public.racun_stolovi")).rows).toEqual([]);
  });

  it("takes no further orders: a new order opens a new bill", async () => {
    const r = await placen();
    const prije = await stampa(r.id);
    await naruci([jelo("Gulaš")]);
    const novi = await racun();
    expect(novi.id).not.toBe(r.id);
    expect(novi.broj).toBeGreaterThan(r.broj);
    expect(novi.ukupno).toBe(13);
    expect(await stampa(r.id)).toEqual(prije);
  });

  it("does not grow when an old order is retried", async () => {
    const requestId = randomUUID();
    const tijelo = { requestId, stoId: 1, stavke: [jelo(PICE)] };
    const narudzba = async () => narudzbaRuta(zahtjev("/api/narudzbe", { tijelo, kolacici: [ljudi.konobar.kolacic] }));
    const { narudzbe } = (await (await narudzba()).json()) as { narudzbe: { id: string }[] };
    await izdaj(narudzbe[0].id, "sank");
    const r = await racun();
    await uspjesno(r, { nacin: "kartica" });
    expect((await narudzba()).status).toBe(201);
    expect(await racun()).toBeNull();
    expect((await stampa(r.id)).stavke).toHaveLength(1);
  });

  it("refuses a void", async () => {
    const r = await placen();
    const odgovor = await storniraj(r.narudzbe[0].stavke[0].id);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun je zatvoren." });
  });

  it.each(["premjesti", "dodaj", "spoji"])("refuses to %s it", async (radnja) => {
    await placen(1);
    await naruci([jelo("Gulaš")], 2);
    const odgovor = await premjesti(radnja, 1, 3);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Sto 1 nema otvoren račun." });
  });

  it("refuses a second payment, with a new requestId", async () => {
    const r = await placen();
    const odgovor = await naplatiRacun(r, { nacin: "kartica" });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun je već naplaćen." });
    expect(await redoviNaplate()).toHaveLength(1);
  });

  it("refuses a second payment after going on debt", async () => {
    const r = await racunOd("10.00");
    await uspjesno(r, { nacin: "dug", gostDuznik: DUZNIK });
    const odgovor = await naplatiRacun(r, { nacin: "kartica" });
    expect(await odgovor.json()).toEqual({ greska: "Račun je već naplaćen." });
  });

  it("refuses a discount, and does not touch the PIN counter", async () => {
    const r = await placen();
    const odgovor = await popust(r.id, { procenat: 10, razlog: "Drugo", pin: "1357" });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun je zatvoren." });
    expect((await (await demoBaza()).query("select 1 from public.pin_pokusaji")).rows).toEqual([]);
  });
});

describe("a merged bill", () => {
  it("pays for every merged table at once and frees them all", async () => {
    const a = (await naruci([jelo(PICE)], 1))[0].id;
    const b = (await naruci([jelo("Fanta 0,25 l")], 2))[0].id;
    await izdaj(a, "sank");
    await izdaj(b, "sank");
    const stari = await racun(2);
    expect((await premjesti("spoji", 2, 1)).status).toBe(200);
    expect((await premjesti("dodaj", 1, 3)).status).toBe(200);

    const r = await racun(1);
    expect(r.stolovi).toEqual([1, 2, 3]);
    const naplata = await uspjesno(r, { nacin: "kartica" });
    expect(naplata.ukupno).toBe(r.ukupno);
    expect(naplata.ukupno).toBeGreaterThan(stari.ukupno);
    expect(naplata.stolovi).toEqual([1, 2, 3]);

    for (const sto of [1, 2, 3]) expect(await racun(sto)).toBeNull();
    expect((await stampa(r.id)).stolovi).toEqual([1, 2, 3]);
    expect((await stampa(r.id)).stavke).toHaveLength(2);
  });

  it("refuses a stale screen paying the merged-away bill", async () => {
    await racunOd("10.00", 1);
    const stari = await racunOd("20.00", 2);
    expect((await premjesti("spoji", 2, 1)).status).toBe(200);
    await odbijeno(stari, { nacin: "kartica" }, "Račun je spojen s drugim računom. Osvježite stranicu.");
    const odgovor = await stampaOdgovor(stari.id);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun je spojen s drugim računom. Osvježite stranicu." });
  });

  it("blocks when an order on the other table is not issued yet", async () => {
    await racunOd("10.00", 1);
    await naruci([jelo("Gulaš")], 2);
    expect((await premjesti("spoji", 2, 1)).status).toBe(200);
    const r = await racun(1);
    expect(r.sveIzdato).toBe(false);
    await odbijeno(r, { nacin: "kartica" }, "Račun se ne može naplatiti dok stanice ne izdaju sve narudžbe.");
  });

  it.each([
    ["the bill being merged away", 2],
    ["the bill it joins", 1],
  ])("refuses a merge while %s has a discount, then allows it once removed", async (_, sto) => {
    await racunOd("10.00", 1);
    await racunOd("20.00", 2);
    const s = await racun(sto);
    await odobri(s.id, 10, "Stalni gost");

    const odgovor = await premjesti("spoji", 2, 1);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun s popustom se ne može spojiti. Šefica prvo treba ukloniti popust." });

    await odobri(s.id, 0);
    expect((await premjesti("spoji", 2, 1)).status).toBe(200);
  });

  it("keeps the discount on a move and on an added table", async () => {
    const r = await racunOd("10.00", 1);
    await odobri(r.id, 10, "Stalni gost");
    expect((await premjesti("premjesti", 1, 2)).status).toBe(200);
    expect((await premjesti("dodaj", 2, 3)).status).toBe(200);
    expect(await racun(3)).toMatchObject({ id: r.id, ukupno: 9 });
  });
});

describe("POST /api/racuni/[id]/popust: who and what", () => {
  it("needs a session", async () => {
    const r = await racunOd("10.00");
    const odgovor = await popustRuta(zahtjev(`/api/racuni/${r.id}/popust`, { tijelo: { procenat: 10, razlog: "Drugo", pin: PIN_SEFICE } }), parametri(r.id));
    expect(odgovor.status).toBe(401);
  });

  it.each(["kuhinja", "pecenjara", "mesnica"] as const)("refuses %s", async (uloga) => {
    const r = await racunOd("10.00");
    const odgovor = await popust(r.id, { procenat: 10, razlog: "Drugo", pin: PIN_SEFICE }, { osoba: ljudi[uloga] });
    expect(odgovor.status).toBe(403);
    expect((await racun()).popust).toBeNull();
  });

  it.each(["kuhinja", "pecenjara", "mesnica"] as const)("re-checks in SQL: refuses %s", async (uloga) => {
    const r = await racunOd("10.00");
    await expect(
      demoRpc("odobri_popust", {
        p_zaposlenik: ljudi[uloga].id,
        p_racun: r.id,
        p_procenat: 10,
        p_razlog: "Drugo",
        p_pin: PIN_SEFICE,
        p_uredjaj: "u",
        p_ip: "i",
      }),
    ).rejects.toMatchObject({ code: "P0001", message: "Nemate pravo na ovu radnju." });
  });

  it("takes the manager's own session too, but still needs her PIN", async () => {
    const r = await racunOd("10.00");
    expect((await popust(r.id, { procenat: 10, razlog: "Drugo", pin: "1357" }, { osoba: ljudi.sefica })).status).toBe(422);
    expect((await popust(r.id, { procenat: 10, razlog: "Drugo" }, { osoba: ljudi.sefica })).status).toBe(400);
    expect((await popust(r.id, { procenat: 10, razlog: "Drugo", pin: PIN_SEFICE }, { osoba: ljudi.sefica })).status).toBe(200);
    const [z] = await dnevnik("popust");
    expect(z.zaposlenik_id).toBe(ljudi.sefica.id);
  });

  it.each([
    ["an unknown field", { procenat: 10, razlog: "Drugo", pin: PIN_SEFICE, iznos: 1 }],
    ["a payable total from the client", { procenat: 10, razlog: "Drugo", pin: PIN_SEFICE, ukupno: 1 }],
    ["an unknown reason", { procenat: 10, razlog: "Prijatelj", pin: PIN_SEFICE }],
    ["a negative percent", { procenat: -1, razlog: "Drugo", pin: PIN_SEFICE }],
    ["a percent above 100", { procenat: 100.01, razlog: "Drugo", pin: PIN_SEFICE }],
    ["a stringified percent", { procenat: "10", razlog: "Drugo", pin: PIN_SEFICE }],
    ["no percent", { razlog: "Drugo", pin: PIN_SEFICE }],
    ["no PIN", { procenat: 10, razlog: "Drugo" }],
    ["a PIN that is not digits", { procenat: 10, razlog: "Drugo", pin: "abcd" }],
    ["a PIN too short", { procenat: 10, razlog: "Drugo", pin: "123" }],
  ])("rejects %s, with no PIN attempt counted", async (_, tijelo) => {
    const r = await racunOd("10.00");
    expect((await popust(r.id, tijelo)).status).toBe(400);
    expect((await racun()).popust).toBeNull();
    expect((await (await demoBaza()).query("select 1 from public.pin_pokusaji")).rows).toEqual([]);
  });

  it("rejects a bad bill id", async () => {
    expect((await popust("abc", { procenat: 10, razlog: "Drugo", pin: PIN_SEFICE })).status).toBe(400);
  });

  it("says when the bill does not exist, with no PIN attempt counted", async () => {
    const odgovor = await popust(randomUUID(), { procenat: 10, razlog: "Drugo", pin: "1357" });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun nije pronađen." });
    expect((await (await demoBaza()).query("select 1 from public.pin_pokusaji")).rows).toEqual([]);
  });

  it("holds the bills lock until it commits", async () => {
    const r = await racunOd("10.00");
    const brave = await bravaRacuna("select public.odobri_popust($1, $2, 10, 'Drugo', $3, 'u', 'i')", [ljudi.konobar.id, r.id, PIN_SEFICE]);
    expect(brave).toEqual([{ mode: "ExclusiveLock" }]);
  });
});

describe("the manager's PIN", () => {
  const POKUSAJ = { procenat: 10, razlog: "Drugo", pin: "1357" };

  it("is refused without raising, so the counter survives, and leaves the bill alone", async () => {
    const r = await racunOd("10.00");
    const odgovor = await popust(r.id, POKUSAJ);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "PIN šefice nije ispravan." });
    expect((await racun()).popust).toBeNull();
    expect(await dnevnik("popust")).toEqual([]);
    expect((await dnevnik("popust_odbijen")).map((z) => z.detalji)).toEqual([{ racun: r.id }]);
    const { rows } = await (await demoBaza()).query<{ kljuc: string }>("select kljuc from public.pin_pokusaji order by kljuc");
    expect(rows.map((x) => x.kljuc.split(":")[0])).toEqual(["globalno", "ip", "uredjaj"]);
  });

  it("does not accept a waiter's own PIN", async () => {
    const r = await racunOd("10.00");
    expect((await popust(r.id, { ...POKUSAJ, pin: PIN_KONOBARA })).status).toBe(422);
  });

  it("does not accept a deactivated manager", async () => {
    const r = await racunOd("10.00");
    const db = await demoBaza();
    await db.query("update public.zaposlenici set aktivan = false where id = $1", [ljudi.sefica.id]);
    expect((await popust(r.id, { ...POKUSAJ, pin: PIN_SEFICE })).status).toBe(422);
    await db.query("update public.zaposlenici set aktivan = true where id = $1", [ljudi.sefica.id]);
  });

  it("locks out after 5 wrong tries on one device, even for the right PIN", async () => {
    const r = await racunOd("10.00");
    const prvi = await popust(r.id, POKUSAJ);
    const kolacic = prvi.headers.get("set-cookie")!.split(";")[0];
    expect(kolacic.startsWith(`${KOLACIC_UREDJAJA}=`)).toBe(true);

    for (let i = 0; i < 3; i++) expect((await popust(r.id, POKUSAJ, { uredjaj: kolacic })).status).toBe(422);
    const peti = await popust(r.id, POKUSAJ, { uredjaj: kolacic });
    expect(peti.status).toBe(429);
    expect(Number(peti.headers.get("retry-after"))).toBeGreaterThan(0);

    const ispravan = await popust(r.id, { ...POKUSAJ, pin: PIN_SEFICE }, { uredjaj: kolacic });
    expect(ispravan.status).toBe(429);
    expect((await racun()).popust).toBeNull();
  });

  it("shares its count with the special-side PIN on the same device", async () => {
    const r = await racunOd("10.00");
    const kolacic = (await popust(r.id, POKUSAJ)).headers.get("set-cookie")!.split(";")[0];
    const tijelo = () => ({
      requestId: randomUUID(),
      stoId: 1,
      stavke: [{ proizvodId: id["Gulaš"], kolicina: 1, prilozi: [{ proizvodId: id["Riža"], poseban: true }] }],
      posebanPin: "1357",
    });
    for (let i = 0; i < 3; i++) {
      const odgovor = await narudzbaRuta(zahtjev("/api/narudzbe", { tijelo: tijelo(), kolacici: [ljudi.konobar.kolacic, kolacic] }));
      expect(odgovor.status).toBe(422);
    }
    expect((await popust(r.id, POKUSAJ, { uredjaj: kolacic })).status).toBe(429);
  });

  it("clears the device's count on a right PIN", async () => {
    const r = await racunOd("10.00");
    const prvi = await popust(r.id, POKUSAJ);
    const kolacic = prvi.headers.get("set-cookie")!.split(";")[0];
    expect((await popust(r.id, { ...POKUSAJ, pin: PIN_SEFICE }, { uredjaj: kolacic })).status).toBe(200);
    const { rows } = await (await demoBaza()).query<{ kljuc: string }>("select kljuc from public.pin_pokusaji where kljuc like 'uredjaj:%'");
    expect(rows).toEqual([]);
  });
});

describe("a discount", () => {
  it.each<[string, number, number, number]>([
    // gross, percent, payable, discount
    ["10.01", 15, 8.51, 1.5],
    ["99.99", 33.33, 66.66, 33.33],
    ["0.01", 50, 0.01, 0],
    ["0.03", 50, 0.02, 0.01],
    ["17.30", 10, 15.57, 1.73],
    ["100.00", 12.5, 87.5, 12.5],
    ["1.00", 0.01, 1, 0],
    ["33.33", 99.99, 0, 33.33],
  ])("on %s at %d percent rounds to the fening, and the two parts add up", async (bruto, procenat, ukupno, iznos) => {
    const r = await racunOd(bruto);
    const s = await odobri(r.id, procenat, "Drugo");
    expect(s).toMatchObject({ bruto: Number(bruto), ukupno, popust: { procenat, razlog: "Drugo", iznos } });
    expect(Math.round(s.ukupno * 100) + Math.round(s.popust!.iznos * 100)).toBe(Math.round(Number(bruto) * 100));

    const naplata = await uspjesno(s, { nacin: "kartica" });
    expect(naplata).toMatchObject({ bruto: Number(bruto), ukupno, popust: iznos, kartica: ukupno });
  });

  it.each(RAZLOZI_POPUSTA)("accepts the reason %s at 100 percent, and closes at zero", async (razlog) => {
    const r = await racunOd("17.30");
    const s = await odobri(r.id, 100, razlog);
    expect(s).toMatchObject({ bruto: 17.3, ukupno: 0, popust: { procenat: 100, razlog, iznos: 17.3 } });
    expect(await uspjesno(s, { nacin: "gotovina", gotovina: 0, vraceniKusur: 0 })).toMatchObject({ bruto: 17.3, popust: 17.3, ukupno: 0, baksis: 0 });
  });

  it("closes a 100 % bill by card with no amount", async () => {
    const r = await racunOd("17.30");
    const s = await odobri(r.id, 100, "Častimo");
    expect(await uspjesno(s, { nacin: "kartica" })).toMatchObject({ kartica: 0, ukupno: 0 });
  });

  it("refuses to put a 100 % bill on debt, so no guest name is stored for nothing", async () => {
    const r = await racunOd("17.30");
    const s = await odobri(r.id, 100, "Častimo");
    await odbijeno(s, { nacin: "dug", gostDuznik: DUZNIK }, "Račun je 0,00 KM, pa nema duga. Naplatite ga gotovinom.");
  });

  it.each(["Obrok osoblja", "Častimo"])("is always 100 percent for %s", async (razlog) => {
    const r = await racunOd("17.30");
    const odgovor = await popust(r.id, { procenat: 50, razlog, pin: PIN_SEFICE });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Obrok osoblja i častimo su uvijek 100 %." });
  });

  it.each(["Stalni gost", "Reklamacija", "Drugo"])("can be any percent for %s", async (razlog) => {
    const r = await racunOd("10.00");
    expect((await odobri(r.id, 50, razlog)).ukupno).toBe(5);
  });

  it("needs a reason, checked before the PIN", async () => {
    const r = await racunOd("10.00");
    const odgovor = await popust(r.id, { procenat: 10, pin: "1357" });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Izaberite razlog popusta." });
    expect((await (await demoBaza()).query("select 1 from public.pin_pokusaji")).rows).toEqual([]);
  });

  it("allows two decimals and refuses a third", async () => {
    const r = await racunOd("10.00");
    const odgovor = await popust(r.id, { procenat: 12.345, razlog: "Drugo", pin: PIN_SEFICE });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Popust mora biti od 0 do 100 %, s najviše dvije decimale." });
  });

  it("is replaced, not stacked, and the log keeps both", async () => {
    const r = await racunOd("100.00");
    await odobri(r.id, 10, "Stalni gost");
    expect((await odobri(r.id, 20, "Reklamacija")).ukupno).toBe(80);
    const zapisi = await dnevnik("popust");
    expect(zapisi.map((z) => z.detalji)).toEqual([
      { racun: r.id, procenat: 10, razlog: "Stalni gost", prethodniProcenat: 0, odobrila: ljudi.sefica.id, bruto: 100 },
      { racun: r.id, procenat: 20, razlog: "Reklamacija", prethodniProcenat: 10, odobrila: ljudi.sefica.id, bruto: 100 },
    ]);
    expect(zapisi[0].zaposlenik_id).toBe(ljudi.konobar.id);
  });

  it("is removed by 0, with the PIN, and no reason is kept", async () => {
    const r = await racunOd("100.00");
    await odobri(r.id, 10, "Stalni gost");
    const s = await odobri(r.id, 0);
    expect(s).toMatchObject({ bruto: 100, ukupno: 100, popust: null });
    expect((await popust(r.id, { procenat: 0, pin: "1357" })).status).toBe(422);
  });

  it("shows in the table overview", async () => {
    const r = await racunOd("100.00", 4);
    await odobri(r.id, 10, "Stalni gost");
    const odgovor = await stoloviRuta(zahtjev("/api/stolovi", { kolacici: [ljudi.konobar.kolacic] }));
    const { stolovi } = (await odgovor.json()) as { stolovi: { id: number; racun: Racun | null }[] };
    expect(stolovi.find((s) => s.id === 4)!.racun).toMatchObject({ bruto: 100, ukupno: 90, popust: { procenat: 10, iznos: 10 } });
  });

  it("follows a void: the percent stays and the amounts recompute", async () => {
    const [n] = await naruci([jelo(PICE, 2), jelo("Fanta 0,25 l")]);
    await izdaj(n.id, "sank");
    const r = await racun();
    await (await demoBaza()).query("update public.stavke_narudzbe set cijena = case when naziv = $1 then 5.05 else 3.33 end where narudzba_id = $2", [PICE, n.id]);
    await odobri(r.id, 15, "Reklamacija");

    const odgovor = await storniraj(r.narudzbe[0].stavke[1].id);
    const { racun: s } = (await odgovor.json()) as { racun: Racun };
    // 2 x 5,05 = 10,10 and 85 % of that is 8,585, which rounds up.
    expect(s).toMatchObject({ bruto: 10.1, ukupno: 8.59, popust: { procenat: 15, iznos: 1.51 } });
    expect(await uspjesno(s, { nacin: "kartica" })).toMatchObject({ bruto: 10.1, popust: 1.51, ukupno: 8.59 });
  });

  it("refuses a new order until it is removed, so a later line never inherits it without the manager's PIN", async () => {
    const r = await racunOd("100.00");
    const uloga = ljudi.konobar.kolacic;
    await odobri(r.id, 100, "Častimo");

    const odbijeno = await narudzbaRuta(
      zahtjev("/api/narudzbe", { tijelo: { requestId: randomUUID(), stoId: 1, stavke: [jelo("Fanta 0,25 l")] }, kolacici: [uloga] }),
    );
    expect(odbijeno.status).toBe(422);
    expect(await odbijeno.json()).toEqual({ greska: "Račun ima popust. Šefica prvo treba ukloniti popust, pa onda dodajte narudžbu." });
    expect((await racun()).bruto).toBe(r.bruto);

    await odobri(r.id, 0);
    const [n] = await naruci([jelo("Fanta 0,25 l")]);
    expect((await racun()).popust).toBeNull();
    await izdaj(n.id, "sank");
  });

  it("gets to zero when every line is voided, and the bill still closes", async () => {
    const r = await racunOd("100.00");
    await odobri(r.id, 50, "Stalni gost");
    const odgovor = await storniraj(r.narudzbe[0].stavke[0].id);
    const { racun: s } = (await odgovor.json()) as { racun: Racun };
    expect(s).toMatchObject({ bruto: 0, ukupno: 0, popust: { iznos: 0 } });
    await uspjesno(s, { nacin: "gotovina", gotovina: 0, vraceniKusur: 0 });
    expect(await racun()).toBeNull();
  });
});

describe("split by person", () => {
  it.each<[string, number, number[]]>([
    ["10.00", 3, [3.34, 3.33, 3.33]],
    ["10.00", 4, [2.5, 2.5, 2.5, 2.5]],
    ["0.01", 3, [0.01, 0, 0]],
    ["17.30", 7, [2.48, 2.47, 2.47, 2.47, 2.47, 2.47, 2.47]],
    ["100.01", 2, [50.01, 50]],
    ["5.00", 1, [5]],
  ])("%s among %d adds up, with the leftover fenings named", async (ukupno, osoba, ocekivano) => {
    const r = await racunOd(ukupno);
    const naplata = await uspjesno(r, { nacin: "kartica", podijeljenoNa: osoba });
    expect(naplata).toMatchObject({ podijeljenoNa: osoba, podjela: ocekivano });
    expect(naplata.podjela!.reduce((zbir, x) => zbir + Math.round(x * 100), 0)).toBe(Math.round(Number(ukupno) * 100));
  });

  it("splits what is left after the discount", async () => {
    const r = await racunOd("10.00");
    const s = await odobri(r.id, 50, "Stalni gost");
    expect((await uspjesno(s, { nacin: "kartica", podijeljenoNa: 3 })).podjela).toEqual([1.67, 1.67, 1.66]);
  });

  it("splits a 100 % bill into zeros", async () => {
    const r = await racunOd("10.00");
    const s = await odobri(r.id, 100, "Častimo");
    expect((await uspjesno(s, { nacin: "kartica", podijeljenoNa: 2 })).podjela).toEqual([0, 0]);
  });

  it("does not split a debt", async () => {
    const r = await racunOd("10.00");
    expect(await uspjesno(r, { nacin: "dug", gostDuznik: DUZNIK, podijeljenoNa: 2 })).toMatchObject({ podijeljenoNa: null, podjela: null });
  });

  it("re-checks the limit in SQL", async () => {
    const r = await racunOd("10.00");
    await expect(
      demoRpc("naplati_racun", {
        p_konobar: ljudi.konobar.id,
        p_racun: r.id,
        p_request_id: randomUUID(),
        p_ocekivano: 10,
        p_nacin: "kartica",
        p_gotovina: null,
        p_kartica: null,
        p_kusur: null,
        p_gost_duznik: null,
        p_osoba: 101,
      }),
    ).rejects.toMatchObject({ message: "Račun se može podijeliti na 1 do 100 osoba." });
  });
});

describe("the screen's preview matches what the server charges", () => {
  it.each<[string, number, number, number]>([
    ["17.30", 20, 0, 2.7],
    ["17.30", 20, 0, 2],
    ["17.30", 17.3, 0, 0],
    ["0.07", 0.1, 0, 0.03],
    ["19.99", 50, 0, 30],
    ["1.15", 2.3, 0, 1.15],
    ["50.00", 30, 30, 9.5],
    ["50.00", 5, 60, 5],
    ["33.33", 10, 23.33, 0],
  ])("%s, cash %d, card %d, change %d", async (ukupno, gotovina, kartica, kusur) => {
    const r = await racunOd(ukupno);
    const naplata = await uspjesno(
      r,
      kartica === 0 ? { nacin: "gotovina", gotovina, vraceniKusur: kusur } : { nacin: "kombinovano", gotovina, kartica, vraceniKusur: kusur },
    );
    const pregled = pregledNaplate(r.ukupno, gotovina, kartica, kusur);
    expect(pregled.baksis).toBe(naplata.baksis);
    expect(pregled.najveciKusur).toBeGreaterThanOrEqual(naplata.kusur);
  });

  it.each<[string, number, number]>([
    ["17.30", 20, 2.7],
    ["0.07", 0.1, 0.03],
    ["19.99", 50, 30.01],
    ["1.15", 2.3, 1.15],
  ])("the most change it offers is accepted and leaves no tip: %s from %d", async (ukupno, gotovina, ocekivano) => {
    const r = await racunOd(ukupno);
    const { najveciKusur } = pregledNaplate(r.ukupno, gotovina, 0, 0);
    expect(najveciKusur).toBe(ocekivano);
    expect(await uspjesno(r, { nacin: "gotovina", gotovina, vraceniKusur: najveciKusur })).toMatchObject({ kusur: ocekivano, baksis: 0 });
  });

  it("offers no change above the cash", async () => {
    const r = await racunOd("50.00");
    const { najveciKusur } = pregledNaplate(r.ukupno, 5, 60, 0);
    expect(najveciKusur).toBe(5);
    expect(await uspjesno(r, { nacin: "kombinovano", gotovina: 5, kartica: 60, vraceniKusur: najveciKusur })).toMatchObject({ baksis: 10 });
  });

  it.each<[string, number]>([
    ["10.00", 3],
    ["0.01", 7],
    ["17.30", 7],
    ["99.99", 100],
    ["1000.01", 9],
    ["0.00", 3],
  ])("split of %s among %d", async (ukupno, osoba) => {
    const r = await racunOd(ukupno);
    const naplata = await uspjesno(r, { nacin: "kartica", podijeljenoNa: osoba });
    expect(podjelaPoOsobi(r.ukupno, osoba)).toEqual(naplata.podjela);
  });

  it("agrees with SQL on every share of every fening up to 2 KM", async () => {
    const { rows } = await (await demoBaza()).query<{ iznos: string; osoba: number; podjela: number[] }>(
      `select i::numeric(10, 2) / 100 as iznos, o as osoba, public.podjela_racuna(i::numeric / 100, o) as podjela
       from generate_series(0, 200) i, generate_series(1, 7) o`,
    );
    for (const { iznos, osoba, podjela } of rows) expect(podjelaPoOsobi(Number(iznos), osoba)).toEqual(podjela);
  });
});

describe("GET /api/racuni/[id]/stampa", () => {
  it("needs a session", async () => {
    const r = await racunOd("10.00");
    expect((await stampaRuta(zahtjev(`/api/racuni/${r.id}/stampa`), parametri(r.id))).status).toBe(401);
  });

  it.each(["kuhinja", "pecenjara", "mesnica", "sefica"] as const)("refuses %s", async (uloga) => {
    const r = await racunOd("10.00");
    expect((await stampaOdgovor(r.id, ljudi[uloga].kolacic)).status).toBe(403);
  });

  it.each(["kuhinja", "pecenjara", "mesnica", "sefica"] as const)("re-checks in SQL: refuses %s", async (uloga) => {
    const r = await racunOd("10.00");
    await expect(demoRpc("racun_za_stampu", { p_konobar: ljudi[uloga].id, p_racun: r.id })).rejects.toMatchObject({
      message: "Nemate pravo na ovu radnju.",
    });
  });

  it("rejects a bad bill id, and names a missing one", async () => {
    expect((await stampaOdgovor("abc")).status).toBe(400);
    const odgovor = await stampaOdgovor(randomUUID());
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun nije pronađen." });
  });

  it("prints an open bill: each side right after its dish, across stations, with no void", async () => {
    await naruci([jelo("Pljeskavica", 2, ["Pomfrit", "Riža"]), jelo("Gulaš", 1, ["Pire krompir"]), jelo(PICE)]);
    await naruci([jelo("Fanta 0,25 l")]);
    const r = await racun();
    const linije = r.narudzbe.flatMap((n) => n.stavke);
    expect((await storniraj(linije.find((s) => s.naziv === "Gulaš")!.id)).status).toBe(200);

    const s = await stampa(r.id);
    expect(s).toEqual({
      id: r.id,
      broj: r.broj,
      status: "otvoren",
      otvoren: expect.any(String),
      zatvoren: null,
      konobar: ljudi.konobar.ime,
      stolovi: [1],
      bruto: 2 * 13 + 2 * 4 + 3.5 + 3.5,
      popust: null,
      ukupno: 2 * 13 + 2 * 4 + 3.5 + 3.5,
      naplata: null,
      stavke: [
        { naziv: "Pljeskavica", jedinica: "porcija", kolicina: 2, cijena: 13, iznos: 26, prilog: false },
        { naziv: "Pomfrit", jedinica: "porcija", kolicina: 2, cijena: 0, iznos: 0, prilog: true },
        { naziv: "Riža", jedinica: "porcija", kolicina: 2, cijena: 4, iznos: 8, prilog: true },
        { naziv: PICE, jedinica: "kom", kolicina: 1, cijena: 3.5, iznos: 3.5, prilog: false },
        { naziv: "Fanta 0,25 l", jedinica: "kom", kolicina: 1, cijena: 3.5, iznos: 3.5, prilog: false },
      ],
    });
  });

  it("shows what was charged on a paid bill: discount, tip, split and who charged", async () => {
    const r = await racunOd("100.00", 6);
    await odobri(r.id, 12.5, "Stalni gost");
    const naplata = await uspjesno({ ...r, ukupno: 87.5 }, { nacin: "gotovina", gotovina: 100, vraceniKusur: 10, podijeljenoNa: 3 });

    const s = await stampa(r.id);
    expect(s.naplata).toEqual(naplata);
    expect(s).toMatchObject({
      status: "placen",
      zatvoren: expect.any(String),
      stolovi: [6],
      bruto: 100,
      ukupno: 87.5,
      popust: { procenat: 12.5, razlog: "Stalni gost", iznos: 12.5 },
    });
    expect(s.naplata).toMatchObject({ bruto: 100, popust: 12.5, ukupno: 87.5, gostDao: 100, kusur: 10, baksis: 2.5, podjela: [29.17, 29.17, 29.16] });
    expect(Object.keys(s)).not.toContain("sveIzdato");
  });

  it("names the waiter who charged, not the one who opened", async () => {
    const r = await racunOd("10.00");
    const { rows } = await (await demoBaza()).query<{ id: string; ime: string; v: number }>(
      "select id, ime, sesija_verzija as v from public.zaposlenici where uloga = 'konobar' and id <> $1 order by ime limit 1",
      [ljudi.konobar.id],
    );
    await demoRpc("naplati_racun", {
      p_konobar: rows[0].id,
      p_racun: r.id,
      p_request_id: randomUUID(),
      p_ocekivano: 10,
      p_nacin: "kartica",
      p_gotovina: null,
      p_kartica: null,
      p_kusur: null,
      p_gost_duznik: null,
      p_osoba: null,
    });
    expect((await stampa(r.id)).konobar).toBe(rows[0].ime);
  });

  it("holds nothing the receipt should not show", async () => {
    const r = await racunOd("10.00");
    const tekst = await (await stampaOdgovor(r.id)).text();
    expect(tekst).not.toMatch(/request|pin_|hash|konobar_id|storno/i);
  });
});
