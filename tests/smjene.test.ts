import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as pomjeriRuta } from "@/app/api/narudzbe/[id]/route";
import { POST as stornoRuta } from "@/app/api/narudzbe/stavka/[id]/storno/route";
import { GET as dugGet, POST as dugPost } from "@/app/api/pecenjara/dug/route";
import { GET as popisGet, PATCH as popisPatch, POST as popisPost } from "@/app/api/pecenjara/smjena/route";
import { GET as artikliGet } from "@/app/api/sank/artikli/route";
import { POST as dopunaPost } from "@/app/api/sank/dopune/route";
import { GET as smjeneGet, PATCH as smjenePatch, POST as smjenePost } from "@/app/api/smjene/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza } from "@/lib/demo/store";
import { pregledPopisa } from "@/lib/domain/pecenjara";
import { brojRadnji, jelo, naruci, plati, pomjeri, racunStola } from "./pomocnici-faza5";
import { ocisti, osoblje, pripremiOkruzenje, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type Smjena = {
  id: string;
  oznaka: string;
  otvorio: string;
  kraj: string | null;
  zatvorio: string | null;
  pazarSanka: number | null;
  pazarStanica: number | null;
  ocekivaniPazar: number | null;
  predaniPazar: number | null;
  razlika: number | null;
  naplate: Record<string, number> | null;
};
type Pice = { id: string; naziv: string; cijena: number };
type Popis = Record<string, number | string | null>;

const COLA = "Coca-Cola 0,25 l";

let ljudi: Record<Uloga, Osoba>;
let id: Record<string, string>;
let pica: Pice[];
let cola: Pice;
let drugo: Pice;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
  id = await proizvodi();
  const db = await demoBaza();
  const { rows } = await db.query<{ id: string; naziv: string; cijena: string }>(
    "select id, naziv, cijena::text from public.proizvodi where stanica = 'sank' and aktivan order by naziv",
  );
  pica = rows.map((r) => ({ ...r, cijena: Number(r.cijena) }));
  cola = pica.find((p) => p.naziv === COLA)!;
  drugo = pica.find((p) => p.naziv !== COLA && p.cijena !== cola.cijena)!;
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => ocisti());

const popis = (izuzeci: Record<string, number> = {}, podrazumijevano = 0) =>
  pica.map((p) => ({ proizvodId: p.id, kolicina: izuzeci[p.id] ?? podrazumijevano }));

const k = (uloga: Uloga) => [ljudi[uloga].kolacic];

async function json<T>(odgovor: Response, status = 200) {
  const tijelo = (await odgovor.json()) as T & { greska?: string };
  expect(odgovor.status, tijelo.greska).toBe(status);
  return tijelo;
}

async function greska(odgovor: Response, status = 422) {
  return (await json<{ greska: string }>(odgovor, status)).greska;
}

const otvori = (tijelo: Record<string, unknown> = {}, uloga: Uloga = "konobar") =>
  smjenePost(zahtjev("/api/smjene", { tijelo: { requestId: randomUUID(), oznaka: "I", popis: popis(), ...tijelo }, kolacici: k(uloga) }));

const zatvori = (smjenaId: string, tijelo: Record<string, unknown> = {}, uloga: Uloga = "konobar") =>
  smjenePatch(
    zahtjev("/api/smjene", {
      tijelo: { requestId: randomUUID(), smjenaId, popis: popis(), predaniPazar: 0, ...tijelo },
      kolacici: k(uloga),
    }),
  );

const otvoriPopis = (tijelo: Record<string, unknown> = {}, uloga: Uloga = "pecenjara") =>
  popisPost(
    zahtjev("/api/pecenjara/smjena", {
      tijelo: { requestId: randomUUID(), pocetneKokePecene: 0, pocetneKokeSirove: 0, pocetnaJanjetinaKg: 0, ...tijelo },
      kolacici: k(uloga),
    }),
  );

// Names the open shift, as the grill screen does with the count it shows.
const zatvoriPopis = async (tijelo: Record<string, unknown> = {}, uloga: Uloga = "pecenjara") =>
  popisPatch(
    zahtjev("/api/pecenjara/smjena", {
      tijelo: {
        requestId: randomUUID(),
        smjenaId: (await (await demoBaza()).query<{ id: string }>("select id from public.smjene where kraj is null")).rows[0]?.id ?? randomUUID(),
        dodatneKoke: 0,
        dodatnaJanjetinaKg: 0,
        preostaleKoke: 0,
        preostalaJanjetinaKg: 0,
        predaniPazar: 0,
        ...tijelo,
      },
      kolacici: k(uloga),
    }),
  );

const dopuni = (proizvodId: string, kolicina: number, requestId: string = randomUUID()) =>
  dopunaPost(zahtjev("/api/sank/dopune", { tijelo: { requestId, proizvodId, kolicina }, kolacici: k("konobar") }));

async function novaSmjena(tijelo: Record<string, unknown> = {}) {
  return (await json<{ smjena: Smjena }>(await otvori(tijelo))).smjena;
}

