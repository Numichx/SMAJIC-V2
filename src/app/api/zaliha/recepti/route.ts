import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const receptShema = z.strictObject({
  proizvodId: z.uuid(),
  sastojci: z.array(z.strictObject({ zalihaId: z.uuid(), kolicina: z.number().positive().max(1000) })).max(50),
});

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const recepti = await rpc<unknown>("recepti_pregled", { p_sefica: sesija.id });
  return Response.json({ recepti });
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const t = await procitajTijelo(request, receptShema);
  const recept = await rpc<unknown>("sacuvaj_recept", {
    p_sefica: sesija.id,
    p_proizvod: t.proizvodId,
    p_sastojci: t.sastojci,
  });
  return Response.json({ recept });
});
