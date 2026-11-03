import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SLIKE } from "@/lib/data/slike";

// Stops at the last live migration, adds real rows, then runs the new ones: what the real database will go through.
const MIGRACIJE = path.resolve("supabase/migrations");
const PRVA_NOVA = "20261103000900";
const datoteke = readdirSync(MIGRACIJE).sort();

type Meni = { kategorije: { proizvodi: Record<string, unknown>[] }[]; prilozi: string[] };
type Linija = { naziv: string; kolicina: string; cijena: string; iznos: string };

let db: PGlite;
const prije: Record<string, unknown> = {};
const poslije: Record<string, unknown> = {};
let konobar: string;
let pecenjara: string;
let id: Record<string, string>;
let otvorenaNarudzba: string;
let lambLinija: string;

const jedan = async <T>(upit: string, parametri: unknown[] = []) => (await db.query<T>(upit, parametri)).rows[0];

const meni = async () => (await jedan<{ v: Meni }>("select public.meni($1::uuid) as v", [konobar])).v;

const stavka = (proizvodId: string, kolicina: number, prilozi: string[] = []) => ({
  proizvodId,
  kolicina,
  prilozi: prilozi.map((p) => ({ proizvodId: p })),
});

// Every dish that has free sides, with those sides and one more, so the free one and the charged one both show.
async function naruci(sto: number) {
  const stavke = [
    stavka(id["Gulaš"], 1, [id["Riža"], id["Pire krompir"]]),
    stavka(id["Pljeskavica"], 2, [id["Pomfrit"]]),
    stavka(id["Mućkalica"], 1, [id["Pomfrit"]]),
    stavka(id["Ćevapi – mala porcija"], 1, [id["Pomfrit"]]),
    stavka(id["Lešo teletina"], 1, [id["Miješano povrće"]]),
    stavka(id["Teletina ispod sača"], 0.5, [id["Pekarski krompir"]]),
    stavka(id["Pastrmka sa žara"], 1, [id["Krompir salata"], id["Pomfrit"]]),
    stavka(id["Jagnjetina s ražnja"], 0.5),
    stavka(id["Coca-Cola 0,25 l"], 1),
  ];
  const zahtjevId = randomUUID();
  await db.query("select public.posalji_narudzbu($1::uuid, $2::uuid, $3::smallint, $4::jsonb, null, null, null)", [
    konobar,
    zahtjevId,
    sto,
    JSON.stringify(stavke),
  ]);
  const { rows } = await db.query<Linija>(
    `select s.naziv, s.kolicina::text, s.cijena::text, s.iznos::text
     from public.stavke_narudzbe s join public.narudzbe n on n.id = s.narudzba_id
     where n.request_id = $1 order by s.naziv, s.cijena`,
    [zahtjevId],
  );
  return rows;
}

async function presjek(cilj: Record<string, unknown>) {
  cilj.meni = await meni();
  await db.exec("update public.proizvodi set aktivan = false where naziv in ('Pomfrit', 'Riža', 'Gulaš')");
  cilj.meniBezPriloga = await meni();
  await db.exec("update public.proizvodi set aktivan = true");
  cilj.cijene = await jedan("select * from public.cijene_pecenjare()");
  cilj.proizvodi = (
    await db.query(
      "select id, kategorija_id, naziv, cijena::text, jedinica::text, stanica::text, redoslijed, aktivan from public.proizvodi order by id",
    )
  ).rows;
  cilj.stavke = (await db.query("select * from public.stavke_narudzbe order by id")).rows;
  cilj.red = (await jedan<{ v: unknown }>("select public.red_stanice($1::uuid, 'pecenjara') as v", [pecenjara])).v;
}

const bezVremena = (red: unknown) => JSON.parse(JSON.stringify(red, (k, v) => (k === "sada" || k === "cekaDugo" ? undefined : v)));

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec("create role anon; create role authenticated; create role service_role;");
  for (const d of datoteke.filter((x) => x < PRVA_NOVA)) await db.exec(readFileSync(path.join(MIGRACIJE, d), "utf8"));

  konobar = (await jedan<{ id: string }>("select id from public.zaposlenici where uloga = 'konobar' order by ime limit 1")).id;
  pecenjara = (await jedan<{ id: string }>("select id from public.zaposlenici where uloga = 'pecenjara' order by ime limit 1")).id;
  id = Object.fromEntries((await db.query<{ id: string; naziv: string }>("select id, naziv from public.proizvodi")).rows.map((r) => [r.naziv, r.id]));

  prije.nova = await naruci(1);
  const n = await jedan<{ id: string }>("select id from public.narudzbe where stanica = 'pecenjara' limit 1");
  otvorenaNarudzba = n.id;
  await db.query("select public.promijeni_status_narudzbe($1::uuid, $2::uuid, 'U pripremi', null, null)", [pecenjara, otvorenaNarudzba]);
  lambLinija = (await jedan<{ id: string }>("select id from public.stavke_narudzbe where naziv = 'Jagnjetina s ražnja'")).id;
  await presjek(prije);

  for (const d of datoteke.filter((x) => x >= PRVA_NOVA)) await db.exec(readFileSync(path.join(MIGRACIJE, d), "utf8"));
  await presjek(poslije);
  poslije.nova = await naruci(2);
}, 120_000);