async function zatvorenPopisPecenjare() {
  await json(await otvoriPopis());
  await json(await zatvoriPopis());
}

async function zatvorena(smjena: string, tijelo: Record<string, unknown> = {}) {
  await zatvorenPopisPecenjare();
  return (await json<{ smjena: Smjena }>(await zatvori(smjena, tijelo))).smjena;
}

describe("opening a shift", () => {
  it("records every drink's count, and the bar screen shows it", async () => {
    const smjena = await novaSmjena({ oznaka: "II", popis: popis({ [cola.id]: 24 }) });
    expect(smjena).toMatchObject({ oznaka: "II", otvorio: ljudi.konobar.ime, kraj: null, razlika: null });
    expect(await brojRadnji("smjena_otvorena")).toBe(1);

    const { smjena: naEkranu, artikli } = await json<{
      smjena: { id: string; oznaka: string };
      artikli: { id: string; naziv: string; jedinica: string; pocetno: number; dopune: number }[];
    }>(await artikliGet(zahtjev("/api/sank/artikli", { kolacici: k("konobar") })));
    expect(naEkranu).toMatchObject({ id: smjena.id, oznaka: "II" });
    expect(artikli).toHaveLength(pica.length);
    expect(artikli.find((a) => a.id === cola.id)).toMatchObject({ pocetno: 24, dopune: 0 });
  });

  it("lists the drinks with no count while no shift is open", async () => {
    const { smjena, artikli } = await json<{ smjena: null; artikli: { pocetno: number | null }[] }>(
      await artikliGet(zahtjev("/api/sank/artikli", { kolacici: k("sefica") })),
    );
    expect(smjena).toBeNull();
    expect(artikli).toHaveLength(pica.length);
    expect(artikli.every((a) => a.pocetno === null)).toBe(true);
  });

  it("refuses a count with a drink missing, and names it", async () => {
    const [prvo, ...ostalo] = popis();
    const naziv = pica.find((p) => p.id === prvo.proizvodId)!.naziv;
    expect(await greska(await otvori({ popis: ostalo }))).toBe(`Nedostaje količina za „${naziv}“.`);
    expect(await brojRadnji("smjena_otvorena")).toBe(0);
  });

  it("refuses a drink counted twice, and a dish that is not a drink", async () => {
    expect(await greska(await otvori({ popis: [...popis(), popis()[0]] }))).toMatch(/dva puta/);
    expect(await greska(await otvori({ popis: [...popis(), { proizvodId: id["Natur šnicla"], kolicina: 1 }] }))).toMatch(/nije piće/);
  });

  it("refuses more than three decimals, in SQL as well as in the route's range", async () => {
    expect(await greska(await otvori({ popis: popis({ [cola.id]: 1.0005 }) }))).toMatch(/tri decimale/);
    expect((await otvori({ popis: popis({ [cola.id]: -1 }) })).status).toBe(400);
    expect((await otvori({ popis: popis({ [cola.id]: 100001 }) })).status).toBe(400);
  });

  it("allows only one open shift", async () => {
    await novaSmjena();
    expect(await greska(await otvori())).toBe("Već postoji otvorena smjena.");
    expect(await greska(await otvori({}, "sefica"))).toBe("Već postoji otvorena smjena.");
  });

  it("a double tap gets the same shift and logs once", async () => {
    const requestId = randomUUID();
    const prva = await novaSmjena({ requestId });
    const druga = await novaSmjena({ requestId });
    expect(druga.id).toBe(prva.id);
    expect(await brojRadnji("smjena_otvorena")).toBe(1);
  });
});

describe("bar refills", () => {
  it("add up, and a double tap adds once", async () => {
    await novaSmjena();
    const requestId = randomUUID();
    const { dopuna } = await json<{ dopuna: { dopune: number } }>(await dopuni(cola.id, 10, requestId));
    expect(dopuna.dopune).toBe(10);
    expect((await json<{ dopuna: { dopune: number } }>(await dopuni(cola.id, 10, requestId))).dopuna.dopune).toBe(10);
    expect((await json<{ dopuna: { dopune: number } }>(await dopuni(cola.id, 2.5))).dopuna.dopune).toBe(12.5);
    expect(await brojRadnji("dopuna_sanka")).toBe(2);
  });

  it("go on this shift's count, not an earlier one's", async () => {
    const prva = await novaSmjena({ popis: popis({ [cola.id]: 3 }) });
    await zatvorena(prva.id, { popis: popis({ [cola.id]: 1 }) });
    await novaSmjena({ popis: popis({ [cola.id]: 1 }) });
    await json(await dopuni(cola.id, 5));
    const { rows } = await (await demoBaza()).query<{ dopune: string }>(
      "select dopune::text from public.popisi_sanka where smjena_id = $1 and proizvod_id = $2",
      [prva.id, cola.id],
    );
    expect(Number(rows[0].dopune)).toBe(0);
  });

  it("need an open shift", async () => {
    expect(await greska(await dopuni(cola.id, 1))).toBe("Prvo otvorite smjenu.");
  });

  it("only take drinks in this shift's count", async () => {
    await novaSmjena();
    expect(await greska(await dopuni(id["Natur šnicla"], 1))).toBe("Tog pića nema u popisu ove smjene.");
  });

  it("refuse zero, negative and over-precise amounts", async () => {
    await novaSmjena();
    expect((await dopuni(cola.id, 0)).status).toBe(400);
    expect((await dopuni(cola.id, -1)).status).toBe(400);
    expect(await greska(await dopuni(cola.id, 1.0005))).toMatch(/Količina dopune/);
  });
});

