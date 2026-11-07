"use client";

import { dugme } from "@/components/konobar/stil";
import { useEffect, useRef, useState } from "react";
import { formatBroj, NAZIV_STANICE } from "@/lib/format";
import { CEKANJE_MS } from "@/lib/offline/sync";
import { PRIJAVA } from "./useMeni";

type Obavijest = { id: string; broj: number; stanica: string; stolovi: number[]; stavke: { naziv: string; kolicina: number; jedinica: string }[] };
type Prikaz = Obavijest & { kljuc: number };

const KURSOR = "obavijestiKursor";

const opis = (o: Obavijest) =>
  `Narudžba ${o.broj} (${NAZIV_STANICE[o.stanica] ?? o.stanica}) je izdata za sto ${o.stolovi.join(", ")}: ${o.stavke.map((s) => `${formatBroj(s.kolicina)} ${s.jedinica} ${s.naziv}`).join(", ")}`;

function pisti(ctx: AudioContext | null) {
  if (!ctx) return;
  // A tablet that slept leaves the context suspended, and it would then play nothing.
  ctx.resume();
  const osc = ctx.createOscillator();
  const jacina = ctx.createGain();
  osc.frequency.value = 880;
  jacina.gain.setValueAtTime(0.3, ctx.currentTime);
  jacina.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc.connect(jacina).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.6);
}

export default function ObavijestiKonobara() {
  const [prikazi, postaviPrikaze] = useState<Prikaz[]>([]);
  const [ukljuceno, postaviUkljuceno] = useState(false);
  const zvuk = useRef<AudioContext | null>(null);
  const brojac = useRef(0);

  // Both need a tap first: browsers refuse sound and permission requests that no user action asked for.
  function ukljuci() {
    const Kontekst = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Kontekst && !zvuk.current) zvuk.current = new Kontekst();
    postaviUkljuceno(true);
    // Not awaited before the state change: a browser that never answers the prompt must not leave the button stuck.
    zvuk.current?.resume().then(() => pisti(zvuk.current));
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  }

  useEffect(() => {
    let zivo = true;
    let uToku = false;
    async function ucitaj() {
      // Keeps polling in a hidden tab: that is the one time a browser Notification is the only signal.
      if (uToku) return;
      uToku = true;
      try {
        const od = sessionStorage.getItem(KURSOR);
        const odgovor = await fetch(od === null ? "/api/konobar/obavijesti" : `/api/konobar/obavijesti?od=${od}`, { signal: AbortSignal.timeout(CEKANJE_MS) });
        if (!zivo) return;
        if (odgovor.status === 401) return window.location.assign(PRIJAVA);
        if (!odgovor.ok) return;
        const { kursor, obavijesti } = (await odgovor.json()) as { kursor: number; obavijesti: Obavijest[] };
        sessionStorage.setItem(KURSOR, String(kursor));
        if (obavijesti.length === 0) return;
        postaviPrikaze((stare) => [...stare, ...obavijesti.map((o) => ({ ...o, kljuc: ++brojac.current }))]);
        pisti(zvuk.current);
        if ("Notification" in window && Notification.permission === "granted") {
          for (const o of obavijesti) new Notification(`Narudžba ${o.broj} je izdata`, { body: opis(o) });
        }
      } catch {
        // The next poll tries again; a banner for a lost connection would only add noise on the waiter's screen.
      } finally {
        uToku = false;
      }
    }
    ucitaj();
    const sat = setInterval(ucitaj, 10_000);
    document.addEventListener("visibilitychange", ucitaj);
    return () => {
      zivo = false;
      clearInterval(sat);
      document.removeEventListener("visibilitychange", ucitaj);
    };
  }, []);

  return (
    <section aria-label="Obavijesti" className="flex flex-col gap-2 p-3 empty:hidden">
      {!ukljuceno && (
        <button type="button" onClick={ukljuci} className="min-h-12 self-start rounded-lg border-2 border-dim px-4">
          Uključi zvuk i obavijesti
        </button>
      )}
      <div role="status">
        <ul className="flex flex-col gap-2">
        {prikazi.map((p) => (
          <li key={p.kljuc} className="flex items-center gap-3 rounded-lg border-2 border-base-content bg-base-200 p-3">
            <span className="flex-1 font-bold">{opis(p)}</span>
            <button
              type="button"
              aria-label={`Zatvori: ${opis(p)}`}
              onClick={() => postaviPrikaze((stare) => stare.filter((x) => x.kljuc !== p.kljuc))}
              className={dugme}
            >
              Zatvori
            </button>
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}
