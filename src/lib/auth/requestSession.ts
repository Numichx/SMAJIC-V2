import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { ApiGreska } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { KOLACIC_SESIJE, PRISTUP, tajnaSesije, type Odjeljak, type Sesija, type Uloga } from "./session";
import { provjeri } from "./sessionToken";

const KES_VAZECIH_MS = 30_000;
const kesVazecih = new Map<string, { vazeca: boolean; do: number }>();

async function jeVazeca({ id, v }: Sesija) {
  const kljuc = `${id}:${v}`;
  const sada = Date.now();
  const zapis = kesVazecih.get(kljuc);
  if (zapis && zapis.do > sada) return zapis.vazeca;

  const vazeca = await rpc<boolean>("sesija_vazeca", { p_id: id, p_verzija: v });
  kesVazecih.set(kljuc, { vazeca, do: sada + KES_VAZECIH_MS });
  return vazeca;
}

export async function zahtijevajSesiju(request: NextRequest, dozvoljene?: readonly Uloga[]) {
  const sesija = provjeri<Sesija>("sesija", request.cookies.get(KOLACIC_SESIJE)?.value, tajnaSesije());
  if (!sesija || !(await jeVazeca(sesija))) throw new ApiGreska(401, "Sesija je istekla. Prijavite se ponovo.");
  if (dozvoljene && !dozvoljene.includes(sesija.uloga)) throw new ApiGreska(403, "Nemate pravo pristupa ovom ekranu.");
  return sesija;
}

export async function sesijaStranice(odjeljak: Odjeljak) {
  const prijava = `/login?uloga=${odjeljak}`;
  const sesija = provjeri<Sesija>(
    "sesija",
    (await cookies()).get(KOLACIC_SESIJE)?.value,
    process.env.SESSION_SECRET,
  );
  if (!sesija || !(await jeVazeca(sesija))) redirect(prijava);
  if (!PRISTUP[odjeljak].includes(sesija.uloga)) redirect(`/${sesija.uloga}`);
  return sesija;
}
