import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as stornoRuta } from "@/app/api/narudzbe/stavka/[id]/storno/route";
import { GET as obavijestiRuta } from "@/app/api/konobar/obavijesti/route";
import { PATCH as pomjeriRuta } from "@/app/api/narudzbe/[id]/route";
import { GET as redRuta, POST as narudzbaRuta } from "@/app/api/narudzbe/route";
import { POST as naplataRuta } from "@/app/api/racuni/[id]/naplata/route";
import { GET as racunStola } from "@/app/api/racuni/sto/[stoId]/route";
import { POST as transfer } from "@/app/api/stolovi/transfer/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { RAZLOZI_STORNA } from "@/lib/domain/naplata";
import { ocisti, osoblje, pripremiOkruzenje, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type Stanica = "kuhinja" | "pecenjara" | "sank";
type Stavka = {
  id: number;
  naziv: string;
  kolicina: number;
  cijena: number;
  iznos: number;
  prilogUz: number | null;
  stornoRazlog: string | null;
  stornoVrijednost: number | null;
};
type Racun = {
  id: string;
  bruto: number;
  ukupno: number;
  sveIzdato: boolean;
  narudzbe: { id: string; status: string; stanica: Stanica; stavke: Stavka[] }[];
};
type StavkaReda = { id: number; naziv: string; trebaTezinu: boolean; stornoRazlog: string | null };
type NarudzbaReda = { id: string; status: string; sljedeci: string | null; stavke: StavkaReda[] };

const JAGNJETINA = "Jagnjetina s ražnja";
const KO_IZDAJE: Record<Stanica, Uloga> = { kuhinja: "kuhinja", pecenjara: "pecenjara", sank: "konobar" };

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

const jelo = (naziv: string, kolicina = 1, prilozi: string[] = []) => ({
  proizvodId: id[naziv],
  kolicina,
  prilozi: prilozi.map((p) => ({ proizvodId: id[p] })),
});

async function naruci(stavke: unknown[], sto = 1) {
  const odgovor = await narudzbaRuta(
    zahtjev("/api/narudzbe", { tijelo: { requestId: randomUUID(), stoId: sto, stavke }, kolacici: [ljudi.konobar.kolacic] }),
  );
  expect(odgovor.status).toBe(201);
  const { narudzbe } = (await odgovor.json()) as { narudzbe: { id: string; stanica: Stanica }[] };
  return Object.fromEntries(narudzbe.map((n) => [n.stanica, n.id])) as Record<Stanica, string>;
}

async function racun(sto = 1) {
  const odgovor = await racunStola(zahtjev(`/api/racuni/sto/${sto}`, { kolacici: [ljudi.konobar.kolacic] }), {
    params: Promise.resolve({ stoId: String(sto) }),
  });
  return ((await odgovor.json()) as { racun: Racun }).racun;
}

async function stavka(naziv: string, sto = 1) {
  return (await racun(sto)).narudzbe.flatMap((n) => n.stavke).find((s) => s.naziv === naziv)!;
}

function stornirajOdgovor(stavkaId: number | string, tijelo: unknown, kolacic: string | undefined = ljudi.konobar.kolacic) {
  return stornoRuta(zahtjev(`/api/narudzbe/stavka/${stavkaId}/storno`, { tijelo, kolacici: [kolacic] }), {
    params: Promise.resolve({ id: String(stavkaId) }),
  });
}

async function storniraj(naziv: string, razlog = "Gost odustao", sto = 1) {
  const odgovor = await stornirajOdgovor((await stavka(naziv, sto)).id, { razlog });
  expect(odgovor.status).toBe(200);
  return ((await odgovor.json()) as { racun: Racun }).racun;
}

function pomjeri(narudzba: string, tijelo: unknown, stanica: Stanica) {
  return pomjeriRuta(zahtjev(`/api/narudzbe/${narudzba}`, { tijelo, kolacici: [ljudi[KO_IZDAJE[stanica]].kolacic] }), {
    params: Promise.resolve({ id: narudzba }),
  });
}

async function korak(narudzba: string, tijelo: unknown, stanica: Stanica) {
  const odgovor = await pomjeri(narudzba, tijelo, stanica);
  expect(odgovor.status).toBe(200);
  return ((await odgovor.json()) as { narudzba: { status: string; sljedeci: string | null } }).narudzba;
}

async function izdaj(narudzba: string, stanica: Stanica) {
  await korak(narudzba, { status: "U pripremi" }, stanica);
  await korak(narudzba, stanica === "pecenjara" ? { status: "Gotovo", cijena: 10, tezine: [] } : { status: "Gotovo" }, stanica);
  await korak(narudzba, { status: "Izdato" }, stanica);
}

async function red(stanica: Stanica) {
  const odgovor = await redRuta(zahtjev(`/api/narudzbe?stanica=${stanica}`, { kolacici: [ljudi[KO_IZDAJE[stanica]].kolacic] }));
  return ((await odgovor.json()) as { narudzbe: NarudzbaReda[] }).narudzbe;
}

async function obavijesti(od: number | null) {
  const url = od === null ? "/api/konobar/obavijesti" : `/api/konobar/obavijesti?od=${od}`;
  const odgovor = await obavijestiRuta(zahtjev(url, { kolacici: [ljudi.konobar.kolacic] }));
  return (await odgovor.json()) as { kursor: number; obavijesti: { id: string; stavke: { naziv: string }[] }[] };
}

async function dnevnik() {
  const { rows } = await (await demoBaza()).query<{ zaposlenik_id: string; detalji: Record<string, unknown> }>(
    "select zaposlenik_id, detalji from public.dnevnik_radnji where radnja = 'storno' order by id",
  );
  return rows;
}

async function statusNarudzbe(narudzba: string) {
  const { rows } = await (await demoBaza()).query<{ status: string; cijena: number | null }>(
    "select status, cijena_pecenjari::float8 as cijena from public.narudzbe where id = $1",
    [narudzba],
  );
  return rows[0];
}

async function plati(sto = 1) {
  const r = await racun(sto);
  const odgovor = await naplataRuta(
    zahtjev(`/api/racuni/${r.id}/naplata`, {
      tijelo: { requestId: randomUUID(), ocekivano: r.ukupno, nacin: "kartica" },
      kolacici: [ljudi.konobar.kolacic],
    }),
    { params: Promise.resolve({ id: r.id }) },
  );
  expect(odgovor.status).toBe(200);
  return r;
}

describe("POST /api/narudzbe/stavka/[id]/storno: who and what", () => {
  it("needs a session", async () => {
    await naruci([jelo("Gulaš")]);
    const { id: s } = await stavka("Gulaš");
    const odgovor = await stornoRuta(zahtjev(`/api/narudzbe/stavka/${s}/storno`, { tijelo: { razlog: "Drugo" } }), {
      params: Promise.resolve({ id: String(s) }),
    });
    expect(odgovor.status).toBe(401);
  });

  it.each(["kuhinja", "pecenjara", "mesnica", "sefica"] as const)("refuses %s", async (uloga) => {
    await naruci([jelo("Gulaš")]);
    const s = await stavka("Gulaš");
    const odgovor = await stornirajOdgovor(s.id, { razlog: "Drugo" }, ljudi[uloga].kolacic);
    expect(odgovor.status).toBe(403);
    expect((await stavka("Gulaš")).stornoRazlog).toBeNull();
  });

  it.each(["kuhinja", "pecenjara", "mesnica", "sefica"] as const)("re-checks in SQL: refuses %s", async (uloga) => {
    await naruci([jelo("Gulaš")]);
    const s = await stavka("Gulaš");
    await expect(demoRpc("storniraj_stavku", { p_konobar: ljudi[uloga].id, p_stavka: s.id, p_razlog: "Drugo" })).rejects.toMatchObject({
      code: "P0001",
      message: "Nemate pravo na ovu radnju.",
    });
  });

  it.each([
    ["an unknown field", { razlog: "Drugo", cijena: 0 }],
    ["a client value", { razlog: "Drugo", vrijednost: 1 }],
    ["a fifth reason", { razlog: "Nešto treće" }],
    ["a lower-case reason", { razlog: "drugo" }],
    ["no reason", {}],
    ["not an object", "Drugo"],
  ])("rejects %s", async (_, tijelo) => {
    await naruci([jelo("Gulaš")]);
    const odgovor = await stornirajOdgovor((await stavka("Gulaš")).id, tijelo);
    expect(odgovor.status).toBe(400);
    expect((await stavka("Gulaš")).stornoRazlog).toBeNull();
  });

  it.each(["abc", "0", "-1", "1.5", ""])("rejects the line id %j", async (s) => {
    expect((await stornirajOdgovor(s, { razlog: "Drugo" })).status).toBe(400);
  });

  it("says when the line does not exist", async () => {
    const odgovor = await stornirajOdgovor(999999, { razlog: "Drugo" });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Stavka nije pronađena." });
  });

  it("re-checks the reason in SQL", async () => {
    await naruci([jelo("Gulaš")]);
    const s = await stavka("Gulaš");
    for (const razlog of ["Nešto treće", null]) {
      await expect(demoRpc("storniraj_stavku", { p_konobar: ljudi.konobar.id, p_stavka: s.id, p_razlog: razlog })).rejects.toMatchObject({
        message: "Izaberite razlog storna.",
      });
    }
  });

  it("holds the bills lock until it commits", async () => {
    await naruci([jelo("Gulaš")]);
    const s = await stavka("Gulaš");
    const brave = await (await demoBaza()).transaction(async (tx) => {
      await tx.query("select public.storniraj_stavku($1, $2, 'Drugo')", [ljudi.konobar.id, s.id]);
      return (
        await tx.query<{ mode: string }>(
          `select mode from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()
           and ((classid::bigint << 32) | objid::bigint) = hashtextextended('racuni', 0)`,
        )
      ).rows;
    });
    expect(brave).toEqual([{ mode: "ExclusiveLock" }]);
  });
});

describe("what a void does to the money", () => {
  it.each(RAZLOZI_STORNA)("accepts the reason %s, zeroes the price and keeps the old value", async (razlog) => {
    await naruci([jelo("Gulaš", 2), jelo("Grah s mesom")]);
    const prije = await racun();
    const gulas = await stavka("Gulaš");
    const r = await storniraj("Gulaš", razlog);

    expect(r.ukupno).toBeCloseTo(prije.ukupno - gulas.iznos, 2);
    const poslije = await stavka("Gulaš");
    expect(poslije).toMatchObject({ cijena: 0, iznos: 0, kolicina: 2, stornoRazlog: razlog, stornoVrijednost: gulas.iznos });
    expect((await stavka("Grah s mesom")).stornoRazlog).toBeNull();
  });

  it("keeps a kg line's exact value, to the fening", async () => {
    await naruci([jelo("Jagnjetina s ražnja", 0.333)]);
    await storniraj(JAGNJETINA);
    // 0,333 kg at 50 KM.
    expect(await stavka(JAGNJETINA)).toMatchObject({ kolicina: 0.333, iznos: 0, stornoVrijednost: 16.65 });
    expect((await racun()).ukupno).toBe(0);
  });

  it("keeps the weighed value when a weighed lamb line is voided", async () => {
    const { pecenjara } = await naruci([jelo(JAGNJETINA, 0.5)]);
    await korak(pecenjara, { status: "U pripremi" }, "pecenjara");
    const s = await stavka(JAGNJETINA);
    await korak(pecenjara, { status: "Gotovo", cijena: 10, tezine: [{ stavkaId: s.id, kg: 0.6 }] }, "pecenjara");
    await storniraj(JAGNJETINA);
    expect(await stavka(JAGNJETINA)).toMatchObject({ kolicina: 0.6, iznos: 0, stornoVrijednost: 30 });
  });

  it("treats a double tap as one void: the first reason stands and one entry is logged", async () => {
    await naruci([jelo("Gulaš")]);
    await storniraj("Gulaš", "Gost odustao");
    await storniraj("Gulaš", "Greška kuhinje");
    expect(await stavka("Gulaš")).toMatchObject({ stornoRazlog: "Gost odustao", stornoVrijednost: 13 });
    expect(await dnevnik()).toHaveLength(1);
  });

  it("takes the dish's sides along, across stations, each keeping its own value", async () => {
    await naruci([jelo("Pljeskavica", 2, ["Pomfrit", "Riža"]), jelo("Coca-Cola 0,25 l")]);
    // Pomfrit is free with Pljeskavica, and Riža is charged at 4 KM a portion.
    const prije = await racun();
    expect(prije.ukupno).toBe(2 * 13 + 2 * 4 + 3.5);

    const r = await storniraj("Pljeskavica", "Greška kuhinje");
    expect(r.ukupno).toBe(3.5);
    expect(await stavka("Pljeskavica")).toMatchObject({ iznos: 0, stornoRazlog: "Greška kuhinje", stornoVrijednost: 26 });
    expect(await stavka("Pomfrit")).toMatchObject({ iznos: 0, stornoRazlog: "Greška kuhinje", stornoVrijednost: 0 });
    expect(await stavka("Riža")).toMatchObject({ iznos: 0, stornoRazlog: "Greška kuhinje", stornoVrijednost: 8 });
    expect((await stavka("Coca-Cola 0,25 l")).stornoRazlog).toBeNull();
  });

  it("voids a side alone and leaves the dish", async () => {
    await naruci([jelo("Pljeskavica", 1, ["Pomfrit", "Riža"])]);
    const r = await storniraj("Riža", "Gost odustao");
    expect(r.ukupno).toBe(13);
    expect((await stavka("Pljeskavica")).stornoRazlog).toBeNull();
    expect((await stavka("Pomfrit")).stornoRazlog).toBeNull();
  });

  it("does not reprice the charged side when the free one is voided", async () => {
    await naruci([jelo("Gulaš", 1, ["Pire krompir", "Riža"])]);
    expect((await storniraj("Pire krompir")).ukupno).toBe(13 + 4);
  });

  it("leaves a side's own earlier void alone when the dish follows", async () => {
    await naruci([jelo("Pljeskavica", 1, ["Pomfrit", "Riža"])]);
    await storniraj("Riža", "Gost odustao");
    await storniraj("Pljeskavica", "Greška kuhinje");
    expect(await stavka("Riža")).toMatchObject({ stornoRazlog: "Gost odustao", stornoVrijednost: 4 });
    const zapisi = await dnevnik();
    expect((zapisi[1].detalji.stavke as { naziv: string }[]).map((s) => s.naziv)).toEqual(["Pljeskavica", "Pomfrit"]);
  });

  it("writes who, what, why and how much to the log", async () => {
    await naruci([jelo("Pljeskavica", 1, ["Riža"])]);
    const r = await racun();
    await storniraj("Pljeskavica", "Drugo");
    const [zapis] = await dnevnik();
    expect(zapis.zaposlenik_id).toBe(ljudi.konobar.id);
    expect(zapis.detalji).toEqual({
      racun: r.id,
      razlog: "Drugo",
      stavke: [
        { stavka: expect.any(Number), naziv: "Pljeskavica", kolicina: 1, vrijednost: 13 },
        { stavka: expect.any(Number), naziv: "Riža", kolicina: 1, vrijednost: 4 },
      ],
    });
  });

  it("allows a void after Izdato, as long as the bill is open", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš"), jelo("Grah s mesom")]);
    await izdaj(kuhinja, "kuhinja");
    const r = await storniraj("Gulaš");
    expect(r.sveIzdato).toBe(true);
    expect((await statusNarudzbe(kuhinja)).status).toBe("Izdato");
    expect((await stavka("Gulaš")).stornoRazlog).toBe("Gost odustao");
  });

  it("works on a line that came from a merged-away bill, and the merged total follows", async () => {
    await naruci([jelo("Gulaš")], 1);
    await naruci([jelo("Coca-Cola 0,25 l")], 2);
    const odgovor = await transfer(
      zahtjev("/api/stolovi/transfer", { tijelo: { radnja: "spoji", stoIz: 2, stoU: 1 }, kolacici: [ljudi.konobar.kolacic] }),
    );
    expect(odgovor.status).toBe(200);
    expect((await storniraj("Coca-Cola 0,25 l", "Drugo", 1)).ukupno).toBe(13);
  });

  it("leaves what the waiter owes the grill alone: the guest's bill and the grill's price are separate", async () => {
    const { pecenjara } = await naruci([jelo("Pljeskavica")]);
    await izdaj(pecenjara, "pecenjara");
    await storniraj("Pljeskavica");
    expect(await statusNarudzbe(pecenjara)).toEqual({ status: "Izdato", cijena: 10 });
  });

  it("is refused once the bill is paid", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await izdaj(kuhinja, "kuhinja");
    const s = await stavka("Gulaš");
    await plati();
    const odgovor = await stornirajOdgovor(s.id, { razlog: "Drugo" });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Račun je zatvoren." });
    expect(await dnevnik()).toEqual([]);
  });
});

