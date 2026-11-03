import type { NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { datumIz, stranaIz } from "@/lib/domain/period";

const novaShema = z.strictObject({
  requestId: z.uuid(),
  ime: z.string().min(2).max(200),
  brojGostiju: z.number().int().min(1).max(200),
  vrijeme: z.iso.datetime({ offset: true }),
  stoId: z.number().int().min(1).max(20).optional(),
  telefon: z.string().max(200).optional(),
  napomena: z.string().max(1000).optional(),
});

const statusShema = z.strictObject({ id: z.uuid(), status: z.enum(["realizovana", "otkazana"]) });

// The waiter takes the call and seats the guest, so a reservation's name is for both of these roles.
const ULOGE = ["konobar", "sefica"] as const;

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ULOGE);
  const upit = request.nextUrl.searchParams;
  const pregled = await rpc<unknown>("rezervacije_za_dan", {
    p_zaposlenik: sesija.id,
    p_datum: datumIz(upit),
    p_strana: stranaIz(upit),
  });
  return Response.json(pregled);
});

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ULOGE);
  const t = await procitajTijelo(request, novaShema);
  const rezervacija = await rpc<unknown>("nova_rezervacija", {
    p_zaposlenik: sesija.id,
    p_request_id: t.requestId,
    p_ime: t.ime,
    p_broj_gostiju: t.brojGostiju,
    p_vrijeme: t.vrijeme,
    p_sto: t.stoId ?? null,
    p_telefon: t.telefon ?? null,
    p_napomena: t.napomena ?? null,
  });
  return Response.json({ rezervacija });
});

export const PATCH = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ULOGE);
  const t = await procitajTijelo(request, statusShema);
  const rezervacija = await rpc<unknown>("promijeni_status_rezervacije", {
    p_zaposlenik: sesija.id,
    p_rezervacija: t.id,
    p_status: t.status,
  });
  return Response.json({ rezervacija });
});
