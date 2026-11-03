import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiGreska, procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { RAZLOZI_STORNA } from "@/lib/domain/naplata";

const stavkaShema = z.coerce.number().int().positive();
const stornoShema = z.strictObject({ razlog: z.enum(RAZLOZI_STORNA) });

export const POST = ruta(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const sesija = await zahtijevajSesiju(request, ["konobar"]);
  const stavka = stavkaShema.safeParse((await params).id);
  if (!stavka.success) throw new ApiGreska(400, "Neispravni podaci.");
  const { razlog } = await procitajTijelo(request, stornoShema);

  const racun = await rpc<unknown>("storniraj_stavku", { p_konobar: sesija.id, p_stavka: stavka.data, p_razlog: razlog });
  return Response.json({ racun });
});
