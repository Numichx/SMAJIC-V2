import type { NextRequest } from "next/server";
import { ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["konobar"]);
  const stolovi = await rpc<unknown[]>("stolovi_pregled", { p_konobar: sesija.id });
  return Response.json({ stolovi });
});
