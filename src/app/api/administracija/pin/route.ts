import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const aktivacijaShema = z.strictObject({ zaposlenikId: z.uuid() });

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const { zaposlenikId } = await procitajTijelo(request, aktivacijaShema);

  const kod = await rpc<string>("aktiviraj_pin", { p_zaposlenik: zaposlenikId, p_sefica: sesija.id });
  return Response.json({ kod }, { headers: { "Cache-Control": "no-store" } });
});
