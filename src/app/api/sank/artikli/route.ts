import type { NextRequest } from "next/server";
import { ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { PRISTUP } from "@/lib/auth/session";

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, PRISTUP.sank);
  const pregled = await rpc<unknown>("sank_artikli", { p_zaposlenik: sesija.id });
  return Response.json(pregled);
});
