import type { NextRequest } from "next/server";
import { ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const zaposlenici = await rpc<unknown[]>("zaposlenici_pregled", { p_sefica: sesija.id });
  return Response.json({ zaposlenici });
});
