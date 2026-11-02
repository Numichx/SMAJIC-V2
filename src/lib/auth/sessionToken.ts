import { createHmac, timingSafeEqual } from "node:crypto";

// The purpose is part of the signature, so a device cookie can never pass as a session.
function potpis(svrha: string, sadrzaj: string, tajna: string) {
  return createHmac("sha256", tajna).update(`${svrha}.${sadrzaj}`).digest("base64url");
}

export function potpisi(
  svrha: string,
  podaci: object,
  tajna: string,
  trajanjeS: number,
  sadaMs = Date.now(),
) {
  const exp = Math.floor(sadaMs / 1000) + trajanjeS;
  const sadrzaj = Buffer.from(JSON.stringify({ ...podaci, exp })).toString("base64url");
  return `${sadrzaj}.${potpis(svrha, sadrzaj, tajna)}`;
}

export function provjeri<T>(
  svrha: string,
  token: string | undefined,
  tajna: string | undefined,
  sadaMs = Date.now(),
): T | null {
  if (!token || !tajna) return null;

  const [sadrzaj, primljeni, visak] = token.split(".");
  if (!sadrzaj || !primljeni || visak !== undefined) return null;

  const a = Buffer.from(potpis(svrha, sadrzaj, tajna));
  const b = Buffer.from(primljeni);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const podaci = JSON.parse(Buffer.from(sadrzaj, "base64url").toString());
    if (typeof podaci.exp !== "number" || podaci.exp <= Math.floor(sadaMs / 1000)) return null;
    return podaci as T;
  } catch {
    return null;
  }
}
