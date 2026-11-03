import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiGreska, procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { stranaIz } from "@/lib/domain/period";

// A manual count: the real number on the shelf. The server works out the change.
const popisShema = z.strictObject({
  requestId: z.uuid(),
  zalihaId: z.uuid(),
  stanje: z.number().min(0).max(100000),
  razlog: z.enum(["Popis", "Prijem robe", "Višak", "Otpis"]),
});

const filterShema = z.strictObject({
  zalihaId: z.uuid().optional(),
  vrsta: z.enum(["popis", "prodaja", "isporuka"]).optional(),
});

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["mesnica", "sefica"]);
  const upit = request.nextUrl.searchParams;
  const filter = filterShema.safeParse({
    zalihaId: upit.get("zalihaId") ?? undefined,
    vrsta: upit.get("vrsta") ?? undefined,
  });
  if (!filter.success) throw new ApiGreska(400, "Neispravni podaci.");

  const prometi = await rpc<unknown>("prometi_zalihe", {
    p_zaposlenik: sesija.id,
    p_zaliha: filter.data.zalihaId ?? null,
    p_vrsta: filter.data.vrsta ?? null,
    p_strana: stranaIz(upit),
  });
  return Response.json(prometi);
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["mesnica", "sefica"]);
  const t = await procitajTijelo(request, popisShema);
  const promet = await rpc<unknown>("popisi_zalihu", {
    p_zaposlenik: sesija.id,
    p_request_id: t.requestId,
    p_zaliha: t.zalihaId,
    p_stanje: t.stanje,
    p_razlog: t.razlog,
  });
  return Response.json({ promet });
});
