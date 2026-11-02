import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as racunStola } from "@/app/api/racuni/sto/[stoId]/route";
import { POST as narudzba } from "@/app/api/narudzbe/route";
import { KOLACIC_UREDJAJA } from "@/lib/auth/pinOgranicenje";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { ocisti, osoblje, PIN_KONOBARA, PIN_SEFICE, pripremiOkruzenje, postaviPin, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type Stavka = {
  id: number;
  naziv: string;
  jedinica: string;
  kolicina: number;
  cijena: number;
  iznos: number;
  napomena: string | null;
  prilogUz: number | null;
  poseban: boolean;
};
type Racun = { id: string; ukupno: number; narudzbe: { id: string; stanica: string; status: string; stavke: Stavka[] }[] };

let ljudi: Record<Uloga, Osoba>;
let id: Record<string, string>;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
  id = await proizvodi();
  await postaviPin(ljudi.sefica.id, PIN_SEFICE);
  await postaviPin(ljudi.konobar.id, PIN_KONOBARA);
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => ocisti());

function posalji(tijelo: Record<string, unknown>, opcije: { kolacici?: (string | null)[]; ip?: string; sto?: number } = {}) {
  return narudzba(
    zahtjev("/api/narudzbe", {
      tijelo: { requestId: randomUUID(), stoId: opcije.sto ?? 1, ...tijelo },
      kolacici: [ljudi.konobar.kolacic, ...(opcije.kolacici ?? [])],
      ip: opcije.ip,
    }),
  );
}

async function racun(sto = 1) {
  const odgovor = await racunStola(zahtjev(`/api/racuni/sto/${sto}`, { kolacici: [ljudi.konobar.kolacic] }), {
    params: Promise.resolve({ stoId: String(sto) }),
  });
  return ((await odgovor.json()) as { racun: Racun | null }).racun;
}

async function broj(tabela: "narudzbe" | "racuni" | "stavke_narudzbe") {
  const { rows } = await (await demoBaza()).query<{ n: number }>(`select count(*)::int as n from public.${tabela}`);
  return rows[0].n;
}

async function radnje() {
  const { rows } = await (await demoBaza()).query<{ radnja: string; zaposlenik_id: string; detalji: Record<string, unknown> }>(
    "select radnja, zaposlenik_id, detalji from public.dnevnik_radnji order by id",
  );
  return rows;
}

// A dish with sides, sent through the real route, returned as the bill's rows.
async function saPrilozima(jelo: string, kolicina: number, prilozi: (string | { naziv: string; poseban: boolean })[]) {
  const odgovor = await posalji({
    stavke: [
      {
        proizvodId: id[jelo],
        kolicina,
        prilozi: prilozi.map((p) =>
          typeof p === "string" ? { proizvodId: id[p] } : { proizvodId: id[p.naziv], poseban: p.poseban },
        ),
      },
    ],
    posebanPin: prilozi.some((p) => typeof p !== "string") ? PIN_SEFICE : undefined,
  });
  expect(odgovor.status).toBe(201);
  const r = (await racun())!;
  const stavke = r.narudzbe.flatMap((n) => n.stavke);
  return {
    ukupno: r.ukupno,
    jelo: stavke.find((s) => s.prilogUz === null)!,
    prilozi: stavke.filter((s) => s.prilogUz !== null),
  };
}

describe("POST /api/narudzbe: who may send", () => {
  const tijelo = () => ({ requestId: randomUUID(), stoId: 1, stavke: [{ proizvodId: id["Gulaš"], kolicina: 1 }] });

  it("requires a session", async () => {
    expect((await narudzba(zahtjev("/api/narudzbe", { tijelo: tijelo() }))).status).toBe(401);
  });

  it.each(["kuhinja", "pecenjara", "mesnica", "sefica"] as const)("refuses %s", async (uloga) => {
    const odgovor = await narudzba(zahtjev("/api/narudzbe", { tijelo: tijelo(), kolacici: [ljudi[uloga].kolacic] }));
    expect(odgovor.status).toBe(403);
    expect(await broj("narudzbe")).toBe(0);
  });

  it("re-checks the role and active state in SQL", async () => {
    const poziv = (konobar: string) =>
      demoRpc("posalji_narudzbu", {
        p_konobar: konobar,
        p_request_id: randomUUID(),
        p_sto: 1,
        p_stavke: tijelo().stavke,
        p_poseban_pin: null,
        p_uredjaj: null,
        p_ip: null,
      });
    await expect(poziv(ljudi.kuhinja.id)).rejects.toMatchObject({ code: "P0001" });

    const db = await demoBaza();
    await db.query("update public.zaposlenici set aktivan = false where id = $1", [ljudi.konobar.id]);
    await expect(poziv(ljudi.konobar.id)).rejects.toMatchObject({ code: "P0001" });
    await db.query("update public.zaposlenici set aktivan = true where id = $1", [ljudi.konobar.id]);
  });
});

