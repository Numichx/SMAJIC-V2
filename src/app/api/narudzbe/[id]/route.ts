import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiGreska, procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { PRISTUP } from "@/lib/auth/session";

// The path, the station and the ranges are checked in promijeni_status_narudzbe.
const tijeloShema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.enum(["U pripremi", "Izdato"]) }),
  z.strictObject({
    status: z.literal("Gotovo"),
    cijena: z.number().optional(),
    tezine: z
      .array(z.strictObject({ stavkaId: z.number().int().positive(), kg: z.number() }))
      .max(100)
      .optional(),
  }),
]);

const STANICE = [...PRISTUP.kuhinja, ...PRISTUP.pecenjara, ...PRISTUP.sank];

export const PATCH = ruta(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const sesija = await zahtijevajSesiju(request, STANICE);
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new ApiGreska(400, "Neispravni podaci.");
  const tijelo = await procitajTijelo(request, tijeloShema);

  const narudzba = await rpc<unknown>("promijeni_status_narudzbe", {
    p_zaposlenik: sesija.id,
    p_narudzba: id.data,
    p_status: tijelo.status,
    p_cijena: tijelo.status === "Gotovo" ? (tijelo.cijena ?? null) : null,
    p_tezine: tijelo.status === "Gotovo" ? (tijelo.tezine ?? null) : null,
  });
  return Response.json({ narudzba });
});
