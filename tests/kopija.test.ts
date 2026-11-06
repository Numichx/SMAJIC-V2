import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { demoBaza } from "@/lib/demo/store";
import { redoslijed, sqlPovrata, UPIT_SEME, upitPodataka } from "../scripts/kopija.mjs";
import { ocisti, osoblje, pripremiOkruzenje, proizvodi } from "./pomocnici";
import { jelo, naruci, plati, pomjeri, racunStola } from "./pomocnici-faza5";

type Sema = { tabela: string; kolone: { ime: string; identitet: string }[]; zavisi_od: string[] }[];

// A second database with only the migrations, like a new Supabase project after `db push`.
async function praznaBaza() {
  const db = await PGlite.create("memory://", { extensions: { pgcrypto } });
  await db.exec("create role anon; create role authenticated; create role service_role;");
  const folder = path.join(process.cwd(), "supabase", "migrations");
  for (const ime of readdirSync(folder).sort()) await db.exec(readFileSync(path.join(folder, ime), "utf8"));
  return db;
}

async function sadrzaj(db: PGlite, sema: Sema) {
  const { rows } = await db.query<{ v: Record<string, unknown> }>(
    `select jsonb_build_object(${sema
      .map((t) => `'${t.tabela}', (select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb) from public."${t.tabela}" x)`)
      .join(", ")}) as v`,
  );
  return rows[0].v;
}

beforeAll(async () => {
  pripremiOkruzenje();
  await ocisti();
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("restores every table exactly into a freshly migrated database, and new rows continue after it", async () => {
  const ljudi = await osoblje();
  const p = await proizvodi();
  // A grill dish with a kitchen side, a drink, all issued and paid: rows across most money tables.
  for (const n of await naruci(ljudi, [jelo(p["Pljeskavica"], 1, [p["Pomfrit"]]), jelo(p["Coca-Cola 0,25 l"], 2)])) await pomjeri(ljudi, n);
  await plati(ljudi, await racunStola(ljudi), { nacin: "kartica" });
  // An order on a bill that got its discount later. The insert trigger would refuse it during a restore.
  await naruci(ljudi, [jelo(p["Espresso"])], 2);
  const izvor = await demoBaza();
  await izvor.query("update public.racuni set popust_procenat = 10, popust_razlog = 'Stalni gost' where status = 'otvoren'");

  const sema = JSON.parse(JSON.stringify((await izvor.query(UPIT_SEME)).rows)) as Sema;
  const podaci = JSON.parse(JSON.stringify((await izvor.query<{ podaci: unknown }>(upitPodataka(sema))).rows[0].podaci));
  expect(redoslijed(sema).map((t: { tabela: string }) => t.tabela).indexOf("racuni")).toBeLessThan(
    redoslijed(sema).map((t: { tabela: string }) => t.tabela).indexOf("narudzbe"),
  );

  const cilj = await praznaBaza();
  await cilj.exec(sqlPovrata({ sema, podaci }));

  const prije = await sadrzaj(izvor, sema);
  expect(await sadrzaj(cilj, sema)).toEqual(prije);
  expect((prije.naplate as unknown[]).length).toBe(1);
  expect((prije.stavke_narudzbe as unknown[]).length).toBe(4);

  // Identity sequences were moved past the restored ids.
  const najveci = (await cilj.query<{ m: number }>("select max(id)::int as m from public.dnevnik_radnji")).rows[0].m;
  const novi = (await cilj.query<{ id: number }>("insert into public.dnevnik_radnji (radnja) values ('test') returning id::int")).rows[0].id;
  expect(novi).toBeGreaterThan(najveci);
  // The trigger is back on after the restore.
  const racun = (await cilj.query<{ id: string }>("select id from public.racuni where status = 'otvoren'")).rows[0].id;
  await expect(
    cilj.query("insert into public.narudzbe (racun_id, stanica, konobar_id) values ($1, 'sank', $2)", [racun, ljudi.konobar.id]),
  ).rejects.toThrow(/popust/);
  await cilj.close();
}, 120_000);

it("refuses a table name it would have to quote", () => {
  expect(() => upitPodataka([{ tabela: 'x"; drop table y; --', kolone: [], zavisi_od: [] }])).toThrow(/Neočekivano ime/);
});
