import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as obavijestiRuta } from "@/app/api/konobar/obavijesti/route";
import { PATCH as pomjeriRuta } from "@/app/api/narudzbe/[id]/route";
import { GET as redRuta, POST as narudzbaRuta } from "@/app/api/narudzbe/route";
import { GET as racunStola } from "@/app/api/racuni/sto/[stoId]/route";
import { POST as transfer } from "@/app/api/stolovi/transfer/route";
import { KOLACIC_SESIJE, type Uloga } from "@/lib/auth/session";
import { potpisi } from "@/lib/auth/sessionToken";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { ocisti, osoblje, pripremiOkruzenje, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type StavkaReda = {
  id: number;
  naziv: string;
  jedinica: string;
  kolicina: number;
  napomena: string | null;
  prilogUz: number | null;
  prilogUzNaziv: string | null;
  trebaTezinu: boolean;
};
type NarudzbaReda = {
  id: string;
  broj: number;
  status: string;
  sljedeci: string | null;
  kreirano: string;
  cekaDugo: boolean;
  konobar: string;
  stolovi: number[];
  stavke: StavkaReda[];
};
type Red = { sada: string; narudzbe: NarudzbaReda[] };
type Obavijest = {
  id: string;
  broj: number;
  stanica: string;
  stolovi: number[];
  stavke: { naziv: string; kolicina: number; jedinica: string }[];
};
type Racun = { ukupno: number; narudzbe: { stavke: { id: number; naziv: string; kolicina: number; iznos: number }[] }[] };
type Stanica = "kuhinja" | "pecenjara" | "sank";

const ULOGE = ["konobar", "kuhinja", "pecenjara", "mesnica", "sefica"] as const;
const DOZVOLJENE: Record<Stanica, readonly Uloga[]> = {
  kuhinja: ["kuhinja"],
  pecenjara: ["pecenjara"],
  sank: ["konobar", "sefica"],
};
const MATRICA = (Object.keys(DOZVOLJENE) as Stanica[]).flatMap((stanica) =>
  ULOGE.map((uloga) => [stanica, uloga, DOZVOLJENE[stanica].includes(uloga)] as const),
);

const JAGNJETINA = "Jagnjetina s ražnja";
const PICE = "Coca-Cola 0,25 l";

let ljudi: Record<Uloga, Osoba>;
let id: Record<string, string>;
let drugi: Osoba;
let treci: Osoba;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
  id = await proizvodi();

  const { rows } = await (await demoBaza()).query<{ id: string; ime: string; v: number }>(
    "select id, ime, sesija_verzija as v from public.zaposlenici where uloga = 'konobar' and id <> $1 order by ime",
    [ljudi.konobar.id],
  );
  [drugi, treci] = rows.map(({ id, ime, v }) => ({
    id,
    ime,
    kolacic: `${KOLACIC_SESIJE}=${potpisi("sesija", { id, ime, uloga: "konobar", v }, process.env.SESSION_SECRET!, 3600)}`,
  }));
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  // ocisti() in pomocnici.ts predates this table.
  await (await demoBaza()).exec("delete from public.statusi_narudzbe");
  await ocisti();
});

const jelo = (naziv: string, kolicina = 1, dodatno: Record<string, unknown> = {}) => ({
  proizvodId: id[naziv],
  kolicina,
  ...dodatno,
});

async function naruci(stavke: unknown[], opcije: { sto?: number; konobar?: Osoba } = {}) {
  const odgovor = await narudzbaRuta(
    zahtjev("/api/narudzbe", {
      tijelo: { requestId: randomUUID(), stoId: opcije.sto ?? 1, stavke },
      kolacici: [(opcije.konobar ?? ljudi.konobar).kolacic],
    }),
  );
  expect(odgovor.status).toBe(201);
  const { narudzbe } = (await odgovor.json()) as { narudzbe: { id: string; stanica: Stanica }[] };
  return Object.fromEntries(narudzbe.map((n) => [n.stanica, n.id])) as Record<Stanica, string>;
}

function redOdgovor(upit: string, kolacic?: string) {
  return redRuta(zahtjev(`/api/narudzbe${upit}`, { kolacici: [kolacic] }));
}

async function red(stanica: Stanica, kolacic?: string) {
  const uloga = DOZVOLJENE[stanica][0];
  const odgovor = await redOdgovor(`?stanica=${stanica}`, kolacic ?? ljudi[uloga].kolacic);
  expect(odgovor.status).toBe(200);
  return (await odgovor.json()) as Red;
}

// zahtjev() only builds GET and POST, and the handler does not look at the method.
function pomjeri(narudzba: string, tijelo: unknown, kolacic?: string) {
  return pomjeriRuta(zahtjev(`/api/narudzbe/${narudzba}`, { tijelo, kolacici: [kolacic] }), {
    params: Promise.resolve({ id: narudzba }),
  });
}

async function uspjesno(narudzba: string, tijelo: unknown, osoba: Osoba) {
  const odgovor = await pomjeri(narudzba, tijelo, osoba.kolacic);
  expect(odgovor.status).toBe(200);
  return ((await odgovor.json()) as { narudzba: { id: string; status: string; sljedeci: string | null } }).narudzba;
}

async function status(narudzba: string) {
  const { rows } = await (await demoBaza()).query<{ status: string; cijena: number | null }>(
    "select status, cijena_pecenjari::float8 as cijena from public.narudzbe where id = $1",
    [narudzba],
  );
  return rows[0];
}

async function koraci(narudzba: string) {
  const { rows } = await (await demoBaza()).query<{ id: number; status: string; zaposlenik_id: string; vrijeme: Date }>(
    "select id::int as id, status, zaposlenik_id, vrijeme from public.statusi_narudzbe where narudzba_id = $1 order by id",
    [narudzba],
  );
  return rows;
}

async function racun(sto = 1) {
  const odgovor = await racunStola(zahtjev(`/api/racuni/sto/${sto}`, { kolacici: [ljudi.konobar.kolacic] }), {
    params: Promise.resolve({ stoId: String(sto) }),
  });
  return ((await odgovor.json()) as { racun: Racun }).racun;
}

async function linija(stavka: number) {
  const { rows } = await (await demoBaza()).query<{ kolicina: number; naruceno: number | null; iznos: number }>(
    "select kolicina::float8 as kolicina, naruceno::float8 as naruceno, iznos::float8 as iznos from public.stavke_narudzbe where id = $1",
    [stavka],
  );
  return rows[0];
}

async function zapisi() {
  const { rows } = await (await demoBaza()).query<{ radnja: string; zaposlenik_id: string; detalji: Record<string, unknown> }>(
    "select radnja, zaposlenik_id, detalji from public.dnevnik_radnji where radnja = 'pecenjara_gotovo' order by id",
  );
  return rows;
}

