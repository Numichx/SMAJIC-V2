import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as narudzba } from "@/app/api/narudzbe/route";
import { GET as racunStola } from "@/app/api/racuni/sto/[stoId]/route";
import { GET as stolovi } from "@/app/api/stolovi/route";
import { POST as transfer } from "@/app/api/stolovi/transfer/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { ocisti, osoblje, pripremiOkruzenje, proizvodi, zahtjev, type Osoba } from "./pomocnici";

type Sazetak = { id: string; broj: number; otvoren: string; konobar: string; stolovi: number[]; ukupno: number; sveIzdato: boolean };
type Sto = { id: number; racun: Sazetak | null };

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

async function naruci(sto: number, naziv = "Gulaš") {
  const odgovor = await narudzba(
    zahtjev("/api/narudzbe", {
      tijelo: { requestId: randomUUID(), stoId: sto, stavke: [{ proizvodId: id[naziv], kolicina: 1 }] },
      kolacici: [ljudi.konobar.kolacic],
    }),
  );
  expect(odgovor.status).toBe(201);
  return ((await odgovor.json()) as { racunId: string }).racunId;
}

async function lista() {
  const odgovor = await stolovi(zahtjev("/api/stolovi", { kolacici: [ljudi.konobar.kolacic] }));
  expect(odgovor.status).toBe(200);
  return ((await odgovor.json()) as { stolovi: Sto[] }).stolovi;
}

function racunOdgovor(sto: string | number, kolacic: string | undefined = ljudi.konobar.kolacic) {
  return racunStola(zahtjev(`/api/racuni/sto/${sto}`, { kolacici: [kolacic] }), {
    params: Promise.resolve({ stoId: String(sto) }),
  });
}

async function racun(sto: number) {
  return ((await (await racunOdgovor(sto)).json()) as { racun: (Sazetak & { narudzbe: { stavke: { naziv: string }[] }[] }) | null }).racun;
}

function premjesti(radnja: string, stoIz: number, stoU: number, kolacic: string | undefined = ljudi.konobar.kolacic) {
  return transfer(zahtjev("/api/stolovi/transfer", { tijelo: { radnja, stoIz, stoU }, kolacici: [kolacic] }));
}

describe("who may use tables and bills", () => {
  it("requires a session", async () => {
    expect((await stolovi(zahtjev("/api/stolovi"))).status).toBe(401);
    expect(
      (await racunStola(zahtjev("/api/racuni/sto/1"), { params: Promise.resolve({ stoId: "1" }) })).status,
    ).toBe(401);
    expect(
      (await transfer(zahtjev("/api/stolovi/transfer", { tijelo: { radnja: "premjesti", stoIz: 1, stoU: 2 } }))).status,
    ).toBe(401);
  });

  it.each(["kuhinja", "pecenjara", "mesnica", "sefica"] as const)("refuses %s", async (uloga) => {
    const kolacic = ljudi[uloga].kolacic;
    expect((await stolovi(zahtjev("/api/stolovi", { kolacici: [kolacic] }))).status).toBe(403);
    expect((await racunOdgovor(1, kolacic)).status).toBe(403);
    expect((await premjesti("premjesti", 1, 2, kolacic)).status).toBe(403);
  });

  it("re-checks the role in SQL", async () => {
    const tudji = ljudi.kuhinja.id;
    await expect(demoRpc("stolovi_pregled", { p_konobar: tudji })).rejects.toMatchObject({ code: "P0001" });
    await expect(demoRpc("racun_za_sto", { p_konobar: tudji, p_sto: 1 })).rejects.toMatchObject({ code: "P0001" });
    await expect(
      demoRpc("premjesti_sto", { p_konobar: tudji, p_radnja: "premjesti", p_sto_iz: 1, p_sto_u: 2 }),
    ).rejects.toMatchObject({ code: "P0001" });
  });
});

