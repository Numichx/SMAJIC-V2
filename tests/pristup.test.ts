import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { demoBaza } from "@/lib/demo/store";
import { pripremiOkruzenje } from "./pomocnici";

// The access review, as a test: any later migration that opens a door fails here, with no list to keep up to date.
const ULOGE = ["anon", "authenticated", "service_role"];

beforeAll(async () => {
  pripremiOkruzenje();
  await demoBaza();
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const upit = async <T>(sql: string, parametri: unknown[] = []) => (await (await demoBaza()).query<T>(sql, parametri)).rows;

describe("access review of the public schema", () => {
  it("has found the tables and functions it reviews", async () => {
    const [{ tabele, funkcije }] = await upit<{ tabele: number; funkcije: number }>(`
      select
        (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p')) as tabele,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as funkcije
    `);
    expect(tabele).toBeGreaterThanOrEqual(24);
    expect(funkcije).toBeGreaterThan(50);
  });

  it("has row-level security on every table", async () => {
    const rows = await upit<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    `);
    expect(rows).toEqual([]);
  });

  it("has no policy on any table", async () => {
    expect(await upit("select schemaname, tablename, policyname from pg_policies where schemaname = 'public'")).toEqual([]);
  });

  it.each(ULOGE)("gives %s no rights on any table, view or column", async (uloga) => {
    const rows = await upit<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
         and (
           has_table_privilege($1, c.oid, 'select, insert, update, delete, truncate, references, trigger')
           or has_any_column_privilege($1, c.oid, 'select, insert, update, references')
         )`,
      [uloga],
    );
    expect(rows).toEqual([]);
  });

  it.each(["anon", "authenticated"])("lets %s execute no function", async (uloga) => {
    const rows = await upit<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege($1, p.oid, 'execute')`,
      [uloga],
    );
    expect(rows).toEqual([]);
  });
});
