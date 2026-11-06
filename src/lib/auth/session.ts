import { ApiGreska } from "@/lib/api/greske";

export const ODJELJCI = ["konobar", "kuhinja", "pecenjara", "sank", "mesnica", "sefica", "pomoc"] as const;
export type Odjeljak = (typeof ODJELJCI)[number];
export type Uloga = Exclude<Odjeljak, "sank" | "pomoc">;
// Help pages open for any role, so they are not a login: a PIN there would match every role at once.
export const PRIJAVE = ODJELJCI.filter((o): o is Exclude<Odjeljak, "pomoc"> => o !== "pomoc");

export type Sesija = { id: string; ime: string; uloga: Uloga; v: number; exp: number };

export const KOLACIC_SESIJE = "smajic_sesija";
export const TRAJANJE_SESIJE_S = 18 * 60 * 60;

// Who may open each section. The bar has no staff of its own.
export const PRISTUP: Record<Odjeljak, readonly Uloga[]> = {
  konobar: ["konobar"],
  kuhinja: ["kuhinja"],
  pecenjara: ["pecenjara"],
  sank: ["konobar", "sefica"],
  mesnica: ["mesnica"],
  sefica: ["sefica"],
  pomoc: ["konobar", "kuhinja", "pecenjara", "mesnica", "sefica"],
};

export function jeOdjeljak(vrijednost: string | undefined): vrijednost is Odjeljak {
  return ODJELJCI.includes(vrijednost as Odjeljak);
}

export function tajnaSesije() {
  const tajna = process.env.SESSION_SECRET;
  if (!tajna) throw new ApiGreska(503, "Aplikacija nije postavljena. Javite se šefici.");
  return tajna;
}

export function opcijeKolacica(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  } as const;
}