describe("GET /api/stolovi", () => {
  it("lists 20 free tables", async () => {
    const svi = await lista();
    expect(svi.map((s) => s.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(svi.every((s) => s.racun === null)).toBe(true);
  });

  it("shows the open bill's state on its table", async () => {
    const racunId = await naruci(3);
    await naruci(3, "Grah s mesom");

    const sto = (await lista()).find((s) => s.id === 3)!;
    expect(sto.racun).toMatchObject({
      id: racunId,
      konobar: ljudi.konobar.ime,
      stolovi: [3],
      ukupno: 21,
      sveIzdato: false,
    });
    expect(sto.racun!.broj).toBeGreaterThan(0);
    expect(Date.parse(sto.racun!.otvoren)).not.toBeNaN();
  });

  it("marks a bill as ready once every order is issued", async () => {
    await naruci(3);
    await (await demoBaza()).exec("update public.narudzbe set status = 'Izdato'");
    expect((await lista()).find((s) => s.id === 3)!.racun!.sveIzdato).toBe(true);
  });
});

describe("GET /api/racuni/sto/[stoId]", () => {
  it("returns null for a free table", async () => {
    const odgovor = await racunOdgovor(5);
    expect(odgovor.status).toBe(200);
    expect(await odgovor.json()).toEqual({ racun: null });
  });

  it.each(["0", "21", "abc", "1.5", ""])("rejects table %j", async (sto) => {
    expect((await racunOdgovor(sto)).status).toBe(400);
  });

  it("returns items and totals, with no internal fields", async () => {
    await naruci(5);
    const odgovor = await racunOdgovor(5);
    const tekst = await odgovor.text();
    const { racun: r } = JSON.parse(tekst) as { racun: Sazetak & { narudzbe: Record<string, unknown>[] } };

    expect(Object.keys(r).sort()).toEqual(["broj", "id", "konobar", "narudzbe", "otvoren", "stolovi", "sveIzdato", "ukupno"]);
    expect(Object.keys(r.narudzbe[0]).sort()).toEqual(["id", "kreirano", "stanica", "status", "stavke"]);
    expect(Object.keys((r.narudzbe[0].stavke as object[])[0]).sort()).toEqual(
      ["cijena", "id", "iznos", "jedinica", "kolicina", "naziv", "napomena", "poseban", "prilogUz"].sort(),
    );
    expect(tekst).not.toMatch(/request|pin|hash/i);
  });
});

describe("POST /api/stolovi/transfer", () => {
  it.each([
    ["an unknown field", { radnja: "spoji", stoIz: 1, stoU: 2, racunId: randomUUID() }],
    ["an unknown action", { radnja: "izbrisi", stoIz: 1, stoU: 2 }],
    ["a table out of range", { radnja: "spoji", stoIz: 1, stoU: 21 }],
    ["a missing table", { radnja: "spoji", stoIz: 1 }],
  ])("rejects %s with 400", async (_opis, tijelo) => {
    const odgovor = await transfer(zahtjev("/api/stolovi/transfer", { tijelo, kolacici: [ljudi.konobar.kolacic] }));
    expect(odgovor.status).toBe(400);
  });

  it("rejects the same table twice", async () => {
    await naruci(1);
    const odgovor = await premjesti("premjesti", 1, 1);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Izaberite dva različita stola." });
  });

  it.each(["premjesti", "spoji", "dodaj"])("%s refuses a source with no bill", async (radnja) => {
    const odgovor = await premjesti(radnja, 1, 2);
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Sto 1 nema otvoren račun." });
  });

  describe("premjesti", () => {
    it("moves a bill to a free table, and frees the old one", async () => {
      const racunId = await naruci(1);
      const odgovor = await premjesti("premjesti", 1, 2);
      expect(odgovor.status).toBe(200);
      expect(await odgovor.json()).toEqual({ racunId, stolovi: [2] });

      expect(await racun(1)).toBeNull();
      expect((await racun(2))!.id).toBe(racunId);
      const svi = await lista();
      expect(svi.find((s) => s.id === 1)!.racun).toBeNull();
      expect(svi.find((s) => s.id === 2)!.racun!.id).toBe(racunId);

      // The freed table opens a new bill, the new table adds to the moved one.
      expect(await naruci(1)).not.toBe(racunId);
      expect(await naruci(2)).toBe(racunId);

      const { rows } = await (await demoBaza()).query<{ sto_id: number }>("select sto_id from public.racuni where id = $1", [racunId]);
      expect(rows[0].sto_id).toBe(2);
    });

    it("refuses an occupied table and changes nothing", async () => {
      const prvi = await naruci(1);
      const drugi = await naruci(2);
      const odgovor = await premjesti("premjesti", 1, 2);
      expect(odgovor.status).toBe(422);
      expect(await odgovor.json()).toEqual({ greska: "Sto 2 je zauzet." });
      expect((await racun(1))!.id).toBe(prvi);
      expect((await racun(2))!.id).toBe(drugi);
    });

    it("moves one table of a multi-table bill, and leaves the other", async () => {
      const racunId = await naruci(1);
      await premjesti("dodaj", 1, 2);
      expect(await (await premjesti("premjesti", 2, 3)).json()).toEqual({ racunId, stolovi: [1, 3] });
      expect(await racun(2)).toBeNull();
      expect((await racun(3))!.id).toBe(racunId);

      const { rows } = await (await demoBaza()).query<{ sto_id: number }>("select sto_id from public.racuni where id = $1", [racunId]);
      expect(rows[0].sto_id).toBe(1);
    });
  });

  describe("spoji", () => {
    it("merges two bills, keeping every order and the sum", async () => {
      const izvor = await naruci(1);
      const cilj = await naruci(2, "Grah s mesom");
      const odgovor = await premjesti("spoji", 1, 2);
      expect(odgovor.status).toBe(200);
      expect(await odgovor.json()).toEqual({ racunId: cilj, stolovi: [1, 2] });

      const r = (await racun(2))!;
      expect(r.ukupno).toBe(21);
      expect(r.stolovi).toEqual([1, 2]);
      expect(r.narudzbe.flatMap((n) => n.stavke.map((s) => s.naziv)).sort()).toEqual(["Grah s mesom", "Gulaš"]);

      const { rows } = await (await demoBaza()).query<{ status: string; zatvoren: unknown }>(
        "select status, zatvoren from public.racuni where id = $1",
        [izvor],
      );
      expect(rows[0].status).toBe("spojen");
      expect(rows[0].zatvoren).not.toBeNull();
    });

    it("makes a merged table resolve to the surviving bill everywhere", async () => {
      await naruci(1);
      const cilj = await naruci(2);
      await premjesti("spoji", 1, 2);

      expect((await racun(1))!.id).toBe(cilj);
      const svi = await lista();
      expect(svi.find((s) => s.id === 1)!.racun!.id).toBe(cilj);
      expect(svi.find((s) => s.id === 2)!.racun!.id).toBe(cilj);

      // A new order on the merged table lands on the surviving bill, and a move onto it is refused.
      expect(await naruci(1)).toBe(cilj);
      expect((await racun(2))!.ukupno).toBe(39);
      expect((await premjesti("premjesti", 3, 1)).status).toBe(422);
    });

    it("merges every table of the source bill", async () => {
      await naruci(1);
      await premjesti("dodaj", 1, 3);
      const cilj = await naruci(2);
      expect(await (await premjesti("spoji", 3, 2)).json()).toEqual({ racunId: cilj, stolovi: [1, 2, 3] });
      expect((await racun(1))!.id).toBe(cilj);
    });

    it("makes a retried order name the surviving bill", async () => {
      await naruci(2);
      const requestId = randomUUID();
      const tijelo = { requestId, stoId: 1, stavke: [{ proizvodId: id["Gulaš"], kolicina: 1 }] };
      const salji = () => narudzba(zahtjev("/api/narudzbe", { tijelo, kolacici: [ljudi.konobar.kolacic] }));

      await salji();
      const { racunId: cilj } = (await (await premjesti("spoji", 1, 2)).json()) as { racunId: string };
      const ponovo = (await (await salji()).json()) as { racunId: string };
      expect(ponovo.racunId).toBe(cilj);
      expect((await racun(2))!.ukupno).toBe(26);
    });

    it("refuses a target with no bill, and two tables on one bill", async () => {
      await naruci(1);
      const prazan = await premjesti("spoji", 1, 2);
      expect(prazan.status).toBe(422);
      expect(await prazan.json()).toEqual({ greska: "Sto 2 nema otvoren račun." });

      await premjesti("dodaj", 1, 2);
      const isti = await premjesti("spoji", 1, 2);
      expect(isti.status).toBe(422);
      expect(await isti.json()).toEqual({ greska: "Stolovi su već na istom računu." });
    });
  });

  describe("dodaj", () => {
    it("adds a free table to a bill, and both tables resolve to it", async () => {
      const racunId = await naruci(1);
      const odgovor = await premjesti("dodaj", 1, 2);
      expect(odgovor.status).toBe(200);
      expect(await odgovor.json()).toEqual({ racunId, stolovi: [1, 2] });

      expect((await racun(2))!.id).toBe(racunId);
      expect(await naruci(2)).toBe(racunId);
      expect((await racun(1))!.ukupno).toBe(26);

      const svi = await lista();
      expect(svi.filter((s) => s.racun?.id === racunId).map((s) => s.id)).toEqual([1, 2]);
    });

    it("refuses an occupied table", async () => {
      await naruci(1);
      await naruci(2);
      const odgovor = await premjesti("dodaj", 1, 2);
      expect(odgovor.status).toBe(422);
      expect(await odgovor.json()).toEqual({ greska: "Sto 2 je zauzet." });
    });
  });

  it("logs each change with who made it", async () => {
    const racunId = await naruci(1);
    await premjesti("premjesti", 1, 2);
    await premjesti("dodaj", 2, 3);
    const drugi = await naruci(4);
    await premjesti("spoji", 4, 3);

    const { rows } = await (await demoBaza()).query<{ radnja: string; zaposlenik_id: string; detalji: unknown }>(
      "select radnja, zaposlenik_id, detalji from public.dnevnik_radnji order by id",
    );
    expect(rows.map((r) => r.radnja)).toEqual(["sto_premjesti", "sto_dodaj", "sto_spoji"]);
    expect(rows.every((r) => r.zaposlenik_id === ljudi.konobar.id)).toBe(true);
    expect(rows[2].detalji).toEqual({ iz: 4, u: 3, racun: drugi, ostaje: racunId });
  });
});
