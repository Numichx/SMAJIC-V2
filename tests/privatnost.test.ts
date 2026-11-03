import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as dugoviGet } from "@/app/api/administracija/dugovi/route";
import { POST } from "@/app/api/administracija/privatnost/route";
import { POST as danPost } from "@/app/api/smjene/zatvori-dan/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { naplataU } from "./pomocnici-faza5";
import { ocisti, osoblje, pripremiOkruzenje, zahtjev, type Osoba } from "./pomocnici";

type Rezultat = { dugovi: number; rezervacije: number; daniDugovi: number; daniRezervacije: number };

const ANONIMNO = "Anonimizirano";

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

const url = "/api/administracija/privatnost";

async function pokreni(tijelo: Record<string, unknown> = {}) {
  const odgovor = await POST(zahtjev(url, { tijelo, kolacici: [ljudi.sefica.kolacic] }));
  expect(odgovor.status).toBe(200);
  return ((await odgovor.json()) as { rezultat: Rezultat }).rezultat;
}

async function sql<T>(upit: string, parametri: unknown[] = []) {
  return (await (await demoBaza()).query<T>(upit, parametri)).rows;
}

const prijeDana = async (dani: number) =>
  (await sql<{ t: string }>("select to_json(now() - make_interval(days => $1::int))#>>'{}' as t", [dani]))[0].t;

// A debt taken 1500 days ago, collected "dani" days ago. null leaves it open.
async function dug(ime: string, dani: number | null) {
  const racun = await naplataU(ljudi.konobar.id, await prijeDana(1500), { ukupno: 25, nacin: "dug", duznik: ime });
  if (dani !== null) {
    await sql("update public.racuni set status = 'placen' where id = $1", [racun]);
    await sql(
      "insert into public.naplate_dugova (racun_id, request_id, nacin, iznos, zaposlenik_id, vrijeme) values ($1, $2, 'gotovina', 25, $3, $4::text::timestamptz)",
      [racun, randomUUID(), ljudi.sefica.id, await prijeDana(dani)],
    );
  }
  return racun;
}

async function rezervacija(ime: string, telefon: string | null, dani: number, status = "realizovana") {
  const { id } = (
    await sql<{ id: string }>(
      `insert into public.rezervacije (request_id, ime, broj_gostiju, vrijeme, telefon, napomena, status, kreirao_id, sto_id)
       values ($1, $2, 4, now() - make_interval(days => $3::int), $4, 'Rođendan', $5, $6, 3) returning id`,
      [randomUUID(), ime, dani, telefon, status, ljudi.konobar.id],
    )
  )[0];
  return id;
}

const imeDuga = async (racun: string) =>
  (await sql<{ gost_duznik: string }>("select gost_duznik from public.naplate where racun_id = $1", [racun]))[0].gost_duznik;
const red = async (id: string) =>
  (await sql<{ ime: string; telefon: string | null }>("select ime, telefon from public.rezervacije where id = $1", [id]))[0];

describe("access and shape", () => {
  it("needs a session", async () => {
    expect((await POST(zahtjev(url, { tijelo: {} }))).status).toBe(401);
  });

  it.each(["konobar", "kuhinja", "pecenjara", "mesnica"] as const)("refuses %s, in the route and in SQL", async (uloga) => {
    expect((await POST(zahtjev(url, { tijelo: {}, kolacici: [ljudi[uloga].kolacic] }))).status).toBe(403);
    await expect(
      demoRpc("anonimiziraj_licne_podatke", { p_sefica: ljudi[uloga].id, p_dani_dugovi: null, p_dani_rezervacije: null }),
    ).rejects.toThrow("Nemate pravo na ovu radnju.");
  });

  it.each([
    ["an unknown field", { dani: 30 }],
    ["text", { daniDugovi: "400" }],
    ["a fraction", { daniDugovi: 400.5 }],
    ["a negative", { daniRezervacije: -1 }],
    ["a non-object", []],
  ])("rejects %s", async (_, tijelo) => {
    expect((await POST(zahtjev(url, { tijelo, kolacici: [ljudi.sefica.kolacic] }))).status).toBe(400);
  });

  it.each([
    [{ daniDugovi: 29 }],
    [{ daniDugovi: 3651 }],
    [{ daniRezervacije: 0 }],
    [{ daniRezervacije: 3651 }],
  ])("refuses the period %j, and changes nothing", async (tijelo) => {
    const racun = await dug("Mujo Mujić", 1000);
    const odgovor = await POST(zahtjev(url, { tijelo, kolacici: [ljudi.sefica.kolacic] }));
    expect(odgovor.status).toBe(422);
    expect(((await odgovor.json()) as { greska: string }).greska).toBe("Rok mora biti od 30 do 3.650 dana.");
    expect(await imeDuga(racun)).toBe("Mujo Mujić");
  });
});

