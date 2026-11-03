import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as dnevnik from "@/app/api/administracija/dnevnik/route";
import * as dugovi from "@/app/api/administracija/dugovi/route";
import * as zaposlenici from "@/app/api/administracija/zaposlenici/route";
import * as izvjestaji from "@/app/api/izvjestaji/route";
import * as izvjestajiCsv from "@/app/api/izvjestaji/csv/route";
import * as dug from "@/app/api/pecenjara/dug/route";
import * as popisPecenjare from "@/app/api/pecenjara/smjena/route";
import * as rezervacije from "@/app/api/rezervacije/route";
import * as artikli from "@/app/api/sank/artikli/route";
import * as dopune from "@/app/api/sank/dopune/route";
import * as smjene from "@/app/api/smjene/route";
import * as zatvoriDan from "@/app/api/smjene/zatvori-dan/route";
import * as statistika from "@/app/api/statistika-konobara/route";
import * as nabavka from "@/app/api/zaliha/nabavka/route";
import * as prodaja from "@/app/api/zaliha/prodaja/route";
import * as promet from "@/app/api/zaliha/promet/route";
import * as recepti from "@/app/api/zaliha/recepti/route";
import * as zaliha from "@/app/api/zaliha/route";
import * as zahtjevi from "@/app/api/zaliha/zahtjevi/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { osoblje, pripremiOkruzenje, zahtjev, type Osoba } from "./pomocnici";

type Ruta = (request: NextRequest) => Promise<Response>;

const ULOGE: Uloga[] = ["konobar", "kuhinja", "pecenjara", "mesnica", "sefica"];
const SANK: Uloga[] = ["konobar", "sefica"];
const SEFICA: Uloga[] = ["sefica"];
const u = () => randomUUID();

