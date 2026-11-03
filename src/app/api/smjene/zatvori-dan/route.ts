import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { datumIz } from "@/lib/domain/period";

// With no date, today in Sarajevo. After midnight she picks yesterday.
const zatvaranjeShema = z.strictObject({ datum: z.iso.date().optional() });

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const pregled = await rpc<unknown>("dan_pregled", { p_sefica: sesija.id, p_datum: datumIz(request.nextUrl.searchParams) });
  return Response.json(pregled);
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const { datum } = await procitajTijelo(request, zatvaranjeShema);
  const zakljucak = await rpc<unknown>("zatvori_dan", { p_sefica: sesija.id, p_datum: datum ?? null });
  return Response.json({ zakljucak });
});
