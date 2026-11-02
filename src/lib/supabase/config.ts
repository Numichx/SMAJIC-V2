export type ModAplikacije = "supabase" | "demo" | "misconfigured";

const SUPABASE_VARIJABLE = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;

const MIN_DUZINA_TAJNE = 32;

export function modAplikacije(
  env: Record<string, string | undefined> = process.env,
): ModAplikacije {
  const postavljeno = SUPABASE_VARIJABLE.filter((ime) => env[ime]).length;
  const produkcija = env.NODE_ENV === "production";

  if (produkcija && (env.SESSION_SECRET?.length ?? 0) < MIN_DUZINA_TAJNE) return "misconfigured";
  if (postavljeno === SUPABASE_VARIJABLE.length) return "supabase";
  // Demo stores data in a local file, so it must never serve production.
  if (postavljeno === 0 && !produkcija) return "demo";
  return "misconfigured";
}