const RUTE: { naziv: string; ruta: Ruta; url: string; uloge: Uloga[]; tijelo?: () => Record<string, unknown> }[] = [
  { naziv: "GET smjene", ruta: smjene.GET, url: "/api/smjene", uloge: SANK },
  { naziv: "POST smjene", ruta: smjene.POST, url: "/api/smjene", uloge: SANK, tijelo: () => ({ requestId: u(), oznaka: "I", popis: [] }) },
  {
    naziv: "PATCH smjene",
    ruta: smjene.PATCH,
    url: "/api/smjene",
    uloge: SANK,
    tijelo: () => ({ requestId: u(), smjenaId: u(), popis: [], predaniPazar: 0 }),
  },
  { naziv: "GET zatvori-dan", ruta: zatvoriDan.GET, url: "/api/smjene/zatvori-dan", uloge: SEFICA },
  { naziv: "POST zatvori-dan", ruta: zatvoriDan.POST, url: "/api/smjene/zatvori-dan", uloge: SEFICA, tijelo: () => ({ datum: "2020-01-01" }) },
  { naziv: "GET sank/artikli", ruta: artikli.GET, url: "/api/sank/artikli", uloge: SANK },
  { naziv: "POST sank/dopune", ruta: dopune.POST, url: "/api/sank/dopune", uloge: SANK, tijelo: () => ({ requestId: u(), proizvodId: u(), kolicina: 1 }) },
  { naziv: "GET pecenjara/smjena", ruta: popisPecenjare.GET, url: "/api/pecenjara/smjena", uloge: ["pecenjara", "sefica"] },
  {
    naziv: "POST pecenjara/smjena",
    ruta: popisPecenjare.POST,
    url: "/api/pecenjara/smjena",
    uloge: ["pecenjara", "sefica"],
    tijelo: () => ({ requestId: u(), pocetneKokePecene: 0, pocetneKokeSirove: 0, pocetnaJanjetinaKg: 0 }),
  },
  {
    naziv: "PATCH pecenjara/smjena",
    ruta: popisPecenjare.PATCH,
    url: "/api/pecenjara/smjena",
    uloge: ["pecenjara", "sefica"],
    tijelo: () => ({ requestId: u(), dodatneKoke: 0, dodatnaJanjetinaKg: 0, preostaleKoke: 0, preostalaJanjetinaKg: 0, predaniPazar: 0 }),
  },
  { naziv: "GET pecenjara/dug", ruta: dug.GET, url: "/api/pecenjara/dug", uloge: ["pecenjara", "sefica"] },
  { naziv: "POST pecenjara/dug", ruta: dug.POST, url: "/api/pecenjara/dug", uloge: ["pecenjara"], tijelo: () => ({ requestId: u(), konobarId: u(), iznos: 1 }) },
  { naziv: "GET zaliha", ruta: zaliha.GET, url: "/api/zaliha", uloge: ["kuhinja", "mesnica", "sefica"] },
  { naziv: "PATCH zaliha", ruta: zaliha.PATCH, url: "/api/zaliha", uloge: SEFICA, tijelo: () => ({ id: u(), minimum: 0, nabavnaCijena: null, prodajnaCijena: null }) },
  { naziv: "GET zaliha/promet", ruta: promet.GET, url: "/api/zaliha/promet", uloge: ["mesnica", "sefica"] },
  {
    naziv: "POST zaliha/promet",
    ruta: promet.POST,
    url: "/api/zaliha/promet",
    uloge: ["mesnica", "sefica"],
    tijelo: () => ({ requestId: u(), zalihaId: u(), stanje: 1, razlog: "Popis" }),
  },
  { naziv: "POST zaliha/prodaja", ruta: prodaja.POST, url: "/api/zaliha/prodaja", uloge: ["mesnica"], tijelo: () => ({ requestId: u(), zalihaId: u(), kolicina: 1 }) },
  { naziv: "GET zaliha/zahtjevi", ruta: zahtjevi.GET, url: "/api/zaliha/zahtjevi", uloge: ["kuhinja", "mesnica", "sefica"] },
  { naziv: "POST zaliha/zahtjevi", ruta: zahtjevi.POST, url: "/api/zaliha/zahtjevi", uloge: ["kuhinja", "sefica"], tijelo: () => ({ requestId: u(), zalihaId: u() }) },
  { naziv: "PATCH zaliha/zahtjevi", ruta: zahtjevi.PATCH, url: "/api/zaliha/zahtjevi", uloge: ["mesnica"], tijelo: () => ({ zahtjevId: u(), radnja: "nema_na_stanju" }) },
  { naziv: "GET zaliha/recepti", ruta: recepti.GET, url: "/api/zaliha/recepti", uloge: SEFICA },
  { naziv: "POST zaliha/recepti", ruta: recepti.POST, url: "/api/zaliha/recepti", uloge: SEFICA, tijelo: () => ({ proizvodId: u(), sastojci: [] }) },
  { naziv: "GET zaliha/nabavka", ruta: nabavka.GET, url: "/api/zaliha/nabavka", uloge: SEFICA },
  { naziv: "GET izvjestaji", ruta: izvjestaji.GET, url: "/api/izvjestaji?dani=1", uloge: SEFICA },
  { naziv: "GET izvjestaji/csv", ruta: izvjestajiCsv.GET, url: "/api/izvjestaji/csv?dani=1", uloge: SEFICA },
  { naziv: "GET rezervacije", ruta: rezervacije.GET, url: "/api/rezervacije", uloge: SANK },
  {
    naziv: "POST rezervacije",
    ruta: rezervacije.POST,
    url: "/api/rezervacije",
    uloge: SANK,
    tijelo: () => ({ requestId: u(), ime: "Gost", brojGostiju: 2, vrijeme: "2000-01-01T10:00:00+01:00" }),
  },
  { naziv: "PATCH rezervacije", ruta: rezervacije.PATCH, url: "/api/rezervacije", uloge: SANK, tijelo: () => ({ id: u(), status: "otkazana" }) },
  { naziv: "GET statistika-konobara", ruta: statistika.GET, url: "/api/statistika-konobara", uloge: ["konobar"] },
  { naziv: "GET administracija/dnevnik", ruta: dnevnik.GET, url: "/api/administracija/dnevnik", uloge: SEFICA },
  { naziv: "GET administracija/dugovi", ruta: dugovi.GET, url: "/api/administracija/dugovi", uloge: SEFICA },
  {
    naziv: "POST administracija/dugovi",
    ruta: dugovi.POST,
    url: "/api/administracija/dugovi",
    uloge: SEFICA,
    tijelo: () => ({ requestId: u(), racunId: u(), nacin: "gotovina" }),
  },
  { naziv: "GET administracija/zaposlenici", ruta: zaposlenici.GET, url: "/api/administracija/zaposlenici", uloge: SEFICA },
  // A name already taken, so the matrix adds nobody.
  { naziv: "POST administracija/zaposlenici", ruta: zaposlenici.POST, url: "/api/administracija/zaposlenici", uloge: SEFICA, tijelo: () => ({ ime: "Mirzeta", uloga: "kuhinja" }) },
  { naziv: "PATCH administracija/zaposlenici", ruta: zaposlenici.PATCH, url: "/api/administracija/zaposlenici", uloge: SEFICA, tijelo: () => ({ id: u(), aktivan: false }) },
];

