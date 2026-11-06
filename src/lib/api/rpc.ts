import type { Database } from "@/lib/supabase/database.types";
import { admin } from "@/lib/supabase/admin";
import { modAplikacije } from "@/lib/supabase/config";
import { ApiGreska } from "./greske";

type Funkcije = Database["public"]["Functions"];

// The one door to the data: the same SQL functions in both modes.
// The name is checked against database.types.ts. Arguments are not, because generated types cannot mark a
// parameter nullable; demoRpc checks their names in every test. Results are jsonb, so callers name their shape.
export async function rpc<T>(ime: keyof Funkcije, args: Record<string, unknown> = {}): Promise<T> {
  const mod = modAplikacije();
  if (mod === "misconfigured") throw new ApiGreska(503, "Aplikacija nije postavljena. Javite se šefici.");

  // The build removes this branch from production, so PGlite and the demo code never ship.
  if (process.env.NODE_ENV !== "production" && mod === "demo") {
    const { demoRpc } = await import("@/lib/demo/store");
    return (await demoRpc(ime, args)) as T;
  }

  const { data, error } = await admin().rpc(ime, args as never);
  if (error) throw error;
  return data as T;
}