describe("guest debts", () => {
  it("anonymises a debt collected over a year ago, keeps a newer one, and leaves an open one however old", async () => {
    const stari = await dug("Mujo Mujić", 366);
    const taman = await dug("Haso Hasić", 364);
    const otvoren = await dug("Fata Fatić", null);

    expect(await pokreni()).toEqual({ dugovi: 1, rezervacije: 0, daniDugovi: 365, daniRezervacije: 90 });
    expect(await imeDuga(stari)).toBe(ANONIMNO);
    expect(await imeDuga(taman)).toBe("Haso Hasić");
    expect(await imeDuga(otvoren)).toBe("Fata Fatić");
  });

  it("keeps an open debt's name for the manager's list", async () => {
    await dug("Fata Fatić", null);
    await pokreni({ daniDugovi: 30 });
    const odgovor = await dugoviGet(zahtjev("/api/administracija/dugovi", { kolacici: [ljudi.sefica.kolacic] }));
    expect(((await odgovor.json()) as { dugovi: { gostDuznik: string }[] }).dugovi[0].gostDuznik).toBe("Fata Fatić");
  });

  it("takes the period from the call", async () => {
    const racun = await dug("Mujo Mujić", 40);
    expect(await pokreni({ daniDugovi: 41 })).toMatchObject({ dugovi: 0, daniDugovi: 41 });
    expect(await pokreni({ daniDugovi: 39 })).toMatchObject({ dugovi: 1, daniDugovi: 39 });
    expect(await imeDuga(racun)).toBe(ANONIMNO);
  });

  it("leaves a payment's money and the debt's collection exactly as they were", async () => {
    await dug("Mujo Mujić", 1000);
    await naplataU(ljudi.konobar.id, await prijeDana(1000), { ukupno: 10, bruto: 12, nacin: "gotovina", gotovina: 20, kusur: 9 });
    const stanje = () =>
      sql(`select (to_jsonb(n) - 'gost_duznik') as n, to_jsonb(u) as u, to_jsonb(r) as r
           from public.naplate n join public.racuni r on r.id = n.racun_id left join public.naplate_dugova u on u.racun_id = n.racun_id
           order by n.racun_id`);
    const prije = await stanje();
    expect((await pokreni()).dugovi).toBe(1);
    expect(await stanje()).toEqual(prije);
    expect(prije).toHaveLength(2);
  });

  it("keeps every report and closed day the same", async () => {
    const datum = (await sql<{ d: string }>("select (public.danas_u_sarajevu() - 1000)::text as d"))[0].d;
    const racun = await dug("Mujo Mujić", 1000);
    await sql("update public.naplate set vrijeme = public.pocetak_dana($1::text::date) + interval '12 hours' where racun_id = $2", [datum, racun]);
    const odgovor = await danPost(zahtjev("/api/smjene/zatvori-dan", { tijelo: { datum }, kolacici: [ljudi.sefica.kolacic] }));
    expect(odgovor.status).toBe(200);

    const pre = await sql("select * from public.dnevni_zakljucci");
    const izvjestaj = () => sql<{ v: unknown }>("select public.izvjestaj_raspona($1::text::date, $1::text::date) as v", [datum]);
    const uzivo = await izvjestaj();
    await pokreni();
    expect(await izvjestaj()).toEqual(uzivo);
    expect(await sql("select * from public.dnevni_zakljucci")).toEqual(pre);
  });
});