const FUNKCIJE: { ime: string; uloge: Uloga[]; argumenti: (id: string) => Record<string, unknown> }[] = [
  { ime: "otvori_smjenu", uloge: SANK, argumenti: (id) => ({ p_zaposlenik: id, p_request_id: u(), p_oznaka: "I", p_popis: [] }) },
  { ime: "zatvori_smjenu", uloge: SANK, argumenti: (id) => ({ p_zaposlenik: id, p_smjena: u(), p_request_id: u(), p_popis: [], p_predani: 0 }) },
  { ime: "smjene_pregled", uloge: SANK, argumenti: (id) => ({ p_zaposlenik: id, p_strana: 1 }) },
  { ime: "sank_artikli", uloge: SANK, argumenti: (id) => ({ p_zaposlenik: id }) },
  { ime: "dopuni_sank", uloge: SANK, argumenti: (id) => ({ p_zaposlenik: id, p_request_id: u(), p_proizvod: u(), p_kolicina: 1 }) },
  { ime: "pecenjara_pregled", uloge: ["pecenjara", "sefica"], argumenti: (id) => ({ p_zaposlenik: id, p_strana: 1 }) },
  {
    ime: "otvori_popis_pecenjare",
    uloge: ["pecenjara", "sefica"],
    argumenti: (id) => ({ p_zaposlenik: id, p_request_id: u(), p_koke_pecene: 0, p_koke_sirove: 0, p_janjetina_kg: 0 }),
  },
  {
    ime: "zatvori_popis_pecenjare",
    uloge: ["pecenjara", "sefica"],
    argumenti: (id) => ({ p_zaposlenik: id, p_request_id: u(), p_dodatne_koke: 0, p_dodatna_kg: 0, p_preostale_koke: 0, p_preostala_kg: 0, p_predani: 0 }),
  },
  { ime: "dugovi_pecenjari", uloge: ["pecenjara", "sefica"], argumenti: (id) => ({ p_zaposlenik: id }) },
  { ime: "uplati_pecenjari", uloge: ["pecenjara"], argumenti: (id) => ({ p_zaposlenik: id, p_request_id: u(), p_konobar: u(), p_iznos: 1 }) },
  { ime: "zaliha_pregled", uloge: ["kuhinja", "mesnica", "sefica"], argumenti: (id) => ({ p_zaposlenik: id }) },
  { ime: "izmijeni_artikal_zalihe", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_zaliha: u(), p_minimum: 0, p_nabavna: null, p_prodajna: null }) },
  { ime: "popisi_zalihu", uloge: ["mesnica", "sefica"], argumenti: (id) => ({ p_zaposlenik: id, p_request_id: u(), p_zaliha: u(), p_stanje: 1, p_razlog: "Popis" }) },
  { ime: "prodaj_zalihu", uloge: ["mesnica"], argumenti: (id) => ({ p_zaposlenik: id, p_request_id: u(), p_zaliha: u(), p_kolicina: 1 }) },
  { ime: "prometi_zalihe", uloge: ["mesnica", "sefica"], argumenti: (id) => ({ p_zaposlenik: id, p_zaliha: null, p_vrsta: null, p_strana: 1 }) },
  { ime: "zahtjevi_mesnici_pregled", uloge: ["kuhinja", "mesnica", "sefica"], argumenti: (id) => ({ p_zaposlenik: id, p_strana: 1 }) },
  { ime: "posalji_zahtjev_mesnici", uloge: ["kuhinja", "sefica"], argumenti: (id) => ({ p_zaposlenik: id, p_request_id: u(), p_zaliha: u(), p_kolicina: null }) },
  { ime: "obradi_zahtjev_mesnici", uloge: ["mesnica"], argumenti: (id) => ({ p_zaposlenik: id, p_zahtjev: u(), p_radnja: "nema_na_stanju", p_kolicina: null }) },
  { ime: "recepti_pregled", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id }) },
  { ime: "sacuvaj_recept", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_proizvod: u(), p_sastojci: [] }) },
  { ime: "prijedlog_nabavke", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id }) },
  { ime: "izvjestaj_perioda", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_dani: 1 }) },
  { ime: "statistika_konobara", uloge: ["konobar"], argumenti: (id) => ({ p_konobar: id, p_dani: 1 }) },
  { ime: "dan_pregled", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_datum: null }) },
  { ime: "zatvori_dan", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_datum: "2020-01-01" }) },
  { ime: "dugovi_gostiju", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_strana: 1 }) },
  { ime: "naplati_dug", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_racun: u(), p_request_id: u(), p_nacin: "gotovina" }) },
  { ime: "dnevnik_pregled", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_prije: null }) },
  { ime: "sacuvaj_zaposlenika", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_id: null, p_ime: "Mirzeta", p_uloga: "kuhinja" }) },
  { ime: "postavi_aktivnost_zaposlenika", uloge: SEFICA, argumenti: (id) => ({ p_sefica: id, p_id: u(), p_aktivan: false }) },
  {
    ime: "nova_rezervacija",
    uloge: SANK,
    argumenti: (id) => ({
      p_zaposlenik: id,
      p_request_id: u(),
      p_ime: "Gost",
      p_broj_gostiju: 2,
      p_vrijeme: "2000-01-01T10:00:00+01:00",
      p_sto: null,
      p_telefon: null,
      p_napomena: null,
    }),
  },
  { ime: "rezervacije_za_dan", uloge: SANK, argumenti: (id) => ({ p_zaposlenik: id, p_datum: null, p_strana: 1 }) },
  { ime: "promijeni_status_rezervacije", uloge: SANK, argumenti: (id) => ({ p_zaposlenik: id, p_rezervacija: u(), p_status: "otkazana" }) },
];