describe("the station is told", () => {
  it("marks the voided line on the card, with the reason and no money", async () => {
    await naruci([jelo("Gulaš"), jelo("Grah s mesom")]);
    await storniraj("Gulaš", "Gost odustao");
    const [n] = await red("kuhinja");
    expect(n.stavke.map((s) => [s.naziv, s.stornoRazlog])).toEqual([
      ["Gulaš", "Gost odustao"],
      ["Grah s mesom", null],
    ]);
    expect(n.sljedeci).toBe("U pripremi");
    expect(JSON.stringify(n)).not.toMatch(/cijena|iznos|ukupno|vrijednost/i);
  });

  it("tells the kitchen when the grill dish its side belongs to is voided", async () => {
    await naruci([jelo("Pljeskavica", 1, ["Pomfrit"])]);
    await storniraj("Pljeskavica", "Greška kuhinje");
    expect((await red("kuhinja"))[0].stavke[0]).toMatchObject({ naziv: "Pomfrit", stornoRazlog: "Greška kuhinje" });
    expect((await red("pecenjara"))[0].stavke[0]).toMatchObject({ naziv: "Pljeskavica", stornoRazlog: "Greška kuhinje" });
  });
});

describe("a voided lamb line needs no weight", () => {
  async function dvijeJagnjetine() {
    const { pecenjara } = await naruci([jelo(JAGNJETINA, 0.5), jelo(JAGNJETINA, 0.7)]);
    const linije = (await racun()).narudzbe.flatMap((n) => n.stavke);
    await stornirajOdgovor(linije[0].id, { razlog: "Gost odustao" });
    await korak(pecenjara, { status: "U pripremi" }, "pecenjara");
    return { pecenjara, stornirana: linije[0].id, ziva: linije[1].id };
  }

  it("stops asking for it on the card", async () => {
    const { stornirana, ziva } = await dvijeJagnjetine();
    const [n] = await red("pecenjara");
    expect(n.stavke.map((s) => [s.id, s.trebaTezinu])).toEqual([
      [stornirana, false],
      [ziva, true],
    ]);
  });

  it("weighs only the live line and still bills it", async () => {
    const { pecenjara, ziva } = await dvijeJagnjetine();
    await korak(pecenjara, { status: "Gotovo", cijena: 10, tezine: [{ stavkaId: ziva, kg: 0.8 }] }, "pecenjara");
    expect((await racun()).ukupno).toBe(40);
  });

  it("refuses a weight on the voided line", async () => {
    const { pecenjara, stornirana, ziva } = await dvijeJagnjetine();
    const odgovor = await pomjeri(
      pecenjara,
      { status: "Gotovo", cijena: 10, tezine: [{ stavkaId: ziva, kg: 0.8 }, { stavkaId: stornirana, kg: 0.5 }] },
      "pecenjara",
    );
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Stvarna količina se upisuje samo na jagnjetinu iz ove narudžbe, jednom po stavci." });
    expect((await racun()).narudzbe[0].stavke[0]).toMatchObject({ kolicina: 0.5, stornoVrijednost: 25 });
  });

  it("still needs the live line's weight and the grill's price", async () => {
    const { pecenjara } = await dvijeJagnjetine();
    expect((await pomjeri(pecenjara, { status: "Gotovo", cijena: 10, tezine: [] }, "pecenjara")).status).toBe(422);
    expect((await pomjeri(pecenjara, { status: "Gotovo", tezine: [] }, "pecenjara")).status).toBe(422);
  });
});