describe("closing a shift", () => {
  it("is refused until the grill's count is closed", async () => {
    const smjena = await novaSmjena();
    const poruka = "Smjena se ne može zatvoriti dok pečenjara ne zaključi svoj popis.";

    expect(await greska(await zatvori(smjena.id))).toBe(poruka);
    await json(await otvoriPopis());
    expect(await greska(await zatvori(smjena.id))).toBe(poruka);
    await json(await zatvoriPopis());
    expect((await json<{ smjena: Smjena }>(await zatvori(smjena.id))).smjena.kraj).not.toBeNull();
  });

  it("works out the bar's takings from opening count, refills and closing count", async () => {
    const smjena = await novaSmjena({ popis: popis({ [cola.id]: 10, [drugo.id]: 4 }) });
    await json(await dopuni(cola.id, 5));
    const zatvoreno = await zatvorena(smjena.id, { popis: popis({ [cola.id]: 3, [drugo.id]: 1 }), predaniPazar: 100 });

    const ocekivano = Math.round((12 * cola.cijena + 3 * drugo.cijena) * 100) / 100;
    expect(zatvoreno.pazarSanka).toBe(ocekivano);
    expect(zatvoreno.pazarStanica).toBe(0);
    expect(zatvoreno.ocekivaniPazar).toBe(ocekivano);
    expect(zatvoreno.predaniPazar).toBe(100);
    expect(zatvoreno.razlika).toBe(Math.round((100 - ocekivano) * 100) / 100);
    expect(zatvoreno.zatvorio).toBe(ljudi.konobar.ime);
  });

  it("reports a shortage as a negative difference", async () => {
    const smjena = await novaSmjena({ popis: popis({ [cola.id]: 2 }) });
    const zatvoreno = await zatvorena(smjena.id, { predaniPazar: 0 });
    expect(zatvoreno.razlika).toBe(-2 * cola.cijena);
  });

  it("counts issued kitchen and grill lines at what the guest pays, with the real lamb weight and paid sides", async () => {
    const smjena = await novaSmjena();

    // A dish with its free side and a paid one, sitting on the kitchen's order.
    const [kuhinja] = await naruci(ljudi, [jelo(id["Natur šnicla"], 1, [id["Pomfrit"], id["Riža"]])], 1);
    await pomjeri(ljudi, kuhinja);

    const [janjetina] = await naruci(ljudi, [jelo(id["Jagnjetina s ražnja"], 0.5)], 2);
    const stavka = (await racunStola(ljudi, 2)).narudzbe[0].stavke[0].id;
    await pomjeri(ljudi, janjetina, "Izdato", { cijena: 20, tezine: [{ stavkaId: stavka, kg: 0.62 }] });

    // A drink is counted by the bar, so it must not count here too.
    const [sank] = await naruci(ljudi, [jelo(id[COLA])], 3);
    await pomjeri(ljudi, sank);

    // Not issued yet, so not taken yet.
    const [ceka] = await naruci(ljudi, [jelo(id["Pečeno pile"])], 4);
    await pomjeri(ljudi, ceka, "Gotovo");

    const zatvoreno = await zatvorena(smjena.id);
    expect(zatvoreno.pazarStanica).toBe(17 + 4 + 31);
    expect(zatvoreno.ocekivaniPazar).toBe(52);
  });

  it("leaves voided lines out", async () => {
    const smjena = await novaSmjena();
    const [n] = await naruci(ljudi, [jelo(id["Natur šnicla"]), jelo(id["Bečka šnicla"])], 1);
    await pomjeri(ljudi, n);
    const stavke = (await racunStola(ljudi, 1)).narudzbe[0].stavke;
    const odgovor = await stornoRuta(
      zahtjev(`/api/narudzbe/stavka/${stavke[1].id}/storno`, { tijelo: { razlog: "Gost odustao" }, kolacici: k("konobar") }),
      { params: Promise.resolve({ id: String(stavke[1].id) }) },
    );
    expect(odgovor.status).toBe(200);

    expect((await zatvorena(smjena.id)).pazarStanica).toBe(17);
  });

  it("puts each issued order in exactly one shift, even one issued between shifts", async () => {
    const prva = await novaSmjena();
    const [uPrvoj] = await naruci(ljudi, [jelo(id["Natur šnicla"])], 1);
    await pomjeri(ljudi, uPrvoj);
    // Ordered in the first shift, issued only after it closed.
    const [kasnije] = await naruci(ljudi, [jelo(id["Bečka šnicla"])], 2);
    await pomjeri(ljudi, kasnije, "Gotovo");
    expect((await zatvorena(prva.id)).pazarStanica).toBe(17);

    const izdavanje = await pomjeriRuta(zahtjev(`/api/narudzbe/${kasnije.id}`, { tijelo: { status: "Izdato" }, kolacici: k("kuhinja") }), {
      params: Promise.resolve({ id: kasnije.id }),
    });
    expect(izdavanje.status).toBe(200);

    const druga = await novaSmjena();
    const [uDrugoj] = await naruci(ljudi, [jelo(id["Pariška šnicla"])], 3);
    await pomjeri(ljudi, uDrugoj);
    expect((await zatvorena(druga.id)).pazarStanica).toBe(19 + 19);

    // The third starts where the second stopped, so nothing from before it counts.
    const treca = await novaSmjena();
    expect((await zatvorena(treca.id)).pazarStanica).toBe(0);
  });

  it("the first shift ever starts at its opening, not at the beginning of time", async () => {
    const [prije] = await naruci(ljudi, [jelo(id["Natur šnicla"])], 1);
    await pomjeri(ljudi, prije);
    const smjena = await novaSmjena();
    expect((await zatvorena(smjena.id)).pazarStanica).toBe(0);
  });

  it("shows what the bills took beside the difference, without changing it", async () => {
    const smjena = await novaSmjena();
    const [gotovina] = await naruci(ljudi, [jelo(id["Natur šnicla"])], 1);
    await pomjeri(ljudi, gotovina);
    await plati(ljudi, await racunStola(ljudi, 1), { nacin: "gotovina", gotovina: 20, vraceniKusur: 2 });
    const [kartica] = await naruci(ljudi, [jelo(id["Bečka šnicla"])], 2);
    await pomjeri(ljudi, kartica);
    await plati(ljudi, await racunStola(ljudi, 2), { nacin: "kartica", kartica: 19 });
    const [dug] = await naruci(ljudi, [jelo(id["Pariška šnicla"])], 3);
    await pomjeri(ljudi, dug);
    await plati(ljudi, await racunStola(ljudi, 3), { nacin: "dug", gostDuznik: "Gost Testni" });

    const zatvoreno = await zatvorena(smjena.id, { predaniPazar: 55 });
    expect(zatvoreno.pazarStanica).toBe(55);
    expect(zatvoreno.razlika).toBe(0);
    expect(zatvoreno.naplate).toEqual({ naplaceno: 36, gotovina: 18, kartica: 19, baksis: 1, popust: 0, dug: 19 });
  });

  it("a double tap gets the first result and logs once", async () => {
    const smjena = await novaSmjena({ popis: popis({ [cola.id]: 5 }) });
    await zatvorenPopisPecenjare();
    const requestId = randomUUID();
    const prva = (await json<{ smjena: Smjena }>(await zatvori(smjena.id, { requestId, popis: popis({ [cola.id]: 1 }), predaniPazar: 10 }))).smjena;
    const druga = (await json<{ smjena: Smjena }>(await zatvori(smjena.id, { requestId, popis: popis({ [cola.id]: 5 }), predaniPazar: 999 }))).smjena;
    expect(druga).toEqual(prva);
    expect(await brojRadnji("smjena_zatvorena")).toBe(1);
  });

  it("a second device gets a clear refusal, and the first closing stands", async () => {
    const smjena = await novaSmjena();
    const prva = await zatvorena(smjena.id, { predaniPazar: 10 });
    expect(await greska(await zatvori(smjena.id, { predaniPazar: 999 }))).toBe("Smjena je već zatvorena.");
    const { smjene } = await json<{ smjene: Smjena[] }>(await smjeneGet(zahtjev("/api/smjene", { kolacici: k("sefica") })));
    expect(smjene[0]).toEqual(prva);
  });

  it("refuses a request id already used on another shift", async () => {
    const prva = await novaSmjena();
    await zatvorenPopisPecenjare();
    const requestId = randomUUID();
    await json(await zatvori(prva.id, { requestId }));
    const druga = await novaSmjena();
    expect(await greska(await zatvori(druga.id, { requestId }))).toMatch(/već iskorištena/);
  });

  it("refuses an unknown shift", async () => {
    expect(await greska(await zatvori(randomUUID()))).toBe("Smjena nije pronađena.");
  });

  it("refuses more left than there was, and names the drink", async () => {
    const smjena = await novaSmjena({ popis: popis({ [cola.id]: 5 }) });
    await json(await dopuni(cola.id, 1));
    await zatvorenPopisPecenjare();
    expect(await greska(await zatvori(smjena.id, { popis: popis({ [cola.id]: 6.001 }) }))).toBe(
      `Završno stanje za „${COLA}“ je veće od početnog stanja i dopuna.`,
    );
    expect((await json<{ smjena: Smjena }>(await zatvori(smjena.id, { popis: popis({ [cola.id]: 6 }) }))).smjena.pazarSanka).toBe(0);
  });

  it("refuses a closing count with a drink missing, rather than treating it as sold out", async () => {
    const smjena = await novaSmjena({ popis: popis({ [cola.id]: 5 }) });
    await zatvorenPopisPecenjare();
    expect(await greska(await zatvori(smjena.id, { popis: popis().filter((p) => p.proizvodId !== cola.id) }))).toBe(
      `Nedostaje količina za „${COLA}“.`,
    );
  });

  it("refuses handed-over money that is not whole fenings", async () => {
    const smjena = await novaSmjena();
    await zatvorenPopisPecenjare();
    expect(await greska(await zatvori(smjena.id, { predaniPazar: 10.005 }))).toMatch(/zaokružen na fening/);
    expect((await zatvori(smjena.id, { predaniPazar: -1 })).status).toBe(400);
  });

  it("logs the figures", async () => {
    const smjena = await novaSmjena({ popis: popis({ [cola.id]: 1 }) });
    await zatvorena(smjena.id, { predaniPazar: 10 });
    const { rows } = await (await demoBaza()).query<{ detalji: Record<string, unknown> }>(
      "select detalji from public.dnevnik_radnji where radnja = 'smjena_zatvorena'",
    );
    expect(rows[0].detalji).toMatchObject({ smjena: smjena.id, pazarSanka: cola.cijena, predaniPazar: 10, razlika: 10 - cola.cijena });
  });
});

