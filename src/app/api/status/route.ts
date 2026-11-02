import { modAplikacije } from "@/lib/supabase/config";

export function GET() {
  const mod = modAplikacije();
  const ok = mod !== "misconfigured";

  return Response.json(
    { ok, mod },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
