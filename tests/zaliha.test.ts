import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as stornoRuta } from "@/app/api/narudzbe/stavka/[id]/storno/route";
import { GET as nabavkaGet } from "@/app/api/zaliha/nabavka/route";
import { POST as prodajaPost } from "@/app/api/zaliha/prodaja/route";
import { GET as prometGet, POST as prometPost } from "@/app/api/zaliha/promet/route";
import { GET as receptiGet, POST as receptiPost } from "@/app/api/zaliha/recepti/route";
import { GET as zalihaGet, PATCH as zalihaPatch } from "@/app/api/zaliha/route";
import { GET as zahtjeviGet, PATCH as zahtjeviPatch, POST as zahtjeviPost } from "@/app/api/zaliha/zahtjevi/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza } from "@/lib/demo/store";
import { brojRadnji, jelo, naruci, pomjeri, racunStola } from "./pomocnici-faza5";
import { ocisti, osoblje, pripremiOkruzenje, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type Artikal = {
  id: string;
  naziv: string;
  jedinica: string;
  stanje: number;
  minimum: number;
  ispodMinimuma: boolean;
  prodajnaCijena: number | null;
  nabavnaCijena: number | null;
};
type Zahtjev = { id: string; artikal: string; trazeno: number | null; status: string; isporuceno: number | null; kreirao: string; obradio: string | null };
type Promet = { artikal: string; vrsta: string; promjena: number; stanje: number; razlog: string | null; cijena: number | null; iznos: number | null; zaposlenik: string };
type Nabavka = { naziv: string; stanje: number; minimum: number; ispodMinimuma: boolean; nabavnaCijena: number | null; utrosak7Dana: number; predlozenaNabavka: number };

let ljudi: Record<Uloga, Osoba>;
let id: Record<string, string>;
let artikal: Record<string, string>;
let pocetnaStanja: { naziv: string; stanje: string; prodajna_cijena: string | null }[];

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
  id = await proizvodi();
  const { rows } = await (await demoBaza()).query<{ id: string; naziv: string }>("select id, naziv from public.zaliha_artikli");
  artikal = Object.fromEntries(rows.map((r) => [r.naziv, r.id]));
  // Read here, because every test's cleanup resets stock to 0 and would hide a wrong seed.
  pocetnaStanja = (await (await demoBaza()).query<{ naziv: string; stanje: string; prodajna_cijena: string | null }>(
    "select naziv, stanje::text, prodajna_cijena::text from public.zaliha_artikli",
  )).rows;
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => ocisti());
afterEach(async () => {
  await (await demoBaza()).exec("update public.zaliha_artikli set prodajna_cijena = null");
});

const k = (uloga: Uloga) => [ljudi[uloga].kolacic];

async function json<T>(odgovor: Response, status = 200) {
  const tijelo = (await odgovor.json()) as T & { greska?: string };
  expect(odgovor.status, tijelo.greska).toBe(status);
  return tijelo;
}

async function greska(odgovor: Response, status = 422) {
  return (await json<{ greska: string }>(odgovor, status)).greska;
}

const popisi = (naziv: string, stanje: number, tijelo: Record<string, unknown> = {}, uloga: Uloga = "mesnica") =>
  prometPost(
    zahtjev("/api/zaliha/promet", {
      tijelo: { requestId: randomUUID(), zalihaId: artikal[naziv], stanje, razlog: "Popis", ...tijelo },
      kolacici: k(uloga),
    }),
  );

const prodaj = (naziv: string, kolicina: number, requestId: string = randomUUID()) =>
  prodajaPost(zahtjev("/api/zaliha/prodaja", { tijelo: { requestId, zalihaId: artikal[naziv], kolicina }, kolacici: k("mesnica") }));

const zatrazi = (naziv: string, tijelo: Record<string, unknown> = {}, uloga: Uloga = "kuhinja") =>
  zahtjeviPost(zahtjev("/api/zaliha/zahtjevi", { tijelo: { requestId: randomUUID(), zalihaId: artikal[naziv], ...tijelo }, kolacici: k(uloga) }));

const obradi = (zahtjevId: string, tijelo: Record<string, unknown>) =>
  zahtjeviPatch(zahtjev("/api/zaliha/zahtjevi", { tijelo: { zahtjevId, ...tijelo }, kolacici: k("mesnica") }));

async function postaviCijenu(naziv: string, prodajna: number) {
  await (await demoBaza()).query("update public.zaliha_artikli set prodajna_cijena = $1 where naziv = $2", [prodajna, naziv]);
}

