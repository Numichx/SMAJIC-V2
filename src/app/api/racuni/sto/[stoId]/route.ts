import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiGreska, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const stoShema = z.coerce.number().int().min(1).max(20);

export const GET = ruta(async (request: NextRequest, { params }: { params: Promise<{ stoId: string }> }) => {
  const sesija = await zahtijevajSesiju(request, ["konobar"]);
  const sto = stoShema.safeParse((await params).stoId);
  if (!sto.success) throw new ApiGreska(400, "Neispravni podaci.");

  const racun = await rpc<unknown>("racun_za_sto", { p_konobar: sesija.id, p_sto: sto.data });
  return Response.json({ racun });
});
