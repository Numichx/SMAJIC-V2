"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { greskaIz } from "@/lib/api/greskaIz";
import { cijenePriloga, procjenaStavke } from "@/lib/domain/procjena";
import { formatKM } from "@/lib/format";
import MeniPrikaz from "./MeniPrikaz";
import RacunPrikaz, { type Racun } from "./RacunPrikaz";
import StoloAkcije from "./StoloAkcije";
import type { Proizvod } from "./tipovi";
import { NEMA_VEZE, PRIJAVA, useMeni } from "./useMeni";

type Stavka = { kljuc: number; proizvodId: string; kolicina: string; napomena: string; prilozi: { id: string; poseban: boolean }[] };

const MAX_STAVKI = 100;
const MAX_PRILOGA = 4;
const dugme = "min-h-12 min-w-12 rounded-lg border-2 border-okvir bg-povrsina px-4 font-semibold";
const glavno = "min-h-12 rounded-lg bg-akcent px-4 text-lg font-semibold text-akcent-tekst aria-disabled:opacity-60";
const polje = "min-h-12 w-full rounded-lg border-2 border-okvir bg-background px-3 text-lg";

const zarez = (n: number) => n.toString().replace(".", ",");

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
  const { meni, greska: greskaMenija } = useMeni();
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
  const requestId = useRef<string | null>(null);
  const brojac = useRef(0);

  useEffect(() => {
    Promise.all([fetch(`/api/racuni/sto/${stoId}`), fetch("/api/stolovi")])
      .then(async ([a, b]) => {
        if (a.status === 401 || b.status === 401) return window.location.assign(PRIJAVA);
        if (!a.ok) return postaviGresku(await greskaIz(a));
        if (!b.ok) return postaviGresku(await greskaIz(b));
        postaviRacun((await a.json()).racun);
        const stolovi: { id: number; racun: { id: string } | null }[] = (await b.json()).stolovi;
        const ovaj = stolovi.find((s) => s.id === stoId)?.racun?.id;
        postaviSlobodne(stolovi.filter((s) => !s.racun).map((s) => s.id));
        postaviZauzete(stolovi.filter((s) => s.racun && s.racun.id !== ovaj).map((s) => s.id));
        postaviUcitano(true);
      })
      .catch(() => postaviGresku(NEMA_VEZE));
  }, [stoId, osvjezenje]);

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

  async function posalji() {
    if (saljem || korpa.length === 0) return;
    postaviPoruku("");
    const stavke = [];
    for (const s of korpa) {
      const p = proizvodi.get(s.proizvodId);
      if (!p) return postaviGresku("Meni se promijenio. Osvježite stranicu.");
      const k = kolicinaIz(p, s.kolicina);
      if (typeof k === "string") return postaviGresku(k);
      if (s.napomena.length > 500) return postaviGresku(`Napomena za „${p.naziv}“ može imati najviše 500 znakova.`);
      stavke.push({
        proizvodId: p.id,
        kolicina: k,
        ...(s.napomena.trim() && { napomena: s.napomena.trim() }),
        ...(s.prilozi.length > 0 && { prilozi: s.prilozi.map((x) => (x.poseban ? { proizvodId: x.id, poseban: true } : { proizvodId: x.id })) }),
      });
    }
    if (imaPoseban && !/^\d{4,8}$/.test(pin)) return postaviGresku("Za poseban prilog unesite PIN šefice (4 do 8 cifara).");
    postaviGresku("");
    requestId.current ??= crypto.randomUUID();
    postaviSaljem(true);
    try {
      const odgovor = await fetch("/api/narudzbe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, stoId, stavke, ...(imaPoseban && { posebanPin: pin }) }),
      });
      if (odgovor.status === 401) return window.location.assign(PRIJAVA);
      if (odgovor.status === 201) {
        requestId.current = null;
        postaviKorpu([]);
        postaviPoruku("Narudžba je poslana.");
        osvjezi((n) => n + 1);
      } else {
        postaviGresku(await greskaIz(odgovor));
      }
    } catch {
      postaviGresku(NEMA_VEZE);
    } finally {
      postaviPin("");
      postaviSaljem(false);
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

      {!ucitano && !greska && <p>Učitavam račun…</p>}
      {ucitano &&
        (racun ? (
          <>
            <RacunPrikaz racun={racun} />
            <StoloAkcije stoId={stoId} slobodni={slobodni} zauzeti={zauzeti} onGotovo={nakonPrenosa} />
          </>
        ) : (
          <p>Sto je slobodan.</p>
        ))}

      <section aria-label="Nova narudžba" className="flex flex-col gap-3">
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
                      if (typeof k === "number") izmijeni(s.kljuc, { kolicina: zarez(Math.max(kg ? 0.001 : 1, Math.round((k - (kg ? 0.1 : 1)) * 1000) / 1000)) });
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
                      if (typeof k === "number") izmijeni(s.kljuc, { kolicina: zarez(Math.min(kg ? 100 : 200, Math.round((k + (kg ? 0.1 : 1)) * 1000) / 1000)) });
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

      <section aria-label="Meni" className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Meni</h2>
        {!meni && !greskaMenija && <p role="status">Učitavam meni…</p>}
        {meni && <MeniPrikaz meni={meni} onDodaj={dodaj} />}
      </section>
    </div>
  );
}