async function stanje(naziv: string) {
  const { zaliha } = await json<{ zaliha: Artikal[] }>(await zalihaGet(zahtjev("/api/zaliha", { kolacici: k("mesnica") })));
  return zaliha.find((a) => a.naziv === naziv)!.stanje;
}

async function prometi(url = "/api/zaliha/promet") {
  return json<{ prometi: Promet[]; imaJos: boolean }>(await prometGet(zahtjev(url, { kolacici: k("sefica") })));
}

describe("the seed", () => {
  it("takes names, units, minimums and purchase prices from the CSV, and starts every quantity at 0", async () => {
    const { zaliha } = await json<{ zaliha: Artikal[] }>(await zalihaGet(zahtjev("/api/zaliha", { kolacici: k("sefica") })));
    const po = Object.fromEntries(zaliha.map((a) => [a.naziv, a]));
    expect(zaliha).toHaveLength(13);
    expect(pocetnaStanja).toHaveLength(13);
    expect(pocetnaStanja.every((a) => Number(a.stanje) === 0 && a.prodajna_cijena === null)).toBe(true);
    const ocekivano: [string, string, number, number | null][] = [
      ["Kotlet", "kg", 2, 15],
      ["Teletina", "kg", 3, 22],
      ["Junetina", "kg", 3, 16],
      ["Biftek", "kg", 1, 30],
      ["Ramstek", "kg", 1, 28],
      ["Ćevapi", "kg", 5, 12],
      ["Suho meso", "kg", 1, 30],
      ["Sudžuk", "kg", 1, 16],
      ["Stelja", "kg", 1, 14],
      ["Piletina", "kg", 3, 6],
      ["Janjetina", "kg", 5, 22],
      ["Pomfrit", "kg", 5, null],
      ["Lepinja", "kom", 20, null],
    ];
    for (const [naziv, jedinica, minimum, nabavna] of ocekivano) {
      expect(po[naziv], naziv).toMatchObject({ jedinica, minimum, nabavnaCijena: nabavna });
    }
  });

  it("holds exactly the CSV's four recipe lines on its three dishes", async () => {
    const { recepti } = await json<{
      recepti: { naziv: string; sastojci: { naziv: string; jedinica: string; kolicina: number }[] }[];
    }>(await receptiGet(zahtjev("/api/zaliha/recepti", { kolacici: k("sefica") })));
    // By name, because the sort order of Ć depends on the database locale.
    const po = Object.fromEntries(recepti.map((r) => [r.naziv, Object.fromEntries(r.sastojci.map((s) => [s.naziv, s.kolicina]))]));
    expect(po).toEqual({
      "Ćevapi – velika porcija": { "Ćevapi": 1, Lepinja: 2 },
      "Natur šnicla": { Teletina: 0.2 },
      Pomfrit: { Pomfrit: 0.2 },
    });
  });
});

describe("who sees what", () => {
  it("the kitchen sees only what it can ask for", async () => {
    const { zaliha } = await json<{ zaliha: Record<string, unknown>[] }>(await zalihaGet(zahtjev("/api/zaliha", { kolacici: k("kuhinja") })));
    expect(Object.keys(zaliha[0]).sort()).toEqual(["id", "jedinica", "naziv"]);
  });

  it("the butcher sees stock and selling prices, not what the restaurant pays", async () => {
    const { zaliha } = await json<{ zaliha: Record<string, unknown>[] }>(await zalihaGet(zahtjev("/api/zaliha", { kolacici: k("mesnica") })));
    expect(Object.keys(zaliha[0]).sort()).toEqual(["id", "ispodMinimuma", "jedinica", "minimum", "naziv", "prodajnaCijena", "stanje"]);
  });

  it("the manager sees purchase prices too", async () => {
    const { zaliha } = await json<{ zaliha: Record<string, unknown>[] }>(await zalihaGet(zahtjev("/api/zaliha", { kolacici: k("sefica") })));
    expect(zaliha[0]).toHaveProperty("nabavnaCijena");
  });
});

describe("orders and stock", () => {
  it("an order does not touch stock, even a dish with a recipe", async () => {
    await json(await popisi("Teletina", 10));
    await json(await popisi("Ćevapi", 10));
    await json(await popisi("Lepinja", 10));
    const narudzbe = await naruci(ljudi, [jelo(id["Natur šnicla"], 3), jelo(id["Ćevapi – velika porcija"], 2)]);
    for (const n of narudzbe) await pomjeri(ljudi, n);
    expect(await stanje("Teletina")).toBe(10);
    expect(await stanje("Ćevapi")).toBe(10);
    expect(await stanje("Lepinja")).toBe(10);
  });
});

