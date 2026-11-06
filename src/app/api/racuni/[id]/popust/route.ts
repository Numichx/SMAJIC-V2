import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiGreska, procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajCovjeka } from "@/lib/auth/covjek";
import { pinShema } from "@/lib/auth/pin";
import { identitetZahtjeva, KOLACIC_UREDJAJA, porukaZakljucano, TRAJANJE_UREDJAJA_S } from "@/lib/auth/pinOgranicenje";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { opcijeKolacica, tajnaSesije } from "@/lib/auth/session";
import { RAZLOZI_POPUSTA } from "@/lib/domain/naplata";

// procenat 0 removes the discount. The 100 % rule and the decimals are checked in odobri_popust.
const popustShema = z.strictObject({
  procenat: z.number().min(0).max(100),
  razlog: z.enum(RAZLOZI_POPUSTA).optional(),
  pin: pinShema,
});

type Rezultat =
  | { status: "ok"; racun: unknown }
  | { status: "pogresan" | "zakljucano"; retry_after: number };

// Only the manager's PIN approves this, so her session needs it as much as a waiter's device does.
export const POST = ruta(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const sesija = await zahtijevajSesiju(request, ["konobar", "sefica"]);
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new ApiGreska(400, "Neispravni podaci.");
  const { procenat, razlog, pin } = await procitajTijelo(request, popustShema);
  await zahtijevajCovjeka();

  const identitet = identitetZahtjeva(request, tajnaSesije());
  const rezultat = await rpc<Rezultat>("odobri_popust", {
    p_zaposlenik: sesija.id,
    p_racun: id.data,
    p_procenat: procenat,
    p_razlog: razlog ?? null,
    p_pin: pin,
    p_uredjaj: identitet.uredjaj,
    p_ip: identitet.ip,
  });

  let odgovor: NextResponse;
  if (rezultat.status === "ok") {
    odgovor = NextResponse.json({ racun: rezultat.racun });
  } else if (rezultat.status === "zakljucano") {
    odgovor = NextResponse.json(
      { greska: porukaZakljucano(rezultat.retry_after) },
      { status: 429, headers: { "Retry-After": String(rezultat.retry_after) } },
    );
  } else {
    // 422, not 401: the session is fine.
    odgovor = NextResponse.json({ greska: "PIN šefice nije ispravan." }, { status: 422 });
  }

  if (identitet.noviKolacic) {
    odgovor.cookies.set(KOLACIC_UREDJAJA, identitet.noviKolacic, opcijeKolacica(TRAJANJE_UREDJAJA_S));
  }
  return odgovor;
});