async function zatvori(sto = 1) {
  const db = await demoBaza();
  const { rows } = await db.query<{ racun_id: string }>("select racun_id from public.racun_stolovi where sto_id = $1", [sto]);
  await db.query("delete from public.racun_stolovi where racun_id = $1", [rows[0].racun_id]);
  await db.query("update public.racuni set status = 'placen', zatvoren = now() where id = $1", [rows[0].racun_id]);
}

function premjesti(radnja: string, stoIz: number, stoU: number) {
  return transfer(zahtjev("/api/stolovi/transfer", { tijelo: { radnja, stoIz, stoU }, kolacici: [ljudi.konobar.kolacic] }));
}

// A grill order waiting for its price and weight, with the ids of its lamb lines.
async function naRoštilju(stavke: unknown[], opcije: { sto?: number; konobar?: Osoba } = {}) {
  const { pecenjara } = await naruci(stavke, opcije);
  await uspjesno(pecenjara, { status: "U pripremi" }, ljudi.pecenjara);
  const narudzba = (await red("pecenjara")).narudzbe.find((n) => n.id === pecenjara)!;
  return { narudzba: pecenjara, stavke: narudzba.stavke, jagnjetina: narudzba.stavke.filter((s) => s.trebaTezinu).map((s) => s.id) };
}

async function izdaj(narudzba: string, stanica: Stanica) {
  const osoba = ljudi[DOZVOLJENE[stanica][0]];
  await uspjesno(narudzba, { status: "U pripremi" }, osoba);
  await uspjesno(narudzba, stanica === "pecenjara" ? { status: "Gotovo", cijena: 10 } : { status: "Gotovo" }, osoba);
  await uspjesno(narudzba, { status: "Izdato" }, osoba);
}

async function obavijesti(od: number | null, osoba: Osoba = ljudi.konobar) {
  const url = od === null ? "/api/konobar/obavijesti" : `/api/konobar/obavijesti?od=${od}`;
  const odgovor = await obavijestiRuta(zahtjev(url, { kolacici: [osoba.kolacic] }));
  expect(odgovor.status).toBe(200);
  return (await odgovor.json()) as { kursor: number; obavijesti: Obavijest[] };
}

describe("GET /api/narudzbe: who may see a queue", () => {
  it.each(MATRICA)("at %s, %s: allowed is %s", async (stanica, uloga, dozvoljeno) => {
    const odgovor = await redOdgovor(`?stanica=${stanica}`, ljudi[uloga].kolacic);
    expect(odgovor.status).toBe(dozvoljeno ? 200 : 403);
  });

  it("lets every waiter open the bar, not only the first", async () => {
    expect((await redOdgovor("?stanica=sank", drugi.kolacic)).status).toBe(200);
  });

  it("requires a session, even with a bad station", async () => {
    expect((await redOdgovor("?stanica=kuhinja")).status).toBe(401);
    expect((await redOdgovor("?stanica=mesnica")).status).toBe(401);
  });

  it.each(["", "?stanica=", "?stanica=mesnica", "?stanica=KUHINJA"])("rejects the query %j", async (upit) => {
    expect((await redOdgovor(upit, ljudi.kuhinja.kolacic)).status).toBe(400);
  });

  it.each(MATRICA)("re-checks in SQL at %s, %s: allowed is %s", async (stanica, uloga, dozvoljeno) => {
    const poziv = demoRpc("red_stanice", { p_zaposlenik: ljudi[uloga].id, p_stanica: stanica });
    if (dozvoljeno) await expect(poziv).resolves.toMatchObject({ narudzbe: [] });
    else await expect(poziv).rejects.toMatchObject({ code: "P0001" });
  });

  it("refuses a deactivated employee in SQL", async () => {
    const db = await demoBaza();
    await db.query("update public.zaposlenici set aktivan = false where id = $1", [ljudi.kuhinja.id]);
    const poziv = demoRpc("red_stanice", { p_zaposlenik: ljudi.kuhinja.id, p_stanica: "kuhinja" });
    await expect(poziv).rejects.toMatchObject({ code: "P0001" });
    await db.query("update public.zaposlenici set aktivan = true where id = $1", [ljudi.kuhinja.id]);
  });
});

describe("GET /api/narudzbe: what a queue holds", () => {
  it("gives a ticket everything it needs, and no money", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš", 2, { napomena: "bez luka" })], { sto: 7 });
    const r = await red("kuhinja");

    expect(r.narudzbe).toHaveLength(1);
    const [n] = r.narudzbe;
    expect(n).toEqual({
      id: kuhinja,
      broj: expect.any(Number),
      status: "Novo",
      sljedeci: "U pripremi",
      kreirano: expect.any(String),
      cekaDugo: false,
      konobar: ljudi.konobar.ime,
      stolovi: [7],
      stavke: [
        {
          id: expect.any(Number),
          naziv: "Gulaš",
          jedinica: "porcija",
          kolicina: 2,
          napomena: "bez luka",
          prilogUz: null,
          prilogUzNaziv: null,
          trebaTezinu: false,
          stornoRazlog: null,
        },
      ],
    });
    expect(JSON.stringify(r)).not.toMatch(/cijena|iznos|ukupno/);
  });

  it("takes its time from the database clock", async () => {
    const { rows } = await (await demoBaza()).query<{ sada: Date }>("select now() as sada");
    const { sada } = await red("kuhinja");
    expect(Math.abs(Date.parse(sada) - rows[0].sada.getTime())).toBeLessThan(60_000);
  });

  it("names the dish when a side is in another station's order", async () => {
    await naruci([jelo("Pljeskavica", 1, { prilozi: [{ proizvodId: id["Pomfrit"] }] })]);
    const [roštilj] = (await red("pecenjara")).narudzbe;
    const [kuhinja] = (await red("kuhinja")).narudzbe;

    expect(roštilj.stavke.map((s) => s.naziv)).toEqual(["Pljeskavica"]);
    expect(kuhinja.stavke[0]).toMatchObject({
      naziv: "Pomfrit",
      prilogUz: roštilj.stavke[0].id,
      prilogUzNaziv: "Pljeskavica",
    });
  });

  it("shows only its own station, oldest first", async () => {
    const prva = await naruci([jelo("Gulaš"), jelo(PICE), jelo("Pljeskavica")]);
    const druga = await naruci([jelo("Grah s mesom")], { sto: 2 });
    await (await demoBaza()).query("update public.narudzbe set kreirano = now() - interval '1 minute' where id = $1", [
      druga.kuhinja,
    ]);

    expect((await red("kuhinja")).narudzbe.map((n) => n.id)).toEqual([druga.kuhinja, prva.kuhinja]);
    expect((await red("pecenjara")).narudzbe.map((n) => n.id)).toEqual([prva.pecenjara]);
    expect((await red("sank")).narudzbe.map((n) => n.id)).toEqual([prva.sank]);
  });

  it("leaves out issued orders", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await uspjesno(kuhinja, { status: "U pripremi" }, ljudi.kuhinja);
    expect((await red("kuhinja")).narudzbe).toHaveLength(1);
    await uspjesno(kuhinja, { status: "Gotovo" }, ljudi.kuhinja);
    expect((await red("kuhinja")).narudzbe).toHaveLength(1);
    await uspjesno(kuhinja, { status: "Izdato" }, ljudi.kuhinja);
    expect((await red("kuhinja")).narudzbe).toEqual([]);
  });

  it("leaves out unfinished orders on a closed bill", async () => {
    await naruci([jelo("Gulaš")]);
    await naruci([jelo("Grah s mesom")], { sto: 2 });
    await zatvori(1);
    expect((await red("kuhinja")).narudzbe.flatMap((n) => n.stolovi)).toEqual([2]);
  });

  it("has an index for the queue", async () => {
    const plan = await (await demoBaza()).transaction(async (tx) => {
      await tx.exec("set local enable_seqscan = off");
      const { rows } = await tx.query<{ "QUERY PLAN": string }>(
        "explain select * from public.narudzbe n where n.stanica = 'kuhinja' and n.status <> 'Izdato' order by n.kreirano",
      );
      return rows.map((r) => r["QUERY PLAN"]).join("\n");
    });
    expect(plan).toContain("narudzbe_red_idx");
  });
});