describe("the shift list", () => {
  it("shows the grill's state on the open shift", async () => {
    const stanje = async () =>
      (await json<{ otvorena: { popisPecenjare: string } | null }>(await smjeneGet(zahtjev("/api/smjene", { kolacici: k("konobar") })))).otvorena?.popisPecenjare;
    expect(await stanje()).toBeUndefined();
    await novaSmjena();
    expect(await stanje()).toBe("nema");
    await json(await otvoriPopis());
    expect(await stanje()).toBe("otvoren");
    await json(await zatvoriPopis());
    expect(await stanje()).toBe("zatvoren");
  });

  it("gives the money history to the manager only, a page at a time", async () => {
    const smjena = await novaSmjena();
    await zatvorena(smjena.id, { predaniPazar: 10 });

    const konobar = await json<{ smjene: Smjena[]; otvorena: null }>(await smjeneGet(zahtjev("/api/smjene", { kolacici: k("konobar") })));
    expect(konobar.smjene).toEqual([]);

    const sefica = await json<{ smjene: Smjena[]; imaJos: boolean }>(await smjeneGet(zahtjev("/api/smjene", { kolacici: k("sefica") })));
    expect(sefica.smjene.map((s) => s.id)).toEqual([smjena.id]);
    expect(sefica.smjene[0].predaniPazar).toBe(10);
    expect(sefica.imaJos).toBe(false);

    await (await demoBaza()).query(
      `insert into public.smjene (request_id, oznaka, otvorio_id, statusi_od, naplate_od, zatvaranje_request_id, zatvorio_id, kraj, statusi_do,
         predani_pazar, pazar_sanka, pazar_stanica, naplate, pocetak)
       select gen_random_uuid(), 'I', $1, 0, now(), gen_random_uuid(), $1, now() - (i || ' days')::interval, 0, 0, 0, 0, '{}', now() - (i || ' days')::interval
       from generate_series(1, 54) i`,
      [ljudi.sefica.id],
    );
    const prva = await json<{ smjene: Smjena[]; imaJos: boolean }>(await smjeneGet(zahtjev("/api/smjene", { kolacici: k("sefica") })));
    expect(prva.smjene).toHaveLength(50);
    expect(prva.imaJos).toBe(true);
    const druga = await json<{ smjene: Smjena[]; imaJos: boolean }>(await smjeneGet(zahtjev("/api/smjene?strana=2", { kolacici: k("sefica") })));
    expect(druga.smjene).toHaveLength(5);
    expect(druga.imaJos).toBe(false);
    expect(new Set([...prva.smjene, ...druga.smjene].map((s) => s.id)).size).toBe(55);
  });
});

