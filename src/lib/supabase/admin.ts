import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let klijent: SupabaseClient | undefined;

// Server only: this client holds the secret key. Components must never import it.
export function admin() {
  klijent ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return klijent;
}
