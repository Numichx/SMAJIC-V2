import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as dnevnikGet } from "@/app/api/administracija/dnevnik/route";
import { GET as dugoviGet, POST as dugoviPost } from "@/app/api/administracija/dugovi/route";
import { POST as pinPost } from "@/app/api/administracija/pin/route";
import { GET as osobljeGet, PATCH as osobljePatch, POST as osobljePost } from "@/app/api/administracija/zaposlenici/route";
import { GET as stoloviGet } from "@/app/api/stolovi/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza } from "@/lib/demo/store";
import { brojRadnji, jelo, naplataU, naruci, plati, pomjeri, racunStola } from "./pomocnici-faza5";
import { ocisti, osoblje, postaviPin, pripremiOkruzenje, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type Dug = { racunId: string; broj: number; gostDuznik: string; iznos: number; vrijeme: string; stolovi: number[]; konobar: string };
type Zaposlenik = { id: string; ime: string; uloga: string; aktivan: boolean; ima_pin: boolean; ceka_aktivaciju: boolean };

const DUZNIK = "Gost Testni";

let ljudi: Record<Uloga, Osoba>;
let id: Record<string, string>;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
  id = await proizvodi();
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => ocisti());

const k = (uloga: Uloga) => [ljudi[uloga].kolacic];

async function json<T>(odgovor: Response, status = 200) {
  const tijelo = (await odgovor.json()) as T & { greska?: string };
  expect(odgovor.status, tijelo.greska).toBe(status);
  return tijelo;
}

async function greska(odgovor: Response, status = 422) {
  return (await json<{ greska: string }>(odgovor, status)).greska;
}