describe("manual counts", () => {
  it("set the real number, and the server works out and logs the change", async () => {
    const { promet } = await json<{ promet: { promjena: number; stanje: number } }>(await popisi("Teletina", 12.5));
    expect(promet).toMatchObject({ promjena: 12.5, stanje: 12.5 });

    const { promet: drugi } = await json<{ promet: { promjena: number; stanje: number } }>(await popisi("Teletina", 10, { razlog: "Otpis" }));
    expect(drugi).toMatchObject({ promjena: -2.5, stanje: 10 });
    expect(await stanje("Teletina")).toBe(10);

    const { prometi: lista } = await prometi();
    expect(lista.map((p) => [p.vrsta, p.promjena, p.stanje, p.razlog, p.zaposlenik])).toEqual([
      ["popis", -2.5, 10, "Otpis", ljudi.mesnica.ime],
      ["popis", 12.5, 12.5, "Popis", ljudi.mesnica.ime],
    ]);

    const { rows } = await (await demoBaza()).query<{ detalji: Record<string, unknown>; zaposlenik_id: string }>(
      "select detalji, zaposlenik_id from public.dnevnik_radnji where radnja = 'zaliha_popis' order by id",
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].zaposlenik_id).toBe(ljudi.mesnica.id);
    expect(rows[1].detalji).toMatchObject({ artikal: "Teletina", promjena: -2.5, stanje: 10, razlog: "Otpis" });
  });

  it("a recount of the same number is still on record", async () => {
    await json(await popisi("Biftek", 3));
    const { promet } = await json<{ promet: { promjena: number } }>(await popisi("Biftek", 3));
    expect(promet.promjena).toBe(0);
    expect(await brojRadnji("zaliha_popis")).toBe(2);
  });

  it("a double tap counts once", async () => {
    const requestId = randomUUID();
    await json(await popisi("Biftek", 3, { requestId }));
    await json(await popisi("Biftek", 9));
    const { promet } = await json<{ promet: { stanje: number } }>(await popisi("Biftek", 3, { requestId }));
    expect(promet.stanje).toBe(3);
    expect(await stanje("Biftek")).toBe(9);
    expect(await brojRadnji("zaliha_popis")).toBe(2);
  });

  it("the manager can count too", async () => {
    await json(await popisi("Biftek", 2, {}, "sefica"));
    expect(await stanje("Biftek")).toBe(2);
  });

  it("refuses bad values", async () => {
    expect((await popisi("Biftek", -1)).status).toBe(400);
    expect((await popisi("Biftek", 1, { razlog: "Krađa" })).status).toBe(400);
    expect(await greska(await popisi("Biftek", 1.0005))).toMatch(/tri decimale/);
    expect(await greska(await prometPost(zahtjev("/api/zaliha/promet", {
      tijelo: { requestId: randomUUID(), zalihaId: randomUUID(), stanje: 1, razlog: "Popis" },
      kolacici: k("mesnica"),
    })))).toBe("Artikal zalihe nije pronađen.");
  });
});

