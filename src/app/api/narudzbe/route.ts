import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { pinShema } from "@/lib/auth/pin";
import {
  identitetZahtjeva,
  KOLACIC_UREDJAJA,
  porukaZakljucano,
  TRAJANJE_UREDJAJA_S,
} from "@/lib/auth/pinOgranicenje";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { opcijeKolacica, tajnaSesije } from "@/lib/auth/session";

// The limits per unit and the prices are checked in posalji_narudzbu.
const narudzbaShema = z.strictObject({
  requestId: z.uuid(),
  stoId: z.number().int().min(1).max(20),
  stavke: z
    .array(
      z.strictObject({
        proizvodId: z.uuid(),
        kolicina: z.number().positive().max(200),
        napomena: z.string().trim().max(500).optional(),
        prilozi: z
          .array(z.strictObject({ proizvodId: z.uuid(), poseban: z.boolean().optional() }))
          .max(4)
          .optional(),
      }),
    )
    .min(1)
    .max(100),
  posebanPin: pinShema.optional(),
});

type Rezultat =
  | { status: "ok"; racunId: string; narudzbe: { id: string; stanica: string }[] }
  | { status: "pogresan" | "zakljucano"; retry_after: number };

export const POST = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request, ["konobar"]);
  const { requestId, stoId, stavke, posebanPin } = await procitajTijelo(request, narudzbaShema);

  const identitet = posebanPin ? identitetZahtjeva(request, tajnaSesije()) : null;
  const rezultat = await rpc<Rezultat>("posalji_narudzbu", {
    p_konobar: sesija.id,
    p_request_id: requestId,
    p_sto: stoId,
    p_stavke: stavke,
    p_poseban_pin: posebanPin ?? null,
    p_uredjaj: identitet?.uredjaj ?? null,
    p_ip: identitet?.ip ?? null,
  });

  let odgovor: NextResponse;
  if (rezultat.status === "ok") {
    odgovor = NextResponse.json({ racunId: rezultat.racunId, narudzbe: rezultat.narudzbe }, { status: 201 });
  } else if (rezultat.status === "zakljucano") {
    odgovor = NextResponse.json(
      { greska: porukaZakljucano(rezultat.retry_after) },
      { status: 429, headers: { "Retry-After": String(rezultat.retry_after) } },
    );
  } else {
    // 422, not 401: the waiter's session is fine.
    odgovor = NextResponse.json({ greska: "PIN šefice nije ispravan." }, { status: 422 });
  }

  if (identitet?.noviKolacic) {
    odgovor.cookies.set(KOLACIC_UREDJAJA, identitet.noviKolacic, opcijeKolacica(TRAJANJE_UREDJAJA_S));
  }
  return odgovor;
});
