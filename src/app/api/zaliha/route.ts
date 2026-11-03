import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const cijena = z.number().min(0).max(99999.99).nullable();

// All three each time, so a null clearly means "no price" and not "leave as it is".
const izmjenaShema = z.strictObject({
  id: z.uuid(),
  minimum: z.number().min(0).max(100000),
  nabavnaCijena: cijena,
  prodajnaCijena: cijena,
});

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["kuhinja", "mesnica", "sefica"]);
  const zaliha = await rpc<unknown>("zaliha_pregled", { p_zaposlenik: sesija.id });
  return Response.json({ zaliha });
});

export const PATCH = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const t = await procitajTijelo(request, izmjenaShema);
  const artikal = await rpc<unknown>("izmijeni_artikal_zalihe", {
    p_sefica: sesija.id,
    p_zaliha: t.id,
    p_minimum: t.minimum,
    p_nabavna: t.nabavnaCijena,
    p_prodajna: t.prodajnaCijena,
  });
  return Response.json({ artikal });
});