describe("staff admin", () => {
  const dodaj = (tijelo: Record<string, unknown>) => osobljePost(zahtjev("/api/administracija/zaposlenici", { tijelo, kolacici: k("sefica") }));
  const izmijeni = (tijelo: Record<string, unknown>) => osobljePatch(zahtjev("/api/administracija/zaposlenici", { tijelo, kolacici: k("sefica") }));

  const NOVI = "Probni Radnik";

  async function novi(uloga = "konobar") {
    return (await json<{ zaposlenik: Zaposlenik }>(await dodaj({ ime: NOVI, uloga }))).zaposlenik;
  }

  async function red(osoba: string) {
    const { rows } = await (await demoBaza()).query<{ ime: string; uloga: string; aktivan: boolean; sesija_verzija: number; pin_hash: string | null; aktivacija_hash: string | null; aktivacija_do: string | null }>(
      "select ime, uloga, aktivan, sesija_verzija, pin_hash, aktivacija_hash, aktivacija_do from public.zaposlenici where id = $1",
      [osoba],
    );
    return rows[0];
  }

  afterEach(async () => {
    const db = await demoBaza();
    await db.query("update public.zaposlenici set aktivan = true, ime = $1, uloga = 'konobar', pin_hash = null where id = $2", [ljudi.konobar.ime, ljudi.konobar.id]);
    await db.exec(`
      delete from public.dnevnik_radnji;
      delete from public.zaposlenici where ime like 'Probni%';
    `);
  });

  it("adds a person with no PIN, who gets a code like everyone else", async () => {
    const z = await novi("kuhinja");
    expect(z).toMatchObject({ ime: NOVI, uloga: "kuhinja", aktivan: true, ima_pin: false, ceka_aktivaciju: false });
    expect(await brojRadnji("zaposlenik_dodan")).toBe(1);

    const { zaposlenici } = await json<{ zaposlenici: Zaposlenik[] }>(await osobljeGet(zahtjev("/api/administracija/zaposlenici", { kolacici: k("sefica") })));
    expect(zaposlenici.find((x) => x.id === z.id)).toEqual(z);

    const { kod } = await json<{ kod: string }>(await pinPost(zahtjev("/api/administracija/pin", { tijelo: { zaposlenikId: z.id }, kolacici: k("sefica") })));
    expect(kod).toMatch(/^[0-9]{6}$/);
  });

  it("takes no PIN and no id from the screen when adding", async () => {
    expect((await dodaj({ ime: NOVI, uloga: "konobar", pin: "4827" })).status).toBe(400);
    expect((await dodaj({ ime: NOVI, uloga: "konobar", id: randomUUID() })).status).toBe(400);
  });

  it("trims a name, and refuses a short or taken one", async () => {
    expect((await json<{ zaposlenik: Zaposlenik }>(await dodaj({ ime: `  ${NOVI}  `, uloga: "konobar" }))).zaposlenik.ime).toBe(NOVI);
    expect(await greska(await dodaj({ ime: NOVI, uloga: "kuhinja" }))).toBe("Zaposlenik s tim imenom već postoji.");
    expect(await greska(await dodaj({ ime: "   ", uloga: "kuhinja" }))).toBe("Ime mora imati od 2 do 80 znakova.");
    expect(await greska(await dodaj({ ime: "x".repeat(81), uloga: "kuhinja" }))).toBe("Ime mora imati od 2 do 80 znakova.");
    expect((await dodaj({ ime: NOVI, uloga: "sank" })).status).toBe(400);
  });

  it("renames, ends that person's sessions, keeps their PIN, and logs old and new", async () => {
    const z = await novi();
    await postaviPin(z.id, "4827");
    const prije = await red(z.id);

    const { zaposlenik } = await json<{ zaposlenik: Zaposlenik }>(await izmijeni({ id: z.id, ime: "Probni Drugi", uloga: "konobar" }));
    expect(zaposlenik).toMatchObject({ ime: "Probni Drugi", ima_pin: true });
    expect((await red(z.id)).sesija_verzija).toBe(prije.sesija_verzija + 1);

    const { rows } = await (await demoBaza()).query<{ detalji: Record<string, unknown> }>("select detalji from public.dnevnik_radnji where radnja = 'zaposlenik_izmijenjen'");
    expect(rows[0].detalji).toMatchObject({ ime: "Probni Drugi", prethodnoIme: NOVI, uloga: "konobar", prethodnaUloga: "konobar" });
  });

  it("refuses renaming to a colleague's name, but keeping one's own is fine", async () => {
    const z = await novi();
    expect(await greska(await izmijeni({ id: z.id, ime: "Mirzeta", uloga: "konobar" }))).toBe("Zaposlenik s tim imenom već postoji.");
    expect((await izmijeni({ id: z.id, ime: NOVI, uloga: "konobar" })).status).toBe(200);
  });

  it("a new role clears the PIN and any pending code, so they choose again", async () => {
    const z = await novi();
    await postaviPin(z.id, "4827");
    await json(await pinPost(zahtjev("/api/administracija/pin", { tijelo: { zaposlenikId: z.id }, kolacici: k("sefica") })));

    const { zaposlenik } = await json<{ zaposlenik: Zaposlenik }>(await izmijeni({ id: z.id, ime: NOVI, uloga: "sefica" }));
    expect(zaposlenik).toMatchObject({ uloga: "sefica", ima_pin: false, ceka_aktivaciju: false });
    expect(await red(z.id)).toMatchObject({ pin_hash: null, aktivacija_hash: null, aktivacija_do: null });
  });

  it("the same role keeps a pending code", async () => {
    const z = await novi();
    await json(await pinPost(zahtjev("/api/administracija/pin", { tijelo: { zaposlenikId: z.id }, kolacici: k("sefica") })));
    expect((await json<{ zaposlenik: Zaposlenik }>(await izmijeni({ id: z.id, ime: "Probni Drugi", uloga: "konobar" }))).zaposlenik.ceka_aktivaciju).toBe(true);
  });

  it("the manager cannot change her own role or deactivate herself, so one always remains", async () => {
    expect(await greska(await izmijeni({ id: ljudi.sefica.id, ime: ljudi.sefica.ime, uloga: "konobar" }))).toBe("Ne možete promijeniti svoju ulogu.");
    expect(await greska(await izmijeni({ id: ljudi.sefica.id, aktivan: false }))).toBe("Ne možete deaktivirati sami sebe.");
    expect((await red(ljudi.sefica.id)).aktivan).toBe(true);
  });

  it("she can rename herself and keep her session", async () => {
    const prije = await red(ljudi.sefica.id);
    const novoIme = "Probni Sefica";
    try {
      expect((await izmijeni({ id: ljudi.sefica.id, ime: novoIme, uloga: "sefica" })).status).toBe(200);
      expect((await red(ljudi.sefica.id)).sesija_verzija).toBe(prije.sesija_verzija);
    } finally {
      await (await demoBaza()).query("update public.zaposlenici set ime = $1 where id = $2", [ljudi.sefica.ime, ljudi.sefica.id]);
    }
  });

  it("deactivating ends the session at once, even with the session check cached", async () => {
    const konobar = ljudi.konobar;
    const prije = await red(konobar.id);
    const stolovi = () => stoloviGet(zahtjev("/api/stolovi", { kolacici: [konobar.kolacic] }));
    expect((await stolovi()).status).toBe(200);

    const { zaposlenik } = await json<{ zaposlenik: Zaposlenik }>(await izmijeni({ id: konobar.id, aktivan: false }));
    expect(zaposlenik.aktivan).toBe(false);
    expect(await red(konobar.id)).toMatchObject({ aktivan: false, sesija_verzija: prije.sesija_verzija + 1 });

    // The route's 30 s cache still says yes, so the SQL's own check is what refuses this one.
    const odgovor = await stolovi();
    expect(odgovor.status).toBe(422);
    expect(((await odgovor.json()) as { greska: string }).greska).toBe("Nemate pravo na ovu radnju.");
    expect(await brojRadnji("zaposlenik_deaktiviran")).toBe(1);

    // Back at work, the old cookie stays dead and they log in again.
    await json(await izmijeni({ id: konobar.id, aktivan: true }));
    const { rows } = await (await demoBaza()).query<{ vazeca: boolean }>("select public.sesija_vazeca($1::text::uuid, $2) as vazeca", [konobar.id, prije.sesija_verzija]);
    expect(rows[0].vazeca).toBe(false);
    expect(await brojRadnji("zaposlenik_aktiviran")).toBe(1);
  });

  it("a code issued before deactivation does not survive it", async () => {
    const z = await novi();
    await json(await pinPost(zahtjev("/api/administracija/pin", { tijelo: { zaposlenikId: z.id }, kolacici: k("sefica") })));
    await json(await izmijeni({ id: z.id, aktivan: false }));
    expect(await red(z.id)).toMatchObject({ aktivacija_hash: null, aktivacija_do: null });
    await json(await izmijeni({ id: z.id, aktivan: true }));
    expect((await red(z.id)).aktivacija_hash).toBeNull();
  });

  it("keeps a reactivated person's PIN", async () => {
    const z = await novi();
    await postaviPin(z.id, "4827");
    await json(await izmijeni({ id: z.id, aktivan: false }));
    const { zaposlenik } = await json<{ zaposlenik: Zaposlenik }>(await izmijeni({ id: z.id, aktivan: true }));
    expect(zaposlenik).toMatchObject({ aktivan: true, ima_pin: true });
  });

  it("a double tap changes nothing and logs once", async () => {
    const z = await novi();
    await json(await izmijeni({ id: z.id, aktivan: false }));
    const verzija = (await red(z.id)).sesija_verzija;
    await json(await izmijeni({ id: z.id, aktivan: false }));
    expect((await red(z.id)).sesija_verzija).toBe(verzija);
    expect(await brojRadnji("zaposlenik_deaktiviran")).toBe(1);
  });

  it("refuses an unknown person", async () => {
    expect(await greska(await izmijeni({ id: randomUUID(), aktivan: false }))).toBe("Zaposlenik nije pronađen.");
    expect(await greska(await izmijeni({ id: randomUUID(), ime: NOVI, uloga: "konobar" }))).toBe("Zaposlenik nije pronađen.");
  });

  it("refuses a body that mixes the two kinds of change", async () => {
    const z = await novi();
    expect((await izmijeni({ id: z.id, ime: NOVI, uloga: "konobar", aktivan: false })).status).toBe(400);
    expect((await izmijeni({ id: z.id, sesija_verzija: 1, aktivan: false })).status).toBe(400);
  });

  it("logs no PIN or hash", async () => {
    const z = await novi();
    await postaviPin(z.id, "4827");
    await json(await izmijeni({ id: z.id, ime: "Probni Drugi", uloga: "kuhinja" }));
    await json(await izmijeni({ id: z.id, aktivan: false }));
    const { rows } = await (await demoBaza()).query("select detalji from public.dnevnik_radnji");
    const zapis = JSON.stringify(rows);
    expect(zapis).not.toContain("4827");
    expect(zapis).not.toContain("$2");
    expect(zapis).not.toMatch(/hash|pin/i);
  });
});