describe("the 15-minute flag", () => {
  const postavi = async (razmak: string) =>
    (await demoBaza()).exec(`update public.narudzbe set kreirano = now() - interval '${razmak}'`);

  it("is off just before 15 minutes and on after", async () => {
    await naruci([jelo("Gulaš")]);
    await postavi("14 minutes 50 seconds");
    expect((await red("kuhinja")).narudzbe[0].cekaDugo).toBe(false);
    await postavi("15 minutes 1 second");
    expect((await red("kuhinja")).narudzbe[0].cekaDugo).toBe(true);
  });

  // In one transaction now() does not move, so these are the exact boundary.
  it.each([
    ["15 minutes", true],
    ["14 minutes 59.999999 seconds", false],
  ])("after %s is %s", async (razmak, ocekivano) => {
    await naruci([jelo("Gulaš")]);
    const v = await (await demoBaza()).transaction(async (tx) => {
      await tx.exec(`update public.narudzbe set kreirano = now() - interval '${razmak}'`);
      const { rows } = await tx.query<{ v: Red }>("select public.red_stanice($1, 'kuhinja') as v", [ljudi.kuhinja.id]);
      return rows[0].v;
    });
    expect(v.narudzbe[0].cekaDugo).toBe(ocekivano);
  });

  it("stays on for an order already being prepared", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await uspjesno(kuhinja, { status: "U pripremi" }, ljudi.kuhinja);
    await postavi("20 minutes");
    expect((await red("kuhinja")).narudzbe[0]).toMatchObject({ status: "U pripremi", cekaDugo: true });
  });
});

describe("PATCH /api/narudzbe/[id]: who may move an order", () => {
  it.each(MATRICA)("at %s, %s: allowed is %s", async (stanica, uloga, dozvoljeno) => {
    const narudzbe = await naruci([jelo("Gulaš"), jelo("Pljeskavica"), jelo(PICE)]);
    const odgovor = await pomjeri(narudzbe[stanica], { status: "U pripremi" }, ljudi[uloga].kolacic);

    // mesnica has no station at all. The rest pass the route and SQL refuses them for this order.
    expect(odgovor.status).toBe(dozvoljeno ? 200 : uloga === "mesnica" ? 403 : 422);
    expect((await status(narudzbe[stanica])).status).toBe(dozvoljeno ? "U pripremi" : "Novo");
    expect(await koraci(narudzbe[stanica])).toHaveLength(dozvoljeno ? 1 : 0);
  });

  it("says why, in Bosnian, when a station is not the order's own", async () => {
    const { pecenjara } = await naruci([jelo("Pljeskavica")]);
    const odgovor = await pomjeri(pecenjara, { status: "U pripremi" }, ljudi.kuhinja.kolacic);
    expect(await odgovor.json()).toEqual({ greska: "Nemate pravo na ovu radnju." });
  });

  it("requires a session", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    expect((await pomjeri(kuhinja, { status: "U pripremi" })).status).toBe(401);
  });

  it("refuses a deactivated employee in SQL", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    const db = await demoBaza();
    await db.query("update public.zaposlenici set aktivan = false where id = $1", [ljudi.kuhinja.id]);
    await expect(
      demoRpc("promijeni_status_narudzbe", {
        p_zaposlenik: ljudi.kuhinja.id,
        p_narudzba: kuhinja,
        p_status: "U pripremi",
        p_cijena: null,
        p_tezine: null,
      }),
    ).rejects.toMatchObject({ code: "P0001" });
    await db.query("update public.zaposlenici set aktivan = true where id = $1", [ljudi.kuhinja.id]);
  });

  it("names an unknown order", async () => {
    const odgovor = await pomjeri(randomUUID(), { status: "U pripremi" }, ljudi.kuhinja.kolacic);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Narudžba nije pronađena." });
  });

  it("rejects a bad order id", async () => {
    expect((await pomjeri("1", { status: "U pripremi" }, ljudi.kuhinja.kolacic)).status).toBe(400);
  });

  it.each<[string, unknown]>([
    ["no body", undefined],
    ["no status", {}],
    ["an unknown status", { status: "Gotov" }],
    ["a move back to Novo", { status: "Novo" }],
    ["an unknown field", { status: "U pripremi", iznos: 1 }],
    ["a price on the wrong step", { status: "U pripremi", cijena: 1 }],
    ["a weight on the wrong step", { status: "Izdato", tezine: [] }],
    ["a price as text", { status: "Gotovo", cijena: "5" }],
    ["an unknown field with Gotovo", { status: "Gotovo", cijena: 5, ukupno: 1 }],
    ["a weight as text", { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: 1, kg: "1" }] }],
    ["a bad line id", { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: "1", kg: 1 }] }],
    ["a client amount on a weight", { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: 1, kg: 1, iznos: 1 }] }],
  ])("rejects %s with 400", async (_opis, tijelo) => {
    const { pecenjara } = await naruci([jelo("Pljeskavica")]);
    expect((await pomjeri(pecenjara, tijelo ?? "", ljudi.pecenjara.kolacic)).status).toBe(400);
    expect((await status(pecenjara)).status).toBe("Novo");
  });
});

