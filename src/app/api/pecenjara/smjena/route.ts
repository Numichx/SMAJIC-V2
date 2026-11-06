import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { stranaIz } from "@/lib/domain/period";

const koke = z.number().int().min(0).max(100000);
const kg = z.number().min(0).max(100000);

const otvaranjeShema = z.strictObject({
  requestId: z.uuid(),
  pocetneKokePecene: koke,
  pocetneKokeSirove: koke,
  pocetnaJanjetinaKg: kg,
});
const zatvaranjeShema = z.strictObject({
  requestId: z.uuid(),
  smjenaId: z.uuid(),
  dodatneKoke: koke,
  dodatnaJanjetinaKg: kg,
  preostaleKoke: koke,
  preostalaJanjetinaKg: kg,
  predaniPazar: z.number().min(0).max(999999.99),
});

// The manager counts too when nobody is at the grill, or the shift could never close.
const ULOGE = ["pecenjara", "sefica"] as const;

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ULOGE);
  const pregled = await rpc<unknown>("pecenjara_pregled", {
    p_zaposlenik: sesija.id,
    p_strana: stranaIz(request.nextUrl.searchParams),
  });
  return Response.json(pregled);
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ULOGE);
  const t = await procitajTijelo(request, otvaranjeShema);
  const popis = await rpc<unknown>("otvori_popis_pecenjare", {
    p_zaposlenik: sesija.id,
    p_request_id: t.requestId,
    p_koke_pecene: t.pocetneKokePecene,
    p_koke_sirove: t.pocetneKokeSirove,
    p_janjetina_kg: t.pocetnaJanjetinaKg,
  });
  return Response.json({ popis });
});

export const PATCH = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ULOGE);
  const t = await procitajTijelo(request, zatvaranjeShema);
  const popis = await rpc<unknown>("zatvori_popis_pecenjare", {
    p_zaposlenik: sesija.id,
    p_smjena: t.smjenaId,
    p_request_id: t.requestId,
    p_dodatne_koke: t.dodatneKoke,
    p_dodatna_kg: t.dodatnaJanjetinaKg,
    p_preostale_koke: t.preostaleKoke,
    p_preostala_kg: t.preostalaJanjetinaKg,
    p_predani: t.predaniPazar,
  });
  return Response.json({ popis });
});