let ljudi: Record<Uloga, Osoba>;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const parovi = RUTE.flatMap((r) => ULOGE.filter((x) => !r.uloge.includes(x)).map((uloga) => [r.naziv, uloga, r] as const));

describe("every phase 5 route", () => {
  it.each(RUTE.map((r) => [r.naziv, r] as const))("%s needs a session", async (_, r) => {
    const odgovor = await r.ruta(zahtjev(r.url, { tijelo: r.tijelo?.() }));
    expect(odgovor.status).toBe(401);
  });

  it.each(parovi)("%s refuses %s", async (_, uloga, r) => {
    const odgovor = await r.ruta(zahtjev(r.url, { tijelo: r.tijelo?.(), kolacici: [ljudi[uloga].kolacic] }));
    expect(odgovor.status).toBe(403);
  });

  const sTijelom = RUTE.filter((r) => r.tijelo).map((r) => [r.naziv, r] as const);

  it.each(sTijelom)("%s accepts its body shape", async (_, r) => {
    const odgovor = await r.ruta(zahtjev(r.url, { tijelo: r.tijelo?.(), kolacici: [ljudi[r.uloge[0]].kolacic] }));
    expect(odgovor.status).not.toBe(400);
    expect(odgovor.status).toBeLessThan(500);
  });

  it.each(sTijelom)("%s rejects an unknown field", async (_, r) => {
    const odgovor = await r.ruta(
      zahtjev(r.url, { tijelo: { ...r.tijelo?.(), cijena: 0, ukupno: 0, status: "Izdato", razlika: 0 }, kolacici: [ljudi[r.uloge[0]].kolacic] }),
    );
    expect(odgovor.status).toBe(400);
  });

  it.each(sTijelom)("%s rejects a body that is not an object", async (_, r) => {
    const odgovor = await r.ruta(zahtjev(r.url, { tijelo: [], kolacici: [ljudi[r.uloge[0]].kolacic] }));
    expect(odgovor.status).toBe(400);
  });
});

