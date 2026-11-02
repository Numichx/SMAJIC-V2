import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { kodShema, pinShema } from "@/lib/auth/pin";
import {
  identitetZahtjeva,
  KOLACIC_UREDJAJA,
  porukaZakljucano,
  TRAJANJE_UREDJAJA_S,
} from "@/lib/auth/pinOgranicenje";
import { opcijeKolacica, tajnaSesije } from "@/lib/auth/session";

const pinTijelo = z.strictObject({ kod: kodShema, noviPin: pinShema });

type Rezultat = { status: "ok" | "pogresan" | "zakljucano"; retry_after: number };

export const POST = ruta(async (request: NextRequest) => {
  const tajna = tajnaSesije();
  const { kod, noviPin } = await procitajTijelo(request, pinTijelo);

  const { uredjaj, ip, noviKolacic } = identitetZahtjeva(request, tajna);
  const [rezultat] = await rpc<Rezultat[]>("postavi_pin_kodom", {
    p_kod: kod,
    p_novi_pin: noviPin,
    p_uredjaj: uredjaj,
    p_ip: ip,
  });

  let odgovor: NextResponse;
  if (rezultat.status === "ok") {
    odgovor = NextResponse.json({ ok: true });
  } else if (rezultat.status === "zakljucano") {
    odgovor = NextResponse.json(
      { greska: porukaZakljucano(rezultat.retry_after) },
      { status: 429, headers: { "Retry-After": String(rezultat.retry_after) } },
    );
  } else {
    odgovor = NextResponse.json({ greska: "Kod nije ispravan ili je istekao." }, { status: 401 });
  }

  if (noviKolacic) odgovor.cookies.set(KOLACIC_UREDJAJA, noviKolacic, opcijeKolacica(TRAJANJE_UREDJAJA_S));
  return odgovor;
});