describe("butcher sales", () => {
  it("are refused until the manager sets a selling price", async () => {
    await json(await popisi("Teletina", 5));
    expect(await greska(await prodaj("Teletina", 1))).toBe("Prodajna cijena artikla nije podešena. Javite se šefici.");
    expect(await stanje("Teletina")).toBe(5);
  });

  it("charge the server's price, lower stock, and log both", async () => {
    await postaviCijenu("Teletina", 24.5);
    await json(await popisi("Teletina", 5));
    const { prodaja } = await json<{ prodaja: Record<string, number> }>(await prodaj("Teletina", 1.25));
    expect(prodaja).toMatchObject({ kolicina: 1.25, cijena: 24.5, iznos: 30.63, stanje: 3.75 });
    expect(await stanje("Teletina")).toBe(3.75);

    const { prometi: lista } = await prometi("/api/zaliha/promet?vrsta=prodaja");
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ vrsta: "prodaja", promjena: -1.25, iznos: 30.63, cijena: 24.5 });

    const { rows } = await (await demoBaza()).query<{ detalji: Record<string, unknown> }>("select detalji from public.dnevnik_radnji where radnja = 'zaliha_prodaja'");
    expect(rows[0].detalji).toMatchObject({ artikal: "Teletina", promjena: -1.25, iznos: 30.63 });
  });

  it("ignore a price from the client", async () => {
    await postaviCijenu("Teletina", 24.5);
    await json(await popisi("Teletina", 5));
    const odgovor = await prodajaPost(zahtjev("/api/zaliha/prodaja", {
      tijelo: { requestId: randomUUID(), zalihaId: artikal["Teletina"], kolicina: 1, cijena: 1 },
      kolacici: k("mesnica"),
    }));
    expect(odgovor.status).toBe(400);
    expect(await stanje("Teletina")).toBe(5);
  });

  it("keep the sale's price after the price changes", async () => {
    await postaviCijenu("Teletina", 20);
    await json(await popisi("Teletina", 5));
    await json(await prodaj("Teletina", 1));
    await postaviCijenu("Teletina", 30);
    expect((await prometi("/api/zaliha/promet?vrsta=prodaja")).prometi[0]).toMatchObject({ cijena: 20, iznos: 20 });
  });

  it("cannot sell what is not there, and stock never goes negative", async () => {
    await postaviCijenu("Teletina", 20);
    expect(await greska(await prodaj("Teletina", 1))).toBe("Nema dovoljno na stanju. Trenutno stanje: 0 kg.");
    await json(await popisi("Teletina", 1.5));
    expect(await greska(await prodaj("Teletina", 1.501))).toBe("Nema dovoljno na stanju. Trenutno stanje: 1,5 kg.");
    await json(await prodaj("Teletina", 1.5));
    expect(await stanje("Teletina")).toBe(0);
  });

  it("a double tap sells once", async () => {
    await postaviCijenu("Teletina", 20);
    await json(await popisi("Teletina", 5));
    const requestId = randomUUID();
    const prva = await json<{ prodaja: unknown }>(await prodaj("Teletina", 2, requestId));
    const druga = await json<{ prodaja: unknown }>(await prodaj("Teletina", 2, requestId));
    expect(druga).toEqual(prva);
    expect(await stanje("Teletina")).toBe(3);
    expect(await brojRadnji("zaliha_prodaja")).toBe(1);
  });

  it("only sell goods by the kilo", async () => {
    await postaviCijenu("Lepinja", 1);
    await json(await popisi("Lepinja", 5));
    expect(await greska(await prodaj("Lepinja", 1))).toMatch(/samo za robu na kilogram/);
  });

  it("refuse an over-precise amount and an unknown item", async () => {
    await postaviCijenu("Teletina", 20);
    await json(await popisi("Teletina", 5));
    expect(await greska(await prodaj("Teletina", 1.0005))).toMatch(/Količina za prodaju/);
    expect(await greska(await prodajaPost(zahtjev("/api/zaliha/prodaja", {
      tijelo: { requestId: randomUUID(), zalihaId: randomUUID(), kolicina: 1 },
      kolacici: k("mesnica"),
    })))).toBe("Artikal zalihe nije pronađen.");
  });
});

