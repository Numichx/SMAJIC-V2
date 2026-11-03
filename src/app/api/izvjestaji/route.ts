import type { NextRequest } from "next/server";
import { ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { daniIz } from "@/lib/domain/period";

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const izvjestaj = await rpc<unknown>("izvjestaj_perioda", {
    p_sefica: sesija.id,
    p_dani: daniIz(request.nextUrl.searchParams),
  });
  return Response.json({ izvjestaj });
});
