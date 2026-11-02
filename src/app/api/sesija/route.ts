import { NextResponse, type NextRequest } from "next/server";
import { ruta } from "@/lib/api/greske";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { KOLACIC_SESIJE, opcijeKolacica } from "@/lib/auth/session";

export const GET = ruta(async (request: NextRequest) => {
  const { ime, uloga } = await zahtijevajSesiju(request);
  return Response.json({ ime, uloga });
});

export async function DELETE() {
  const odgovor = NextResponse.json({ ok: true });
  odgovor.cookies.set(KOLACIC_SESIJE, "", opcijeKolacica(0));
  return odgovor;
}
