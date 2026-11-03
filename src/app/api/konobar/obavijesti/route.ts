import type { NextRequest } from "next/server";
import { ApiGreska, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["konobar"]);
  const od = request.nextUrl.searchParams.get("od");
  if (od !== null && !/^\d{1,15}$/.test(od)) throw new ApiGreska(400, "Neispravni podaci.");

  return Response.json(
    await rpc<unknown>("obavijesti_konobara", { p_konobar: sesija.id, p_od: od === null ? null : Number(od) }),
  );
});