describe("a fully voided order", () => {
  it.each<[Stanica, string, string[]]>([
    ["kuhinja", "Gulaš", []],
    ["kuhinja", "Gulaš", ["U pripremi"]],
    ["kuhinja", "Gulaš", ["U pripremi", "Gotovo"]],
    ["sank", "Coca-Cola 0,25 l", []],
    ["pecenjara", "Pljeskavica", []],
    ["pecenjara", "Pljeskavica", ["U pripremi"]],
    ["pecenjara", JAGNJETINA, ["U pripremi"]],
  ])("at %s, %s after %j: one tap to Izdato, with no price or weight", async (stanica, naziv, koraci) => {
    const kolicina = naziv === JAGNJETINA ? 0.5 : 1;
    const narudzbe = await naruci([jelo(naziv, kolicina)]);
    const narudzba = narudzbe[stanica];
    for (const status of koraci) {
      await korak(narudzba, status === "Gotovo" && stanica === "pecenjara" ? { status, cijena: 1, tezine: [] } : { status }, stanica);
    }
    await storniraj(naziv);

    const [n] = await red(stanica);
    expect(n).toMatchObject({ id: narudzba, sljedeci: "Izdato" });
    expect(n.stavke.every((s) => s.stornoRazlog !== null)).toBe(true);
    expect(n.stavke.some((s) => s.trebaTezinu)).toBe(false);

    expect(await korak(narudzba, { status: "Izdato" }, stanica)).toEqual({ id: narudzba, status: "Izdato", sljedeci: null });
    expect(await statusNarudzbe(narudzba)).toEqual({ status: "Izdato", cijena: null });
    expect(await red(stanica)).toEqual([]);
  });

  it("settles a double tap on the clearing move", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await storniraj("Gulaš");
    await korak(kuhinja, { status: "Izdato" }, "kuhinja");
    expect((await korak(kuhinja, { status: "Izdato" }, "kuhinja")).status).toBe("Izdato");
  });

  it.each([
    ["U pripremi", { status: "U pripremi" }],
    ["Gotovo with a price", { status: "Gotovo", cijena: 10, tezine: [] }],
  ])("refuses a normal step from a stale screen: %s", async (_, tijelo) => {
    const { pecenjara } = await naruci([jelo("Pljeskavica")]);
    await storniraj("Pljeskavica");
    const odgovor = await pomjeri(pecenjara, tijelo, "pecenjara");
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Sve stavke ove narudžbe su stornirane. Samo je sklonite s reda." });
    expect(await statusNarudzbe(pecenjara)).toEqual({ status: "Novo", cijena: null });
  });

  it("still takes the right station to clear it", async () => {
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await storniraj("Gulaš");
    const odgovor = await pomjeri(kuhinja, { status: "Izdato" }, "pecenjara");
    expect(odgovor.status).toBe(422);
    expect((await statusNarudzbe(kuhinja)).status).toBe("Novo");
  });

  it("notifies no waiter when cleared, and the cursor still moves on", async () => {
    const { kursor } = await obavijesti(null);
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await storniraj("Gulaš");
    await korak(kuhinja, { status: "Izdato" }, "kuhinja");
    const odgovor = await obavijesti(kursor);
    expect(odgovor.obavijesti).toEqual([]);
    expect(odgovor.kursor).toBeGreaterThan(kursor);
  });

  it("does not notify when voided after it was issued but before the poll", async () => {
    const { kursor } = await obavijesti(null);
    const { kuhinja } = await naruci([jelo("Gulaš")]);
    await izdaj(kuhinja, "kuhinja");
    await storniraj("Gulaš");
    expect((await obavijesti(kursor)).obavijesti).toEqual([]);
  });

  it("does not block payment while it waits to be cleared, and payment files it without a notification", async () => {
    const { kursor } = await obavijesti(null);
    const { kuhinja, sank } = await naruci([jelo("Gulaš"), jelo("Coca-Cola 0,25 l")]);
    await izdaj(sank, "sank");
    expect((await racun()).sveIzdato).toBe(false);

    await storniraj("Gulaš");
    expect((await racun()).sveIzdato).toBe(true);
    await plati();

    expect((await statusNarudzbe(kuhinja)).status).toBe("Izdato");
    expect(await red("kuhinja")).toEqual([]);
    expect((await obavijesti(kursor)).obavijesti.map((o) => o.id)).toEqual([sank]);
    const { rows } = await (await demoBaza()).query<{ zaposlenik_id: string }>(
      "select zaposlenik_id from public.statusi_narudzbe where narudzba_id = $1 and status = 'Izdato'",
      [kuhinja],
    );
    expect(rows).toEqual([{ zaposlenik_id: ljudi.konobar.id }]);
  });

  it("blocks payment when only part of the order is voided", async () => {
    await naruci([jelo("Gulaš"), jelo("Grah s mesom")]);
    expect((await storniraj("Gulaš")).sveIzdato).toBe(false);
  });
});

describe("a partly voided order", () => {
  it("names only the live lines in the waiter's notification", async () => {
    const { kursor } = await obavijesti(null);
    const { kuhinja } = await naruci([jelo("Gulaš"), jelo("Grah s mesom")]);
    await storniraj("Gulaš");
    await izdaj(kuhinja, "kuhinja");
    const { obavijesti: o } = await obavijesti(kursor);
    expect(o.map((x) => x.stavke.map((s) => s.naziv))).toEqual([["Grah s mesom"]]);
  });
});
