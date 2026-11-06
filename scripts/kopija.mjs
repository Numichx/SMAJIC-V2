// Backup and restore of the app's data. The free Supabase plan keeps no backups, and `supabase db dump`
// needs Docker, so this reads every public table as JSON through the Supabase CLI instead.
//
//   Backup (read-only):  node scripts/kopija.mjs izvoz <project-ref> <kopija.json>
//   Restore script:      node scripts/kopija.mjs povrat <kopija.json> <povrat.sql>
//
// Run povrat.sql only on a database with exactly the same migrations, after `supabase db push`:
//   npx supabase db query --remote=<project-ref> -f povrat.sql
// It empties every public table first. The backup holds PIN hashes and guest names: keep it off OneDrive.
// shortcut: the whole backup travels as one JSON query result, fine for a restaurant's data for years;
// move to pg_dump (Docker) or Supabase Pro backups if a backup grows past tens of MB.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// One row per public table: its columns (minus generated ones) and the tables its foreign keys point at.
export const UPIT_SEME = `
select c.relname as tabela,
  (select coalesce(jsonb_agg(jsonb_build_object('ime', a.attname, 'identitet', a.attidentity::text) order by a.attnum), '[]'::jsonb)
     from pg_attribute a
     where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = '') as kolone,
  (select coalesce(jsonb_agg(distinct d.relname), '[]'::jsonb)
     from pg_constraint f join pg_class d on d.oid = f.confrelid
     where f.conrelid = c.oid and f.contype = 'f' and f.confrelid <> c.oid and d.relnamespace = c.relnamespace) as zavisi_od
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname`;

const IME = /^[a-z_][a-z0-9_]*$/;
const ime = (s) => {
  if (!IME.test(s)) throw new Error(`Neočekivano ime u bazi: ${s}`);
  return `"${s}"`;
};

// Parents before children, so every foreign key finds its row. A self-reference is fine in one insert.
export function redoslijed(sema) {
  const gotovo = new Set();
  const red = [];
  const ostalo = [...sema];
  while (ostalo.length) {
    const i = ostalo.findIndex((t) => t.zavisi_od.every((d) => gotovo.has(d)));
    if (i < 0) throw new Error(`Kružne veze između tabela: ${ostalo.map((t) => t.tabela).join(", ")}`);
    const [t] = ostalo.splice(i, 1);
    gotovo.add(t.tabela);
    red.push(t);
  }
  return red;
}

export function upitPodataka(sema) {
  const parovi = sema.map((t) => `'${t.tabela}', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.${ime(t.tabela)} x)`);
  return `select jsonb_build_object(${parovi.join(", ")}) as podaci`;
}

export function sqlPovrata({ sema, podaci }) {
  const tekst = JSON.stringify(podaci);
  let oznaka = "kopija";
  while (tekst.includes(`$${oznaka}$`)) oznaka += "_";
  const tabele = redoslijed(sema);
  const sve = tabele.map((t) => `public.${ime(t.tabela)}`).join(", ");
  const sql = ["begin;", `truncate table ${sve} restart identity cascade;`];
  for (const t of tabele) {
    const redovi = podaci[t.tabela] ?? [];
    const kolone = t.kolone.map((k) => ime(k.ime)).join(", ");
    const tabela = `public.${ime(t.tabela)}`;
    // Triggers guard live use; one refuses an order on a discounted bill, which a restore must allow.
    sql.push(`alter table ${tabela} disable trigger user;`);
    if (redovi.length) {
      const nadjacaj = t.kolone.some((k) => k.identitet === "a") ? " overriding system value" : "";
      sql.push(
        `insert into ${tabela} (${kolone})${nadjacaj} select ${kolone} from jsonb_populate_recordset(null::${tabela}, $${oznaka}$${JSON.stringify(redovi)}$${oznaka}$::jsonb);`,
      );
    }
    for (const k of t.kolone.filter((k) => k.identitet)) {
      sql.push(
        `select setval(pg_get_serial_sequence('${tabela}', '${k.ime}'), coalesce((select max(${ime(k.ime)}) from ${tabela}), 0) + 1, false);`,
      );
    }
    sql.push(`alter table ${tabela} enable trigger user;`);
  }
  sql.push("commit;");
  return `${sql.join("\n")}\n`;
}

function upit(ref, sql) {
  const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
  const folder = mkdtempSync(path.join(os.tmpdir(), "smajic-kopija-"));
  try {
    const datoteka = path.join(folder, "upit.sql");
    writeFileSync(datoteka, sql);
    const izlaz = execFileSync(
      process.execPath,
      [cli, "db", "query", `--remote=${ref}`, "--read-only", "--output-format", "json", "-f", datoteka],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] },
    );
    const odgovor = JSON.parse(izlaz.slice(izlaz.indexOf("{")));
    if (!Array.isArray(odgovor.rows)) throw new Error(`Supabase CLI: ${JSON.stringify(odgovor.error ?? odgovor).slice(0, 300)}`);
    return odgovor.rows;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function izvoz(ref) {
  if (!/^[a-z]{20}$/.test(ref)) throw new Error("Upišite project ref, 20 malih slova.");
  const sema = upit(ref, UPIT_SEME);
  const [{ podaci }] = upit(ref, upitPodataka(sema));
  const migracije = upit(ref, "select version from supabase_migrations.schema_migrations order by version").map((m) => m.version);
  return { napravljeno: new Date().toISOString(), projekt: ref, migracije, sema, podaci };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [radnja, a, b] = process.argv.slice(2);
  if (radnja === "izvoz" && a && b) {
    const kopija = izvoz(a);
    writeFileSync(b, JSON.stringify(kopija));
    const redova = Object.values(kopija.podaci).reduce((n, r) => n + r.length, 0);
    console.log(`Kopija: ${kopija.sema.length} tabela, ${redova} redova, ${kopija.migracije.length} migracija -> ${b}`);
  } else if (radnja === "povrat" && a && b) {
    writeFileSync(b, sqlPovrata(JSON.parse(readFileSync(a, "utf8"))));
    console.log(`Skripta za povrat -> ${b}. Pokrenite je samo na bazi s istim migracijama.`);
  } else {
    console.log("Upotreba:\n  node scripts/kopija.mjs izvoz <project-ref> <kopija.json>\n  node scripts/kopija.mjs povrat <kopija.json> <povrat.sql>");
    process.exitCode = 1;
  }
}
