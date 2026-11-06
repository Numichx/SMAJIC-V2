"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { greskaIz } from "@/lib/api/greskaIz";
import { cijenePriloga, procjenaStavke } from "@/lib/domain/procjena";
import { formatBroj, formatKM } from "@/lib/format";
import { dodajURed, trebaVezu, trenutniKonobar, useRed } from "@/lib/offline/queue";
import { CEKANJE_MS, isprazni } from "@/lib/offline/sync";
import MeniPrikaz from "./MeniPrikaz";
import Naplata, { type Placeno } from "./Naplata";
import NaplacenRacun from "./NaplacenRacun";
import RacunPrikaz, { type Racun } from "./RacunPrikaz";
import StoloAkcije from "./StoloAkcije";
import type { Proizvod } from "./tipovi";
import { dugme, glavno, polje } from "./stil";
import { NEMA_VEZE, PRIJAVA, useMeni } from "./useMeni";

type Stavka = { kljuc: number; proizvodId: string; kolicina: string; napomena: string; prilozi: { id: string; poseban: boolean }[] };

const MAX_STAVKI = 100;
const MAX_PRILOGA = 4;

// Returns the quantity as a number, or a Bosnian message.
function kolicinaIz(p: Proizvod, tekst: string): number | string {
  const n = Number(tekst.trim().replace(",", "."));
  if (p.jedinica === "kg") {
    const r = Math.round(n * 1000) / 1000;
    return tekst.trim() !== "" && r >= 0.001 && r <= 100 ? r : `Količina za „${p.naziv}“ mora biti od 0,001 do 100 kg.`;
  }
  return Number.isInteger(n) && tekst.trim() !== "" && n >= 1 && n <= 200 ? n : `Količina za „${p.naziv}“ mora biti cijeli broj od 1 do 200.`;
}

