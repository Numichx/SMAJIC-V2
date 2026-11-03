import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Runs the real migrations on Postgres (PGlite), so no Docker is needed. Not a full Supabase.
const MIGRACIJE = path.resolve("supabase/migrations");
const OTVORENE = [
  "aktiviraj_pin",
  "dan_pregled",
  "dnevnik_pregled",
  "dopuni_sank",
  "dugovi_gostiju",
  "dugovi_pecenjari",
  "izmijeni_artikal_zalihe",
  "izvjestaj_perioda",
  "anonimiziraj_licne_podatke",
  "meni",
  "meni_pregled",
  "naplati_dug",
  "naplati_racun",
  "nova_rezervacija",
  "obavijesti_konobara",
  "obradi_zahtjev_mesnici",
  "odobri_popust",
  "otvori_popis_pecenjare",
  "otvori_smjenu",
  "pecenjara_pregled",
  "popisi_zalihu",
  "posalji_narudzbu",
  "posalji_zahtjev_mesnici",
  "postavi_aktivnost_zaposlenika",
  "postavi_pin_kodom",
  "premjesti_sto",
  "prijava_pinom",
  "prijedlog_nabavke",
  "prodaj_zalihu",
  "prometi_zalihe",
  "promijeni_status_narudzbe",
  "promijeni_status_rezervacije",
  "racun_za_stampu",
  "racun_za_sto",
  "recepti_pregled",
  "red_stanice",
  "rezervacije_za_dan",
  "sacuvaj_recept",
  "sacuvaj_proizvod",
  "sacuvaj_zaposlenika",
  "sank_artikli",
  "sesija_vazeca",
  "smjene_pregled",
  "statistika_konobara",
  "stolovi_pregled",
  "storniraj_stavku",
  "uplati_pecenjari",
  "zahtjevi_mesnici_pregled",
  "zaliha_pregled",
  "zaposlenici_pregled",
  "z_izvjestaj",
  "zaposlenici_za_prijavu",
  "zatvori_dan",
  "zatvori_popis_pecenjare",
  "zatvori_smjenu",
].sort();

type Prijava = {
  status: string;
  retry_after: number;
  id: string | null;
  ime: string | null;
  uloga: string | null;
  sesija_verzija: number | null;
};

let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec("create role anon; create role authenticated; create role service_role;");
  for (const datoteka of readdirSync(MIGRACIJE).sort()) {
    await db.exec(readFileSync(path.join(MIGRACIJE, datoteka), "utf8"));
  }
}, 60_000);

afterAll(() => db.close());

beforeEach(async () => {
  await db.exec(`
    reset role;
    update public.zaposlenici set pin_hash = null, aktivacija_hash = null, aktivacija_do = null, aktivan = true, sesija_verzija = 1;
    delete from public.pin_pokusaji;
    delete from public.dnevnik_radnji;
  `);
});

async function jedan<T>(sql: string, parametri: unknown[] = []) {
  return (await db.query<T>(sql, parametri)).rows[0];
}

function prijava(uloge: string[], zaposlenik: string | null, pin: string, uredjaj = "u1", ip = "i1") {
  return jedan<Prijava>(
    "select * from public.prijava_pinom($1::text::public.uloga[], $2::text::uuid, $3, $4, $5)",
    [`{${uloge.join(",")}}`, zaposlenik, pin, uredjaj, ip],
  );
}

function postaviPin(kod: string, pin: string, uredjaj = "u1", ip = "i1") {
  return jedan<{ status: string; retry_after: number }>(
    "select * from public.postavi_pin_kodom($1, $2, $3, $4)",
    [kod, pin, uredjaj, ip],
  );
}

async function prviKod() {
  return (await jedan<{ kod: string }>("select public.aktiviraj_prvu_seficu() as kod")).kod;
}

async function idPoImenu(ime: string) {
  return (await jedan<{ id: string }>("select id from public.zaposlenici where ime = $1", [ime])).id;
}

