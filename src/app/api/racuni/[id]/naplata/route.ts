import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiGreska, procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const iznos = z.number().min(0).max(999999.99);

// Which amounts each method needs, and whether they cover the bill, is checked in naplati_racun.
const naplataShema = z.strictObject({
  requestId: z.uuid(),
  ocekivano: iznos,
  nacin: z.enum(["gotovina", "kartica", "kombinovano", "dug"]),
  gotovina: iznos.optional(),
  kartica: iznos.optional(),
  vraceniKusur: iznos.optional(),
  gostDuznik: z.string().max(200).optional(),
  podijeljenoNa: z.number().int().min(1).max(100).optional(),
});

export const POST = ruta(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const sesija = await zahtijevajSesiju(request, ["konobar"]);
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new ApiGreska(400, "Neispravni podaci.");
  const t = await procitajTijelo(request, naplataShema);

  const naplata = await rpc<unknown>("naplati_racun", {
    p_konobar: sesija.id,
    p_racun: id.data,
    p_request_id: t.requestId,
    p_ocekivano: t.ocekivano,
    p_nacin: t.nacin,
    p_gotovina: t.gotovina ?? null,
    p_kartica: t.kartica ?? null,
    p_kusur: t.vraceniKusur ?? null,
    p_gost_duznik: t.gostDuznik ?? null,
    p_osoba: t.podijeljenoNa ?? null,
  });
  return Response.json({ naplata });
});