describe("PATCH /api/narudzbe/[id]: the path", () => {
  it.each<[Stanica, string, Uloga, string[]]>([
    ["kuhinja", "Gulaš", "kuhinja", ["U pripremi", "Gotovo", "Izdato"]],
    ["sank", PICE, "konobar", ["U pripremi", "Gotovo", "Izdato"]],
    ["pecenjara", "Pljeskavica", "pecenjara", ["U pripremi", "Gotovo", "Izdato"]],
  ])("%s goes one step at a time, and the queue names each step", async (stanica, naziv, uloga, put) => {
    const narudzba = (await naruci([jelo(naziv)]))[stanica];
    for (const korak of put) {
      expect((await red(stanica, ljudi[uloga].kolacic)).narudzbe[0].sljedeci).toBe(korak);
      const tijelo = korak === "Gotovo" && stanica === "pecenjara" ? { status: korak, cijena: 10 } : { status: korak };
      const rezultat = await uspjesno(narudzba, tijelo, ljudi[uloga]);
      expect(rezultat).toMatchObject({ id: narudzba, status: korak });
    }
    expect(await uspjesno(narudzba, { status: "Izdato" }, ljudi[uloga])).toEqual({ id: narudzba, status: "Izdato", sljedeci: null });
    expect((await red(stanica, ljudi[uloga].kolacic)).narudzbe).toEqual([]);
  });

  it.each<[string, Stanica, string, string[], string]>([
    ["kitchen, Novo to Izdato", "kuhinja", "Gulaš", [], "Izdato"],
    ["kitchen, U pripremi to Izdato", "kuhinja", "Gulaš", ["U pripremi"], "Izdato"],
    ["bar, U pripremi to Izdato", "sank", PICE, ["U pripremi"], "Izdato"],
    ["grill, Novo to Gotovo", "pecenjara", "Pljeskavica", [], "Gotovo"],
    ["grill, Novo to Izdato", "pecenjara", "Pljeskavica", [], "Izdato"],
    ["grill, U pripremi to Izdato", "pecenjara", "Pljeskavica", ["U pripremi"], "Izdato"],
  ])("refuses a skip: %s", async (_opis, stanica, naziv, prije, cilj) => {
    const narudzba = (await naruci([jelo(naziv)]))[stanica];
    const osoba = ljudi[DOZVOLJENE[stanica][0]];
    for (const korak of prije) await uspjesno(narudzba, { status: korak }, osoba);
    const tekuci = (await status(narudzba)).status;

    const odgovor = await pomjeri(narudzba, cilj === "Gotovo" ? { status: cilj, cijena: 5 } : { status: cilj }, osoba.kolacic);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: `Narudžba je u statusu „${tekuci}“ i ne može preći u „${cilj}“.` });
    expect((await status(narudzba)).status).toBe(tekuci);
  });

  it("only moves forward", async () => {
    const { pecenjara } = await naruci([jelo("Pljeskavica")]);
    const osoba = ljudi.pecenjara;
    await uspjesno(pecenjara, { status: "U pripremi" }, osoba);
    await uspjesno(pecenjara, { status: "Gotovo", cijena: 5 }, osoba);
    expect((await pomjeri(pecenjara, { status: "U pripremi" }, osoba.kolacic)).status).toBe(422);
    expect((await status(pecenjara)).status).toBe("Gotovo");

    await uspjesno(pecenjara, { status: "Izdato" }, osoba);
    expect((await pomjeri(pecenjara, { status: "Gotovo", cijena: 5 }, osoba.kolacic)).status).toBe(422);
    expect((await pomjeri(pecenjara, { status: "U pripremi" }, osoba.kolacic)).status).toBe(422);
    expect((await status(pecenjara)).status).toBe("Izdato");
  });

  it("refuses a move back to Novo in SQL too", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await uspjesno(kuhinja, { status: "U pripremi" }, ljudi.kuhinja);
    await expect(
      demoRpc("promijeni_status_narudzbe", {
        p_zaposlenik: ljudi.kuhinja.id,
        p_narudzba: kuhinja,
        p_status: "Novo",
        p_cijena: null,
        p_tezine: null,
      }),
    ).rejects.toMatchObject({ code: "P0001" });
    expect((await status(kuhinja)).status).toBe("U pripremi");
  });

  it("returns the current state for a double tap, and records one step", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    const prvi = await uspjesno(kuhinja, { status: "U pripremi" }, ljudi.kuhinja);
    const drugiTap = await uspjesno(kuhinja, { status: "U pripremi" }, ljudi.kuhinja);
    expect(drugiTap).toEqual(prvi);
    expect(await koraci(kuhinja)).toHaveLength(1);
  });

  it("holds for parallel taps: no skipped step, no error", async () => {
    const { pecenjara } = await naruci([jelo("Pljeskavica")]);
    const odgovori = await Promise.all(
      Array.from({ length: 5 }, () => pomjeri(pecenjara, { status: "U pripremi" }, ljudi.pecenjara.kolacic)),
    );
    expect(odgovori.map((o) => o.status)).toEqual([200, 200, 200, 200, 200]);
    for (const o of await Promise.all(odgovori.map((o) => o.json()))) {
      expect(o).toEqual({ narudzba: { id: pecenjara, status: "U pripremi", sljedeci: "Gotovo" } });
    }
    expect((await koraci(pecenjara)).map((k) => k.status)).toEqual(["U pripremi"]);
  });

  it("records who made each step and when", async () => {
    const { sank } = await naruci([jelo(PICE)]);
    await uspjesno(sank, { status: "U pripremi" }, ljudi.sefica);
    await uspjesno(sank, { status: "Gotovo" }, ljudi.sefica);
    await uspjesno(sank, { status: "Izdato" }, drugi);
    // A second tap by someone else does not take the step over.
    await uspjesno(sank, { status: "Izdato" }, ljudi.konobar);

    const redovi = await koraci(sank);
    expect(redovi.map((k) => [k.status, k.zaposlenik_id])).toEqual([
      ["U pripremi", ljudi.sefica.id],
      ["Gotovo", ljudi.sefica.id],
      ["Izdato", drugi.id],
    ]);
    for (const k of redovi) expect(Date.now() - k.vrijeme.getTime()).toBeLessThan(60_000);
  });

  it("refuses a move on a closed bill, but still reports the state", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await uspjesno(kuhinja, { status: "U pripremi" }, ljudi.kuhinja);
    await zatvori();

    const odgovor = await pomjeri(kuhinja, { status: "Gotovo" }, ljudi.kuhinja.kolacic);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun je zatvoren." });
    expect((await uspjesno(kuhinja, { status: "U pripremi" }, ljudi.kuhinja)).status).toBe("U pripremi");
  });

  // PGlite has one connection, so moves cannot really interleave here. This pins what makes them safe on Postgres.
  it("holds the bills lock until it commits", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    const brave = await (await demoBaza()).transaction(async (tx) => {
      await tx.query("select public.promijeni_status_narudzbe($1, $2, 'U pripremi', null, null)", [ljudi.kuhinja.id, kuhinja]);
      return (await tx.query<{ mode: string }>("select mode from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()")).rows;
    });
    expect(brave).toEqual([{ mode: "ExclusiveLock" }]);
  });

  it("does not change the bill", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš", 2)]);
    await izdaj(kuhinja, "kuhinja");
    expect((await racun()).ukupno).toBe(26);
  });
});

