import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

// No price here: prodaj_zalihu charges the item's selling price.
const prodajaShema = z.strictObject({
  requestId: z.uuid(),
  zalihaId: z.uuid(),
  kolicina: z.number().positive().max(100000),
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["mesnica"]);
  const t = await procitajTijelo(request, prodajaShema);
  const prodaja = await rpc<unknown>("prodaj_zalihu", {
    p_zaposlenik: sesija.id,
    p_request_id: t.requestId,
    p_zaliha: t.zalihaId,
    p_kolicina: t.kolicina,
  });
  return Response.json({ prodaja });
});
