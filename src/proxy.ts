import type { NextRequest } from "next/server";
import { zastita } from "@/lib/proxy";

export function proxy(request: NextRequest) {
  return zastita(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:jpg|jpeg|png|webp|svg|ico)$).*)"],
};