describe("reservations", () => {
  it("anonymises the name and phone of one older than 90 days, by its own time", async () => {
    const stara = await rezervacija("Mujo Mujić", "061123456", 91);
    const nova = await rezervacija("Haso Hasić", "062123456", 89);
    const buduca = await rezervacija("Fata Fatić", "063123456", -30, "aktivna");

    expect((await pokreni()).rezervacije).toBe(1);
    expect(await red(stara)).toEqual({ ime: ANONIMNO, telefon: null });
    expect(await red(nova)).toEqual({ ime: "Haso Hasić", telefon: "062123456" });
    expect(await red(buduca)).toEqual({ ime: "Fata Fatić", telefon: "063123456" });
  });

  it("looks at when the table was booked for, not when it was entered", async () => {
    const buduca = await rezervacija("Fata Fatić", "063123456", -30, "aktivna");
    await sql("update public.rezervacije set kreirano = now() - interval '5 years' where id = $1", [buduca]);
    await pokreni();
    expect((await red(buduca)).ime).toBe("Fata Fatić");
  });

  it("covers every status, and a reservation with no phone", async () => {
    const a = await rezervacija("Mujo Mujić", null, 200, "otkazana");
    const b = await rezervacija("Haso Hasić", "061", 200, "aktivna");
    expect((await pokreni()).rezervacije).toBe(2);
    expect(await red(a)).toEqual({ ime: ANONIMNO, telefon: null });
    expect(await red(b)).toEqual({ ime: ANONIMNO, telefon: null });
  });

  it("clears a phone left on a name already anonymised", async () => {
    const a = await rezervacija(ANONIMNO, "061", 200);
    expect((await pokreni()).rezervacije).toBe(1);
    expect(await red(a)).toEqual({ ime: ANONIMNO, telefon: null });
  });

  it("leaves the rest of the row alone", async () => {
    const a = await rezervacija("Mujo Mujić", "061", 200);
    const stanje = async () => (await sql<Record<string, unknown>>("select broj_gostiju, vrijeme, sto_id, status, kreirao_id from public.rezervacije where id = $1", [a]))[0];
    const prije = await stanje();
    await pokreni();
    expect(await stanje()).toEqual(prije);
  });

  it("takes the period from the call", async () => {
    const a = await rezervacija("Mujo Mujić", "061", 40);
    expect((await pokreni({ daniRezervacije: 41 })).rezervacije).toBe(0);
    expect((await pokreni({ daniRezervacije: 39 })).rezervacije).toBe(1);
    expect((await red(a)).ime).toBe(ANONIMNO);
  });
});

describe("every run", () => {
  it("does nothing more the second time", async () => {
    await dug("Mujo Mujić", 1000);
    await rezervacija("Haso Hasić", "061", 1000);
    expect(await pokreni()).toMatchObject({ dugovi: 1, rezervacije: 1 });
    expect(await pokreni()).toMatchObject({ dugovi: 0, rezervacije: 0 });
  });

  it("logs only counts and periods", async () => {
    await dug("Mujo Mujić", 1000);
    await rezervacija("Haso Hasić", "061999", 1000);
    await pokreni();
    const zapisi = await sql<{ radnja: string; zaposlenik_id: string; detalji: unknown }>("select radnja, zaposlenik_id, detalji from public.dnevnik_radnji");
    expect(zapisi).toEqual([
      {
        radnja: "licni_podaci_anonimizirani",
        zaposlenik_id: ljudi.sefica.id,
        detalji: { dugovi: 1, rezervacije: 1, daniDugovi: 365, daniRezervacije: 90 },
      },
    ]);
  });

  it("leaves no trace of the names or phone in any table", async () => {
    await dug("Mujo Mujić", 1000);
    await rezervacija("Haso Hasić", "061999888", 1000);
    await pokreni();
    const { rows: tabele } = await (await demoBaza()).query<{ relname: string }>(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'",
    );
    expect(tabele.length).toBeGreaterThan(20);
    for (const { relname } of tabele) {
      const { rows } = await (await demoBaza()).query<{ n: number }>(
        `select count(*)::int as n from public.${relname} t where t::text ~ 'Mujo Mujić|Haso Hasić|061999888'`,
      );
      expect(rows[0].n, relname).toBe(0);
    }
  });
});
