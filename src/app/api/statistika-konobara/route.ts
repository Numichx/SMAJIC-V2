import type { NextRequest } from "next/server";
import { ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { daniIz } from "@/lib/domain/period";

// Always the waiter's own: the id comes from the session, never from the request.
export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["konobar"]);
  const statistika = await rpc<unknown>("statistika_konobara", {
    p_konobar: sesija.id,
    p_dani: daniIz(request.nextUrl.searchParams),
  });
  return Response.json({ statistika });
});