describe("the grill's price and the lamb's real weight", () => {
  it("bills the real weight, keeps the ordered one, and logs both", async () => {
    const { narudzba, jagnjetina: [stavka], stavke } = await naRoštilju([
      jelo(JAGNJETINA, 0.5, { prilozi: [{ proizvodId: id["Pomfrit"] }] }),
      jelo("Pljeskavica"),
    ]);
    expect(stavke.map((s) => [s.naziv, s.trebaTezinu])).toEqual([
      [JAGNJETINA, true],
      ["Pljeskavica", false],
    ]);
    expect((await racun()).ukupno).toBe(42); // 25 + 13 + 4

    await uspjesno(narudzba, { status: "Gotovo", cijena: 20, tezine: [{ stavkaId: stavka, kg: 0.62 }] }, ljudi.pecenjara);

    expect(await linija(stavka)).toEqual({ kolicina: 0.62, naruceno: 0.5, iznos: 31 });
    expect(await status(narudzba)).toEqual({ status: "Gotovo", cijena: 20 });
    const r = await racun();
    expect(r.ukupno).toBe(48); // 31 + 13 + 4
    const sve = r.narudzbe.flatMap((n) => n.stavke);
    // Only the lamb line moves. The side stays one portion, as the rule for dishes by kg says.
    expect(sve.find((s) => s.naziv === "Pomfrit")).toMatchObject({ kolicina: 1, iznos: 4 });
    expect(sve.find((s) => s.naziv === "Pljeskavica")).toMatchObject({ kolicina: 1, iznos: 13 });

    const [zapis, ...ostali] = await zapisi();
    expect(ostali).toEqual([]);
    expect(zapis.zaposlenik_id).toBe(ljudi.pecenjara.id);
    expect(zapis.detalji).toEqual({
      narudzba,
      racun: expect.any(String),
      cijena: 20,
      tezine: [
        {
          stavka,
          naziv: JAGNJETINA,
          staraKolicina: 0.5,
          novaKolicina: 0.62,
          cijena: 50,
          stariIznos: 25,
          noviIznos: 31,
        },
      ],
    });
  });

  it.each([
    [33.33, 0.5, 16.67], // 16.665 exactly: rounds up, where floats may not
    [33.33, 0.123, 4.1], // 4.09959
    [50, 0.333, 16.65],
    [50, 0.001, 0.05],
    [50, 100, 5000],
  ])("at %d KM/kg, %d kg comes to exactly %d KM", async (cijena, kg, iznos) => {
    const { narudzba, jagnjetina: [stavka] } = await naRoštilju([jelo(JAGNJETINA, 1)]);
    await (await demoBaza()).query("update public.stavke_narudzbe set cijena = $1 where id = $2", [cijena, stavka]);

    await uspjesno(narudzba, { status: "Gotovo", cijena: 0, tezine: [{ stavkaId: stavka, kg }] }, ljudi.pecenjara);
    expect((await linija(stavka)).iznos).toBe(iznos);
    expect((await racun()).ukupno).toBe(iznos);
  });

  it("totals a bill from the rounded lines", async () => {
    const { narudzba, jagnjetina } = await naRoštilju([jelo(JAGNJETINA, 1), jelo(JAGNJETINA, 1, { napomena: "bez soli" })]);
    await (await demoBaza()).query("update public.stavke_narudzbe set cijena = 33.33");

    await uspjesno(
      narudzba,
      { status: "Gotovo", cijena: 0, tezine: [{ stavkaId: jagnjetina[0], kg: 0.5 }, { stavkaId: jagnjetina[1], kg: 0.123 }] },
      ljudi.pecenjara,
    );
    expect((await racun()).ukupno).toBe(20.77); // 16.67 + 4.10
  });

  it("weighs every lamb line in the order, and refuses part of them", async () => {
    const { narudzba, jagnjetina } = await naRoštilju([jelo(JAGNJETINA, 0.5), jelo(JAGNJETINA, 0.5, { napomena: "bez soli" })]);
    expect(jagnjetina).toHaveLength(2);

    const djelimicno = await pomjeri(narudzba, { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: jagnjetina[0], kg: 1 }] }, ljudi.pecenjara.kolacic);
    expect(djelimicno.status).toBe(422);
    expect(((await djelimicno.json()) as { greska: string }).greska).toContain(`„${JAGNJETINA}“`);
    expect(await linija(jagnjetina[0])).toEqual({ kolicina: 0.5, naruceno: null, iznos: 25 });

    await uspjesno(
      narudzba,
      { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: jagnjetina[0], kg: 1 }, { stavkaId: jagnjetina[1], kg: 0.2 }] },
      ljudi.pecenjara,
    );
    expect((await racun()).ukupno).toBe(60); // 50 + 10
  });

  it.each([["Porcija pečene jagnjetine"], ["Janjeća puca"], ["Pečena janjeća glava"], ["Teletina ispod sača"], ["Pljeskavica"]])(
    "asks no weight for %s, and refuses one",
    async (naziv) => {
      const { narudzba, stavke, jagnjetina } = await naRoštilju([jelo(naziv, 1)]);
      expect(jagnjetina).toEqual([]);
      const ukupno = (await racun()).ukupno;

      const odgovor = await pomjeri(narudzba, { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: stavke[0].id, kg: 2 }] }, ljudi.pecenjara.kolacic);
      expect(odgovor.status).toBe(422);
      expect((await status(narudzba)).status).toBe("U pripremi");

      await uspjesno(narudzba, { status: "Gotovo", cijena: 5 }, ljudi.pecenjara);
      expect((await racun()).ukupno).toBe(ukupno);
    },
  );

  // Today's menu has no such dish by the portion: "Porcija pečene jagnjetine" spells it differently.
  it.each([
    [JAGNJETINA, "kg", true],
    ["JAGNJETINA", "kg", true],
    ["Jagnjetina", "porcija", false],
    ["Teletina ispod sača", "kg", false],
  ])("weighs %s by %s: %s", async (naziv, jedinica, ocekivano) => {
    const { rows } = await (await demoBaza()).query<{ v: boolean }>(
      "select public.je_jagnjetina($1, $2::text::public.jedinica) as v",
      [naziv, jedinica],
    );
    expect(rows[0].v).toBe(ocekivano);
  });

  it("never lets the grill's price touch the guest's bill", async () => {
    const { narudzba } = await naRoštilju([jelo("Pljeskavica", 2)]);
    await uspjesno(narudzba, { status: "Gotovo", cijena: 999.99 }, ljudi.pecenjara);
    expect((await racun()).ukupno).toBe(26);
    expect((await status(narudzba)).cijena).toBe(999.99);
  });

  it.each<[string, unknown]>([
    ["no price", undefined],
    ["a negative price", -0.01],
    ["a price over the limit", 100000],
    ["a price with 3 decimals", 1.234],
  ])("refuses %s, and changes nothing", async (_opis, cijena) => {
    const { narudzba, jagnjetina: [stavka] } = await naRoštilju([jelo(JAGNJETINA, 0.5)]);
    const odgovor = await pomjeri(narudzba, { status: "Gotovo", cijena, tezine: [{ stavkaId: stavka, kg: 1 }] }, ljudi.pecenjara.kolacic);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Unesite cijenu koju konobar plaća pečenjari, od 0 do 99.999,99 KM." });
    expect(await status(narudzba)).toEqual({ status: "U pripremi", cijena: null });
    expect(await linija(stavka)).toEqual({ kolicina: 0.5, naruceno: null, iznos: 25 });
    expect(await zapisi()).toEqual([]);
  });

  it.each([[0], [99999.99]])("accepts a price of %d", async (cijena) => {
    const { narudzba } = await naRoštilju([jelo("Pljeskavica")]);
    await uspjesno(narudzba, { status: "Gotovo", cijena }, ljudi.pecenjara);
    expect((await status(narudzba)).cijena).toBe(cijena);
  });

  it.each([[0], [-1], [100.001], [1.2345]])("refuses a weight of %d kg, and changes nothing", async (kg) => {
    const { narudzba, jagnjetina: [stavka] } = await naRoštilju([jelo(JAGNJETINA, 0.5)]);
    const odgovor = await pomjeri(narudzba, { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: stavka, kg }] }, ljudi.pecenjara.kolacic);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: `Unesite stvarnu količinu za „${JAGNJETINA}“, od 0,001 do 100 kg.` });
    expect(await status(narudzba)).toEqual({ status: "U pripremi", cijena: null });
    expect(await linija(stavka)).toEqual({ kolicina: 0.5, naruceno: null, iznos: 25 });
    expect(await zapisi()).toEqual([]);
  });

  it("refuses a lamb order with no weight", async () => {
    const { narudzba } = await naRoštilju([jelo(JAGNJETINA, 0.5)]);
    expect((await pomjeri(narudzba, { status: "Gotovo", cijena: 5 }, ljudi.pecenjara.kolacic)).status).toBe(422);
    expect((await status(narudzba)).status).toBe("U pripremi");
  });

  it("refuses the same line twice", async () => {
    const { narudzba, jagnjetina: [stavka] } = await naRoštilju([jelo(JAGNJETINA, 0.5)]);
    const odgovor = await pomjeri(
      narudzba,
      { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: stavka, kg: 1 }, { stavkaId: stavka, kg: 2 }] },
      ljudi.pecenjara.kolacic,
    );
    expect(odgovor.status).toBe(422);
    expect(await linija(stavka)).toEqual({ kolicina: 0.5, naruceno: null, iznos: 25 });
  });

  it("refuses a lamb line from another order, and rolls back the lines before it", async () => {
    const prva = await naRoštilju([jelo(JAGNJETINA, 0.5)]);
    const druga = await naRoštilju([jelo(JAGNJETINA, 0.5)], { sto: 2 });
    const tudja = { stavkaId: druga.jagnjetina[0], kg: 1 };

    expect((await pomjeri(prva.narudzba, { status: "Gotovo", cijena: 5, tezine: [tudja] }, ljudi.pecenjara.kolacic)).status).toBe(422);
    const uz = await pomjeri(prva.narudzba, { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: prva.jagnjetina[0], kg: 1 }, tudja] }, ljudi.pecenjara.kolacic);
    expect(uz.status).toBe(422);

    expect(await linija(prva.jagnjetina[0])).toEqual({ kolicina: 0.5, naruceno: null, iznos: 25 });
    expect(await linija(druga.jagnjetina[0])).toEqual({ kolicina: 0.5, naruceno: null, iznos: 25 });
  });

  it.each(["kuhinja", "konobar", "sefica", "mesnica"] as const)("refuses %s", async (uloga) => {
    const { narudzba, jagnjetina: [stavka] } = await naRoštilju([jelo(JAGNJETINA, 0.5)]);
    const odgovor = await pomjeri(narudzba, { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: stavka, kg: 1 }] }, ljudi[uloga].kolacic);
    expect(odgovor.status).toBe(uloga === "mesnica" ? 403 : 422);
    expect(await linija(stavka)).toEqual({ kolicina: 0.5, naruceno: null, iznos: 25 });
    expect(await zapisi()).toEqual([]);
  });

  it("gives other stations no way to enter a price", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await uspjesno(kuhinja, { status: "U pripremi" }, ljudi.kuhinja);
    await uspjesno(kuhinja, { status: "Gotovo", cijena: 5 }, ljudi.kuhinja);
    expect(await status(kuhinja)).toEqual({ status: "Gotovo", cijena: null });
    expect(await zapisi()).toEqual([]);
  });

  it("refuses a weight on a closed bill", async () => {
    const { narudzba, jagnjetina: [stavka] } = await naRoštilju([jelo(JAGNJETINA, 0.5)]);
    await zatvori();
    const odgovor = await pomjeri(narudzba, { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: stavka, kg: 1 }] }, ljudi.pecenjara.kolacic);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun je zatvoren." });
    expect(await linija(stavka)).toEqual({ kolicina: 0.5, naruceno: null, iznos: 25 });
  });

  it("applies a double tap once, whatever the second one says", async () => {
    const { narudzba, jagnjetina: [stavka] } = await naRoštilju([jelo(JAGNJETINA, 0.5)]);
    await uspjesno(narudzba, { status: "Gotovo", cijena: 20, tezine: [{ stavkaId: stavka, kg: 0.62 }] }, ljudi.pecenjara);
    const ponovo = await uspjesno(narudzba, { status: "Gotovo", cijena: 99, tezine: [{ stavkaId: stavka, kg: 9 }] }, ljudi.pecenjara);

    expect(ponovo).toEqual({ id: narudzba, status: "Gotovo", sljedeci: "Izdato" });
    expect(await linija(stavka)).toEqual({ kolicina: 0.62, naruceno: 0.5, iznos: 31 });
    expect((await status(narudzba)).cijena).toBe(20);
    expect(await zapisi()).toHaveLength(1);
  });

  it("charges the bill that survived a merge", async () => {
    await naruci([jelo("Gulaš")]);
    const { narudzba, jagnjetina: [stavka] } = await naRoštilju([jelo(JAGNJETINA, 0.5)], { sto: 2, konobar: drugi });
    expect((await premjesti("spoji", 2, 1)).status).toBe(200);
    expect((await racun()).ukupno).toBe(38); // 13 + 25

    await uspjesno(narudzba, { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: stavka, kg: 1 }] }, ljudi.pecenjara);
    expect((await racun()).ukupno).toBe(63); // 13 + 50
  });

  it("re-checks the weight in SQL when the route is bypassed", async () => {
    const { narudzba } = await naRoštilju([jelo(JAGNJETINA, 0.5)]);
    await expect(
      demoRpc("promijeni_status_narudzbe", {
        p_zaposlenik: ljudi.pecenjara.id,
        p_narudzba: narudzba,
        p_status: "Gotovo",
        p_cijena: 5,
        p_tezine: { stavkaId: 1, kg: 1 },
      }),
    ).rejects.toMatchObject({ code: "P0001" });
  });
});

