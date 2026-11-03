import type { NextRequest } from "next/server";
import { ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { izvjestajUCsv, type IzvjestajCsv } from "@/lib/domain/csv";
import { daniIz } from "@/lib/domain/period";

// Built here, so the screen is only a link and has no cell to get wrong.
export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["sefica"]);
  const dani = daniIz(request.nextUrl.searchParams);
  const izvjestaj = await rpc<IzvjestajCsv>("izvjestaj_perioda", { p_sefica: sesija.id, p_dani: dani });
  return new Response(izvjestajUCsv(izvjestaj), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="izvjestaj-${dani}-dana.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
