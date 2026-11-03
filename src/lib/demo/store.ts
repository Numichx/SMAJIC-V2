import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Development stand-in for Supabase: the real migrations on a local Postgres, so no SQL function needs a TypeScript copy.

const globalno = globalThis as typeof globalThis & { demoBaza?: Promise<PGlite> };

async function otvori() {
  const folder = process.env.DEMO_BAZA ?? path.join(process.cwd(), ".data", "demo");
  // PGlite does not create missing parents, so a fresh install would fail. memory:// is not a path.
  if (!folder.includes("://")) mkdirSync(folder, { recursive: true });
  const db = await PGlite.create(folder, { extensions: { pgcrypto } });

  await db.exec(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'service_role') then
        create role anon;
        create role authenticated;
        create role service_role;
      end if;
    end $$;
    create schema if not exists demo;
    create table if not exists demo.migracije (ime text primary key);
  `);

  const migracije = path.join(process.cwd(), "supabase", "migrations");
  const { rows } = await db.query<{ ime: string }>("select ime from demo.migracije");
  const primijenjene = new Set(rows.map((r) => r.ime));
  for (const ime of readdirSync(migracije).sort()) {
    if (primijenjene.has(ime)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(readFileSync(path.join(migracije, ime), "utf8"));
      await tx.query("insert into demo.migracije values ($1)", [ime]);
    });
  }

  // Stands in for running aktiviraj_prvu_seficu() in the SQL editor.
  const sefica = await db.query("select from public.zaposlenici where uloga = 'sefica' and pin_hash is not null");
  if (sefica.rows.length === 0) {
    const kod = await db.query<{ kod: string }>("select public.aktiviraj_prvu_seficu() as kod");
    console.info(`[demo] Aktivacijski kod za šeficu: ${kod.rows[0].kod}`);
  }
  return db;
}

// On globalThis because PGlite allows one connection, and dev hot reload re-runs this module.
export function demoBaza() {
  return (globalno.demoBaza ??= otvori());
}

function uTekst(vrijednost: unknown, tip: string) {
  if (vrijednost === null) return null;
  if (tip.endsWith("[]")) return `{${(vrijednost as unknown[]).map((v) => JSON.stringify(v)).join(",")}}`;
  return typeof vrijednost === "object" ? JSON.stringify(vrijednost) : String(vrijednost);
}

async function pozovi(tx: Transaction, ime: string, args: Record<string, unknown>) {
  const { rows } = await tx.query<{ argumenti: string; skup: boolean }>(
    `select pg_get_function_identity_arguments(p.oid) as argumenti, p.proretset as skup
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1`,
    [ime],
  );
  if (rows.length === 0) throw new Error(`Nema funkcije ${ime}`);

  const argumenti = rows[0].argumenti
    .split(", ")
    .filter(Boolean)
    .map((a) => {
      const [naziv, ...tip] = a.split(" ");
      return { naziv, tip: tip.join(" ") };
    });

  // PostgREST finds a function by its exact argument names, so a wrong name must fail here too.
  const ocekivani = argumenti.map((a) => a.naziv).sort();
  if (ocekivani.join() !== Object.keys(args).sort().join()) {
    throw new Error(`Pogrešni argumenti za ${ime}: očekivano ${ocekivani.join()}`);
  }

  const poziv = `public.${ime}(${argumenti.map((a, i) => `${a.naziv} => $${i + 1}::text::${a.tip}`).join(", ")})`;
  const sql = rows[0].skup
    ? `select coalesce(jsonb_agg(r), '[]'::jsonb) as v from ${poziv} r`
    : `select to_jsonb(${poziv}) as v`;

  // Runs with the app's real rights, and returns JSON in the same shape as PostgREST.
  await tx.query("set local role service_role");
  const rezultat = await tx.query<{ v: unknown }>(sql, argumenti.map((a) => uTekst(args[a.naziv], a.tip)));
  return rezultat.rows[0].v;
}

export async function demoRpc(ime: string, args: Record<string, unknown>) {
  const db = await demoBaza();
  return db.transaction((tx) => pozovi(tx, ime, args));
}