describe("GET /api/konobar/obavijesti", () => {
  it("requires a session", async () => {
    expect((await obavijestiRuta(zahtjev("/api/konobar/obavijesti"))).status).toBe(401);
  });

  it.each(["kuhinja", "pecenjara", "mesnica", "sefica"] as const)("refuses %s", async (uloga) => {
    const odgovor = await obavijestiRuta(zahtjev("/api/konobar/obavijesti", { kolacici: [ljudi[uloga].kolacic] }));
    expect(odgovor.status).toBe(403);
  });

  it("re-checks the role in SQL", async () => {
    await expect(demoRpc("obavijesti_konobara", { p_konobar: ljudi.kuhinja.id, p_od: null })).rejects.toMatchObject({ code: "P0001" });
  });

  it.each(["", "abc", "-1", "1.5", "1e3", "2026-11-03T12:00:00Z", "1234567890123456"])("rejects the cursor %j", async (od) => {
    const odgovor = await obavijestiRuta(zahtjev(`/api/konobar/obavijesti?od=${od}`, { kolacici: [ljudi.konobar.kolacic] }));
    expect(odgovor.status).toBe(400);
  });

  it("starts from now on the first poll, with no history", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await izdaj(kuhinja, "kuhinja");
    const prvi = await obavijesti(null);
    expect(prvi.obavijesti).toEqual([]);
    expect(prvi.kursor).toBe((await koraci(kuhinja)).at(-1)!.id);
    expect((await obavijesti(prvi.kursor)).obavijesti).toEqual([]);
  });

  it("says which table and what was issued, with no money", async () => {
    const { kursor } = await obavijesti(null);
    const { pecenjara } = await naruci([jelo("Pljeskavica", 2), jelo(JAGNJETINA, 0.5)], { sto: 4 });
    await uspjesno(pecenjara, { status: "U pripremi" }, ljudi.pecenjara);
    const stavka = (await red("pecenjara")).narudzbe[0].stavke.find((s) => s.trebaTezinu)!.id;
    await uspjesno(pecenjara, { status: "Gotovo", cijena: 5, tezine: [{ stavkaId: stavka, kg: 0.62 }] }, ljudi.pecenjara);
    await uspjesno(pecenjara, { status: "Izdato" }, ljudi.pecenjara);

    const odgovor = await obavijesti(kursor);
    expect(odgovor.obavijesti).toEqual([
      {
        id: pecenjara,
        broj: expect.any(Number),
        stanica: "pecenjara",
        stolovi: [4],
        stavke: [
          { naziv: "Pljeskavica", kolicina: 2, jedinica: "porcija" },
          { naziv: JAGNJETINA, kolicina: 0.62, jedinica: "kg" },
        ],
      },
    ]);
    expect(JSON.stringify(odgovor)).not.toMatch(/cijena|iznos|ukupno/);
  });

  it("neither misses nor repeats an order at the cursor", async () => {
    const pocetak = (await obavijesti(null)).kursor;
    const a = (await naruci([jelo("Gulaš")])).kuhinja;
    await izdaj(a, "kuhinja");
    const naKursoru = (await koraci(a)).at(-1)!.id;

    expect((await obavijesti(naKursoru)).obavijesti).toEqual([]); // exactly at the cursor: already seen
    expect((await obavijesti(naKursoru - 1)).obavijesti.map((o) => o.id)).toEqual([a]); // one below: not yet

    const prvi = await obavijesti(pocetak);
    expect(prvi.obavijesti.map((o) => o.id)).toEqual([a]);
    expect(prvi.kursor).toBe(naKursoru);
    expect((await obavijesti(prvi.kursor)).obavijesti).toEqual([]);

    const b = (await naruci([jelo("Grah s mesom")])).kuhinja;
    await izdaj(b, "kuhinja");
    const drugiPut = await obavijesti(prvi.kursor);
    expect(drugiPut.obavijesti.map((o) => o.id)).toEqual([b]);
    expect((await obavijesti(drugiPut.kursor)).obavijesti).toEqual([]);
  });

  it("returns everything issued between two polls, in order", async () => {
    const { kursor } = await obavijesti(null);
    const { kuhinja, sank, pecenjara } = await naruci([jelo("Gulaš"), jelo(PICE), jelo("Pljeskavica")]);
    await izdaj(sank, "sank");
    await izdaj(kuhinja, "kuhinja");
    await izdaj(pecenjara, "pecenjara");
    expect((await obavijesti(kursor)).obavijesti.map((o) => o.id)).toEqual([sank, kuhinja, pecenjara]);
  });

  it("stays silent until an order is issued", async () => {
    const { kursor } = await obavijesti(null);
    const { pecenjara } = await naruci([jelo("Pljeskavica")]);
    await uspjesno(pecenjara, { status: "U pripremi" }, ljudi.pecenjara);
    await uspjesno(pecenjara, { status: "Gotovo", cijena: 5 }, ljudi.pecenjara);
    expect((await obavijesti(kursor)).obavijesti).toEqual([]);
  });

  it("moves past other waiters' orders without losing a later one of mine", async () => {
    const { kursor } = await obavijesti(null);
    const tudja = (await naruci([jelo("Gulaš")], { sto: 2, konobar: drugi })).kuhinja;
    await izdaj(tudja, "kuhinja");

    const prazno = await obavijesti(kursor);
    expect(prazno.obavijesti).toEqual([]);
    expect(prazno.kursor).toBeGreaterThan(kursor);

    const moja = (await naruci([jelo("Grah s mesom")])).kuhinja;
    await izdaj(moja, "kuhinja");
    expect((await obavijesti(prazno.kursor)).obavijesti.map((o) => o.id)).toEqual([moja]);
  });

  it("pages a long backlog without skipping any", async () => {
    await naruci([jelo("Gulaš")]);
    const db = await demoBaza();
    const { kursor } = await obavijesti(null);
    await db.query(
      `insert into public.narudzbe (racun_id, request_id, stanica, konobar_id, status)
       select r.id, gen_random_uuid(), 'kuhinja', $1, 'Izdato' from public.racuni r, generate_series(1, 51)`,
      [ljudi.konobar.id],
    );
    await db.query(
      "insert into public.statusi_narudzbe (narudzba_id, status, zaposlenik_id) select id, 'Izdato', $1 from public.narudzbe where status = 'Izdato'",
      [ljudi.kuhinja.id],
    );

    const prva = await obavijesti(kursor);
    expect(prva.obavijesti).toHaveLength(50);
    const druga = await obavijesti(prva.kursor);
    expect(druga.obavijesti).toHaveLength(1);
    expect(new Set([...prva.obavijesti, ...druga.obavijesti].map((o) => o.id)).size).toBe(51);
    expect((await obavijesti(druga.kursor)).obavijesti).toEqual([]);
  });

  it("resets a cursor from the future to the real end", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await izdaj(kuhinja, "kuhinja");
    const odgovor = await obavijesti(999999999999999);
    expect(odgovor.obavijesti).toEqual([]);
    expect(odgovor.kursor).toBe((await koraci(kuhinja)).at(-1)!.id);
  });

  it("waits for moves in progress: volatile, and under the shared lock", async () => {
    const db = await demoBaza();
    const { rows } = await db.query<{ provolatile: string }>("select provolatile from pg_proc where proname = 'obavijesti_konobara'");
    expect(rows).toEqual([{ provolatile: "v" }]);

    const brave = await db.transaction(async (tx) => {
      await tx.query("select public.obavijesti_konobara($1, null)", [ljudi.konobar.id]);
      return (await tx.query<{ mode: string }>("select mode from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()")).rows;
    });
    expect(brave).toEqual([{ mode: "ShareLock" }]);
  });

  it("still names the table when the bill was paid before the poll", async () => {
    const { kursor } = await obavijesti(null);
    const { kuhinja } = await naruci([jelo("Gulaš")], { sto: 9 });
    await izdaj(kuhinja, "kuhinja");
    await zatvori(9);
    expect((await obavijesti(kursor)).obavijesti[0].stolovi).toEqual([9]);
  });
});

