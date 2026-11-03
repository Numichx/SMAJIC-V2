import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { PRISTUP } from "@/lib/auth/session";
import { stranaIz } from "@/lib/domain/period";

// Whether a count is complete, and the amounts it adds up to, are checked in otvori_smjenu and zatvori_smjenu.
const popis = z.array(z.strictObject({ proizvodId: z.uuid(), kolicina: z.number().min(0).max(100000) })).max(500);

const otvaranjeShema = z.strictObject({ requestId: z.uuid(), oznaka: z.enum(["I", "II"]), popis });
const zatvaranjeShema = z.strictObject({
  requestId: z.uuid(),
  smjenaId: z.uuid(),
  popis,
  predaniPazar: z.number().min(0).max(999999.99),
});

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, PRISTUP.sank);
  const pregled = await rpc<unknown>("smjene_pregled", {
    p_zaposlenik: sesija.id,
    p_strana: stranaIz(request.nextUrl.searchParams),
  });
  return Response.json(pregled);
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, PRISTUP.sank);
  const t = await procitajTijelo(request, otvaranjeShema);
  const smjena = await rpc<unknown>("otvori_smjenu", {
    p_zaposlenik: sesija.id,
    p_request_id: t.requestId,
    p_oznaka: t.oznaka,
    p_popis: t.popis,
  });
  return Response.json({ smjena });
});

export const PATCH = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, PRISTUP.sank);
  const t = await procitajTijelo(request, zatvaranjeShema);
  const smjena = await rpc<unknown>("zatvori_smjenu", {
    p_zaposlenik: sesija.id,
    p_smjena: t.smjenaId,
    p_request_id: t.requestId,
    p_popis: t.popis,
    p_predani: t.predaniPazar,
  });
  return Response.json({ smjena });
});
