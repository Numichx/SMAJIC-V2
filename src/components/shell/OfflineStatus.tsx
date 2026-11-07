"use client";

import { dugme } from "@/components/konobar/stil";
import { useEffect, useState } from "react";
import { useRed, zatvoriIzvjestaj } from "@/lib/offline/queue";
import { pokreniSync } from "@/lib/offline/sync";

// shortcut: no service worker, because the proxy's per-request CSP nonce makes cached pages unsafe, so a page cannot be opened or reloaded without a connection and the queue only protects a page already open; revisit if the trial week shows waiters need it.
export default function OfflineStatus({ konobar }: { konobar: string }) {
  const [veza, postaviVezu] = useState(true);
  const { red, izvjestaji } = useRed();

  useEffect(() => pokreniSync(konobar, postaviVezu), [konobar]);

  if (veza && red.length === 0 && izvjestaji.length === 0) return null;
  return (
    <section aria-label="Stanje veze" className="flex flex-col gap-2 p-3">
      {!veza && (
        <p role="status" className="rounded-lg border-2 border-okvir bg-povrsina p-3 font-semibold">
          Nema veze sa serverom.
        </p>
      )}
      {red.length > 0 && (
        <div role="status" className="rounded-lg border-2 border-okvir bg-povrsina p-3">
          <p className="font-semibold">Narudžbi na čekanju: {red.length}. Još nisu u kuhinji.</p>
          <ul>
            {red.map((z) => (
              <li key={z.id}>
                Sto {z.tijelo.stoId}: {z.opis}
                {z.konobar !== konobar && ` (unio/la ${z.konobar}: šalje se tek kad se ta osoba prijavi)`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div role="alert">
        {izvjestaji.length > 0 && (
        <ul className="flex flex-col gap-2">
          {izvjestaji.map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-lg border-2 border-greska bg-povrsina p-3">
              <span className="flex-1 font-semibold">{i.poruka}</span>
              <button type="button" aria-label={`Zatvori: ${i.poruka}`} onClick={() => zatvoriIzvjestaj(i.id).catch(() => {})} className={dugme}>
                Zatvori
              </button>
            </li>
          ))}
        </ul>
        )}
      </div>
    </section>
  );
}
