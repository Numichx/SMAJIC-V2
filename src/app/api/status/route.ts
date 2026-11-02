import { connection } from "next/server";
import { modAplikacije } from "@/lib/supabase/config";

export async function GET() {
  // Cache Components would otherwise prerender this and freeze the mode at build time.
  await connection();

  const mod = modAplikacije();
  const ok = mod !== "misconfigured";

  return Response.json(
    { ok, mod },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
