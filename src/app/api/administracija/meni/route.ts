import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { SLIKE } from "@/lib/data/slike";

// SQL gives the exact limits and messages. These only stop what cannot be right.
const naziv = z.string().min(1).max(200);
const kategorijaId = z.string().min(1).max(50);
const cijena = z.number().min(0).max(100000);
const jedinica = z.enum(["porcija", "kom", "kg", "l"]);
const stanica = z.enum(["kuhinja", "pecenjara", "sank"]);
const redoslijed = z.number().int().min(0).max(100000);

const novaShema = z.strictObject({ naziv, kategorijaId, cijena, jedinica, stanica, redoslijed: redoslijed.optional() });
const izmjenaShema = z
  .strictObject({
    id: z.uuid(),
    naziv: naziv.optional(),
    kategorijaId: kategorijaId.optional(),
    cijena: cijena.optional(),
    jedinica: jedinica.optional(),
    stanica: stanica.optional(),
    redoslijed: redoslijed.optional(),
    aktivan: z.boolean().optional(),
  })
  .refine((t) => Object.keys(t).length > 1);

type Proizvod = { slikaKljuc: string | null };

function saSlikom({ slikaKljuc, ...proizvod }: Proizvod) {
  const slika = slikaKljuc ? SLIKE[slikaKljuc] : null;
  return { ...proizvod, slika: slika ? { putanja: slika.putanja, zasluge: slika.zasluge } : null };
}

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const { kategorije, proizvodi } = await rpc<{ kategorije: unknown[]; proizvodi: Proizvod[] }>("meni_pregled", { p_sefica: sesija.id });
  return Response.json({ kategorije, proizvodi: proizvodi.map(saSlikom) });
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const t = await procitajTijelo(request, novaShema);
  const proizvod = await rpc<Proizvod>("sacuvaj_proizvod", {
    p_sefica: sesija.id,
    p_id: null,
    p_naziv: t.naziv,
    p_kategorija: t.kategorijaId,
    p_cijena: t.cijena,
    p_jedinica: t.jedinica,
    p_stanica: t.stanica,
    p_redoslijed: t.redoslijed ?? null,
    p_aktivan: null,
  });
  return Response.json({ proizvod: saSlikom(proizvod) });
});

export const PATCH = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const t = await procitajTijelo(request, izmjenaShema);
  const proizvod = await rpc<Proizvod>("sacuvaj_proizvod", {
    p_sefica: sesija.id,
    p_id: t.id,
    p_naziv: t.naziv ?? null,
    p_kategorija: t.kategorijaId ?? null,
    p_cijena: t.cijena ?? null,
    p_jedinica: t.jedinica ?? null,
    p_stanica: t.stanica ?? null,
    p_redoslijed: t.redoslijed ?? null,
    p_aktivan: t.aktivan ?? null,
  });
  return Response.json({ proizvod: saSlikom(proizvod) });
});