describe("kitchen requests", () => {
  async function nov(naziv = "Teletina", tijelo: Record<string, unknown> = {}) {
    return (await json<{ zahtjev: Zahtjev }>(await zatrazi(naziv, tijelo))).zahtjev;
  }

  it("go to the butcher, with or without a quantity", async () => {
    const prvi = await nov("Teletina", { kolicina: 3 });
    expect(prvi).toMatchObject({ artikal: "Teletina", trazeno: 3, status: "nov", kreirao: ljudi.kuhinja.ime, isporuceno: null, obradio: null });
    const drugi = await nov("Ćevapi");
    expect(drugi.trazeno).toBeNull();

    const { zahtjevi, imaJos } = await json<{ zahtjevi: Zahtjev[]; imaJos: boolean }>(
      await zahtjeviGet(zahtjev("/api/zaliha/zahtjevi", { kolacici: k("mesnica") })),
    );
    expect(zahtjevi.map((z) => z.id).sort()).toEqual([prvi.id, drugi.id].sort());
    expect(imaJos).toBe(false);
  });

  it("do not change stock until they are delivered", async () => {
    await json(await popisi("Teletina", 5));
    await nov("Teletina", { kolicina: 3 });
    expect(await stanje("Teletina")).toBe(5);
  });

  it("a double tap sends one", async () => {
    const requestId = randomUUID();
    const prvi = await nov("Teletina", { requestId });
    const drugi = await nov("Teletina", { requestId });
    expect(drugi.id).toBe(prvi.id);
    const { zahtjevi } = await json<{ zahtjevi: Zahtjev[] }>(await zahtjeviGet(zahtjev("/api/zaliha/zahtjevi", { kolacici: k("kuhinja") })));
    expect(zahtjevi).toHaveLength(1);
  });

  it("refuse an unknown item and an over-precise amount", async () => {
    expect(await greska(await zahtjeviPost(zahtjev("/api/zaliha/zahtjevi", {
      tijelo: { requestId: randomUUID(), zalihaId: randomUUID() },
      kolacici: k("kuhinja"),
    })))).toBe("Artikal zalihe nije pronađen.");
    expect(await greska(await zatrazi("Teletina", { kolicina: 1.0005 }))).toMatch(/Količina/);
  });

  it("delivering lowers stock by what was delivered, and logs it", async () => {
    await json(await popisi("Teletina", 5));
    const z = await nov("Teletina", { kolicina: 3 });
    const { zahtjev: obradjen } = await json<{ zahtjev: Zahtjev }>(await obradi(z.id, { radnja: "isporuci", kolicina: 2.5 }));
    expect(obradjen).toMatchObject({ status: "isporucen", trazeno: 3, isporuceno: 2.5, obradio: ljudi.mesnica.ime });
    expect(await stanje("Teletina")).toBe(2.5);

    expect((await prometi("/api/zaliha/promet?vrsta=isporuka")).prometi[0]).toMatchObject({ artikal: "Teletina", promjena: -2.5, stanje: 2.5, iznos: null });
    expect(await brojRadnji("zaliha_isporuka")).toBe(1);
  });

  it("a double tap delivers once, and the first amount stands", async () => {
    await json(await popisi("Teletina", 5));
    const z = await nov();
    await json(await obradi(z.id, { radnja: "isporuci", kolicina: 2 }));
    const { zahtjev: drugi } = await json<{ zahtjev: Zahtjev }>(await obradi(z.id, { radnja: "isporuci", kolicina: 3 }));
    expect(drugi.isporuceno).toBe(2);
    expect(await stanje("Teletina")).toBe(3);
    expect(await brojRadnji("zaliha_isporuka")).toBe(1);
  });

  it("cannot deliver what is not there, and the request stays open", async () => {
    await json(await popisi("Teletina", 1));
    const z = await nov();
    expect(await greska(await obradi(z.id, { radnja: "isporuci", kolicina: 2 }))).toBe("Nema dovoljno na stanju. Trenutno stanje: 1 kg.");
    expect(await stanje("Teletina")).toBe(1);
    const { zahtjevi } = await json<{ zahtjevi: Zahtjev[] }>(await zahtjeviGet(zahtjev("/api/zaliha/zahtjevi", { kolacici: k("kuhinja") })));
    expect(zahtjevi[0].status).toBe("nov");
  });

  it("'out of stock' closes it without touching stock, and it cannot then be delivered", async () => {
    await json(await popisi("Teletina", 5));
    const z = await nov();
    const { zahtjev: obradjen } = await json<{ zahtjev: Zahtjev }>(await obradi(z.id, { radnja: "nema_na_stanju" }));
    expect(obradjen).toMatchObject({ status: "nema_na_stanju", isporuceno: null, obradio: ljudi.mesnica.ime });
    expect(await stanje("Teletina")).toBe(5);
    expect(await brojRadnji("zahtjev_nema_na_stanju")).toBe(1);

    // A double tap only reports the state.
    expect((await json<{ zahtjev: Zahtjev }>(await obradi(z.id, { radnja: "nema_na_stanju" }))).zahtjev.status).toBe("nema_na_stanju");
    expect(await brojRadnji("zahtjev_nema_na_stanju")).toBe(1);

    expect(await greska(await obradi(z.id, { radnja: "isporuci", kolicina: 1 }))).toBe("Zahtjev je već obrađen.");
    expect(await stanje("Teletina")).toBe(5);
  });

  it("a delivered one cannot then be marked out of stock", async () => {
    await json(await popisi("Teletina", 5));
    const z = await nov();
    await json(await obradi(z.id, { radnja: "isporuci", kolicina: 1 }));
    expect(await greska(await obradi(z.id, { radnja: "nema_na_stanju" }))).toBe("Zahtjev je već obrađen.");
  });

  it("refuses bad deliveries", async () => {
    const z = await nov();
    expect((await obradi(z.id, { radnja: "isporuci" })).status).toBe(400);
    expect((await obradi(z.id, { radnja: "isporuci", kolicina: 0 })).status).toBe(400);
    expect((await obradi(z.id, { radnja: "nema_na_stanju", kolicina: 1 })).status).toBe(400);
    expect((await obradi(z.id, { radnja: "baci" })).status).toBe(400);
    expect(await greska(await obradi(z.id, { radnja: "isporuci", kolicina: 1.0005 }))).toMatch(/Količina isporuke/);
    expect(await greska(await obradi(randomUUID(), { radnja: "nema_na_stanju" }))).toBe("Zahtjev nije pronađen.");
  });

  it("the list pages", async () => {
    await (await demoBaza()).query(
      `insert into public.zahtjevi_mesnici (request_id, zaliha_id, kreirao_id, kreirano)
       select gen_random_uuid(), $1, $2, now() - (i || ' minutes')::interval from generate_series(1, 53) i`,
      [artikal["Biftek"], ljudi.kuhinja.id],
    );
    const prva = await json<{ zahtjevi: Zahtjev[]; imaJos: boolean }>(await zahtjeviGet(zahtjev("/api/zaliha/zahtjevi", { kolacici: k("kuhinja") })));
    const druga = await json<{ zahtjevi: Zahtjev[]; imaJos: boolean }>(await zahtjeviGet(zahtjev("/api/zaliha/zahtjevi?strana=2", { kolacici: k("kuhinja") })));
    expect([prva.zahtjevi.length, prva.imaJos, druga.zahtjevi.length, druga.imaJos]).toEqual([50, true, 3, false]);
  });
});