describe("merged, moved and shared tables", () => {
  it("keeps a merged table's orders in the queue, with both tables on them", async () => {
    const a = (await naruci([jelo("Gulaš")], { sto: 1 })).kuhinja;
    const b = (await naruci([jelo("Grah s mesom")], { sto: 2, konobar: drugi })).kuhinja;
    expect((await premjesti("spoji", 2, 1)).status).toBe(200);

    const { narudzbe } = await red("kuhinja");
    expect(narudzbe.map((n) => [n.id, n.stolovi, n.konobar])).toEqual([
      [a, [1, 2], ljudi.konobar.ime],
      [b, [1, 2], drugi.ime],
    ]);
  });

  it("lets an order on a merged-away bill keep moving", async () => {
    const b = (await naruci([jelo("Grah s mesom")], { sto: 2, konobar: drugi })).kuhinja;
    await naruci([jelo("Gulaš")], { sto: 1 });
    await uspjesno(b, { status: "U pripremi" }, ljudi.kuhinja);
    await premjesti("spoji", 2, 1);
    expect((await uspjesno(b, { status: "Gotovo" }, ljudi.kuhinja)).status).toBe("Gotovo");
  });

  it("follows a moved table", async () => {
    await naruci([jelo("Gulaš")], { sto: 1 });
    expect((await premjesti("premjesti", 1, 5)).status).toBe(200);
    expect((await red("kuhinja")).narudzbe[0].stolovi).toEqual([5]);
  });

  it("shows a table added to the bill", async () => {
    await naruci([jelo("Gulaš")], { sto: 1 });
    expect((await premjesti("dodaj", 1, 6)).status).toBe(200);
    expect((await red("kuhinja")).narudzbe[0].stolovi).toEqual([1, 6]);
  });

  it("names the new table in a notification after a move", async () => {
    const { kursor } = await obavijesti(null);
    const { kuhinja } = await naruci([jelo("Gulaš")], { sto: 1 });
    await premjesti("premjesti", 1, 5);
    await izdaj(kuhinja, "kuhinja");
    expect((await obavijesti(kursor)).obavijesti.map((o) => o.stolovi)).toEqual([[5]]);
  });

  it("after a merge, tells both the waiter who placed the order and the one holding the bill", async () => {
    const [kA, kB, kC] = await Promise.all([obavijesti(null), obavijesti(null, drugi), obavijesti(null, treci)]);
    const a = (await naruci([jelo("Gulaš")], { sto: 1 })).kuhinja;
    const b = (await naruci([jelo("Grah s mesom")], { sto: 2, konobar: drugi })).kuhinja;
    await premjesti("spoji", 2, 1);
    await izdaj(b, "kuhinja");
    await izdaj(a, "kuhinja");

    const uDrzacaRacuna = (await obavijesti(kA.kursor)).obavijesti;
    expect(uDrzacaRacuna.map((o) => [o.id, o.stolovi])).toEqual([
      [b, [1, 2]],
      [a, [1, 2]],
    ]);
    // The other waiter placed b only, and their own bill is gone.
    expect((await obavijesti(kB.kursor, drugi)).obavijesti.map((o) => [o.id, o.stolovi])).toEqual([[b, [1, 2]]]);
    expect((await obavijesti(kC.kursor, treci)).obavijesti).toEqual([]);
  });

  it("tells both when a colleague adds to a table", async () => {
    const [kA, kB, kC] = await Promise.all([obavijesti(null), obavijesti(null, drugi), obavijesti(null, treci)]);
    await naruci([jelo("Gulaš")], { sto: 1 });
    const dodata = (await naruci([jelo("Grah s mesom")], { sto: 1, konobar: drugi })).kuhinja;
    await izdaj(dodata, "kuhinja");

    expect((await obavijesti(kA.kursor)).obavijesti.map((o) => o.id)).toEqual([dodata]);
    expect((await obavijesti(kB.kursor, drugi)).obavijesti.map((o) => o.id)).toEqual([dodata]);
    expect((await obavijesti(kC.kursor, treci)).obavijesti).toEqual([]);
  });
});