describe("the grill's count", () => {
  it("needs an open shift", async () => {
    expect(await greska(await otvoriPopis())).toMatch(/Nema otvorene smjene/);
    expect(await greska(await zatvoriPopis())).toMatch(/Ta smjena više nije otvorena/);
    await novaSmjena();
    expect(await greska(await zatvoriPopis())).toBe("Nema otvorenog popisa pečenjare.");
  });

  it("opens once per shift, and a double tap gets the first answer", async () => {
    await novaSmjena();
    const requestId = randomUUID();
    const prvi = await json<{ popis: Popis }>(await otvoriPopis({ requestId, pocetneKokePecene: 3, pocetneKokeSirove: 2, pocetnaJanjetinaKg: 4.5 }));
    expect(prvi.popis).toMatchObject({ pocetneKokePecene: 3, pocetneKokeSirove: 2, pocetnaJanjetinaKg: 4.5, zatvoreno: null, razlika: null });
    const drugi = await json<{ popis: Popis }>(await otvoriPopis({ requestId, pocetneKokePecene: 99 }));
    expect(drugi.popis).toEqual(prvi.popis);
    expect(await greska(await otvoriPopis())).toBe("Popis pečenjare za ovu smjenu je već otvoren.");
    expect(await brojRadnji("popis_pecenjare_otvoren")).toBe(1);
  });

  it.each([
    ["whole numbers", { pocetneKokePecene: 5, pocetneKokeSirove: 3, pocetnaJanjetinaKg: 10 }, { dodatneKoke: 2, dodatnaJanjetinaKg: 5, preostaleKoke: 1, preostalaJanjetinaKg: 3.25, predaniPazar: 700 }],
    ["fractions of a kilo", { pocetneKokePecene: 0, pocetneKokeSirove: 0, pocetnaJanjetinaKg: 0.1 }, { dodatneKoke: 0, dodatnaJanjetinaKg: 0.2, preostaleKoke: 0, preostalaJanjetinaKg: 0, predaniPazar: 15 }],
    ["a half fening", { pocetneKokePecene: 0, pocetneKokeSirove: 0, pocetnaJanjetinaKg: 1.111 }, { dodatneKoke: 0, dodatnaJanjetinaKg: 0, preostaleKoke: 0, preostalaJanjetinaKg: 0, predaniPazar: 55.55 }],
    ["nothing sold", { pocetneKokePecene: 4, pocetneKokeSirove: 0, pocetnaJanjetinaKg: 2 }, { dodatneKoke: 0, dodatnaJanjetinaKg: 0, preostaleKoke: 4, preostalaJanjetinaKg: 2, predaniPazar: 0 }],
    ["money short", { pocetneKokePecene: 1, pocetneKokeSirove: 0, pocetnaJanjetinaKg: 0 }, { dodatneKoke: 0, dodatnaJanjetinaKg: 0, preostaleKoke: 0, preostalaJanjetinaKg: 0, predaniPazar: 10.5 }],
  ])("closing works out sales and the difference, and the screen's preview agrees: %s", async (_, pocetak, kraj) => {
    await novaSmjena();
    await json(await otvoriPopis(pocetak));
    const { popis: p } = await json<{ popis: Popis }>(await zatvoriPopis(kraj));

    const prodaneKoke = pocetak.pocetneKokePecene + pocetak.pocetneKokeSirove + kraj.dodatneKoke - kraj.preostaleKoke;
    expect(p.prodaneKoke).toBe(prodaneKoke);
    expect(p.cijenaKoke).toBe(14);
    expect(p.cijenaJanjetine).toBe(50);

    const pregled = pregledPopisa({ ...pocetak, ...kraj, cijenaKoke: 14, cijenaJanjetine: 50 });
    expect(pregled).toEqual({
      moguce: true,
      prodaneKoke: p.prodaneKoke,
      prodanaJanjetinaKg: p.prodanaJanjetinaKg,
      pazarPoPopisu: p.pazarPoPopisu,
      razlika: p.razlika,
    });
  });

  it("works out the takings the way the old app's own example does", async () => {
    await novaSmjena();
    await json(await otvoriPopis({ pocetneKokePecene: 5, pocetneKokeSirove: 3, pocetnaJanjetinaKg: 10 }));
    const { popis: p } = await json<{ popis: Popis }>(
      await zatvoriPopis({ dodatneKoke: 2, dodatnaJanjetinaKg: 5, preostaleKoke: 1, preostalaJanjetinaKg: 3.25, predaniPazar: 700 }),
    );
    expect(p).toMatchObject({ prodaneKoke: 9, prodanaJanjetinaKg: 11.75, pazarPoPopisu: 713.5, predaniPazar: 700, razlika: -13.5 });
  });

  it("the preview flags a count that cannot be right, as the server does", async () => {
    const osnova = { pocetneKokePecene: 1, pocetneKokeSirove: 0, pocetnaJanjetinaKg: 1, dodatneKoke: 0, dodatnaJanjetinaKg: 0, preostalaJanjetinaKg: 0, preostaleKoke: 0, predaniPazar: 0, cijenaKoke: 14, cijenaJanjetine: 50 };
    expect(pregledPopisa(osnova).moguce).toBe(true);
    expect(pregledPopisa({ ...osnova, preostaleKoke: 2 }).moguce).toBe(false);
    expect(pregledPopisa({ ...osnova, preostalaJanjetinaKg: 1.001 }).moguce).toBe(false);
  });

  it("refuses more left than there was", async () => {
    await novaSmjena();
    await json(await otvoriPopis({ pocetneKokePecene: 2, pocetneKokeSirove: 1, pocetnaJanjetinaKg: 5 }));
    const poruka = "Završno stanje ne može biti veće od raspoložive količine.";
    expect(await greska(await zatvoriPopis({ preostaleKoke: 4 }))).toBe(poruka);
    expect(await greska(await zatvoriPopis({ preostalaJanjetinaKg: 5.001 }))).toBe(poruka);
    // Exactly what was there is fine, and additions count as available.
    expect((await json<{ popis: Popis }>(await zatvoriPopis({ preostaleKoke: 4, dodatneKoke: 1, preostalaJanjetinaKg: 5 }))).popis.prodaneKoke).toBe(0);
  });

  // A tablet still showing an earlier shift must not close the count of the shift opened since.
  it("refuses a close for a shift that is no longer open, and leaves the open count alone", async () => {
    await novaSmjena();
    await json(await otvoriPopis({ pocetneKokePecene: 3 }));
    const stara = randomUUID();
    expect(await greska(await zatvoriPopis({ smjenaId: stara }))).toBe(
      "Ta smjena više nije otvorena. Osvježite stranicu i provjerite koji popis zatvarate.",
    );
    expect((await json<{ popis: Popis | null }>(await popisGet(zahtjev("/api/pecenjara/smjena", { kolacici: k("pecenjara") })))).popis?.zatvoreno).toBeNull();
  });

  it("closes once: a double tap gets the first answer, a second device a refusal", async () => {
    await novaSmjena();
    await json(await otvoriPopis({ pocetneKokePecene: 2 }));
    const requestId = randomUUID();
    const prvi = await json<{ popis: Popis }>(await zatvoriPopis({ requestId, predaniPazar: 28 }));
    const drugi = await json<{ popis: Popis }>(await zatvoriPopis({ requestId, predaniPazar: 999 }));
    expect(drugi.popis).toEqual(prvi.popis);
    expect(await greska(await zatvoriPopis({ predaniPazar: 999 }))).toBe("Popis pečenjare je već zaključen.");
    expect(await brojRadnji("popis_pecenjare_zatvoren")).toBe(1);
  });

  it("refuses over-precise amounts", async () => {
    await novaSmjena();
    expect(await greska(await otvoriPopis({ pocetnaJanjetinaKg: 1.0005 }))).toBe("Početni popis nije ispravan.");
    await json(await otvoriPopis());
    expect(await greska(await zatvoriPopis({ dodatnaJanjetinaKg: 1.0005 }))).toBe("Završni popis nije ispravan.");
    expect(await greska(await zatvoriPopis({ predaniPazar: 1.005 }))).toMatch(/zaokružen na fening/);
    expect((await zatvoriPopis({ dodatneKoke: 1.5 })).status).toBe(400);
  });

  it("takes its prices from the menu, and keeps them after the menu changes", async () => {
    const db = await demoBaza();
    await novaSmjena();
    await json(await otvoriPopis({ pocetneKokePecene: 1 }));
    await db.exec("update public.proizvodi set cijena = 15 where naziv = 'Pečeno pile'");
    try {
      const { popis: p } = await json<{ popis: Popis }>(await zatvoriPopis({ predaniPazar: 15 }));
      expect(p).toMatchObject({ cijenaKoke: 15, pazarPoPopisu: 15, razlika: 0 });

      await db.exec("update public.proizvodi set cijena = 99 where naziv = 'Pečeno pile'");
      const { historija } = await json<{ historija: Popis[] }>(await popisGet(zahtjev("/api/pecenjara/smjena", { kolacici: k("pecenjara") })));
      expect(historija[0]).toMatchObject({ cijenaKoke: 15, pazarPoPopisu: 15 });
    } finally {
      await db.exec("update public.proizvodi set cijena = 14 where naziv = 'Pečeno pile'");
    }
  });

  it("the manager can count when nobody is at the grill", async () => {
    const smjena = await novaSmjena();
    await json(await otvoriPopis({}, "sefica"));
    await json(await zatvoriPopis({}, "sefica"));
    expect((await json<{ smjena: Smjena }>(await zatvori(smjena.id))).smjena.kraj).not.toBeNull();
  });

  it("the screen gets the shift, the count, the prices and the history", async () => {
    const ucitaj = async () =>
      json<{ smjena: { id: string } | null; popis: Popis | null; cijene: { koka: number; janjetina: number }; historija: Popis[]; imaJos: boolean }>(
        await popisGet(zahtjev("/api/pecenjara/smjena", { kolacici: k("pecenjara") })),
      );
    expect(await ucitaj()).toMatchObject({ smjena: null, popis: null, cijene: { koka: 14, janjetina: 50 }, historija: [], imaJos: false });

    const smjena = await novaSmjena();
    await json(await otvoriPopis({ pocetneKokePecene: 7 }));
    const otvoreno = await ucitaj();
    expect(otvoreno.smjena?.id).toBe(smjena.id);
    expect(otvoreno.popis).toMatchObject({ pocetneKokePecene: 7, zatvoreno: null });
    expect(otvoreno.historija).toEqual([]);

    await json(await zatvoriPopis({ preostaleKoke: 7 }));
    expect((await ucitaj()).historija).toHaveLength(1);
  });
});

