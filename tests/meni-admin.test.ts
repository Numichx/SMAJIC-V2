import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "@/app/api/administracija/meni/route";
import { GET as meniGet } from "@/app/api/meni/route";
import { PATCH as statusRuta } from "@/app/api/narudzbe/[id]/route";
import { POST as narudzbaRuta } from "@/app/api/narudzbe/route";
import { POST as smjenaPost } from "@/app/api/smjene/route";
import { GET as pecenjaraGet, POST as popisPost } from "@/app/api/pecenjara/smjena/route";
import type { Uloga } from "@/lib/auth/session";
import { SLIKE } from "@/lib/data/slike";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { brojRadnji, jelo, naruci, pomjeri, racunStola } from "./pomocnici-faza5";
import { ocisti, osoblje, pripremiOkruzenje, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type Proizvod = {
  id: string;
  kategorijaId: string;
  naziv: string;
  cijena: number;
  jedinica: string;
  stanica: string;
  redoslijed: number;
  aktivan: boolean;
  tezina: boolean;
  jePrilog: boolean;
  besplatniPrilozi: string[];
  slika: { putanja: string; zasluge: string | null } | null;
};
type MeniStavka = {
  id: string;
  naziv: string;
  slika: { putanja: string } | null;
  prilog: { besplatni: string[]; podrazumijevani: string | null; jednaPorcija: boolean } | null;
};

const ULOGE: Uloga[] = ["konobar", "kuhinja", "pecenjara", "mesnica"];
const NOVI = { naziv: "Novo jelo", kategorijaId: "kuhana-jela", cijena: 12.5, jedinica: "porcija", stanica: "kuhinja" };
const JAGNJETINA = "Jagnjetina s ražnja";

let ljudi: Record<Uloga, Osoba>;
let id: Record<string, string>;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
  id = await proizvodi();
  await (await demoBaza()).exec("create table demo.proizvodi_kopija as select * from public.proizvodi");
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
// Each test may rename or add, so the menu goes back to what the migration left.
beforeEach(async () => {
  await ocisti();
  await (await demoBaza()).exec(`
    delete from public.recepti where proizvod_id not in (select id from demo.proizvodi_kopija);
    delete from public.proizvodi where id not in (select id from demo.proizvodi_kopija);
    update public.proizvodi p set naziv = 'x' || p.id, kategorija_id = k.kategorija_id from demo.proizvodi_kopija k where k.id = p.id;
    update public.proizvodi p
    set naziv = k.naziv, cijena = k.cijena, jedinica = k.jedinica, stanica = k.stanica, redoslijed = k.redoslijed,
        aktivan = k.aktivan, prilog = k.prilog, besplatni_prilozi = k.besplatni_prilozi, prilog_unaprijed = k.prilog_unaprijed
    from demo.proizvodi_kopija k where k.id = p.id;
  `);
});

const k = (uloga: Uloga | "sefica") => [ljudi[uloga as Uloga].kolacic];
const seficaZ = (tijelo?: unknown) => zahtjev("/api/administracija/meni", { tijelo, kolacici: [ljudi.sefica.kolacic] });

async function json<T>(odgovor: Response, status = 200) {
  const tijelo = (await odgovor.json()) as T & { greska?: string };
  expect(odgovor.status, tijelo.greska).toBe(status);
  return tijelo;
}

const izmijeni = async (tijelo: Record<string, unknown>) => (await json<{ proizvod: Proizvod }>(await PATCH(seficaZ(tijelo)))).proizvod;
const dodaj = async (tijelo: Record<string, unknown> = {}) => (await json<{ proizvod: Proizvod }>(await POST(seficaZ({ ...NOVI, ...tijelo })))).proizvod;
const greskaIzmjene = async (tijelo: Record<string, unknown>) => (await json<{ greska: string }>(await PATCH(seficaZ(tijelo)), 422)).greska;
const greskaDodavanja = async (tijelo: Record<string, unknown>) => (await json<{ greska: string }>(await POST(seficaZ({ ...NOVI, ...tijelo })), 422)).greska;
const pregled = async () => json<{ kategorije: { id: string; naziv: string }[]; proizvodi: Proizvod[] }>(await GET(seficaZ()));

async function meniKonobara() {
  const m = await json<{ kategorije: { proizvodi: MeniStavka[] }[]; prilozi: string[] }>(await meniGet(zahtjev("/api/meni", { kolacici: k("konobar") })));
  return { proizvodi: m.kategorije.flatMap((x) => x.proizvodi), prilozi: m.prilozi };
}

async function dnevnik() {
  const { rows } = await (await demoBaza()).query<{ radnja: string; zaposlenik_id: string; detalji: Record<string, never> }>(
    "select radnja, zaposlenik_id, detalji from public.dnevnik_radnji order by id",
  );
  return rows;
}

async function otvoriSmjenu() {
  const { rows } = await (await demoBaza()).query<{ id: string }>("select id from public.proizvodi where stanica = 'sank' and aktivan");
  const popis = rows.map((r) => ({ proizvodId: r.id, kolicina: 0 }));
  await json(await smjenaPost(zahtjev("/api/smjene", { tijelo: { requestId: randomUUID(), oznaka: "I", popis }, kolacici: k("konobar") })));
}

const linije = async (sto = 1) => (await racunStola(ljudi, sto)).narudzbe.flatMap((n) => n.stavke as { naziv: string; iznos: number; id: number }[]);

describe("role and shape", () => {
  const rute: [string, (r: NextRequest) => Promise<Response>, unknown][] = [
    ["GET", GET, undefined],
    ["POST", POST, NOVI],
    ["PATCH", PATCH, { id: randomUUID(), cijena: 1 }],
  ];

  it.each(rute)("%s needs a session", async (_, ruta, tijelo) => {
    expect((await ruta(zahtjev("/api/administracija/meni", { tijelo }))).status).toBe(401);
  });

  it.each(rute.flatMap(([n, ruta, tijelo]) => ULOGE.map((uloga) => [n, uloga, ruta, tijelo] as const)))("%s refuses %s", async (_, uloga, ruta, tijelo) => {
    expect((await ruta(zahtjev("/api/administracija/meni", { tijelo, kolacici: k(uloga) }))).status).toBe(403);
  });

  it.each([
    ["an unknown field", { ...NOVI, tezina: true }],
    ["a client's choice of free sides", { ...NOVI, besplatniPrilozi: [] }],
    ["an id", { ...NOVI, id: randomUUID() }],
    ["active state on an add", { ...NOVI, aktivan: false }],
    ["a price as text", { ...NOVI, cijena: "12.50" }],
    ["a negative price", { ...NOVI, cijena: -1 }],
    ["an unknown unit", { ...NOVI, jedinica: "litar" }],
    ["an unknown station", { ...NOVI, stanica: "bar" }],
    ["a missing field", { naziv: "X y", kategorijaId: "supe" }],
    ["a non-object", []],
  ])("POST rejects %s", async (_, tijelo) => {
    expect((await POST(seficaZ(tijelo))).status).toBe(400);
  });

  it.each([
    ["an unknown field", { id: randomUUID(), cijena: 1, tezina: true }],
    ["the photo key", { id: randomUUID(), cijena: 1, slikaKljuc: "x" }],
    ["nothing to change", { id: randomUUID() }],
    ["no id", { cijena: 1 }],
    ["a bad id", { id: "1", cijena: 1 }],
    ["a non-boolean state", { id: randomUUID(), aktivan: "ne" }],
    ["a fractional order", { id: randomUUID(), redoslijed: 1.5 }],
  ])("PATCH rejects %s", async (_, tijelo) => {
    expect((await PATCH(seficaZ(tijelo))).status).toBe(400);
  });

  const argumenti = (p_sefica: string) => ({
    p_sefica,
    p_id: null,
    p_naziv: "Nesto novo",
    p_kategorija: "supe",
    p_cijena: 1,
    p_jedinica: "porcija",
    p_stanica: "kuhinja",
    p_redoslijed: null,
    p_aktivan: null,
  });

  it.each(ULOGE)("SQL refuses %s too", async (uloga) => {
    const id = ljudi[uloga].id;
    await expect(demoRpc("sacuvaj_proizvod", argumenti(id))).rejects.toThrow("Nemate pravo na ovu radnju.");
    await expect(demoRpc("meni_pregled", { p_sefica: id })).rejects.toThrow("Nemate pravo na ovu radnju.");
  });

  it("SQL refuses a deactivated manager", async () => {
    const db = await demoBaza();
    await db.query("update public.zaposlenici set aktivan = false where id = $1", [ljudi.sefica.id]);
    try {
      await expect(demoRpc("sacuvaj_proizvod", argumenti(ljudi.sefica.id))).rejects.toThrow("Nemate pravo na ovu radnju.");
    } finally {
      await db.query("update public.zaposlenici set aktivan = true where id = $1", [ljudi.sefica.id]);
    }
  });
});

describe("GET", () => {
  it("lists everything in menu order, with only what the screen needs", async () => {
    const { kategorije, proizvodi } = await pregled();
    expect(kategorije).toHaveLength(18);
    expect(kategorije[0]).toEqual({ id: "hladna-predjela", naziv: "Hladna predjela" });
    expect(proizvodi).toHaveLength(161);
    expect(proizvodi[0].naziv).toBe("Goveđa pečenica");
    expect(Object.keys(proizvodi[0]).sort()).toEqual(
      ["aktivan", "besplatniPrilozi", "cijena", "id", "jePrilog", "jedinica", "kategorijaId", "naziv", "redoslijed", "slika", "stanica", "tezina"].sort(),
    );
    const gulas = proizvodi.find((p) => p.naziv === "Gulaš")!;
    expect(gulas.besplatniPrilozi).toEqual(["Pire krompir", "Riža", "Makaroni"]);
    expect(gulas.slika?.putanja).toBe("/meni/kuhana-jela/gulas.jpg");
    expect(proizvodi.find((p) => p.naziv === JAGNJETINA)!.tezina).toBe(true);
    expect(proizvodi.find((p) => p.naziv === "Pomfrit")!.jePrilog).toBe(true);
  });

  it("still shows a sold-out item, so she can bring it back", async () => {
    await izmijeni({ id: id["Gulaš"], aktivan: false });
    const gulas = (await pregled()).proizvodi.find((p) => p.id === id["Gulaš"])!;
    expect(gulas.aktivan).toBe(false);
  });
});

describe("price", () => {
  it("charges new orders the new price, leaves lines already sent alone, and logs both values", async () => {
    await naruci(ljudi, [jelo(id["Gulaš"])], 1);
    expect(await izmijeni({ id: id["Gulaš"], cijena: 14.5 })).toMatchObject({ cijena: 14.5 });
    await naruci(ljudi, [jelo(id["Gulaš"])], 2);

    expect((await racunStola(ljudi, 1)).ukupno).toBe(13);
    expect((await racunStola(ljudi, 2)).ukupno).toBe(14.5);

    const zapis = (await dnevnik()).find((d) => d.radnja === "proizvod_izmijenjen")!;
    expect(zapis.zaposlenik_id).toBe(ljudi.sefica.id);
    expect(zapis.detalji).toEqual({ proizvod: id["Gulaš"], naziv: "Gulaš", promjene: { cijena: { staro: 13, novo: 14.5 } } });
  });

  it.each([
    ["3 decimals, not rounded", 12.345],
    ["float noise", 0.1 + 0.2],
    ["zero", 0],
    ["over the limit", 10000],
  ])("refuses %s, and changes nothing", async (_, cijena) => {
    expect(await greskaIzmjene({ id: id["Gulaš"], cijena })).toBe("Cijena mora biti od 0,01 do 9.999,99 KM, s najviše dvije decimale.");
    expect(await greskaDodavanja({ cijena })).toContain("Cijena mora biti");
    expect((await pregled()).proizvodi.find((p) => p.id === id["Gulaš"])!.cijena).toBe(13);
    expect((await pregled()).proizvodi).toHaveLength(161);
    expect(await dnevnik()).toEqual([]);
  });

  it("allows the limits", async () => {
    expect((await izmijeni({ id: id["Gulaš"], cijena: 0.01 })).cijena).toBe(0.01);
    expect((await izmijeni({ id: id["Gulaš"], cijena: 9999.99 })).cijena).toBe(9999.99);
  });

  it("logs nothing for a double tap", async () => {
    await izmijeni({ id: id["Gulaš"], cijena: 14 });
    await izmijeni({ id: id["Gulaš"], cijena: 14 });
    expect(await brojRadnji("proizvod_izmijenjen")).toBe(1);
  });
});

describe("sold out and back", () => {
  it("hides it from waiters, refuses an order, and brings it back", async () => {
    await izmijeni({ id: id["Gulaš"], aktivan: false });
    expect((await meniKonobara()).proizvodi.some((p) => p.id === id["Gulaš"])).toBe(false);

    const odgovor = await narudzbaRuta(
      zahtjev("/api/narudzbe", { tijelo: { requestId: randomUUID(), stoId: 1, stavke: [jelo(id["Gulaš"])] }, kolacici: k("konobar") }),
    );
    expect(odgovor.status).toBe(422);
    expect(((await odgovor.json()) as { greska: string }).greska).toContain("trenutno nije dostupan");

    await izmijeni({ id: id["Gulaš"], aktivan: true });
    expect((await meniKonobara()).proizvodi.some((p) => p.id === id["Gulaš"])).toBe(true);

    const zapisi = (await dnevnik()).map((d) => d.detalji.promjene);
    expect(zapisi).toEqual([{ aktivan: { staro: true, novo: false } }, { aktivan: { staro: false, novo: true } }]);
  });

  it("drops a sold-out side from the free list and the picker, and restores it", async () => {
    await izmijeni({ id: id["Pomfrit"], aktivan: false });
    let m = await meniKonobara();
    expect(m.prilozi).not.toContain(id["Pomfrit"]);
    expect(m.proizvodi.find((p) => p.id === id["Pljeskavica"])!.prilog!.besplatni).toEqual([]);

    await izmijeni({ id: id["Pomfrit"], aktivan: true });
    m = await meniKonobara();
    expect(m.proizvodi.find((p) => p.id === id["Pljeskavica"])!.prilog!.besplatni).toEqual([id["Pomfrit"]]);
  });

  it("does not touch a line already sent", async () => {
    await naruci(ljudi, [jelo(id["Gulaš"])], 1);
    await izmijeni({ id: id["Gulaš"], aktivan: false });
    expect((await racunStola(ljudi, 1)).ukupno).toBe(13);
  });
});

describe("adding", () => {
  it("adds an orderable item at the end of its category, with no photo, and logs it", async () => {
    const novi = await dodaj();
    expect(novi).toMatchObject({
      naziv: "Novo jelo",
      kategorijaId: "kuhana-jela",
      cijena: 12.5,
      jedinica: "porcija",
      stanica: "kuhinja",
      redoslijed: 9,
      aktivan: true,
      tezina: false,
      jePrilog: false,
      besplatniPrilozi: [],
      slika: null,
    });

    const stavka = (await meniKonobara()).proizvodi.find((p) => p.id === novi.id)!;
    expect(stavka.slika).toBeNull();
    await naruci(ljudi, [jelo(novi.id, 2)], 1);
    expect((await racunStola(ljudi, 1)).ukupno).toBe(25);

    const zapis = (await dnevnik()).find((d) => d.radnja === "proizvod_dodan")!;
    expect(zapis.detalji).toMatchObject({ proizvod: novi.id, naziv: "Novo jelo", cijena: 12.5, kategorija: "kuhana-jela" });
  });

  it("takes an order number, and trims the name", async () => {
    expect(await dodaj({ naziv: "  Prvo jelo  ", redoslijed: 1 })).toMatchObject({ naziv: "Prvo jelo", redoslijed: 1 });
  });

  it("gives a new dish the rule of its category, as the menu's rule always did", async () => {
    const rostilj = await dodaj({ naziv: "Roštilj miks", kategorijaId: "rostilj", stanica: "pecenjara" });
    expect(rostilj.besplatniPrilozi).toEqual(["Pomfrit"]);
    expect((await dodaj({ naziv: "Ćevapi XL", kategorijaId: "rostilj", stanica: "pecenjara" })).besplatniPrilozi).toEqual([]);

    await naruci(ljudi, [jelo(rostilj.id, 1, [id["Pomfrit"]])], 1);
    expect((await racunStola(ljudi, 1)).ukupno).toBe(12.5);
  });

  it("finds the free side even after it was renamed", async () => {
    await izmijeni({ id: id["Pomfrit"], naziv: "Prženi krompir" });
    const novi = await dodaj({ naziv: "Roštilj miks", kategorijaId: "rostilj", stanica: "pecenjara" });
    expect(novi.besplatniPrilozi).toEqual(["Prženi krompir"]);
  });

  it("does not take a new item named like a side for the free side", async () => {
    const lazni = await dodaj({ naziv: "Pomfrit", kategorijaId: "supe" });
    const novi = await dodaj({ naziv: "Roštilj miks", kategorijaId: "rostilj", stanica: "pecenjara" });
    expect(lazni.jePrilog).toBe(false);
    expect(novi.besplatniPrilozi).toEqual(["Pomfrit"]);
    const m = await meniKonobara();
    expect(m.proizvodi.find((p) => p.id === novi.id)!.prilog!.besplatni).toEqual([id["Pomfrit"]]);
    expect(m.prilozi).not.toContain(lazni.id);
  });

  it("makes a new item in the sides category a side", async () => {
    const novi = await dodaj({ naziv: "Ajvar", kategorijaId: "prilozi", cijena: 2 });
    expect(novi.jePrilog).toBe(true);
    expect((await meniKonobara()).prilozi).toContain(novi.id);
  });

  it("weighs a new lamb dish sold by the kg, as the name rule did, and no other", async () => {
    expect((await dodaj({ naziv: "Jagnjetina but", kategorijaId: "pecenja", jedinica: "kg", stanica: "pecenjara" })).tezina).toBe(true);
    expect((await dodaj({ naziv: "Jagnjetina porcija", kategorijaId: "pecenja", stanica: "pecenjara" })).tezina).toBe(false);
    expect((await dodaj({ naziv: "Govedina", kategorijaId: "pecenja", jedinica: "kg", stanica: "pecenjara" })).tezina).toBe(false);
  });

  it.each([
    ["the same name", "Gulaš"],
    ["the same name in other case", "GULAŠ"],
    ["the same name with spaces", "  Gulaš "],
  ])("refuses %s in a category", async (_, naziv) => {
    expect(await greskaDodavanja({ naziv })).toBe("Proizvod s tim nazivom već postoji u toj kategoriji.");
    expect(await dnevnik()).toEqual([]);
  });

  it("allows the same name in another category", async () => {
    expect((await dodaj({ naziv: "Gulaš", kategorijaId: "supe" })).naziv).toBe("Gulaš");
  });

  it.each([
    ["too short", { naziv: "x" }, "Naziv mora imati"],
    ["blank", { naziv: "    " }, "Naziv mora imati"],
    ["too long", { naziv: "x".repeat(101) }, "Naziv mora imati"],
    ["with a line break", { naziv: "dva\nreda" }, "Naziv mora imati"],
    ["an unknown category", { kategorijaId: "nema" }, "Kategorija ne postoji."],
    ["an order out of range", { redoslijed: 0 }, "Redoslijed mora biti"],
    ["an order over the limit", { redoslijed: 10000 }, "Redoslijed mora biti"],
  ])("refuses %s", async (_, izmjena, poruka) => {
    expect(await greskaDodavanja(izmjena)).toContain(poruka);
  });

  it("SQL insists on every field for a new item", async () => {
    await expect(
      demoRpc("sacuvaj_proizvod", {
        p_sefica: ljudi.sefica.id,
        p_id: null,
        p_naziv: "Bez cijene",
        p_kategorija: "supe",
        p_cijena: null,
        p_jedinica: "porcija",
        p_stanica: "kuhinja",
        p_redoslijed: null,
        p_aktivan: null,
      }),
    ).rejects.toThrow("Unesite naziv, kategoriju, cijenu, jedinicu i stanicu.");
  });
});

describe("editing", () => {
  it("changes every field and logs old and new", async () => {
    await izmijeni({ id: id["Tripice"], naziv: "Fileki", jedinica: "kom", stanica: "pecenjara", redoslijed: 50 });
    const p = (await pregled()).proizvodi.find((x) => x.id === id["Tripice"])!;
    expect(p).toMatchObject({ naziv: "Fileki", jedinica: "kom", stanica: "pecenjara", redoslijed: 50 });
    expect((await dnevnik())[0].detalji).toEqual({
      proizvod: id["Tripice"],
      naziv: "Tripice",
      promjene: {
        naziv: { staro: "Tripice", novo: "Fileki" },
        jedinica: { staro: "porcija", novo: "kom" },
        stanica: { staro: "kuhinja", novo: "pecenjara" },
        redoslijed: { staro: 5, novo: 50 },
      },
    });
  });

  it("refuses an unknown item", async () => {
    expect(await greskaIzmjene({ id: randomUUID(), cijena: 1 })).toBe("Proizvod nije pronađen.");
  });

  it("refuses a rename onto a neighbour, but allows renaming to its own name in other case", async () => {
    expect(await greskaIzmjene({ id: id["Gulaš"], naziv: "tripice" })).toBe("Proizvod s tim nazivom već postoji u toj kategoriji.");
    expect((await izmijeni({ id: id["Gulaš"], naziv: "GULAŠ" })).naziv).toBe("GULAŠ");
  });

  it("refuses a move onto a name taken in the new category", async () => {
    await dodaj({ naziv: "Tripice", kategorijaId: "supe" });
    expect(await greskaIzmjene({ id: id["Tripice"], kategorijaId: "supe" })).toBe("Proizvod s tim nazivom već postoji u toj kategoriji.");
  });

  it("keeps history: a sent line keeps its name, unit, price and total through every edit", async () => {
    await naruci(ljudi, [jelo(id["Gulaš"], 2)], 1);
    const prije = await linije();
    await izmijeni({ id: id["Gulaš"], naziv: "Gulaš novi", cijena: 99, jedinica: "kom", stanica: "pecenjara", kategorijaId: "supe", aktivan: false });
    expect(await linije()).toEqual(prije);
    expect(prije[0]).toMatchObject({ naziv: "Gulaš", iznos: 26 });
  });

  it("moves an item to the end of its new category, and to the rule of that category", async () => {
    const p = await izmijeni({ id: id["Gulaš"], kategorijaId: "riba" });
    expect(p).toMatchObject({ kategorijaId: "riba", redoslijed: 3, besplatniPrilozi: ["Pomfrit", "Krompir salata"] });
    expect(p.slika?.putanja).toBe("/meni/kuhana-jela/gulas.jpg");
    expect((await izmijeni({ id: id["Pomfrit"], kategorijaId: "supe" })).jePrilog).toBe(false);
    expect((await meniKonobara()).prilozi).not.toContain(id["Pomfrit"]);
    // A dish still listing it cannot offer what the order would refuse.
    expect((await meniKonobara()).proizvodi.find((x) => x.id === id["Pljeskavica"])!.prilog!.besplatni).toEqual([]);
  });

  it("takes an explicit order in the new category", async () => {
    expect((await izmijeni({ id: id["Gulaš"], kategorijaId: "riba", redoslijed: 1 })).redoslijed).toBe(1);
  });

  it("breaks an order tie by name, so the list stays stable", async () => {
    await izmijeni({ id: id["Gulaš"], redoslijed: 1 });
    const imena = (await meniKonobara()).proizvodi.map((p) => p.naziv);
    expect(imena.indexOf("Gulaš")).toBeLessThan(imena.indexOf("Lešo teletina"));
  });

  it.each([JAGNJETINA, "Pečeno pile"])("will not change the unit or station of %s, which the grill count prices", async (naziv) => {
    const poruka = "Ovaj proizvod se važe ili je u popisu pečenjare, pa mu se jedinica i stanica ne mijenjaju.";
    expect(await greskaIzmjene({ id: id[naziv], jedinica: "porcija" })).toBe(poruka);
    expect(await greskaIzmjene({ id: id[naziv], stanica: "kuhinja" })).toBe(poruka);
  });

  it("the database refuses a weighed item that is not sold by the kg", async () => {
    await expect((await demoBaza()).exec("update public.proizvodi set tezina = true where naziv = 'Gulaš'")).rejects.toThrow("proizvodi_tezina_po_kg");
  });
});

describe("a rename keeps every rule", () => {
  async function dajZaLamb() {
    const [n] = await naruci(ljudi, [jelo(id[JAGNJETINA], 1)], 1);
    await pomjeri(ljudi, n, "U pripremi");
    return n;
  }

  it("still weighs renamed lamb, with the weight on the bill", async () => {
    const n = await dajZaLamb();
    await izmijeni({ id: id[JAGNJETINA], naziv: "Janjetina na ražnju" });
    const [m] = await naruci(ljudi, [jelo(id[JAGNJETINA], 1)], 2);
    await pomjeri(ljudi, m, "U pripremi");

    const red = (await demoRpc("red_stanice", { p_zaposlenik: ljudi.pecenjara.id, p_stanica: "pecenjara" })) as {
      narudzbe: { id: string; stavke: { id: number; trebaTezinu: boolean; naziv: string }[] }[];
    };
    expect(red.narudzbe.flatMap((x) => x.stavke).map((s) => [s.naziv, s.trebaTezinu])).toEqual([
      [JAGNJETINA, true],
      ["Janjetina na ražnju", true],
    ]);

    for (const [narudzba, sto] of [[n, 1], [m, 2]] as const) {
      const stavka = red.narudzbe.find((x) => x.id === narudzba.id)!.stavke[0];
      const bezTezine = await statusRuta(zahtjev(`/api/narudzbe/${narudzba.id}`, { tijelo: { status: "Gotovo", cijena: 5, tezine: [] }, kolacici: k("pecenjara") }), {
        params: Promise.resolve({ id: narudzba.id }),
      });
      expect(bezTezine.status).toBe(422);
      await pomjeri(ljudi, narudzba, "Gotovo", { cijena: 5, tezine: [{ stavkaId: stavka.id, kg: 1.5 }] });
      expect((await racunStola(ljudi, sto)).ukupno).toBe(75);
    }
  });

  it("does not start weighing veal when it is named like lamb", async () => {
    await izmijeni({ id: id["Teletina ispod sača"], naziv: "Jagnjetina ispod sača" });
    const [n] = await naruci(ljudi, [jelo(id["Teletina ispod sača"], 1)], 1);
    await pomjeri(ljudi, n, "U pripremi");
    const red = (await demoRpc("red_stanice", { p_zaposlenik: ljudi.pecenjara.id, p_stanica: "pecenjara" })) as {
      narudzbe: { stavke: { trebaTezinu: boolean }[] }[];
    };
    expect(red.narudzbe[0].stavke[0].trebaTezinu).toBe(false);
  });

  it("does not weigh a voided line", async () => {
    const n = await dajZaLamb();
    const { rows } = await (await demoBaza()).query<{ id: number }>("select id from public.stavke_narudzbe where narudzba_id = $1", [n.id]);
    await (await demoBaza()).query("update public.stavke_narudzbe set cijena = 0, storno_razlog = 'Drugo', storno_vrijednost = 50 where id = $1", [rows[0].id]);
    const red = (await demoRpc("red_stanice", { p_zaposlenik: ljudi.pecenjara.id, p_stanica: "pecenjara" })) as {
      narudzbe: { stavke: { trebaTezinu: boolean }[] }[];
    };
    expect(red.narudzbe[0].stavke[0].trebaTezinu).toBe(false);
  });

  it("keeps the grill count's prices, even for items renamed and sold out", async () => {
    await izmijeni({ id: id["Pečeno pile"], naziv: "Pile s ražnja", aktivan: false });
    await izmijeni({ id: id[JAGNJETINA], naziv: "Janjetina", cijena: 60 });
    const pregled = await json<{ cijene: { koka: number; janjetina: number } }>(await pecenjaraGet(zahtjev("/api/pecenjara/smjena", { kolacici: k("pecenjara") })));
    expect(pregled.cijene).toEqual({ koka: 14, janjetina: 60 });
  });

  it("does not let a new item steal a grill count's price", async () => {
    await dodaj({ naziv: "Pečeno pile", kategorijaId: "rostilj", stanica: "pecenjara", cijena: 99 });
    const pregled = await json<{ cijene: { koka: number } }>(await pecenjaraGet(zahtjev("/api/pecenjara/smjena", { kolacici: k("pecenjara") })));
    expect(pregled.cijene.koka).toBe(14);
  });

  it.each([
    ["Bečka šnicla", "Šnicla bečka", ["Pomfrit"], "Pomfrit"],
    ["Pljeskavica", "Velika pljeskavica", ["Pomfrit"], "Pomfrit"],
    ["Lešo teletina", "Kuhana teletina", ["Miješano povrće"], "Miješano povrće"],
    ["Gulaš", "Goulash", ["Pire krompir", "Riža", "Makaroni"], null],
    ["Teletina ispod sača", "Sač", ["Pekarski krompir", "Pomfrit"], "Pekarski krompir"],
    ["Pastrmka sa žara", "Riba sa žara", ["Pomfrit", "Krompir salata"], "Pomfrit"],
    ["Mućkalica", "Miks", [], null],
    ["Ćevapi – mala porcija", "Mala porcija", [], null],
    ["Sudžukice – male", "Male", [], null],
  ] as const)("%s renamed to %s keeps its free sides", async (staro, novo, besplatni, podrazumijevani) => {
    const prije = (await meniKonobara()).proizvodi.find((p) => p.id === id[staro])!.prilog;
    await izmijeni({ id: id[staro], naziv: novo });
    const poslije = (await meniKonobara()).proizvodi.find((p) => p.id === id[staro])!;
    expect(poslije.naziv).toBe(novo);
    expect(poslije.prilog).toEqual(prije);
    expect(poslije.prilog!.besplatni).toEqual(besplatni.map((b) => id[b]));
    expect(poslije.prilog!.podrazumijevani).toBe(podrazumijevani ? id[podrazumijevani] : null);
  });

  it("does not give fries to a dish renamed away from a rule that excluded it, or take them from one renamed into it", async () => {
    await izmijeni({ id: id["Pljeskavica"], naziv: "Ćevap pljeskavica" });
    await naruci(ljudi, [jelo(id["Pljeskavica"], 1, [id["Pomfrit"]])], 1);
    expect((await racunStola(ljudi, 1)).ukupno).toBe(13);

    await izmijeni({ id: id["Ćevapi – mala porcija"], naziv: "Mala" });
    await naruci(ljudi, [jelo(id["Ćevapi – mala porcija"], 1, [id["Pomfrit"]])], 2);
    expect((await racunStola(ljudi, 2)).ukupno).toBe(13.5);
  });

  it("a renamed side stays a side, and stays free", async () => {
    await izmijeni({ id: id["Pomfrit"], naziv: "Prženi krompir" });
    await izmijeni({ id: id["Krompir salata"], naziv: "Salata od povrća" });
    const m = await meniKonobara();
    expect(m.prilozi).toEqual(expect.arrayContaining([id["Pomfrit"], id["Krompir salata"]]));

    await naruci(ljudi, [jelo(id["Pljeskavica"], 1, [id["Pomfrit"]])], 1);
    expect((await racunStola(ljudi, 1)).ukupno).toBe(13);
    await naruci(ljudi, [jelo(id["Pastrmka sa žara"], 1, [id["Krompir salata"]])], 2);
    expect((await racunStola(ljudi, 2)).ukupno).toBe(17);
  });

  it("charges the second side, as the one-free-side rule says", async () => {
    await izmijeni({ id: id["Gulaš"], naziv: "Goulash" });
    await naruci(ljudi, [jelo(id["Gulaš"], 1, [id["Riža"], id["Pire krompir"]])], 1);
    expect((await racunStola(ljudi, 1)).ukupno).toBe(17);
  });

  it("refuses as a side what is not one, whatever its name says", async () => {
    await izmijeni({ id: id["Zimska salata"], naziv: "Krompir zimska" });
    const odgovor = await narudzbaRuta(
      zahtjev("/api/narudzbe", {
        tijelo: { requestId: randomUUID(), stoId: 1, stavke: [jelo(id["Pljeskavica"], 1, [id["Zimska salata"]])] },
        kolacici: k("konobar"),
      }),
    );
    expect(odgovor.status).toBe(422);
    expect(((await odgovor.json()) as { greska: string }).greska).toBe("Odabrani prilog ne postoji.");
  });
});

describe("photos", () => {
  it("keeps the photo through a rename and a move, on both screens", async () => {
    const prije = SLIKE["kuhana-jela/Gulaš"].putanja;
    await izmijeni({ id: id["Gulaš"], naziv: "Goulash", kategorijaId: "supe" });
    expect((await meniKonobara()).proizvodi.find((p) => p.id === id["Gulaš"])!.slika?.putanja).toBe(prije);
    expect((await pregled()).proizvodi.find((p) => p.id === id["Gulaš"])!.slika?.putanja).toBe(prije);
  });

  it("does not hand an old photo to a new item taking a freed name", async () => {
    await izmijeni({ id: id["Gulaš"], naziv: "Goulash" });
    expect((await dodaj({ naziv: "Gulaš" })).slika).toBeNull();
  });

  it("never sends the key to a screen", async () => {
    const m = await meniKonobara();
    expect(JSON.stringify(m)).not.toContain("slikaKljuc");
    expect(JSON.stringify(await pregled())).not.toContain("slikaKljuc");
  });

  it("the key cannot be changed by an edit", async () => {
    await izmijeni({ id: id["Gulaš"], naziv: "Goulash" });
    const { rows } = await (await demoBaza()).query<{ izvorni_kljuc: string }>("select izvorni_kljuc from public.proizvodi where id = $1", [id["Gulaš"]]);
    expect(rows[0].izvorni_kljuc).toBe("kuhana-jela/Gulaš");
  });
});

describe("with a shift open", () => {
  const COLA = "Coca-Cola 0,25 l";

  it("refuses a new price or another station for a counted drink, as it would reprice drinks already sold", async () => {
    await otvoriSmjenu();
    const poruka = "Dok je smjena otvorena, piću iz popisa se ne mijenjaju cijena ni stanica.";
    expect(await greskaIzmjene({ id: id[COLA], cijena: 4 })).toBe(poruka);
    expect(await greskaIzmjene({ id: id[COLA], stanica: "kuhinja" })).toBe(poruka);
  });

  it("still allows a drink to sell out and come back, or a rename, and any kitchen price", async () => {
    await otvoriSmjenu();
    await izmijeni({ id: id[COLA], aktivan: false });
    await izmijeni({ id: id[COLA], aktivan: true });
    expect((await izmijeni({ id: id[COLA], naziv: "Cola" })).naziv).toBe("Cola");
    expect((await izmijeni({ id: id["Gulaš"], cijena: 15 })).cijena).toBe(15);
  });

  it("refuses a drink the count does not know, new or brought back", async () => {
    await izmijeni({ id: id[COLA], aktivan: false });
    await otvoriSmjenu();
    const poruka = "Piće koje nije u popisu otvorene smjene može se dodati ili vratiti tek kad se smjena zatvori.";
    expect(await greskaIzmjene({ id: id[COLA], aktivan: true })).toBe(poruka);
    expect(await greskaIzmjene({ id: id["Gulaš"], stanica: "sank" })).toBe(poruka);
    expect(await greskaDodavanja({ naziv: "Novi sok", kategorijaId: "bezalkoholna-pica", stanica: "sank" })).toBe(poruka);
    expect((await dodaj({ naziv: "Novi kolač", kategorijaId: "deserti" })).aktivan).toBe(true);
  });

  it("allows all of it with no shift open", async () => {
    expect((await izmijeni({ id: id[COLA], cijena: 4 })).cijena).toBe(4);
    expect((await dodaj({ naziv: "Novi sok", kategorijaId: "bezalkoholna-pica", stanica: "sank" })).aktivan).toBe(true);
  });

  it("refuses a new price for the grill count's two items while that count is open", async () => {
    await otvoriSmjenu();
    await json(
      await popisPost(
        zahtjev("/api/pecenjara/smjena", {
          tijelo: { requestId: randomUUID(), pocetneKokePecene: 1, pocetneKokeSirove: 0, pocetnaJanjetinaKg: 1 },
          kolacici: k("pecenjara"),
        }),
      ),
    );
    const poruka = "Dok je popis pečenjare otvoren, cijena ovog proizvoda se ne mijenja.";
    expect(await greskaIzmjene({ id: id[JAGNJETINA], cijena: 60 })).toBe(poruka);
    expect(await greskaIzmjene({ id: id["Pečeno pile"], cijena: 20 })).toBe(poruka);
    expect((await izmijeni({ id: id["Pljeskavica"], cijena: 20 })).cijena).toBe(20);
  });
});