describe("POST /api/narudzbe: what the schema accepts", () => {
  const dobra = () => ({ proizvodId: id["Gulaš"], kolicina: 1 });

  it.each<[string, () => Record<string, unknown>]>([
    ["a price on the order", () => ({ stavke: [dobra()], ukupno: 1 })],
    ["a price on an item", () => ({ stavke: [{ ...dobra(), cijena: 0.01 }] })],
    ["a price on a side", () => ({ stavke: [{ ...dobra(), prilozi: [{ proizvodId: id["Riža"], cijena: 0 }] }] })],
    ["a client claim that a side is free", () => ({ stavke: [{ ...dobra(), prilozi: [{ proizvodId: id["Riža"], standard: true }] }] })],
    ["no items", () => ({ stavke: [] })],
    ["101 items", () => ({ stavke: Array.from({ length: 101 }, dobra) })],
    ["5 sides", () => ({ stavke: [{ ...dobra(), prilozi: Array.from({ length: 5 }, () => ({ proizvodId: id["Riža"] })) }] })],
    ["a zero quantity", () => ({ stavke: [{ ...dobra(), kolicina: 0 }] })],
    ["a negative quantity", () => ({ stavke: [{ ...dobra(), kolicina: -1 }] })],
    ["a quantity over the limit", () => ({ stavke: [{ ...dobra(), kolicina: 201 }] })],
    ["a quantity as text", () => ({ stavke: [{ ...dobra(), kolicina: "1" }] })],
    ["a bad product id", () => ({ stavke: [{ ...dobra(), proizvodId: "1" }] })],
    ["a table out of range", () => ({ stavke: [dobra()], stoId: 21 })],
    ["table 0", () => ({ stavke: [dobra()], stoId: 0 })],
    ["a bad request id", () => ({ stavke: [dobra()], requestId: "1" })],
    ["a badly formed PIN", () => ({ stavke: [dobra()], posebanPin: "abc" })],
    ["a long note", () => ({ stavke: [{ ...dobra(), napomena: "x".repeat(501) }] })],
  ])("rejects %s with 400", async (_opis, tijelo) => {
    expect((await posalji(tijelo())).status).toBe(400);
    expect(await broj("narudzbe")).toBe(0);
  });

  it("validates again in SQL when the route is bypassed", async () => {
    const poziv = (stavke: unknown) =>
      demoRpc("posalji_narudzbu", {
        p_konobar: ljudi.konobar.id,
        p_request_id: randomUUID(),
        p_sto: 1,
        p_stavke: stavke,
        p_poseban_pin: null,
        p_uredjaj: null,
        p_ip: null,
      });
    await expect(poziv([])).rejects.toMatchObject({ code: "P0001" });
    await expect(poziv({})).rejects.toMatchObject({ code: "P0001" });
    await expect(poziv(Array.from({ length: 101 }, dobra))).rejects.toMatchObject({ code: "P0001" });
    await expect(
      poziv([{ ...dobra(), prilozi: Array.from({ length: 5 }, () => ({ proizvodId: id["Riža"] })) }]),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(poziv([{ ...dobra(), napomena: "x".repeat(501) }])).rejects.toMatchObject({ code: "P0001" });
  });
});

describe("POST /api/narudzbe: orders and bills", () => {
  it("opens one bill and stores the price at the time of ordering", async () => {
    const odgovor = await posalji({ stavke: [{ proizvodId: id["Gulaš"], kolicina: 2, napomena: "  bez luka  " }] });
    expect(odgovor.status).toBe(201);
    const tijelo = (await odgovor.json()) as { racunId: string; narudzbe: { id: string; stanica: string }[] };
    expect(tijelo.narudzbe.map((n) => n.stanica)).toEqual(["kuhinja"]);

    const r = (await racun())!;
    expect(r.id).toBe(tijelo.racunId);
    expect(r.ukupno).toBe(26);
    expect(r.narudzbe[0].status).toBe("Novo");
    expect(r.narudzbe[0].stavke[0]).toMatchObject({
      naziv: "Gulaš",
      jedinica: "porcija",
      kolicina: 2,
      cijena: 13,
      iznos: 26,
      napomena: "bez luka",
      prilogUz: null,
      poseban: false,
    });

    await (await demoBaza()).exec("update public.proizvodi set cijena = 99 where naziv = 'Gulaš'");
    const nakon = (await racun())!;
    await (await demoBaza()).exec("update public.proizvodi set cijena = 13 where naziv = 'Gulaš'");
    expect(nakon.ukupno).toBe(26);
  });

  it("creates one order per station", async () => {
    const odgovor = await posalji({
      stavke: [
        { proizvodId: id["Gulaš"], kolicina: 1 },
        { proizvodId: id["Grah s mesom"], kolicina: 1 },
        { proizvodId: id["Pljeskavica"], kolicina: 1 },
        { proizvodId: id["Coca-Cola 0,25 l"], kolicina: 2 },
      ],
    });
    const { narudzbe } = (await odgovor.json()) as { narudzbe: { stanica: string }[] };
    expect(narudzbe.map((n) => n.stanica)).toEqual(["kuhinja", "pecenjara", "sank"]);

    const r = (await racun())!;
    expect(r.narudzbe.map((n) => [n.stanica, n.stavke.length]).sort()).toEqual([
      ["kuhinja", 2],
      ["pecenjara", 1],
      ["sank", 1],
    ]);
    expect(await broj("racuni")).toBe(1);
  });

  it("sends a side to its own station, so a grill dish with a side makes two orders", async () => {
    const odgovor = await posalji({
      stavke: [{ proizvodId: id["Pljeskavica"], kolicina: 1, prilozi: [{ proizvodId: id["Pomfrit"] }] }],
    });
    const { narudzbe } = (await odgovor.json()) as { narudzbe: { stanica: string }[] };
    expect(narudzbe.map((n) => n.stanica)).toEqual(["kuhinja", "pecenjara"]);
  });

  it("adds to the open bill, with new orders", async () => {
    const prva = (await (await posalji({ stavke: [{ proizvodId: id["Gulaš"], kolicina: 1 }] })).json()) as { racunId: string };
    const druga = (await (await posalji({ stavke: [{ proizvodId: id["Grah s mesom"], kolicina: 1 }] })).json()) as {
      racunId: string;
    };
    expect(druga.racunId).toBe(prva.racunId);
    expect(await broj("racuni")).toBe(1);
    expect(await broj("narudzbe")).toBe(2);
    expect((await racun())!.ukupno).toBe(21);
  });

  it("keeps separate bills per table", async () => {
    await posalji({ stavke: [{ proizvodId: id["Gulaš"], kolicina: 1 }] });
    await posalji({ stavke: [{ proizvodId: id["Grah s mesom"], kolicina: 1 }] }, { sto: 2 });
    expect(await broj("racuni")).toBe(2);
    expect((await racun(2))!.ukupno).toBe(8);
  });

  it("allows the same dish twice with different sides", async () => {
    await posalji({
      stavke: [
        { proizvodId: id["Gulaš"], kolicina: 1, prilozi: [{ proizvodId: id["Riža"] }] },
        { proizvodId: id["Gulaš"], kolicina: 1, prilozi: [{ proizvodId: id["Makaroni"] }] },
      ],
    });
    const stavke = (await racun())!.narudzbe.flatMap((n) => n.stavke);
    expect(stavke.map((s) => s.naziv)).toEqual(["Gulaš", "Riža", "Gulaš", "Makaroni"]);
    expect(stavke[1].prilogUz).toBe(stavke[0].id);
    expect(stavke[3].prilogUz).toBe(stavke[2].id);
  });

  it("rejects an unknown product in clear Bosnian, and writes nothing", async () => {
    const odgovor = await posalji({
      stavke: [
        { proizvodId: id["Gulaš"], kolicina: 1 },
        { proizvodId: randomUUID(), kolicina: 1 },
      ],
    });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Proizvod ne postoji. Osvježite meni." });
    expect(await broj("racuni")).toBe(0);
    expect(await broj("narudzbe")).toBe(0);
  });

  it("rejects an inactive product by name, and writes nothing", async () => {
    await (await demoBaza()).exec("update public.proizvodi set aktivan = false where naziv = 'Gulaš'");
    const odgovor = await posalji({ stavke: [{ proizvodId: id["Grah s mesom"], kolicina: 1 }, { proizvodId: id["Gulaš"], kolicina: 1 }] });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Proizvod „Gulaš“ trenutno nije dostupan." });
    expect(await broj("stavke_narudzbe")).toBe(0);
  });
});

describe("POST /api/narudzbe: quantities", () => {
  it("allows decimals for kg and works out the money in fenings", async () => {
    await posalji({ stavke: [{ proizvodId: id["Teletina ispod sača"], kolicina: 0.333 }] });
    const stavka = (await racun())!.narudzbe[0].stavke[0];
    expect(stavka.kolicina).toBe(0.333);
    expect(stavka.iznos).toBe(18.32); // 18.315 rounds up
    expect((await racun())!.ukupno).toBe(18.32);
  });

  it.each([
    ["Jagnjetina s ražnja", 0.0005],
    ["Jagnjetina s ražnja", 1.2345],
    ["Jagnjetina s ražnja", 100.5],
    ["Gulaš", 1.5],
    ["Pečeno pile", 0.5],
    ["Točeno pivo 1 l", 0.5],
  ])("rejects %s x %d with a clear message", async (naziv, kolicina) => {
    const odgovor = await posalji({ stavke: [{ proizvodId: id[naziv], kolicina }] });
    expect(odgovor.status).toBe(422);
    expect(((await odgovor.json()) as { greska: string }).greska).toContain(`Količina za „${naziv}“`);
  });

  it.each([
    ["Jagnjetina s ražnja", 100],
    ["Gulaš", 200],
    ["Točeno pivo 1 l", 3],
  ])("accepts %s x %d", async (naziv, kolicina) => {
    expect((await posalji({ stavke: [{ proizvodId: id[naziv], kolicina }] })).status).toBe(201);
  });
});

describe("POST /api/narudzbe: idempotency", () => {
  const tijelo = () => ({
    requestId: randomUUID(),
    stoId: 1,
    stavke: [
      { proizvodId: id["Gulaš"], kolicina: 1 },
      { proizvodId: id["Coca-Cola 0,25 l"], kolicina: 1 },
    ],
  });
  const salji = (t: unknown) => narudzba(zahtjev("/api/narudzbe", { tijelo: t, kolacici: [ljudi.konobar.kolacic] }));

  it("returns the same result for a retry and creates nothing", async () => {
    const t = tijelo();
    const prvi = await salji(t);
    const drugi = await salji(t);
    expect(prvi.status).toBe(201);
    expect(drugi.status).toBe(201);
    expect(await drugi.json()).toEqual(await prvi.json());
    expect(await broj("racuni")).toBe(1);
    expect(await broj("narudzbe")).toBe(2);
    expect(await broj("stavke_narudzbe")).toBe(2);
  });

  it("holds for parallel retries", async () => {
    const t = tijelo();
    const odgovori = await Promise.all(Array.from({ length: 5 }, () => salji(t)));
    const tijela = await Promise.all(odgovori.map((o) => o.json()));
    expect(odgovori.every((o) => o.status === 201)).toBe(true);
    for (const r of tijela) expect(r).toEqual(tijela[0]);
    expect(await broj("racuni")).toBe(1);
    expect(await broj("narudzbe")).toBe(2);
    expect(await broj("stavke_narudzbe")).toBe(2);
  });

  it("treats a new requestId as a new order", async () => {
    await salji(tijelo());
    await salji(tijelo());
    expect(await broj("narudzbe")).toBe(4);
    expect(await broj("racuni")).toBe(1);
  });

  it("has a unique index behind the lock", async () => {
    await salji(tijelo());
    await expect(
      (await demoBaza()).exec(
        "insert into public.narudzbe (racun_id, request_id, stanica, konobar_id) select racun_id, request_id, stanica, konobar_id from public.narudzbe limit 1",
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("does not spend a PIN attempt on a retry of a saved order", async () => {
    const t = {
      ...tijelo(),
      stavke: [{ proizvodId: id["Gulaš"], kolicina: 1, prilozi: [{ proizvodId: id["Riža"], poseban: true }] }],
      posebanPin: PIN_SEFICE,
    };
    await salji(t);
    const ponovo = await salji({ ...t, posebanPin: "9999" });
    expect(ponovo.status).toBe(201);
    expect(await broj("stavke_narudzbe")).toBe(2);
    expect((await (await demoBaza()).query("select 1 from public.pin_pokusaji")).rows).toEqual([]);
  });
});

describe("sides: the free rule, every branch", () => {
  it.each([
    // jela-po-narudzbi and piletina: Pomfrit, except Mućkalica
    ["Natur šnicla", "Pomfrit", true],
    ["Natur šnicla", "Riža", false],
    ["Mućkalica", "Pomfrit", false],
    ["Pileći file sa žara", "Pomfrit", true],
    ["Pileći file sa žara", "Pekarski krompir", false],
    // kuhana-jela: Lešo teletina and Gulaš have their own, the rest nothing
    ["Lešo teletina", "Miješano povrće", true],
    ["Lešo teletina", "Pomfrit", false],
    ["Gulaš", "Pire krompir", true],
    ["Gulaš", "Riža", true],
    ["Gulaš", "Makaroni", true],
    ["Gulaš", "Pomfrit", false],
    ["Grah s mesom", "Pomfrit", false],
    ["Sitni ćevap", "Pomfrit", false],
    // riba
    ["Pastrmka sa žara", "Pomfrit", true],
    ["Kuhana pastrmka", "Krompir salata", true],
    ["Pastrmka sa žara", "Riža", false],
    // pecenja: only Teletina ispod sača
    ["Teletina ispod sača", "Pekarski krompir", true],
    ["Teletina ispod sača", "Pomfrit", true],
    ["Teletina ispod sača", "Riža", false],
    ["Porcija pečene teletine", "Pomfrit", false],
    ["Jagnjetina s ražnja", "Pomfrit", false],
    // rostilj: Pomfrit, except ćevapi and sudžukice
    ["Pljeskavica", "Pomfrit", true],
    ["Pljeskavica", "Pire krompir", false],
    ["Ćevapi – mala porcija", "Pomfrit", false],
    ["Sudžukice – male", "Pomfrit", false],
    ["Kombinacija: 5 ćevapa + 3 sudžukice", "Pomfrit", false],
    // everything else
    ["Goveđa pečenica", "Pomfrit", false],
    ["Hurmašica", "Pomfrit", false],
  ])("%s with %s: free is %s", async (jelo, prilog, besplatan) => {
    const { prilozi } = await saPrilozima(jelo, 1, [prilog]);
    const { rows } = await (await demoBaza()).query<{ cijena: number }>(
      "select cijena::float8 as cijena from public.proizvodi where naziv = $1",
      [prilog],
    );
    expect(prilozi).toHaveLength(1);
    expect(prilozi[0].naziv).toBe(prilog);
    expect(prilozi[0].cijena).toBe(besplatan ? 0 : rows[0].cijena);
    expect(prilozi[0].poseban).toBe(false);
  });

  it("charges a paid side per dish, on top of the dish", async () => {
    const { ukupno, jelo, prilozi } = await saPrilozima("Grah s mesom", 3, ["Pomfrit"]);
    expect(jelo.iznos).toBe(24);
    expect(prilozi[0]).toMatchObject({ kolicina: 3, cijena: 4, iznos: 12 });
    expect(ukupno).toBe(36);
  });

  it("gives a free side the dish's quantity at no charge", async () => {
    const { ukupno, prilozi } = await saPrilozima("Gulaš", 2, ["Riža"]);
    expect(prilozi[0]).toMatchObject({ kolicina: 2, cijena: 0, iznos: 0 });
    expect(ukupno).toBe(26);
  });

  it("gives a dish sold by kg one free side portion, whatever the weight", async () => {
    const { ukupno, prilozi } = await saPrilozima("Teletina ispod sača", 2.5, ["Pekarski krompir"]);
    expect(prilozi[0]).toMatchObject({ kolicina: 1, cijena: 0, iznos: 0 });
    expect(ukupno).toBe(137.5);
  });

  it("charges one portion of a paid side with a dish sold by kg", async () => {
    const { ukupno, prilozi } = await saPrilozima("Jagnjetina s ražnja", 0.3, ["Pomfrit"]);
    expect(prilozi[0]).toMatchObject({ kolicina: 1, cijena: 4, iznos: 4 });
    expect(ukupno).toBe(19);
  });

  it("gives only the first of several free-list sides for free", async () => {
    const { prilozi } = await saPrilozima("Gulaš", 1, ["Riža", "Makaroni", "Kečap"]);
    expect(prilozi.map((p) => [p.naziv, p.cijena])).toEqual([
      ["Riža", 0],
      ["Makaroni", 3],
      ["Kečap", 1],
    ]);
  });

  it.each([
    ["the same side twice", "Gulaš", ["Riža", "Riža"], "Isti prilog je izabran više puta."],
    ["a product that is not a side", "Gulaš", ["Coca-Cola 0,25 l"], "Odabrani prilog ne postoji."],
    ["a salad other than potato", "Gulaš", ["Šopska salata"], "Odabrani prilog ne postoji."],
    ["a side with a drink", "Coca-Cola 0,25 l", ["Pomfrit"], "Uz piće se ne bira prilog."],
  ])("rejects %s", async (_opis, jelo, prilozi, poruka) => {
    const odgovor = await posalji({
      stavke: [{ proizvodId: id[jelo], kolicina: 1, prilozi: prilozi.map((p) => ({ proizvodId: id[p] })) }],
    });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: poruka });
    expect(await broj("narudzbe")).toBe(0);
  });

  it("rejects an inactive side by name", async () => {
    await (await demoBaza()).exec("update public.proizvodi set aktivan = false where naziv = 'Riža'");
    const odgovor = await posalji({ stavke: [{ proizvodId: id["Gulaš"], kolicina: 1, prilozi: [{ proizvodId: id["Riža"] }] }] });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Prilog „Riža“ trenutno nije dostupan." });
  });
});

describe("sides: the special side PIN", () => {
  const stavke = () => [{ proizvodId: id["Gulaš"], kolicina: 1, prilozi: [{ proizvodId: id["Riža"], poseban: true }] }];

  it("accepts the manager's PIN, charges menu price, marks the side and logs who approved", async () => {
    const odgovor = await posalji({ stavke: stavke(), posebanPin: PIN_SEFICE });
    expect(odgovor.status).toBe(201);

    const r = (await racun())!;
    const prilog = r.narudzbe[0].stavke[1];
    expect(prilog).toMatchObject({ naziv: "Riža", cijena: 4, poseban: true });
    expect(r.ukupno).toBe(17);

    const zapis = (await radnje()).find((z) => z.radnja === "poseban_prilog")!;
    expect(zapis.zaposlenik_id).toBe(ljudi.konobar.id);
    expect(zapis.detalji).toEqual({ racun: r.id, sto: 1, odobrila: ljudi.sefica.id, prilozi: ["Riža"] });
    expect(JSON.stringify(await radnje())).not.toContain(PIN_SEFICE);
  });

  it("clears only the device counter on success", async () => {
    const pogresan = await posalji({ stavke: stavke(), posebanPin: "9999" });
    const uredjaj = pogresan.headers.getSetCookie().find((k) => k.startsWith(`${KOLACIC_UREDJAJA}=`))!.split(";")[0];
    await posalji({ stavke: stavke(), posebanPin: PIN_SEFICE }, { kolacici: [uredjaj] });
    const { rows } = await (await demoBaza()).query<{ kljuc: string }>("select kljuc from public.pin_pokusaji order by kljuc");
    expect(rows.map((r) => r.kljuc.split(":")[0])).toEqual(["globalno", "ip"]);
  });

  it("refuses a wrong PIN, writes nothing but the attempt and the log", async () => {
    const odgovor = await posalji({ stavke: stavke(), posebanPin: "9999" });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "PIN šefice nije ispravan." });
    expect(await broj("racuni")).toBe(0);
    expect(await broj("narudzbe")).toBe(0);
    expect(await broj("stavke_narudzbe")).toBe(0);

    const { rows } = await (await demoBaza()).query<{ pogresni: number; kljuc: string }>(
      "select kljuc, pogresni from public.pin_pokusaji",
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.pogresni === 1)).toBe(true);
    expect((await radnje()).map((z) => z.radnja)).toEqual(["poseban_prilog_odbijen"]);
  });

  it("refuses a waiter's PIN, even the sender's own", async () => {
    const odgovor = await posalji({ stavke: stavke(), posebanPin: PIN_KONOBARA });
    expect(odgovor.status).toBe(422);
    expect(await broj("narudzbe")).toBe(0);
  });

  it("refuses the PIN of a deactivated manager", async () => {
    const db = await demoBaza();
    await db.query("update public.zaposlenici set aktivan = false where id = $1", [ljudi.sefica.id]);
    const odgovor = await posalji({ stavke: stavke(), posebanPin: PIN_SEFICE });
    await db.query("update public.zaposlenici set aktivan = true where id = $1", [ljudi.sefica.id]);
    expect(odgovor.status).toBe(422);
  });

  it("asks for the PIN when it is missing, without counting an attempt", async () => {
    const odgovor = await posalji({ stavke: stavke() });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Za poseban prilog unesite PIN šefice." });
    expect((await (await demoBaza()).query("select 1 from public.pin_pokusaji")).rows).toEqual([]);
  });

  it("does not check a PIN for an order with no special side", async () => {
    const odgovor = await posalji({ stavke: [{ proizvodId: id["Gulaš"], kolicina: 1 }], posebanPin: "9999" });
    expect(odgovor.status).toBe(201);
    expect((await (await demoBaza()).query("select 1 from public.pin_pokusaji")).rows).toEqual([]);
  });

  it("lets the same requestId go through after a wrong PIN", async () => {
    const requestId = randomUUID();
    expect((await posalji({ requestId, stavke: stavke(), posebanPin: "9999" })).status).toBe(422);
    expect((await posalji({ requestId, stavke: stavke(), posebanPin: PIN_SEFICE })).status).toBe(201);
    expect(await broj("stavke_narudzbe")).toBe(2);
  });

  it("locks the device after 5 wrong PINs, through the login's lockout", async () => {
    let uredjaj: string | null = null;
    for (let i = 1; i <= 4; i++) {
      const odgovor = await posalji({ stavke: stavke(), posebanPin: "9999" }, { kolacici: [uredjaj] });
      expect(odgovor.status).toBe(422);
      uredjaj ??= odgovor.headers.getSetCookie().find((k) => k.startsWith(`${KOLACIC_UREDJAJA}=`))!.split(";")[0];
    }

    const peti = await posalji({ stavke: stavke(), posebanPin: "9999" }, { kolacici: [uredjaj] });
    expect(peti.status).toBe(429);
    expect(Number(peti.headers.get("Retry-After"))).toBeGreaterThan(290);
    expect(((await peti.json()) as { greska: string }).greska).toMatch(/Previše pogrešnih pokušaja/);

    // Even the right PIN waits, an order without a PIN still goes, and another device is unaffected.
    const tacan = await posalji({ stavke: stavke(), posebanPin: PIN_SEFICE }, { kolacici: [uredjaj] });
    expect(tacan.status).toBe(429);
    expect(await broj("narudzbe")).toBe(0);
    expect((await posalji({ stavke: [{ proizvodId: id["Gulaš"], kolicina: 1 }] }, { kolacici: [uredjaj] })).status).toBe(201);
    expect((await posalji({ stavke: stavke(), posebanPin: PIN_SEFICE }, { ip: "10.0.0.2" })).status).toBe(201);
  }, 30_000);
});
