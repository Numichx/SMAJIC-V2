import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const dani = z.number().int().min(0).max(100000).optional();
const shema = z.strictObject({ daniDugovi: dani, daniRezervacije: dani });

// With no values, SQL uses its defaults. Returns counts only, never a name.
export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const t = await procitajTijelo(request, shema);
  const rezultat = await rpc<unknown>("anonimiziraj_licne_podatke", {
    p_sefica: sesija.id,
    p_dani_dugovi: t.daniDugovi ?? null,
    p_dani_rezervacije: t.daniRezervacije ?? null,
  });
  return Response.json({ rezultat });
});
