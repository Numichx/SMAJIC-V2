import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const transferShema = z.strictObject({
  radnja: z.enum(["premjesti", "spoji", "dodaj"]),
  stoIz: z.number().int().min(1).max(20),
  stoU: z.number().int().min(1).max(20),
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["konobar"]);
  const { radnja, stoIz, stoU } = await procitajTijelo(request, transferShema);

  const rezultat = await rpc<{ racunId: string; stolovi: number[] }>("premjesti_sto", {
    p_konobar: sesija.id,
    p_radnja: radnja,
    p_sto_iz: stoIz,
    p_sto_u: stoU,
  });
  return Response.json(rezultat);
});
