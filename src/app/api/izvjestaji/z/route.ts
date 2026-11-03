import type { NextRequest } from "next/server";
import { ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { datumIz } from "@/lib/domain/period";

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const izvjestaj = await rpc<unknown>("z_izvjestaj", { p_sefica: sesija.id, p_datum: datumIz(request.nextUrl.searchParams) });
  return Response.json({ izvjestaj });
});