describe("stock history", () => {
  it("filters by item and pages", async () => {
    await json(await popisi("Biftek", 1));
    await json(await popisi("Kotlet", 2));
    const { prometi: biftek } = await prometi(`/api/zaliha/promet?zalihaId=${artikal["Biftek"]}`);
    expect(biftek.map((p) => p.artikal)).toEqual(["Biftek"]);

    await (await demoBaza()).query(
      `insert into public.prometi_zaliha (zaliha_id, vrsta, promjena, stanje, razlog, zaposlenik_id)
       select $1, 'popis', 0, 0, 'Popis', $2 from generate_series(1, 55)`,
      [artikal["Stelja"], ljudi.mesnica.id],
    );
    const prva = await prometi();
    expect([prva.prometi.length, prva.imaJos]).toEqual([50, true]);
    const druga = await prometi("/api/zaliha/promet?strana=2");
    expect([druga.prometi.length, druga.imaJos]).toEqual([7, false]);
  });
});

describe("the manager's edits", () => {
  const izmijeni = (naziv: string, tijelo: Record<string, unknown>) =>
    zalihaPatch(zahtjev("/api/zaliha", {
      tijelo: { id: artikal[naziv], minimum: 1, nabavnaCijena: null, prodajnaCijena: null, ...tijelo },
      kolacici: k("sefica"),
    }));

  afterEach(async () => {
    await (await demoBaza()).exec("update public.zaliha_artikli set minimum = 1, nabavna_cijena = 30 where naziv = 'Biftek'");
  });

  it("set the minimum and prices, enable sales, and log old and new", async () => {
    const { artikal: a } = await json<{ artikal: Record<string, number> }>(
      await izmijeni("Biftek", { minimum: 2.5, nabavnaCijena: 31, prodajnaCijena: 40 }),
    );
    expect(a).toMatchObject({ minimum: 2.5, nabavnaCijena: 31, prodajnaCijena: 40 });

    await json(await popisi("Biftek", 1));
    expect((await json<{ prodaja: { iznos: number } }>(await prodaj("Biftek", 1))).prodaja.iznos).toBe(40);

    const { rows } = await (await demoBaza()).query<{ detalji: Record<string, unknown> }>("select detalji from public.dnevnik_radnji where radnja = 'zaliha_izmjena'");
    expect(rows[0].detalji).toMatchObject({ artikal: "Biftek", minimum: 2.5, prodajnaCijena: 40, prethodno: { minimum: 1, nabavnaCijena: 30, prodajnaCijena: null } });
  });

  it("do not change the quantity", async () => {
    await json(await popisi("Biftek", 7));
    await json(await izmijeni("Biftek", { minimum: 9 }));
    expect(await stanje("Biftek")).toBe(7);
  });

  it("show when stock is at or under the minimum", async () => {
    const ispod = async () => {
      const { zaliha } = await json<{ zaliha: Artikal[] }>(await zalihaGet(zahtjev("/api/zaliha", { kolacici: k("mesnica") })));
      return zaliha.find((a) => a.naziv === "Biftek")!.ispodMinimuma;
    };
    await json(await izmijeni("Biftek", { minimum: 3 }));
    expect(await ispod()).toBe(true);
    await json(await popisi("Biftek", 3));
    expect(await ispod()).toBe(true);
    await json(await popisi("Biftek", 3.001));
    expect(await ispod()).toBe(false);
  });

  it("refuse bad values", async () => {
    expect((await izmijeni("Biftek", { minimum: -1 })).status).toBe(400);
    expect((await izmijeni("Biftek", { prodajnaCijena: -1 })).status).toBe(400);
    expect(await greska(await izmijeni("Biftek", { prodajnaCijena: 1.005 }))).toMatch(/zaokružena na fening/);
    expect(await greska(await izmijeni("Biftek", { minimum: 1.0005 }))).toMatch(/Minimum/);
    expect(await greska(await zalihaPatch(zahtjev("/api/zaliha", {
      tijelo: { id: randomUUID(), minimum: 1, nabavnaCijena: null, prodajnaCijena: null },
      kolacici: k("sefica"),
    })))).toBe("Artikal zalihe nije pronađen.");
  });
});

