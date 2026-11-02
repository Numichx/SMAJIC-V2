import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { ApiGreska } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { KOLACIC_SESIJE, PRISTUP, tajnaSesije, type Odjeljak, type Sesija, type Uloga } from "./session";
import { provjeri } from "./sessionToken";

const KES_AKTIVNIH_MS = 30_000;
const kesAktivnih = new Map<string, { aktivan: boolean; do: number }>();

async function jeAktivan(id: string) {
  const sada = Date.now();
  const zapis = kesAktivnih.get(id);
  if (zapis && zapis.do > sada) return zapis.aktivan;

  const aktivan = await rpc<boolean>("zaposlenik_aktivan", { p_id: id });
  kesAktivnih.set(id, { aktivan, do: sada + KES_AKTIVNIH_MS });
  return aktivan;
}

export async function zahtijevajSesiju(request: NextRequest, dozvoljene?: readonly Uloga[]) {
  const sesija = provjeri<Sesija>("sesija", request.cookies.get(KOLACIC_SESIJE)?.value, tajnaSesije());
  if (!sesija || !(await jeAktivan(sesija.id))) throw new ApiGreska(401, "Prijavite se.");
  if (dozvoljene && !dozvoljene.includes(sesija.uloga)) throw new ApiGreska(403, "Nemate pristup.");
  return sesija;
}

export async function sesijaStranice(odjeljak: Odjeljak) {
  const prijava = `/login?uloga=${odjeljak}`;
  const sesija = provjeri<Sesija>(
    "sesija",
    (await cookies()).get(KOLACIC_SESIJE)?.value,
    process.env.SESSION_SECRET,
  );
  if (!sesija || !(await jeAktivan(sesija.id))) redirect(prijava);
  if (!PRISTUP[odjeljak].includes(sesija.uloga)) redirect(`/${sesija.uloga}`);
  return sesija;
}