describe("guest debts", () => {
  const lista = async (url = "/api/administracija/dugovi") =>
    json<{ dugovi: Dug[]; imaJos: boolean; broj: number; ukupno: number }>(await dugoviGet(zahtjev(url, { kolacici: k("sefica") })));

  const naplati = (racunId: string, tijelo: Record<string, unknown> = {}) =>
    dugoviPost(zahtjev("/api/administracija/dugovi", { tijelo: { requestId: randomUUID(), racunId, nacin: "gotovina", ...tijelo }, kolacici: k("sefica") }));

  async function dug(sto = 1, proizvod = "Natur šnicla") {
    for (const n of await naruci(ljudi, [jelo(id[proizvod])], sto)) await pomjeri(ljudi, n);
    const racun = await racunStola(ljudi, sto);
    await plati(ljudi, racun, { nacin: "dug", gostDuznik: DUZNIK });
    return racun.id;
  }

  const stanje = async (racun: string) => {
    const { rows } = await (await demoBaza()).query<{ status: string; nacin: string; zatvoren: Date }>(
      "select r.status, n.nacin, r.zatvoren from public.racuni r join public.naplate n on n.racun_id = r.id where r.id = $1",
      [racun],
    );
    return rows[0];
  };

  it("lists open debts with the guest's name, for the manager", async () => {
    const racun = await dug(3);
    const { dugovi, broj, ukupno, imaJos } = await lista();
    expect(dugovi).toEqual([
      { racunId: racun, broj: expect.any(Number), gostDuznik: DUZNIK, iznos: 17, vrijeme: expect.any(String), stolovi: [3], konobar: ljudi.konobar.ime },
    ]);
    expect([broj, ukupno, imaJos]).toEqual([1, 17, false]);
  });

  it("leaves out bills that were simply paid", async () => {
    await naplataU(ljudi.konobar.id, new Date().toISOString(), { ukupno: 50 });
    expect(await lista()).toMatchObject({ dugovi: [], broj: 0, ukupno: 0 });
  });

  it("collecting takes the whole debt off the list, at the bill's amount", async () => {
    const racun = await dug();
    const { naplata } = await json<{ naplata: Record<string, unknown> }>(await naplati(racun, { nacin: "kartica" }));
    expect(naplata).toMatchObject({ racunId: racun, iznos: 17, nacin: "kartica" });
    expect(await lista()).toMatchObject({ dugovi: [], broj: 0, ukupno: 0 });
    expect((await stanje(racun)).status).toBe("placen");
  });

  it("keeps the record that it was a debt, and the time the bill closed", async () => {
    const racun = await dug();
    const prije = await stanje(racun);
    await json(await naplati(racun));
    const poslije = await stanje(racun);
    expect(poslije.nacin).toBe("dug");
    expect(poslije.zatvoren).toEqual(prije.zatvoren);
  });

  it("takes no amount from the screen", async () => {
    const racun = await dug();
    expect((await naplati(racun, { iznos: 1 })).status).toBe(400);
    expect((await naplati(racun, { nacin: "dug" })).status).toBe(400);
    expect((await naplati(racun, { nacin: "kombinovano" })).status).toBe(400);
    expect((await lista()).broj).toBe(1);
  });

  it("a double tap collects once and gets the same answer", async () => {
    const racun = await dug();
    const requestId = randomUUID();
    const prva = await json<{ naplata: unknown }>(await naplati(racun, { requestId }));
    const druga = await json<{ naplata: unknown }>(await naplati(racun, { requestId, nacin: "kartica" }));
    expect(druga).toEqual(prva);
    expect(await brojRadnji("dug_naplacen")).toBe(1);
    const { rows } = await (await demoBaza()).query("select racun_id from public.naplate_dugova");
    expect(rows).toHaveLength(1);
  });

  it("a second device gets a clear refusal", async () => {
    const racun = await dug();
    await json(await naplati(racun));
    expect(await greska(await naplati(racun))).toBe("Dug je već naplaćen.");
    expect(await brojRadnji("dug_naplacen")).toBe(1);
  });

  it("refuses a bill that is not on debt, an unknown bill, and a reused request id", async () => {
    const placen = await naplataU(ljudi.konobar.id, new Date().toISOString(), { ukupno: 5 });
    expect(await greska(await naplati(placen))).toBe("Račun nije na dugu.");
    expect(await greska(await naplati(randomUUID()))).toBe("Račun nije pronađen.");

    for (const n of await naruci(ljudi, [jelo(id["Natur šnicla"])], 5)) await pomjeri(ljudi, n);
    expect(await greska(await naplati((await racunStola(ljudi, 5)).id))).toBe("Račun nije na dugu.");

    const a = await dug(1);
    const b = await dug(2, "Bečka šnicla");
    const requestId = randomUUID();
    await json(await naplati(a, { requestId }));
    expect(await greska(await naplati(b, { requestId }))).toMatch(/već iskorištena/);
    expect((await lista()).broj).toBe(1);
  });

  it("logs the money and not the name", async () => {
    const racun = await dug();
    await json(await naplati(racun));
    const { rows } = await (await demoBaza()).query<{ detalji: Record<string, unknown>; zaposlenik_id: string }>(
      "select detalji, zaposlenik_id from public.dnevnik_radnji where radnja = 'dug_naplacen'",
    );
    expect(rows[0].zaposlenik_id).toBe(ljudi.sefica.id);
    expect(rows[0].detalji).toEqual({ racun: racun, iznos: 17, nacin: "gotovina" });
    const sve = await (await demoBaza()).query("select detalji from public.dnevnik_radnji");
    expect(JSON.stringify(sve.rows)).not.toContain(DUZNIK);
  });

  it("pages, and the total covers every page", async () => {
    for (let i = 0; i < 52; i++) await naplataU(ljudi.konobar.id, new Date(Date.now() - i * 60_000).toISOString(), { nacin: "dug", ukupno: 2 });
    const prva = await lista();
    expect([prva.dugovi.length, prva.imaJos, prva.broj, prva.ukupno]).toEqual([50, true, 52, 104]);
    const druga = await lista("/api/administracija/dugovi?strana=2");
    expect([druga.dugovi.length, druga.imaJos, druga.broj, druga.ukupno]).toEqual([2, false, 52, 104]);
    expect(new Set([...prva.dugovi, ...druga.dugovi].map((d) => d.racunId)).size).toBe(52);
  });
});