describe("what waiters owe the grill", () => {
  const ucitaj = async (uloga: Uloga = "pecenjara") =>
    json<{ dugovi: { konobarId: string; ime: string; izdato: number; placeno: number; dug: number }[]; ukupno: number }>(
      await dugGet(zahtjev("/api/pecenjara/dug", { kolacici: k(uloga) })),
    );

  const uplati = (tijelo: Record<string, unknown>) =>
    dugPost(zahtjev("/api/pecenjara/dug", { tijelo: { requestId: randomUUID(), konobarId: ljudi.konobar.id, ...tijelo }, kolacici: k("pecenjara") }));

  async function narudzbaPecenjare(sto: number, cijena: number, dokle: "Gotovo" | "Izdato" = "Izdato") {
    const [n] = await naruci(ljudi, [jelo(id["Pečeno pile"])], sto);
    await pomjeri(ljudi, n, dokle, { cijena, tezine: [] });
    return n;
  }

  it("grows only when the grill issues the order", async () => {
    await narudzbaPecenjare(1, 12.5, "Gotovo");
    expect(await ucitaj()).toEqual({ dugovi: [], ukupno: 0 });

    await narudzbaPecenjare(2, 10);
    expect(await ucitaj()).toEqual({
      dugovi: [{ konobarId: ljudi.konobar.id, ime: ljudi.konobar.ime, izdato: 10, placeno: 0, dug: 10 }],
      ukupno: 10,
    });
  });

  it("is per waiter who placed the order, and the guest's bill does not feed it", async () => {
    await narudzbaPecenjare(1, 10);
    const n = await narudzbaPecenjare(2, 7);
    const db = await demoBaza();
    const { rows } = await db.query<{ id: string; ime: string }>(
      "select id, ime from public.zaposlenici where uloga = 'konobar' and id <> $1 order by ime limit 1",
      [ljudi.konobar.id],
    );
    await db.query("update public.narudzbe set konobar_id = $1 where id = $2", [rows[0].id, n.id]);

    const { dugovi, ukupno } = await ucitaj();
    expect(ukupno).toBe(17);
    expect(dugovi.map((d) => [d.ime, d.dug])).toEqual([
      [ljudi.konobar.ime, 10],
      [rows[0].ime, 7],
    ]);
  });

  it("ignores kitchen and bar orders", async () => {
    const [k1] = await naruci(ljudi, [jelo(id["Natur šnicla"])], 1);
    await pomjeri(ljudi, k1);
    const [s1] = await naruci(ljudi, [jelo(id[COLA])], 2);
    await pomjeri(ljudi, s1);
    expect((await ucitaj()).ukupno).toBe(0);
  });

  it("keeps a priced order that was voided afterwards, as the old app did", async () => {
    await narudzbaPecenjare(1, 10);
    const stavka = (await racunStola(ljudi, 1)).narudzbe[0].stavke[0].id;
    const odgovor = await stornoRuta(
      zahtjev(`/api/narudzbe/stavka/${stavka}/storno`, { tijelo: { razlog: "Gost odustao" }, kolacici: k("konobar") }),
      { params: Promise.resolve({ id: String(stavka) }) },
    );
    expect(odgovor.status).toBe(200);
    expect((await ucitaj()).ukupno).toBe(10);
  });

  it("falls with a payment, which drops a settled waiter off the list", async () => {
    await narudzbaPecenjare(1, 10);
    const { uplata } = await json<{ uplata: { iznos: number; preostaliDug: number } }>(await uplati({ iznos: 4 }));
    expect(uplata).toMatchObject({ iznos: 4, preostaliDug: 6 });
    expect((await ucitaj()).dugovi[0]).toMatchObject({ izdato: 10, placeno: 4, dug: 6 });

    expect((await json<{ uplata: { preostaliDug: number } }>(await uplati({ iznos: 6 }))).uplata.preostaliDug).toBe(0);
    expect(await ucitaj()).toEqual({ dugovi: [], ukupno: 0 });
  });

  it("refuses paying more than is owed, and says how much that is", async () => {
    await narudzbaPecenjare(1, 10.5);
    expect(await greska(await uplati({ iznos: 10.51 }))).toBe("Uplata prelazi dug konobara (10,50 KM).");
    expect(await greska(await uplati({ iznos: 1, konobarId: randomUUID() }))).toBe("Uplata prelazi dug konobara (0 KM).");
  });

  it("a double tap pays once", async () => {
    await narudzbaPecenjare(1, 10);
    const requestId = randomUUID();
    await json(await uplati({ requestId, iznos: 4 }));
    await json(await uplati({ requestId, iznos: 4 }));
    expect((await ucitaj()).dugovi[0].dug).toBe(6);
    expect(await brojRadnji("uplata_pecenjari")).toBe(1);
  });

  it("refuses over-precise and non-positive amounts", async () => {
    await narudzbaPecenjare(1, 10);
    expect(await greska(await uplati({ iznos: 1.005 }))).toMatch(/Iznos uplate/);
    expect((await uplati({ iznos: 0 })).status).toBe(400);
  });

  it("the manager can read it", async () => {
    await narudzbaPecenjare(1, 10);
    expect((await ucitaj("sefica")).ukupno).toBe(10);
  });
});
