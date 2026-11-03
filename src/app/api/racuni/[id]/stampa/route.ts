import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiGreska, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

export const GET = ruta(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const sesija = await zahtijevajSesiju(request, ["konobar"]);
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new ApiGreska(400, "Neispravni podaci.");

  const racun = await rpc<unknown>("racun_za_stampu", { p_konobar: sesija.id, p_racun: id.data });
  return Response.json({ racun });
});
