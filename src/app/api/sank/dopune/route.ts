import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { PRISTUP } from "@/lib/auth/session";

const dopunaShema = z.strictObject({
  requestId: z.uuid(),
  proizvodId: z.uuid(),
  kolicina: z.number().positive().max(100000),
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, PRISTUP.sank);
  const t = await procitajTijelo(request, dopunaShema);
  const dopuna = await rpc<unknown>("dopuni_sank", {
    p_zaposlenik: sesija.id,
    p_request_id: t.requestId,
    p_proizvod: t.proizvodId,
    p_kolicina: t.kolicina,
  });
  return Response.json({ dopuna });
});
