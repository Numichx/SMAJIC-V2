import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const uplataShema = z.strictObject({
  requestId: z.uuid(),
  konobarId: z.uuid(),
  iznos: z.number().positive().max(999999.99),
});

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["pecenjara", "sefica"]);
  const pregled = await rpc<unknown>("dugovi_pecenjari", { p_zaposlenik: sesija.id });
  return Response.json(pregled);
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["pecenjara"]);
  const t = await procitajTijelo(request, uplataShema);
  const uplata = await rpc<unknown>("uplati_pecenjari", {
    p_zaposlenik: sesija.id,
    p_request_id: t.requestId,
    p_konobar: t.konobarId,
    p_iznos: t.iznos,
  });
  return Response.json({ uplata });
});
