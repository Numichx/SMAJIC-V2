import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiGreska, procitajTijelo, ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { pinShema } from "@/lib/auth/pin";
import {
  identitetZahtjeva,
  KOLACIC_UREDJAJA,
  porukaZakljucano,
  TRAJANJE_UREDJAJA_S,
} from "@/lib/auth/pinOgranicenje";
import {
  jeOdjeljak,
  KOLACIC_SESIJE,
  ODJELJCI,
  opcijeKolacica,
  PRISTUP,
  tajnaSesije,
  TRAJANJE_SESIJE_S,
  type Odjeljak,
  type Uloga,
} from "@/lib/auth/session";
import { potpisi } from "@/lib/auth/sessionToken";

// These sections log in with name plus PIN. The rest use the PIN alone.
const SA_IMENOM: readonly Odjeljak[] = ["konobar", "sank"];

const prijavaShema = z.strictObject({
  uloga: z.enum(ODJELJCI),
  zaposlenikId: z.uuid().optional(),
  pin: pinShema,
});

type Rezultat = {
  status: "ok" | "pogresan" | "zakljucano";
  retry_after: number;
  id: string | null;
  ime: string | null;
  uloga: Uloga | null;
  sesija_verzija: number | null;
};

export const GET = ruta(async (request: NextRequest) => {
  const uloga = request.nextUrl.searchParams.get("uloga") ?? undefined;
  if (!jeOdjeljak(uloga)) throw new ApiGreska(400, "Podaci nisu ispravni. Osvježite stranicu i pokušajte ponovo.");

  const zaposlenici = SA_IMENOM.includes(uloga)
    ? await rpc<{ id: string; ime: string }[]>("zaposlenici_za_prijavu", { p_uloge: PRISTUP[uloga] })
    : [];
  return Response.json({ saImenom: SA_IMENOM.includes(uloga), zaposlenici });
});

export const POST = ruta(async (request: NextRequest) => {
  const tajna = tajnaSesije();
  const { uloga, zaposlenikId, pin } = await procitajTijelo(request, prijavaShema);
  if (SA_IMENOM.includes(uloga) && !zaposlenikId) throw new ApiGreska(400, "Podaci nisu ispravni. Osvježite stranicu i pokušajte ponovo.");

  const { uredjaj, ip, noviKolacic } = identitetZahtjeva(request, tajna);
  const [rezultat] = await rpc<Rezultat[]>("prijava_pinom", {
    p_uloge: PRISTUP[uloga],
    p_zaposlenik: zaposlenikId ?? null,
    p_pin: pin,
    p_uredjaj: uredjaj,
    p_ip: ip,
  });

  let odgovor: NextResponse;
  if (rezultat.status === "ok") {
    odgovor = NextResponse.json({ ime: rezultat.ime, uloga: rezultat.uloga, pocetna: `/${uloga}` });
    odgovor.cookies.set(
      KOLACIC_SESIJE,
      potpisi(
        "sesija",
        { id: rezultat.id, ime: rezultat.ime, uloga: rezultat.uloga, v: rezultat.sesija_verzija },
        tajna,
        TRAJANJE_SESIJE_S,
      ),
      opcijeKolacica(TRAJANJE_SESIJE_S),
    );
  } else if (rezultat.status === "zakljucano") {
    odgovor = NextResponse.json(
      { greska: porukaZakljucano(rezultat.retry_after) },
      { status: 429, headers: { "Retry-After": String(rezultat.retry_after) } },
    );
  } else {
    odgovor = NextResponse.json({ greska: "Pogrešan PIN." }, { status: 401 });
  }

  if (noviKolacic) odgovor.cookies.set(KOLACIC_UREDJAJA, noviKolacic, opcijeKolacica(TRAJANJE_UREDJAJA_S));
  return odgovor;
});
