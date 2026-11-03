import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { stranaIz } from "@/lib/domain/period";

const zahtjevShema = z.strictObject({
  requestId: z.uuid(),
  zalihaId: z.uuid(),
  kolicina: z.number().positive().max(100000).optional(),
});

const obradaShema = z.discriminatedUnion("radnja", [
  z.strictObject({ zahtjevId: z.uuid(), radnja: z.literal("isporuci"), kolicina: z.number().positive().max(100000) }),
  z.strictObject({ zahtjevId: z.uuid(), radnja: z.literal("nema_na_stanju") }),
]);

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["kuhinja", "mesnica", "sefica"]);
  const pregled = await rpc<unknown>("zahtjevi_mesnici_pregled", {
    p_zaposlenik: sesija.id,
    p_strana: stranaIz(request.nextUrl.searchParams),
  });
  return Response.json(pregled);
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["kuhinja", "sefica"]);
  const t = await procitajTijelo(request, zahtjevShema);
  const zahtjev = await rpc<unknown>("posalji_zahtjev_mesnici", {
    p_zaposlenik: sesija.id,
    p_request_id: t.requestId,
    p_zaliha: t.zalihaId,
    p_kolicina: t.kolicina ?? null,
  });
  return Response.json({ zahtjev });
});

export const PATCH = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["mesnica"]);
  const t = await procitajTijelo(request, obradaShema);
  const zahtjev = await rpc<unknown>("obradi_zahtjev_mesnici", {
    p_zaposlenik: sesija.id,
    p_zahtjev: t.zahtjevId,
    p_radnja: t.radnja,
    p_kolicina: t.radnja === "isporuci" ? t.kolicina : null,
  });
  return Response.json({ zahtjev });
});
