import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as meni } from "@/app/api/meni/route";
import { SLIKE } from "@/lib/data/slike";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { ocisti, osoblje, pripremiOkruzenje, zahtjev, type Osoba } from "./pomocnici";
import type { Uloga } from "@/lib/auth/session";

type Prilog = { besplatni: string[]; podrazumijevani: string | null; jednaPorcija: boolean };
type Proizvod = {
  id: string;
  naziv: string;
  cijena: number;
  jedinica: string;
  stanica: string;
  slika: { putanja: string; zasluge: string | null } | null;
  prilog: Prilog | null;
};
type Meni = { kategorije: { id: string; naziv: string; proizvodi: Proizvod[] }[]; prilozi: string[] };

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

async function ucitaj() {
  const odgovor = await meni(zahtjev("/api/meni", { kolacici: [ljudi.konobar.kolacic] }));
  expect(odgovor.status).toBe(200);
  return (await odgovor.json()) as Meni;
}

describe("menu seed", () => {
  it("has every item and category from the owner's CSV, and the same price sum", async () => {
    const db = await demoBaza();
    const { rows } = await db.query<{ id: string; broj: number; suma: string; aktivni: number }>(`
      select k.id, count(*)::int as broj, sum(p.cijena)::text as suma, count(*) filter (where p.aktivan)::int as aktivni
      from public.kategorije k join public.proizvodi p on p.kategorija_id = k.id
      group by k.id, k.redoslijed order by k.redoslijed
    `);
    expect(rows.map((r) => [r.id, r.broj])).toEqual([
      ["hladna-predjela", 6],
      ["topla-predjela", 3],
      ["supe", 3],
      ["kuhana-jela", 8],
      ["jela-po-narudzbi", 11],
      ["piletina", 5],
      ["rostilj", 18],
      ["pecenja", 7],
      ["riba", 2],
      ["prilozi", 11],
      ["salate", 4],
      ["hljeb", 3],
      ["deserti", 6],
      ["vina", 16],
      ["zestoka-pica", 18],
      ["pivo", 11],
      ["bezalkoholna-pica", 25],
      ["topli-napici", 4],
    ]);
    expect(rows.reduce((n, r) => n + r.aktivni, 0)).toBe(161);

    const suma = await db.query<{ suma: string }>("select sum(cijena)::text as suma from public.proizvodi");
    expect(suma.rows[0].suma).toBe("1696.50");
  });

  it.each([
    ["Sudžukice – male", "6.50", "porcija", "pecenjara"],
    ["Ćevapi – mala porcija", "9.50", "porcija", "pecenjara"],
    ["Jagnjetina s ražnja", "50.00", "kg", "pecenjara"],
    ["Teletina ispod sača", "55.00", "kg", "pecenjara"],
    ["Janjeća puca", "2.50", "kom", "pecenjara"],
    ["Točeno pivo 1 l", "8.00", "l", "sank"],
    ["Jogurt", "1.50", "porcija", "kuhinja"],
  ])("has %s at %s KM", async (naziv, cijena, jedinica, stanica) => {
    const { rows } = await (await demoBaza()).query(
      "select cijena::text, jedinica::text, stanica::text from public.proizvodi where naziv = $1",
      [naziv],
    );
    expect(rows).toEqual([{ cijena, jedinica, stanica }]);
  });

  it("has a SLIKE entry for every product, and none left over", async () => {
    const { rows } = await (await demoBaza()).query<{ kljuc: string }>(
      "select kategorija_id || '/' || naziv as kljuc from public.proizvodi",
    );
    expect(rows.map((r) => r.kljuc).sort()).toEqual(Object.keys(SLIKE).sort());
  });

  it("has tables 1 to 20", async () => {
    const { rows } = await (await demoBaza()).query<{ id: number }>("select id from public.stolovi order by id");
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

describe("GET /api/meni", () => {
  it("requires a session", async () => {
    expect((await meni(zahtjev("/api/meni"))).status).toBe(401);
  });

  it.each(["konobar", "kuhinja", "pecenjara", "mesnica", "sefica"] as const)("lets %s read it", async (uloga) => {
    expect((await meni(zahtjev("/api/meni", { kolacici: [ljudi[uloga].kolacic] }))).status).toBe(200);
  });

  it("refuses an inactive employee in SQL too", async () => {
    await expect(demoRpc("meni", { p_zaposlenik: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({
      code: "P0001",
    });
  });

  it("returns ordered categories with only the fields a screen needs", async () => {
    const { kategorije } = await ucitaj();
    expect(kategorije).toHaveLength(18);
    expect(kategorije[0]).toMatchObject({ id: "hladna-predjela", naziv: "Hladna predjela" });
    expect(kategorije.flatMap((k) => k.proizvodi)).toHaveLength(161);

    const rostilj = kategorije.find((k) => k.id === "rostilj")!.proizvodi;
    expect(rostilj[0].naziv).toBe("Pileći batak bez kosti");
    expect(Object.keys(rostilj[0]).sort()).toEqual(["cijena", "id", "jedinica", "naziv", "prilog", "slika", "stanica"]);
    expect(rostilj.find((p) => p.naziv === "Sudžukice – male")!.cijena).toBe(6.5);
  });

  it("attaches only the path and credit of a photo", async () => {
    const { kategorije } = await ucitaj();
    const proizvodi = kategorije.flatMap((k) => k.proizvodi);
    expect(proizvodi.every((p) => p.slika && Object.keys(p.slika).sort().join() === "putanja,zasluge")).toBe(true);

    const pecenica = proizvodi.find((p) => p.naziv === "Goveđa pečenica")!;
    expect(pecenica.slika).toEqual({
      putanja: "/meni/hladna-predjela/govedja-pecenica.jpg",
      zasluge: "Photo: Mike Houser / Unsplash",
    });
    expect(proizvodi.find((p) => p.naziv === "Hurmašica")!.slika!.zasluge).toBeNull();
  });

  it("leaves out inactive products, in the menu, the free list and the side picker", async () => {
    await (await demoBaza()).exec("update public.proizvodi set aktivan = false where naziv in ('Gulaš', 'Pomfrit')");
    const { kategorije, prilozi } = await ucitaj();
    const proizvodi = kategorije.flatMap((k) => k.proizvodi);
    expect(proizvodi).toHaveLength(159);
    expect(proizvodi.some((p) => p.naziv === "Gulaš")).toBe(false);

    const pastrmka = proizvodi.find((p) => p.naziv === "Pastrmka sa žara")!;
    const krompirSalata = proizvodi.find((p) => p.naziv === "Krompir salata")!;
    expect(pastrmka.prilog).toEqual({ besplatni: [krompirSalata.id], podrazumijevani: krompirSalata.id, jednaPorcija: false });
    expect(prilozi).toHaveLength(11);
  });

  it("offers the side list and the rule per dish, driven by SQL", async () => {
    const { kategorije, prilozi } = await ucitaj();
    const proizvodi = kategorije.flatMap((k) => k.proizvodi);
    const naziv = (id: string | null) => proizvodi.find((p) => p.id === id)?.naziv ?? null;
    const pravilo = (ime: string) => {
      const p = proizvodi.find((x) => x.naziv === ime)!.prilog!;
      return { besplatni: p.besplatni.map(naziv), podrazumijevani: naziv(p.podrazumijevani), jednaPorcija: p.jednaPorcija };
    };

    expect(prilozi.map(naziv)).toEqual([
      "Pekarski krompir",
      "Kuhani krompir",
      "Makaroni",
      "Pomfrit",
      "Riža",
      "Pire krompir",
      "Miješano povrće",
      "Majoneza",
      "Kečap",
      "Senf",
      "Jogurt",
      "Krompir salata",
    ]);
    expect(pravilo("Gulaš")).toEqual({
      besplatni: ["Pire krompir", "Riža", "Makaroni"],
      podrazumijevani: null,
      jednaPorcija: false,
    });
    expect(pravilo("Teletina ispod sača")).toEqual({
      besplatni: ["Pekarski krompir", "Pomfrit"],
      podrazumijevani: "Pekarski krompir",
      jednaPorcija: true,
    });
    expect(pravilo("Jagnjetina s ražnja")).toEqual({ besplatni: [], podrazumijevani: null, jednaPorcija: true });
    expect(proizvodi.find((p) => p.naziv === "Coca-Cola 0,25 l")!.prilog).toBeNull();
  });

  it("stays small", async () => {
    expect(JSON.stringify(await ucitaj()).length).toBeLessThan(50_000);
  });
});