describe("the audit log", () => {
  type Zapis = { id: number; vrijeme: string; zaposlenik: string | null; radnja: string; detalji: Record<string, unknown> };
  const dnevnik = async (url = "/api/administracija/dnevnik") =>
    json<{ dnevnik: Zapis[]; sljedeci: number | null }>(await dnevnikGet(zahtjev(url, { kolacici: k("sefica") })));

  async function upisi(n: number) {
    await (await demoBaza()).query(
      "insert into public.dnevnik_radnji (zaposlenik_id, radnja, detalji) select $1, 'probna', jsonb_build_object('i', i) from generate_series(1, $2::int) i",
      [ljudi.konobar.id, n],
    );
  }

  it("shows the newest first, with who did it", async () => {
    await upisi(2);
    const { dnevnik: zapisi, sljedeci } = await dnevnik();
    expect(zapisi.map((z) => z.detalji.i)).toEqual([2, 1]);
    expect(zapisi[0]).toMatchObject({ zaposlenik: ljudi.konobar.ime, radnja: "probna", vrijeme: expect.any(String) });
    expect(sljedeci).toBeNull();
  });

  it("shows an entry with no person, such as a lockout", async () => {
    await (await demoBaza()).exec("insert into public.dnevnik_radnji (radnja) values ('pin_zakljucano')");
    expect((await dnevnik()).dnevnik[0]).toMatchObject({ zaposlenik: null, radnja: "pin_zakljucano" });
  });

  it("walks every entry exactly once, a page at a time", async () => {
    await upisi(120);
    const vidjeno: number[] = [];
    let url = "/api/administracija/dnevnik";
    for (let i = 0; i < 4; i++) {
      const { dnevnik: zapisi, sljedeci } = await dnevnik(url);
      expect(zapisi.length).toBeLessThanOrEqual(50);
      vidjeno.push(...zapisi.map((z) => z.detalji.i as number));
      if (sljedeci === null) break;
      url = `/api/administracija/dnevnik?prije=${sljedeci}`;
    }
    expect(vidjeno).toEqual(Array.from({ length: 120 }, (_, i) => 120 - i));
  });

  it("exactly 50 entries is one page with no next", async () => {
    await upisi(50);
    const { dnevnik: zapisi, sljedeci } = await dnevnik();
    expect(zapisi).toHaveLength(50);
    expect(sljedeci).toBeNull();
  });

  it("a new entry does not shift the next page", async () => {
    await upisi(60);
    const prva = await dnevnik();
    await upisi(5);
    const druga = await dnevnik(`/api/administracija/dnevnik?prije=${prva.sljedeci}`);
    expect(druga.dnevnik.map((z) => z.detalji.i)).toEqual(Array.from({ length: 10 }, (_, i) => 10 - i));
  });
});
