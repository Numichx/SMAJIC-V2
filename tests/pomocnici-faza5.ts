import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { PATCH as pomjeriRuta } from "@/app/api/narudzbe/[id]/route";
import { POST as narudzbaRuta } from "@/app/api/narudzbe/route";
import { POST as naplataRuta } from "@/app/api/racuni/[id]/naplata/route";
import { GET as racunStolaRuta } from "@/app/api/racuni/sto/[stoId]/route";
import type { Uloga } from "@/lib/auth/session";
import { demoBaza } from "@/lib/demo/store";
import { zahtjev, type Osoba } from "./pomocnici";

// Real routes for the money paths phase 5 reads from.
export type Stanica = "kuhinja" | "pecenjara" | "sank";
export type Racun = {
  id: string;
  ukupno: number;
  narudzbe: { id: string; stanica: Stanica; stavke: { id: number; naziv: string; iznos: number }[] }[];
};

const KO_IZDAJE: Record<Stanica, Uloga> = { kuhinja: "kuhinja", pecenjara: "pecenjara", sank: "konobar" };
const parametri = (id: string) => ({ params: Promise.resolve({ id }) });

export const jelo = (proizvodId: string, kolicina = 1, prilozi: string[] = []) => ({
  proizvodId,
  kolicina,
  prilozi: prilozi.map((p) => ({ proizvodId: p })),
});

export async function naruci(ljudi: Record<Uloga, Osoba>, stavke: unknown[], sto = 1) {
  const odgovor = await narudzbaRuta(
    zahtjev("/api/narudzbe", { tijelo: { requestId: randomUUID(), stoId: sto, stavke }, kolacici: [ljudi.konobar.kolacic] }),
  );
  expect(odgovor.status).toBe(201);
  return ((await odgovor.json()) as { narudzbe: { id: string; stanica: Stanica }[] }).narudzbe;
}

// Steps an order forward until it reaches the status. At the grill, Gotovo takes its price and any lamb weights.
export async function pomjeri(
  ljudi: Record<Uloga, Osoba>,
  n: { id: string; stanica: Stanica },
  dokle: "U pripremi" | "Gotovo" | "Izdato" = "Izdato",
  grill: { cijena: number; tezine: { stavkaId: number; kg: number }[] } = { cijena: 5, tezine: [] },
) {
  const redom = ["U pripremi", "Gotovo", "Izdato"];
  for (const status of redom.slice(0, redom.indexOf(dokle) + 1)) {
    const tijelo = n.stanica === "pecenjara" && status === "Gotovo" ? { status, ...grill } : { status };
    const odgovor = await pomjeriRuta(
      zahtjev(`/api/narudzbe/${n.id}`, { tijelo, kolacici: [ljudi[KO_IZDAJE[n.stanica]].kolacic] }),
      parametri(n.id),
    );
    expect(odgovor.status).toBe(200);
  }
}

export async function racunStola(ljudi: Record<Uloga, Osoba>, sto = 1) {
  const odgovor = await racunStolaRuta(zahtjev(`/api/racuni/sto/${sto}`, { kolacici: [ljudi.konobar.kolacic] }), {
    params: Promise.resolve({ stoId: String(sto) }),
  });
  return ((await odgovor.json()) as { racun: Racun }).racun;
}

export async function plati(ljudi: Record<Uloga, Osoba>, racun: Racun, tijelo: Record<string, unknown>) {
  const odgovor = await naplataRuta(
    zahtjev(`/api/racuni/${racun.id}/naplata`, {
      tijelo: { requestId: randomUUID(), ocekivano: racun.ukupno, ...tijelo },
      kolacici: [ljudi.konobar.kolacic],
    }),
    parametri(racun.id),
  );
  expect(odgovor.status).toBe(200);
}

// A paid bill at an exact moment, for tests about which day it lands on.
export async function naplataU(
  konobar: string,
  vrijeme: string,
  o: { ukupno?: number; bruto?: number; nacin?: string; gotovina?: number; kartica?: number; kusur?: number; duznik?: string } = {},
) {
  const db = await demoBaza();
  const ukupno = o.ukupno ?? 10;
  const nacin = o.nacin ?? "gotovina";
  const { rows } = await db.query<{ id: string }>(
    `insert into public.racuni (sto_id, konobar_id, status, otvoren, zatvoren)
     values (1, $1, $2::text::public.status_racuna, $3::text::timestamptz, $3::text::timestamptz) returning id`,
    [konobar, nacin === "dug" ? "na_dug" : "placen", vrijeme],
  );
  await db.query(
    `insert into public.naplate (racun_id, request_id, nacin, bruto, ukupno, gotovina, kartica, kusur, gost_duznik, stolovi, konobar_id, vrijeme)
     values ($1, $2, $3::text::public.nacin_naplate, $4, $5, $6, $7, $8, $9, '{1}', $10, $11::text::timestamptz)`,
    [
      rows[0].id,
      randomUUID(),
      nacin,
      o.bruto ?? ukupno,
      ukupno,
      o.gotovina ?? (nacin === "gotovina" ? ukupno : 0),
      o.kartica ?? (nacin === "kartica" ? ukupno : 0),
      o.kusur ?? 0,
      o.duznik ?? (nacin === "dug" ? "Gost Testni" : null),
      konobar,
      vrijeme,
    ],
  );
  return rows[0].id;
}

export async function brojRadnji(radnja: string) {
  const { rows } = await (await demoBaza()).query<{ n: number }>(
    "select count(*)::int as n from public.dnevnik_radnji where radnja = $1",
    [radnja],
  );
  return rows[0].n;
}
