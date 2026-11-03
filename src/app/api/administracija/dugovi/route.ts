import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { stranaIz } from "@/lib/domain/period";

// No amount: the debt is collected whole, at what the bill says.
const naplataShema = z.strictObject({ requestId: z.uuid(), racunId: z.uuid(), nacin: z.enum(["gotovina", "kartica"]) });

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const pregled = await rpc<unknown>("dugovi_gostiju", {
    p_sefica: sesija.id,
    p_strana: stranaIz(request.nextUrl.searchParams),
  });
  return Response.json(pregled);
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const t = await procitajTijelo(request, naplataShema);
  const naplata = await rpc<unknown>("naplati_dug", {
    p_sefica: sesija.id,
    p_racun: t.racunId,
    p_request_id: t.requestId,
    p_nacin: t.nacin,
  });
  return Response.json({ naplata });
});
