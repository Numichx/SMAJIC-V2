import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as racunStola } from "@/app/api/racuni/sto/[stoId]/route";
import { GET as meniRuta } from "@/app/api/meni/route";
import { POST as narudzba } from "@/app/api/narudzbe/route";
import type { Uloga } from "@/lib/auth/session";
import { procjenaStavke } from "@/lib/domain/procjena";
import { ocisti, osoblje, PIN_SEFICE, pripremiOkruzenje, postaviPin, zahtjev, type Osoba } from "./pomocnici";

type Proizvod = { id: string; naziv: string; cijena: number; jedinica: string; prilog: { besplatni: string[] } | null };

let ljudi: Record<Uloga, Osoba>;
let proizvodi: Map<string, Proizvod>;

beforeAll(async () => {
  pripremiOkruzenje();
  ljudi = await osoblje();
  await postaviPin(ljudi.sefica.id, PIN_SEFICE);
  const meni = (await (await meniRuta(zahtjev("/api/meni", { kolacici: [ljudi.konobar.kolacic] }))).json()) as {
    kategorije: { proizvodi: Proizvod[] }[];
  };
  proizvodi = new Map(meni.kategorije.flatMap((k) => k.proizvodi).map((p) => [p.naziv, p]));
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => ocisti());

describe("the cart estimate matches what the server charges", () => {
  it.each<[string, number, [string, boolean?][]]>([
    ["Coca-Cola 0,25 l", 5, []],
    ["Pljeskavica", 1, [["Pomfrit"]]],
    ["Pljeskavica", 2, [["Pomfrit"], ["Riža"]]],
    ["Pljeskavica", 3, [["Riža"], ["Pomfrit"]]],
    ["Gulaš", 2, [["Pire krompir"], ["Riža"]]],
    ["Natur šnicla", 1, [["Pomfrit", true]]],
    ["Natur šnicla", 2, [["Pomfrit", true], ["Riža"]]],
    ["Teletina ispod sača", 0.5, [["Pekarski krompir", true], ["Pomfrit"]]],
    ["Teletina ispod sača", 1.235, [["Pekarski krompir"], ["Pomfrit"]]],
    ["Jagnjetina s ražnja", 0.333, []],
  ])("%s x %d with %j", async (jelo, kolicina, prilozi) => {
    const p = proizvodi.get(jelo)!;
    const saCijenom = prilozi.map(([naziv, poseban]) => {
      const x = proizvodi.get(naziv)!;
      return { id: x.id, cijena: x.cijena, poseban: !!poseban };
    });

    const odgovor = await narudzba(
      zahtjev("/api/narudzbe", {
        tijelo: {
          requestId: randomUUID(),
          stoId: 1,
          stavke: [{ proizvodId: p.id, kolicina, prilozi: saCijenom.map((x) => ({ proizvodId: x.id, poseban: x.poseban })) }],
          ...(saCijenom.some((x) => x.poseban) && { posebanPin: PIN_SEFICE }),
        },
        kolacici: [ljudi.konobar.kolacic],
      }),
    );
    expect(odgovor.status).toBe(201);

    const bill = await racunStola(zahtjev("/api/racuni/sto/1", { kolacici: [ljudi.konobar.kolacic] }), { params: Promise.resolve({ stoId: "1" }) });
    const { racun } = (await bill.json()) as { racun: { ukupno: number } };
    expect(procjenaStavke(p.cijena, kolicina, p.jedinica, saCijenom, p.prilog?.besplatni ?? [])).toBeCloseTo(racun.ukupno, 2);
  });
});