afterAll(() => db.close());

const bezKljuca = (m: Meni) => ({
  ...m,
  kategorije: m.kategorije.map((k) => ({
    ...k,
    proizvodi: k.proizvodi.map((p) => Object.fromEntries(Object.entries(p).filter(([polje]) => polje !== "slikaKljuc"))),
  })),
});

describe("the menu migrations on a database already in use", () => {
  it("expects the live migrations to stop just before them", () => {
    expect(datoteke.filter((x) => x < PRVA_NOVA).at(-1)).toBe("20261103000800_osoblje_rezervacije.sql");
  });

  it("leaves every product's own values alone", () => {
    expect(poslije.proizvodi).toEqual(prije.proizvodi);
    expect((prije.proizvodi as unknown[]).length).toBe(161);
  });

  it("leaves every line already sent alone", () => {
    expect(poslije.stavke).toEqual(prije.stavke);
  });

  it("gives waiters the same menu, rules and sides, to the byte, apart from the photo key", () => {
    expect(bezKljuca(poslije.meni as Meni)).toEqual(prije.meni);
    expect(bezKljuca(poslije.meniBezPriloga as Meni)).toEqual(prije.meniBezPriloga);
  });

  it("charges the same for the same order", () => {
    expect(poslije.nova).toEqual(prije.nova);
    expect(prije.nova).toContainEqual({ naziv: "Riža", kolicina: "1.000", cijena: "0.00", iznos: "0.00" });
    expect(prije.nova).toContainEqual({ naziv: "Pire krompir", kolicina: "1.000", cijena: "4.00", iznos: "4.00" });
  });

  it("keeps the grill count's prices", () => {
    expect(poslije.cijene).toEqual(prije.cijene);
    expect(prije.cijene).toMatchObject({ koka: "14.00", janjetina: "50.00" });
  });

  it("still asks the grill for the weight of a lamb line sent before the migration, and only that", () => {
    expect(bezVremena(poslije.red)).toEqual(bezVremena(prije.red));
    const linije = (poslije.red as { narudzbe: { stavke: { naziv: string; trebaTezinu: boolean }[] }[] }).narudzbe.flatMap((x) => x.stavke);
    expect(linije.filter((s) => s.trebaTezinu).map((s) => s.naziv)).toEqual(["Jagnjetina s ražnja"]);
    expect(linije.length).toBeGreaterThan(1);
  });

  it("takes that line's real weight onto the bill after the migration", async () => {
    await expect(
      db.query("select public.promijeni_status_narudzbe($1::uuid, $2::uuid, 'Gotovo', 5, '[]'::jsonb)", [pecenjara, otvorenaNarudzba]),
    ).rejects.toThrow("Unesite stvarnu količinu");
    await db.query("select public.promijeni_status_narudzbe($1::uuid, $2::uuid, 'Gotovo', 5, $3::jsonb)", [
      pecenjara,
      otvorenaNarudzba,
      JSON.stringify([{ stavkaId: lambLinija, kg: 1 }]),
    ]);
    const { iznos } = await jedan<{ iznos: string }>("select iznos::text from public.stavke_narudzbe where id = $1", [lambLinija]);
    expect(iznos).toBe("50.00");
  });

  it("sets each flag from today's names, and only on what today's rules mean", async () => {
    const { rows } = await db.query<{ naziv: string; tezina: boolean; cijena_popisa: string | null }>(
      "select naziv, tezina, cijena_popisa from public.proizvodi where tezina or cijena_popisa is not null order by naziv",
    );
    expect(rows).toEqual([
      { naziv: "Jagnjetina s ražnja", tezina: true, cijena_popisa: "janjetina" },
      { naziv: "Pečeno pile", tezina: false, cijena_popisa: "koka" },
    ]);
    const { n } = await jedan<{ n: number }>("select count(*)::int as n from public.proizvodi where prilog");
    expect(n).toBe(12);
  });

  it("agrees with the name rules on every product, sold out or not", async () => {
    const { rows } = await db.query(`
      select p.naziv from public.proizvodi p
      cross join lateral public.pravilo_priloga(p.kategorija_id, p.naziv) r
      where p.prilog <> public.je_prilog(p.kategorija_id, p.naziv)
         or p.tezina <> public.je_jagnjetina(p.naziv, p.jedinica)
         or p.prilog_unaprijed <> r.unaprijed
         or (select coalesce(array_agg(s.naziv order by array_position(p.besplatni_prilozi, s.id)), '{}') from public.proizvodi s where s.id = any (p.besplatni_prilozi)) <> r.besplatni
    `);
    expect(rows).toEqual([]);
  });

  it("gives every product the photo key its photo is stored under", async () => {
    const { rows } = await db.query<{ izvorni_kljuc: string; kljuc: string }>(
      "select izvorni_kljuc, kategorija_id || '/' || naziv as kljuc from public.proizvodi",
    );
    expect(rows).toHaveLength(161);
    for (const r of rows) {
      expect(r.izvorni_kljuc).toBe(r.kljuc);
      expect(SLIKE[r.izvorni_kljuc]).toBeDefined();
    }
  });
});
