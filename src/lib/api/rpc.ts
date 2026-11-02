import { admin } from "@/lib/supabase/admin";
import { modAplikacije } from "@/lib/supabase/config";
import { ApiGreska } from "./greske";

// The one door to the data: the same SQL functions in both modes.
// shortcut: results are cast, not typed, until database.types.ts is generated after the first db push.
export async function rpc<T>(ime: string, args: Record<string, unknown> = {}): Promise<T> {
  const mod = modAplikacije();
  if (mod === "misconfigured") throw new ApiGreska(503, "Aplikacija nije postavljena. Javite se šefici.");

  // The build removes this branch from production, so PGlite and the demo code never ship.
  if (process.env.NODE_ENV !== "production" && mod === "demo") {
    const { demoRpc } = await import("@/lib/demo/store");
    return (await demoRpc(ime, args)) as T;
  }

  const { data, error } = await admin().rpc(ime, args);
  if (error) throw error;
  return data as T;
}