describe("query values", () => {
  it.each([
    ["izvjestaji", izvjestaji.GET, "/api/izvjestaji?dani=2"],
    ["izvjestaji", izvjestaji.GET, "/api/izvjestaji?dani=abc"],
    ["csv", izvjestajiCsv.GET, "/api/izvjestaji/csv?dani=31"],
    ["smjene", smjene.GET, "/api/smjene?strana=0"],
    ["smjene", smjene.GET, "/api/smjene?strana=1.5"],
    ["dugovi", dugovi.GET, "/api/administracija/dugovi?strana=abc"],
    ["zatvori-dan", zatvoriDan.GET, "/api/smjene/zatvori-dan?datum=03.11.2026"],
    ["zatvori-dan", zatvoriDan.GET, "/api/smjene/zatvori-dan?datum=2026-02-30"],
    ["promet", promet.GET, "/api/zaliha/promet?vrsta=krada"],
    ["promet", promet.GET, "/api/zaliha/promet?zalihaId=1"],
    ["dnevnik", dnevnik.GET, "/api/administracija/dnevnik?prije=-1"],
    ["rezervacije", rezervacije.GET, "/api/rezervacije?datum=sutra"],
  ] as const)("%s refuses a bad value: %s", async (_, ruta, url) => {
    const odgovor = await ruta(zahtjev(url, { kolacici: [ljudi.sefica.kolacic] }));
    expect(odgovor.status).toBe(400);
  });
});

// The route check alone is not enough: these call the SQL as the route would, with the wrong person.
describe("SQL re-checks the role", () => {
  const pogresni = FUNKCIJE.flatMap((f) => ULOGE.filter((x) => !f.uloge.includes(x)).map((uloga) => [f.ime, uloga, f] as const));

  it.each(pogresni)("%s refuses %s", async (ime, uloga, f) => {
    await expect(demoRpc(ime, f.argumenti(ljudi[uloga].id))).rejects.toThrow("Nemate pravo na ovu radnju.");
  });

  it.each(FUNKCIJE.map((f) => [f.ime, f] as const))("%s refuses a deactivated person", async (ime, f) => {
    const db = await demoBaza();
    const { id } = ljudi[f.uloge[0]];
    await db.query("update public.zaposlenici set aktivan = false where id = $1", [id]);
    try {
      await expect(demoRpc(ime, f.argumenti(id))).rejects.toThrow("Nemate pravo na ovu radnju.");
    } finally {
      await db.query("update public.zaposlenici set aktivan = true where id = $1", [id]);
    }
  });

  it("covers every function granted in phase 5", async () => {
    const stare = new Set([
      "aktiviraj_pin", "meni", "naplati_racun", "obavijesti_konobara", "odobri_popust", "posalji_narudzbu", "postavi_pin_kodom",
      "premjesti_sto", "prijava_pinom", "promijeni_status_narudzbe", "racun_za_stampu", "racun_za_sto", "red_stanice",
      "sesija_vazeca", "stolovi_pregled", "storniraj_stavku", "zaposlenici_pregled", "zaposlenici_za_prijavu",
    ]);
    const { rows } = await (await demoBaza()).query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('service_role', p.oid, 'execute')`,
    );
    expect(rows.map((r) => r.proname).filter((x) => !stare.has(x)).sort()).toEqual(FUNKCIJE.map((f) => f.ime).sort());
  });
});

describe("the three index-backed report paths", () => {
  it("uses them once sequential scans are off the table", async () => {
    const db = await demoBaza();
    await db.exec("set enable_seqscan = off");
    try {
      const plan = async (sql: string) =>
        (await db.query<{ "QUERY PLAN": string }>(`explain ${sql}`)).rows.map((r) => r["QUERY PLAN"]).join("\n");
      expect(await plan("select * from public.naplate where vrijeme >= now() - interval '1 day' and vrijeme < now()")).toContain("naplate_vrijeme_idx");
      expect(await plan(`select * from public.naplate where konobar_id = '${ljudi.konobar.id}' and vrijeme >= now()`)).toContain("naplate_konobar_vrijeme_idx");
      expect(await plan("select * from public.dnevnik_radnji where radnja = 'storno' and vrijeme >= now()")).toContain("dnevnik_radnji_storno_idx");
    } finally {
      await db.exec("reset enable_seqscan");
    }
  });
});