async function aktiviraj(zaposlenik: string, sefica: string) {
  return (
    await jedan<{ kod: string }>("select public.aktiviraj_pin($1::text::uuid, $2::text::uuid) as kod", [zaposlenik, sefica])
  ).kod;
}

async function kaoUloga<T>(uloga: string, radnja: () => Promise<T>) {
  await db.exec(`set role ${uloga}`);
  try {
    return await radnja();
  } finally {
    await db.exec("reset role");
  }
}

describe("database access rules", () => {
  it("has RLS on every table, with no policies", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);
    expect(rows.map((r) => r.relname).sort()).toEqual([
      "dnevni_zakljucci",
      "dnevnik_radnji",
      "dopune_sanka",
      "kategorije",
      "naplate",
      "naplate_dugova",
      "narudzbe",
      "pin_pokusaji",
      "popisi_pecenjare",
      "popisi_sanka",
      "proizvodi",
      "prometi_zaliha",
      "racun_stolovi",
      "racuni",
      "recepti",
      "rezervacije",
      "smjene",
      "statusi_narudzbe",
      "stavke_narudzbe",
      "stolovi",
      "uplate_pecenjari",
      "zahtjevi_mesnici",
      "zaliha_artikli",
      "zaposlenici",
    ]);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);

    const politike = await jedan<{ broj: number }>("select count(*)::int as broj from pg_policies where schemaname = 'public'");
    expect(politike.broj).toBe(0);
  });

  it.each(["anon", "authenticated", "service_role"])("gives %s no direct table rights", async (uloga) => {
    const { rows } = await db.query(
      `select c.relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and has_table_privilege($1, c.oid, 'select, insert, update, delete, truncate, references, trigger')`,
      [uloga],
    );
    expect(rows).toEqual([]);
  });

  it("lets anon and authenticated execute no function, and service_role only the listed ones", async () => {
    const { rows } = await db.query<{ proname: string; anon: boolean; authenticated: boolean; servis: boolean }>(`
      select p.proname,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
        has_function_privilege('service_role', p.oid, 'execute') as servis
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    `);
    expect(rows.length).toBeGreaterThan(OTVORENE.length);
    expect(rows.filter((r) => r.anon || r.authenticated).map((r) => r.proname)).toEqual([]);
    expect(rows.filter((r) => r.servis).map((r) => r.proname).sort()).toEqual(OTVORENE);
  });

  it("pins search_path on every function", async () => {
    const { rows } = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and not coalesce(p.proconfig::text like '%search_path=%', false)
    `);
    expect(rows).toEqual([]);
  });

  it("really blocks anon, and service_role can only go through functions", async () => {
    await expect(kaoUloga("anon", () => db.query("select * from public.zaposlenici"))).rejects.toThrow(/permission denied/);
    await expect(
      kaoUloga("anon", () => db.query("select * from public.prijava_pinom('{sefica}', null, '4827', 'u', 'i')")),
    ).rejects.toThrow(/permission denied/);
    await expect(kaoUloga("service_role", () => db.query("select * from public.zaposlenici"))).rejects.toThrow(/permission denied/);
    await expect(kaoUloga("service_role", () => db.query("select public.aktiviraj_prvu_seficu()"))).rejects.toThrow(/permission denied/);

    const rezultat = await kaoUloga("service_role", () => prijava(["sefica"], null, "4827"));
    expect(rezultat.status).toBe("pogresan");
  });
});

describe("PIN rules", () => {
  const slab = async (pin: string | null) =>
    (await jedan<{ slab: boolean }>("select public.pin_je_slab($1) as slab", [pin])).slab;

  it.each(["1111", "0000", "99999999", "1234", "12345678", "7890", "4321", "87654321", "2580", "0852", "1987", "2026"])(
    "rejects weak PIN %s",
    async (pin) => expect(await slab(pin)).toBe(true),
  );

  it.each(["123", "123456789", "abcd", "12a4", "", " 4827"])("rejects badly formed PIN %j", async (pin) =>
    expect(await slab(pin)).toBe(true),
  );

  it("rejects a missing PIN", async () => expect(await slab(null)).toBe(true));

  it.each(["4827", "5930", "1357", "2100", "1899", "19871"])("accepts PIN %s", async (pin) =>
    expect(await slab(pin)).toBe(false),
  );

  it.each([
    ["uredjaj:test", 5, 300],
    ["ip:test", 20, 900],
    ["globalno", 100, 900],
  ])("locks %s after %i wrong PINs for %i seconds", async (kljuc, pokusaja, zakljucajS) => {
    const preostalo = async () =>
      (await jedan<{ s: number }>("select public.pin_preostalo(array[$1::text]) as s", [kljuc])).s;

    for (let i = 1; i < pokusaja; i++) {
      await db.query("select public.pin_zabiljezi_gresku(array[$1::text])", [kljuc]);
    }
    expect(await preostalo()).toBe(0);

    await db.query("select public.pin_zabiljezi_gresku(array[$1::text])", [kljuc]);
    const sekundi = await preostalo();
    expect(sekundi).toBeGreaterThan(zakljucajS - 10);
    expect(sekundi).toBeLessThanOrEqual(zakljucajS);
  });

  it("seeds the staff with no PINs", async () => {
    const { rows } = await db.query<{ uloga: string; n: number; bez_pina: number }>(
      "select uloga, count(*)::int as n, count(*) filter (where pin_hash is null)::int as bez_pina from public.zaposlenici group by uloga order by uloga",
    );
    expect(rows).toEqual([
      { uloga: "konobar", n: 3, bez_pina: 3 },
      { uloga: "kuhinja", n: 3, bez_pina: 3 },
      { uloga: "pecenjara", n: 3, bez_pina: 3 },
      { uloga: "mesnica", n: 1, bez_pina: 1 },
      { uloga: "sefica", n: 1, bez_pina: 1 },
    ]);
  });
});

describe("PIN functions", () => {
  it("stores bcrypt hashes at cost 10, and never the PIN", async () => {
    await postaviPin(await prviKod(), "4827");
    const { pin_hash } = await jedan<{ pin_hash: string }>(
      "select pin_hash from public.zaposlenici where uloga = 'sefica'",
    );
    expect(pin_hash).toMatch(/^\$2a\$10\$/);
    expect(pin_hash).not.toContain("4827");
  });

  it("allows the first manager activation only once", async () => {
    await postaviPin(await prviKod(), "4827");
    await expect(prviKod()).rejects.toMatchObject({ code: "P0001", message: "Šefica već ima PIN." });
  });

  it("rejects an expired activation code", async () => {
    const kod = await prviKod();
    await db.exec("update public.zaposlenici set aktivacija_do = now() - interval '1 second' where uloga = 'sefica'");
    expect((await postaviPin(kod, "4827")).status).toBe("pogresan");
  });

  it("lets only an active manager create a code", async () => {
    await postaviPin(await prviKod(), "4827");
    const sefica = await idPoImenu("Nedžija Smajić");
    const konobar = await idPoImenu("Emsud Peco");

    await expect(aktiviraj(konobar, konobar)).rejects.toMatchObject({ code: "P0001" });
    expect(await aktiviraj(konobar, sefica)).toMatch(/^[0-9]{6}$/);

    await db.query("update public.zaposlenici set aktivan = false where id = $1::text::uuid", [sefica]);
    await expect(aktiviraj(konobar, sefica)).rejects.toMatchObject({ code: "P0001" });
    await expect(db.query("select * from public.zaposlenici_pregled($1::text::uuid)", [sefica])).rejects.toMatchObject({
      code: "P0001",
    });
  });

  it("logs in by name plus PIN and by PIN alone, and only within the allowed roles", async () => {
    await postaviPin(await prviKod(), "4827");
    const sefica = await idPoImenu("Nedžija Smajić");
    const konobar = await idPoImenu("Emsud Peco");
    await postaviPin(await aktiviraj(konobar, sefica), "5930");

    expect((await prijava(["konobar"], konobar, "5930")).ime).toBe("Emsud Peco");
    expect((await prijava(["konobar"], null, "5930")).ime).toBe("Emsud Peco");
    expect((await prijava(["konobar", "sefica"], konobar, "5930")).uloga).toBe("konobar");
    expect((await prijava(["kuhinja"], null, "5930")).status).toBe("pogresan");
    expect((await prijava(["konobar"], sefica, "5930")).status).toBe("pogresan");
    expect((await prijava(["konobar"], konobar, "4827")).status).toBe("pogresan");
  });

  it("allows a shared PIN across roles", async () => {
    await postaviPin(await prviKod(), "4827");
    const sefica = await idPoImenu("Nedžija Smajić");
    const konobar = await idPoImenu("Emsud Peco");
    expect((await postaviPin(await aktiviraj(konobar, sefica), "4827")).status).toBe("ok");
  });

  it("gives one guess per code at a colleague's PIN: it uses up the code, counts and logs", async () => {
    await postaviPin(await prviKod(), "4827");
    const sefica = await idPoImenu("Nedžija Smajić");
    const prvi = await idPoImenu("Emsud Peco");
    const drugi = await idPoImenu("Gasal Mirza");
    await postaviPin(await aktiviraj(prvi, sefica), "5930");

    const kod = await aktiviraj(drugi, sefica);
    expect((await postaviPin(kod, "5930")).status).toBe("zauzet");

    const { pogresni } = await jedan<{ pogresni: number }>("select pogresni from public.pin_pokusaji where kljuc = 'uredjaj:u1'");
    expect(pogresni).toBe(1);
    const zapis = await jedan<{ n: number }>("select count(*)::int as n from public.dnevnik_radnji where radnja = 'pin_zauzet'");
    expect(zapis.n).toBe(1);

    expect((await postaviPin(kod, "6142")).status).toBe("pogresan");
    const drugiZapis = await jedan<{ pin_hash: string | null }>("select pin_hash from public.zaposlenici where ime = 'Gasal Mirza'");
    expect(drugiZapis.pin_hash).toBeNull();
  });

  it("checks a session by person and version, and bumps the version on a new code or PIN", async () => {
    await postaviPin(await prviKod(), "4827");
    const sefica = await idPoImenu("Nedžija Smajić");
    const konobar = await idPoImenu("Emsud Peco");
    const vazeca = async (id: string, verzija: number) =>
      (await jedan<{ v: boolean }>("select public.sesija_vazeca($1::text::uuid, $2) as v", [id, verzija])).v;

    const kod = await aktiviraj(konobar, sefica);
    expect(await vazeca(konobar, 2)).toBe(true);
    expect(await vazeca(konobar, 1)).toBe(false);

    await postaviPin(kod, "5930");
    expect(await vazeca(konobar, 2)).toBe(false);
    expect(await vazeca(konobar, 3)).toBe(true);
    expect((await prijava(["konobar"], konobar, "5930")).sesija_verzija).toBe(3);

    await db.query("update public.zaposlenici set aktivan = false where id = $1::text::uuid", [konobar]);
    expect(await vazeca(konobar, 3)).toBe(false);
    expect(await vazeca("00000000-0000-4000-8000-000000000000", 1)).toBe(false);

    const prije = (await jedan<{ v: number }>("select sesija_verzija as v from public.zaposlenici where id = $1::text::uuid", [sefica])).v;
    await aktiviraj(sefica, sefica);
    expect(await vazeca(sefica, prije)).toBe(true);
  });

  it("rejects a deactivated employee", async () => {
    await postaviPin(await prviKod(), "4827");
    await db.exec("update public.zaposlenici set aktivan = false where uloga = 'sefica'");
    expect((await prijava(["sefica"], null, "4827")).status).toBe("pogresan");

    const sefica = await idPoImenu("Nedžija Smajić");
    const aktivan = await jedan<{ a: boolean }>("select public.zaposlenik_aktivan($1::text::uuid) as a", [sefica]);
    expect(aktivan.a).toBe(false);
  });

  it("treats an unknown employee as inactive", async () => {
    const r = await jedan<{ a: boolean }>("select public.zaposlenik_aktivan('00000000-0000-4000-8000-000000000000') as a");
    expect(r.a).toBe(false);
  });

  it("counts a badly formed PIN as a wrong attempt", async () => {
    expect((await prijava(["sefica"], null, "' or 1=1 --")).status).toBe("pogresan");
    const { pogresni } = await jedan<{ pogresni: number }>(
      "select pogresni from public.pin_pokusaji where kljuc = 'uredjaj:u1'",
    );
    expect(pogresni).toBe(1);
  });

  it("clears only the device counter on success", async () => {
    await postaviPin(await prviKod(), "4827");
    await prijava(["sefica"], null, "9999");
    await prijava(["sefica"], null, "4827");

    const { rows } = await db.query<{ kljuc: string }>("select kljuc from public.pin_pokusaji order by kljuc");
    expect(rows.map((r) => r.kljuc)).toEqual(["globalno", "ip:i1"]);
  });

  it("stops a colleague guessing at the manager's PIN between their own logins", async () => {
    await postaviPin(await prviKod(), "4827");
    const sefica = await idPoImenu("Nedžija Smajić");
    const konobar = await idPoImenu("Emsud Peco");
    await postaviPin(await aktiviraj(konobar, sefica), "5930");

    // 4 wrong guesses keep the device under its limit, and a real login clears it. The IP count must keep rising.
    for (let krug = 0; krug < 4; krug++) {
      for (let i = 0; i < 4; i++) expect((await prijava(["sefica"], null, "9999")).status).toBe("pogresan");
      expect((await prijava(["konobar"], konobar, "5930")).status).toBe("ok");
    }
    for (let i = 0; i < 3; i++) expect((await prijava(["sefica"], null, "9999")).status).toBe("pogresan");
    expect((await prijava(["sefica"], null, "9999")).status).toBe("zakljucano");
    expect((await prijava(["sefica"], null, "4827")).status).toBe("zakljucano");
  }, 30_000);

  it("starts a new count once the window has passed", async () => {
    for (let i = 0; i < 4; i++) await prijava(["sefica"], null, "9999");
    await db.exec("update public.pin_pokusaji set prozor_od = now() - interval '16 minutes'");
    expect((await prijava(["sefica"], null, "9999")).status).toBe("pogresan");
  });

  it("logs sensitive actions without PINs or real values", async () => {
    await postaviPin(await prviKod(), "4827");
    await prijava(["sefica"], null, "4827");
    for (let i = 0; i < 5; i++) await prijava(["sefica"], null, "9999", "u2", "i2");

    const { rows } = await db.query<{ radnja: string; detalji: unknown }>(
      "select radnja, detalji from public.dnevnik_radnji order by id",
    );
    expect(rows.map((r) => r.radnja)).toEqual([
      "aktivacija_prve_sefice",
      "pin_postavljen",
      "prijava",
      "pin_zakljucano",
    ]);
    expect(rows.at(-1)!.detalji).toEqual({ vrsta: "uredjaj" });
    expect(JSON.stringify(rows)).not.toMatch(/4827|9999|i2|u2/);
  });

  it("returns no hashes from the staff overview", async () => {
    await postaviPin(await prviKod(), "4827");
    const sefica = await idPoImenu("Nedžija Smajić");
    const { rows, fields } = await db.query<{ ime: string; ima_pin: boolean }>(
      "select * from public.zaposlenici_pregled($1::text::uuid)",
      [sefica],
    );
    expect(fields.map((f) => f.name)).toEqual(["id", "ime", "uloga", "aktivan", "ima_pin", "ceka_aktivaciju"]);
    expect(rows.find((r) => r.ime === "Nedžija Smajić")!.ima_pin).toBe(true);
  });
});
