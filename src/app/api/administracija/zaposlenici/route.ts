import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";

const ime = z.string().min(2).max(200);
const uloga = z.enum(["konobar", "kuhinja", "pecenjara", "mesnica", "sefica"]);

const novaShema = z.strictObject({ ime, uloga });
const izmjenaShema = z.union([
  z.strictObject({ id: z.uuid(), ime, uloga }),
  z.strictObject({ id: z.uuid(), aktivan: z.boolean() }),
]);

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const zaposlenici = await rpc<unknown[]>("zaposlenici_pregled", { p_sefica: sesija.id });
  return Response.json({ zaposlenici });
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const t = await procitajTijelo(request, novaShema);
  const zaposlenik = await rpc<unknown>("sacuvaj_zaposlenika", {
    p_sefica: sesija.id,
    p_id: null,
    p_ime: t.ime,
    p_uloga: t.uloga,
  });
  return Response.json({ zaposlenik });
});

export const PATCH = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const t = await procitajTijelo(request, izmjenaShema);
  const zaposlenik =
    "aktivan" in t
      ? await rpc<unknown>("postavi_aktivnost_zaposlenika", { p_sefica: sesija.id, p_id: t.id, p_aktivan: t.aktivan })
      : await rpc<unknown>("sacuvaj_zaposlenika", { p_sefica: sesija.id, p_id: t.id, p_ime: t.ime, p_uloga: t.uloga });
  return Response.json({ zaposlenik });
});
