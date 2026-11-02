import { createHmac, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { potpisi, provjeri } from "./sessionToken";

export const KOLACIC_UREDJAJA = "smajic_uredjaj";
export const TRAJANJE_UREDJAJA_S = 365 * 24 * 60 * 60;

// The limits themselves live in SQL, in pin_zabiljezi_gresku.
export function identitetZahtjeva(request: NextRequest, tajna: string) {
  const iz = provjeri<{ u: string }>("uredjaj", request.cookies.get(KOLACIC_UREDJAJA)?.value, tajna);
  const uredjaj = iz?.u ?? randomUUID();
  const noviKolacic = iz ? null : potpisi("uredjaj", { u: uredjaj }, tajna, TRAJANJE_UREDJAJA_S);

  const adresa =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "nepoznato";
  // Hashed so the lockout table holds no real IP addresses.
  const ip = createHmac("sha256", tajna).update(adresa).digest("base64url");

  return { uredjaj, ip, noviKolacic };
}

export function porukaZakljucano(sekundi: number) {
  return `Previše pogrešnih pokušaja. Pokušajte ponovo za ${Math.ceil(sekundi / 60)} min.`;
}