export default function NarudzbaEditor({ stoId }: { stoId: number }) {
  const router = useRouter();
  const { meni, greska: greskaMenija, izKopije } = useMeni();
  const { red } = useRed();
  const [racun, postaviRacun] = useState<Racun | null>(null);
  const [slobodni, postaviSlobodne] = useState<number[]>([]);
  const [zauzeti, postaviZauzete] = useState<number[]>([]);
  const [ucitano, postaviUcitano] = useState(false);
  const [osvjezenje, osvjezi] = useState(0);
  const [korpa, postaviKorpu] = useState<Stavka[]>([]);
  const [pin, postaviPin] = useState("");
  const [greska, postaviGresku] = useState("");
  const [poruka, postaviPoruku] = useState("");
  const [saljem, postaviSaljem] = useState(false);
  const [placeno, postaviPlaceno] = useState<Placeno | null>(null);
  const requestId = useRef<string | null>(null);
  const stornoZauzeto = useRef(false);
  const pocetno = useRef(false);
  const brojac = useRef(0);

  useEffect(() => {
    Promise.all([fetch(`/api/racuni/sto/${stoId}`, { signal: AbortSignal.timeout(CEKANJE_MS) }), fetch("/api/stolovi", { signal: AbortSignal.timeout(CEKANJE_MS) })])
      .then(async ([a, b]) => {
        if (a.status === 401 || b.status === 401) return window.location.assign(PRIJAVA);
        // Only the first load shows its error: later reloads run in the background and stay silent.
        if (!a.ok || !b.ok) return pocetno.current ? undefined : postaviGresku(await greskaIz(a.ok ? b : a));
        if (!pocetno.current) postaviGresku("");
        postaviRacun((await a.json()).racun);
        const stolovi: { id: number; racun: { id: string } | null }[] = (await b.json()).stolovi;
        const ovaj = stolovi.find((s) => s.id === stoId)?.racun?.id;
        postaviSlobodne(stolovi.filter((s) => !s.racun).map((s) => s.id));
        postaviZauzete(stolovi.filter((s) => s.racun && s.racun.id !== ovaj).map((s) => s.id));
        postaviUcitano(true);
        pocetno.current = true;
      })
      .catch(() => (pocetno.current ? undefined : postaviGresku(NEMA_VEZE)));
  }, [stoId, osvjezenje]);

  // Orders become issued at the stations, so an open bill is reloaded while visible. The cart and payment form are separate state.
  useEffect(() => {
    if (placeno) return;
    const sat = setInterval(() => document.visibilityState === "visible" && osvjezi((n) => n + 1), 10000);
    return () => clearInterval(sat);
  }, [placeno]);

  const proizvodi = useMemo(() => new Map(meni?.kategorije.flatMap((k) => k.proizvodi).map((p) => [p.id, p])), [meni]);

  // Any change to the cart means a different order, so it gets a new requestId when sent.
  function promijeni(fn: (k: Stavka[]) => Stavka[]) {
    requestId.current = null;
    postaviPoruku("");
    postaviKorpu(fn);
  }
  const izmijeni = (kljuc: number, dio: Partial<Stavka>) =>
    promijeni((k) => k.map((s) => (s.kljuc === kljuc ? { ...s, ...dio } : s)));

  function dodaj(p: Proizvod) {
    if (korpa.length >= MAX_STAVKI) return postaviGresku(`Narudžba može imati najviše ${MAX_STAVKI} stavki.`);
    postaviGresku("");
    const zadani = p.prilog?.podrazumijevani;
    promijeni((k) => [
      ...k,
      {
        kljuc: ++brojac.current,
        proizvodId: p.id,
        kolicina: "1",
        napomena: "",
        prilozi: zadani && meni?.prilozi.includes(zadani) ? [{ id: zadani, poseban: false }] : [],
      },
    ]);
  }

  const nazivPriloga = (id: string) => proizvodi.get(id)?.naziv ?? "Prilog";
  const cijenaPriloga = (id: string) => proizvodi.get(id)?.cijena ?? 0;
  const saCijenom = (s: Stavka) => s.prilozi.map((x) => ({ ...x, cijena: cijenaPriloga(x.id) }));

  const procjena = korpa.reduce((zbir, s) => {
    const p = proizvodi.get(s.proizvodId);
    const k = p ? kolicinaIz(p, s.kolicina) : 0;
    if (!p || typeof k !== "number") return zbir;
    return zbir + procjenaStavke(p.cijena, k, p.jedinica, saCijenom(s), p.prilog?.besplatni ?? []);
  }, 0);
  const imaPoseban = korpa.some((s) => s.prilozi.some((x) => x.poseban));
  // Merged tables share one bill, so an order waiting for any of them blocks its payment.
  const cekajuZaSto = red.filter((z) => (racun?.stolovi ?? [stoId]).includes(z.tijelo.stoId));
  const mojeCekaju = cekajuZaSto.filter((z) => z.konobar === trenutniKonobar());
  // Nobody on this device can clear another waiter's order, so it warns but does not block payment.
  const imaTudjih = mojeCekaju.length < cekajuZaSto.length;
  const neposlano =
    korpa.length > 0
      ? "Imate neposlane stavke u korpi. Pošaljite narudžbu ili uklonite stavke prije naplate."
      : mojeCekaju.length > 0
        ? "Narudžba za ovaj sto još čeka vezu i nije na računu. Naplata je moguća kad se pošalje."
        : "";

  async function posalji() {
    if (saljem || korpa.length === 0) return;
    postaviPoruku("");
    const stavke = [];
    const opis = [];
    for (const s of korpa) {
      const p = proizvodi.get(s.proizvodId);
      if (!p) return postaviGresku("Meni se promijenio. Osvježite stranicu.");
      const k = kolicinaIz(p, s.kolicina);
      if (typeof k === "string") return postaviGresku(k);
      if (s.napomena.length > 500) return postaviGresku(`Napomena za „${p.naziv}“ može imati najviše 500 znakova.`);
      opis.push(`${formatBroj(k)} ${p.jedinica} ${p.naziv}${s.prilozi.map((x) => ` + ${nazivPriloga(x.id)}`).join("")}`);
      stavke.push({
        proizvodId: p.id,
        kolicina: k,
        ...(s.napomena.trim() && { napomena: s.napomena.trim() }),
        ...(s.prilozi.length > 0 && { prilozi: s.prilozi.map((x) => (x.poseban ? { proizvodId: x.id, poseban: true } : { proizvodId: x.id })) }),
      });
    }
    if (imaPoseban && !/^\d{4,8}$/.test(pin)) return postaviGresku("Za poseban prilog unesite PIN šefice (4 do 8 cifara).");
    postaviGresku("");
    const id = (requestId.current ??= crypto.randomUUID());
    // A slow send leaves the screen usable, so only what this send carried leaves the cart.
    const poslani = new Set(korpa.map((s) => s.kljuc));
    const ukloniPoslane = () => postaviKorpu((k) => k.filter((s) => !poslani.has(s.kljuc)));
    postaviSaljem(true);
    try {
      const odgovor = await fetch("/api/narudzbe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, stoId, stavke, ...(imaPoseban && { posebanPin: pin }) }),
        signal: AbortSignal.timeout(CEKANJE_MS),
      });
      if (odgovor.status === 401) return window.location.assign(PRIJAVA);
      if (odgovor.status === 201) {
        requestId.current = null;
        ukloniPoslane();
        postaviPoruku("Narudžba je poslana.");
        osvjezi((n) => n + 1);
      } else {
        postaviGresku(await greskaIz(odgovor));
      }
    } catch {
      if (trebaVezu(stavke)) {
        postaviGresku("Nema veze. Poseban prilog traži vezu jer ga šefica odobrava PIN-om, pa narudžba nije spremljena. Ostala je u korpi.");
      } else {
        try {
          // The same requestId: the server may have received the first try, and the retry then returns that result.
          await dodajURed({ requestId: id, stoId, stavke }, opis.join(", "), racun?.id);
          requestId.current = null;
          ukloniPoslane();
          isprazni();
        } catch {
          postaviGresku("Nema veze, a ovaj uređaj ne može spremiti narudžbu. Ostala je u korpi: pokušajte ponovo ili je javite usmeno.");
        }
      }
    } finally {
      postaviPin("");
      postaviSaljem(false);
    }
  }

  async function storno(stavkaId: number, razlog: string) {
    if (stornoZauzeto.current) return;
    stornoZauzeto.current = true;
    postaviGresku("");
    try {
      const odgovor = await fetch(`/api/narudzbe/stavka/${stavkaId}/storno`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ razlog }),
      });
      if (odgovor.status === 401) return window.location.assign(PRIJAVA);
      if (!odgovor.ok) postaviGresku(await greskaIz(odgovor));
      osvjezi((n) => n + 1);
    } catch {
      postaviGresku(NEMA_VEZE);
    } finally {
      stornoZauzeto.current = false;
    }
  }

  function nakonPrenosa(idiNa: number | null) {
    if (idiNa !== null && idiNa !== stoId) router.push(`/konobar/stolovi/${idiNa}`);
    else osvjezi((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/konobar" className="inline-flex min-h-12 items-center underline">
          Nazad na stolove
        </Link>
        <h1 className="text-2xl font-semibold">Sto {stoId}</h1>
      </div>
      <div>
        <p role="alert" className="font-semibold text-greska">
          {greska || greskaMenija}
        </p>
        <p role="status">{poruka}</p>
      </div>

      {placeno && <NaplacenRacun p={placeno} />}
      {!ucitano && !greska && <p>Učitavam račun…</p>}
      {ucitano &&
        !placeno &&
        (racun ? (
          <>
            <RacunPrikaz racun={racun} onStorno={storno} />
            <Naplata racun={racun} neposlano={neposlano} onPlaceno={postaviPlaceno} onOsvjezi={() => osvjezi((n) => n + 1)} />
            <StoloAkcije stoId={stoId} slobodni={slobodni} zauzeti={zauzeti} onGotovo={nakonPrenosa} />
          </>
        ) : (
          <p>Sto je slobodan.</p>
        ))}
      {cekajuZaSto.length > 0 && (
        <p role="status" className="font-semibold">
          Čeka slanje za ovaj sto: {cekajuZaSto.length}. To još NIJE u kuhinji ni na računu, a šalje se samo kad se veza vrati.
          {imaTudjih && " Među njima je narudžba drugog konobara, koja ide tek kad se ta osoba prijavi. Naplata je ne čeka."}
        </p>
      )}

      <section aria-label="Nova narudžba" hidden={!!placeno} className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Nova narudžba</h2>
        {korpa.length === 0 && <p>Korpa je prazna.</p>}
        <ul className="flex flex-col gap-3">
          {korpa.map((s) => {
            const p = proizvodi.get(s.proizvodId);
            if (!p) return null;
            const kg = p.jedinica === "kg";
            const cijene = cijenePriloga(saCijenom(s), p.prilog?.besplatni ?? []);
            const slobodnoJos = !cijene.includes(0);
            const dostupni = (meni?.prilozi ?? []).filter((id) => !s.prilozi.some((x) => x.id === id));
            return (
              <li key={s.kljuc} className="flex flex-col gap-2 rounded-lg border-2 border-okvir p-3">
                <p className="text-lg font-semibold">
                  {p.naziv} <span className="font-normal">{formatKM(p.cijena)}/{p.jedinica}</span>
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <button
                    type="button"
                    className={dugme}
                    aria-label={`Smanji količinu za ${p.naziv}`}
                    onClick={() => {
                      const k = kolicinaIz(p, s.kolicina);
                      if (typeof k === "number") izmijeni(s.kljuc, { kolicina: formatBroj(Math.max(kg ? 0.001 : 1, Math.round((k - (kg ? 0.1 : 1)) * 1000) / 1000)) });
                    }}
                  >
                    −
                  </button>
                  <label className="flex flex-col gap-1">
                    {kg ? "Količina (kg)" : "Količina"}
                    <input
                      className={`${polje} w-28`}
                      value={s.kolicina}
                      onChange={(e) => izmijeni(s.kljuc, { kolicina: e.target.value })}
                      inputMode={kg ? "decimal" : "numeric"}
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    className={dugme}
                    aria-label={`Povećaj količinu za ${p.naziv}`}
                    onClick={() => {
                      const k = kolicinaIz(p, s.kolicina);
                      if (typeof k === "number") izmijeni(s.kljuc, { kolicina: formatBroj(Math.min(kg ? 100 : 200, Math.round((k + (kg ? 0.1 : 1)) * 1000) / 1000)) });
                    }}
                  >
                    +
                  </button>
                  <button type="button" className={dugme} onClick={() => promijeni((k) => k.filter((x) => x.kljuc !== s.kljuc))}>
                    Ukloni
                  </button>
                </div>
                <label className="flex flex-col gap-1">
                  Napomena
                  <input
                    className={polje}
                    value={s.napomena}
                    maxLength={500}
                    onChange={(e) => izmijeni(s.kljuc, { napomena: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                {p.prilog && (
                  <div className="flex flex-col gap-2">
                    <p className="font-semibold">
                      Prilozi{p.prilog.jednaPorcija && " (jedna porcija)"} · najviše {MAX_PRILOGA}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {s.prilozi.map((x, i) => (
                        <li key={x.id} className="flex flex-wrap items-center gap-2">
                          <span>
                            {nazivPriloga(x.id)}: {cijene[i] === 0 ? "uključeno" : formatKM(cijene[i])}
                          </span>
                          <label className="flex min-h-12 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={x.poseban}
                              className="size-6"
                              onChange={(e) => izmijeni(s.kljuc, { prilozi: s.prilozi.map((y) => (y.id === x.id ? { ...y, poseban: e.target.checked } : y)) })}
                            />
                            Poseban
                          </label>
                          <button type="button" className={dugme} aria-label={`Ukloni prilog ${nazivPriloga(x.id)}`} onClick={() => izmijeni(s.kljuc, { prilozi: s.prilozi.filter((y) => y.id !== x.id) })}>
                            Ukloni
                          </button>
                        </li>
                      ))}
                    </ul>
                    {s.prilozi.length < MAX_PRILOGA ? (
                      <div role="group" aria-label={`Dodaj prilog uz ${p.naziv}`} className="flex flex-wrap gap-2">
                        {dostupni.map((id) => (
                          <button key={id} type="button" className={dugme} onClick={() => izmijeni(s.kljuc, { prilozi: [...s.prilozi, { id, poseban: false }] })}>
                            + {nazivPriloga(id)} ({slobodnoJos && p.prilog?.besplatni.includes(id) ? "uključeno" : formatKM(cijenaPriloga(id))})
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>Najviše {MAX_PRILOGA} priloga uz jelo.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {imaPoseban && (
          <label className="flex flex-col gap-1">
            PIN šefice za poseban prilog
            <input
              className={polje}
              type="password"
              value={pin}
              onChange={(e) => postaviPin(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
            />
          </label>
        )}
        {korpa.length > 0 && (
          <>
            <p className="text-lg font-semibold">Procjena: {formatKM(procjena)}</p>
            <button type="button" className={glavno} aria-disabled={saljem} onClick={posalji}>
              {saljem ? "Šaljem…" : "Pošalji narudžbu"}
            </button>
          </>
        )}
      </section>

      <section aria-label="Meni" hidden={!!placeno} className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Meni</h2>
        {izKopije && <p role="status">Prikazana je zadnja spremljena kopija menija. Cijene potvrđuje server pri slanju.</p>}
        {!meni && !greskaMenija && <p role="status">Učitavam meni…</p>}
        {meni && <MeniPrikaz meni={meni} onDodaj={dodaj} />}
      </section>
    </div>
  );
}
