import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiGreska, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const prijeShema = z.coerce.number().int().min(1).optional();

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const prije = prijeShema.safeParse(request.nextUrl.searchParams.get("prije") ?? undefined);
  if (!prije.success) throw new ApiGreska(400, "Neispravni podaci.");

  const pregled = await rpc<unknown>("dnevnik_pregled", { p_sefica: sesija.id, p_prije: prije.data ?? null });
  return Response.json(pregled);
});