describe("recipes", () => {
  const sacuvaj = (proizvodId: string, sastojci: unknown[]) =>
    receptiPost(zahtjev("/api/zaliha/recepti", { tijelo: { proizvodId, sastojci }, kolacici: k("sefica") }));

  const sastojci = async (naziv: string) => {
    const { recepti } = await json<{ recepti: { naziv: string; sastojci: { naziv: string; kolicina: number }[] }[] }>(
      await receptiGet(zahtjev("/api/zaliha/recepti", { kolacici: k("sefica") })),
    );
    return recepti.find((r) => r.naziv === naziv)?.sastojci.map((s) => [s.naziv, s.kolicina]);
  };

  afterEach(async () => {
    const db = await demoBaza();
    await db.exec(`
      delete from public.recepti r using public.proizvodi p where p.id = r.proizvod_id and p.naziv in ('Bečka šnicla', 'Natur šnicla');
      insert into public.recepti (proizvod_id, zaliha_id, kolicina)
      select p.id, z.id, 0.2 from public.proizvodi p, public.zaliha_artikli z where p.naziv = 'Natur šnicla' and z.naziv = 'Teletina';
    `);
  });

  it("are replaced whole, and logged", async () => {
    const odgovor = await json<{ recept: { sastojaka: number } }>(await sacuvaj(id["Natur šnicla"], [
      { zalihaId: artikal["Teletina"], kolicina: 0.25 },
      { zalihaId: artikal["Lepinja"], kolicina: 1 },
    ]));
    expect(odgovor.recept.sastojaka).toBe(2);
    expect(await sastojci("Natur šnicla")).toEqual([["Lepinja", 1], ["Teletina", 0.25]]);
    expect(await brojRadnji("recept")).toBe(1);
  });

  it("an empty list removes the recipe", async () => {
    await json(await sacuvaj(id["Natur šnicla"], []));
    expect(await sastojci("Natur šnicla")).toBeUndefined();
  });

  it("can start one for a dish that had none", async () => {
    await json(await sacuvaj(id["Bečka šnicla"], [{ zalihaId: artikal["Teletina"], kolicina: 0.3 }]));
    expect(await sastojci("Bečka šnicla")).toEqual([["Teletina", 0.3]]);
  });

  it("refuse a bad list and leave the old recipe", async () => {
    const dvaPuta = [{ zalihaId: artikal["Teletina"], kolicina: 1 }, { zalihaId: artikal["Teletina"], kolicina: 2 }];
    expect(await greska(await sacuvaj(id["Natur šnicla"], dvaPuta))).toBe("Sastojak je nepoznat ili naveden dva puta.");
    expect(await greska(await sacuvaj(id["Natur šnicla"], [{ zalihaId: randomUUID(), kolicina: 1 }]))).toBe("Sastojak je nepoznat ili naveden dva puta.");
    expect(await greska(await sacuvaj(id["Natur šnicla"], [{ zalihaId: artikal["Teletina"], kolicina: 0.0005 }]))).toMatch(/Količina sastojka/);
    expect((await sacuvaj(id["Natur šnicla"], [{ zalihaId: artikal["Teletina"], kolicina: 0 }])).status).toBe(400);
    expect(await greska(await sacuvaj(randomUUID(), []))).toBe("Proizvod nije pronađen.");
    expect(await sastojci("Natur šnicla")).toEqual([["Teletina", 0.2]]);
  });
});

describe("purchase suggestions", () => {
  const nabavka = async () => {
    const { nabavka: n } = await json<{ nabavka: Nabavka[] }>(await nabavkaGet(zahtjev("/api/zaliha/nabavka", { kolacici: k("sefica") })));
    return Object.fromEntries(n.map((a) => [a.naziv, a]));
  };

  it("start at nothing", async () => {
    const n = await nabavka();
    expect(Object.keys(n)).toHaveLength(13);
    expect(Object.values(n).every((a) => a.utrosak7Dana === 0 && a.predlozenaNabavka === 0)).toBe(true);
  });

  it("are the week's recipe use plus butcher sales, with 20 % on top, rounded up to the gram", async () => {
    await naruci(ljudi, [jelo(id["Natur šnicla"], 3)]);
    await postaviCijenu("Teletina", 20);
    await json(await popisi("Teletina", 10));
    await json(await prodaj("Teletina", 0.555));

    const { Teletina } = await nabavka();
    // 3 x 0.2 kg from recipes + 0.555 kg sold = 1.155 kg. x 1.2 = 1.386.
    expect(Teletina.utrosak7Dana).toBe(1.155);
    expect(Teletina.predlozenaNabavka).toBe(1.386);
    expect(Teletina).toMatchObject({ stanje: 9.445, minimum: 3, ispodMinimuma: false, nabavnaCijena: 22 });
  });

  it("round up, never down", async () => {
    await postaviCijenu("Sudžuk", 10);
    await json(await popisi("Sudžuk", 5));
    await json(await prodaj("Sudžuk", 0.001));
    // 0.0012 rounds up to 0.002.
    expect((await nabavka())["Sudžuk"].predlozenaNabavka).toBe(0.002);
  });

  it("count each ingredient of a dish", async () => {
    await naruci(ljudi, [jelo(id["Ćevapi – velika porcija"], 2)]);
    const n = await nabavka();
    expect(n["Ćevapi"].utrosak7Dana).toBe(2);
    expect(n["Lepinja"].utrosak7Dana).toBe(4);
    expect(n["Lepinja"].predlozenaNabavka).toBe(4.8);
  });

  it("leave out voided lines", async () => {
    await naruci(ljudi, [jelo(id["Natur šnicla"], 2), jelo(id["Ćevapi – velika porcija"])]);
    const stavke = (await racunStola(ljudi)).narudzbe.flatMap((n) => n.stavke);
    const snicla = stavke.find((s) => s.naziv === "Natur šnicla")!;
    const odgovor = await stornoRuta(
      zahtjev(`/api/narudzbe/stavka/${snicla.id}/storno`, { tijelo: { razlog: "Gost odustao" }, kolacici: k("konobar") }),
      { params: Promise.resolve({ id: String(snicla.id) }) },
    );
    expect(odgovor.status).toBe(200);
    const n = await nabavka();
    expect(n["Teletina"].utrosak7Dana).toBe(0);
    expect(n["Ćevapi"].utrosak7Dana).toBe(1);
  });

  it("leave out anything before today and the six days before it", async () => {
    const db = await demoBaza();
    await naruci(ljudi, [jelo(id["Natur šnicla"], 1)]);
    await db.exec(`update public.narudzbe set kreirano = date_trunc('day', now() at time zone 'Europe/Sarajevo') at time zone 'Europe/Sarajevo' - interval '6 days'`);
    expect((await nabavka())["Teletina"].utrosak7Dana).toBe(0.2);

    await db.exec(`update public.narudzbe set kreirano = kreirano - interval '1 second'`);
    expect((await nabavka())["Teletina"].utrosak7Dana).toBe(0);
  });

  it("do not count a delivery to the kitchen, whose food the recipes already count", async () => {
    await json(await popisi("Teletina", 5));
    const { zahtjev: z } = await json<{ zahtjev: Zahtjev }>(await zatrazi("Teletina"));
    await json(await obradi(z.id, { radnja: "isporuci", kolicina: 2 }));
    expect((await nabavka())["Teletina"].utrosak7Dana).toBe(0);
  });
});
