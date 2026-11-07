"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dugme, glavno, polje } from "@/components/konobar/stil";
import { NEMA_VEZE } from "@/components/konobar/useMeni";
import { greskaIz } from "@/lib/api/greskaIz";
import { formatBroj, NAZIV_STANICE } from "@/lib/format";
import { CEKANJE_MS } from "@/lib/offline/sync";
import { useIspis } from "./useIspis";
import { brojIzUnosa, poredajStavke, sumnjivaTezina, zaPripremu, type Stavka } from "./unos";

type Stanica = "kuhinja" | "pecenjara" | "sank";
type Narudzba = {
  id: string;
  broj: number;
  status: string;
  sljedeci: string | null;
  kreirano: string;
  cekaDugo: boolean;
  konobar: string;
  stolovi: number[];
  stavke: Stavka[];
};

const kol = (s: Pick<Stavka, "kolicina" | "jedinica">) => `${formatBroj(s.kolicina)} ${s.jedinica}`;
// Order-state colours: the badge carries the colour, the card stays base-200.
const ZNACKA: Record<string, string> = { Novo: "badge-info", "U pripremi": "badge-outline badge-warning", Gotovo: "badge-success", Izdato: "badge-ghost text-izdato" };
// How long a status tap waits before it is sent, so a mis-tap in a rush can be taken back.
const ODGODA_MS = 4000;
const minute = (sada: string, kreirano: string) => Math.max(0, Math.floor((Date.parse(sada) - Date.parse(kreirano)) / 60000));

// naPapiru: the 58 mm slip keeps the print font, not the 28 px screen size.
function Stavke({ narudzba, naPapiru = false }: { narudzba: Narudzba; naPapiru?: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {poredajStavke(narudzba.stavke).map(({ stavka, prilozi, uz }) => (
        <li key={stavka.id}>
          <span className={`font-bold${naPapiru ? "" : " text-h2"}${stavka.stornoRazlog ? " line-through" : ""}`}>
            {kol(stavka)} {stavka.naziv}
            {uz && ` uz ${uz}`}
          </span>
          {stavka.stornoRazlog && <p className="font-bold">Stornirano: {stavka.stornoRazlog}</p>}
          {stavka.napomena && <p>Napomena: {stavka.napomena}</p>}
          {prilozi.length > 0 && (
            <ul className="ml-6 list-disc">
              {prilozi.map((p) => (
                <li key={p.id}>
                  <span className={p.stornoRazlog ? "line-through" : ""}>
                    {kol(p)} {p.naziv} (uz)
                  </span>
                  {p.stornoRazlog && <p className="font-bold">Stornirano: {p.stornoRazlog}</p>}
                  {p.napomena && <p>Napomena: {p.napomena}</p>}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Listic({ narudzba, stanica }: { narudzba: Narudzba; stanica: Stanica }) {
  return createPortal(
    <div className="stampa">
      <p>
        <strong>
          Narudžba {narudzba.broj} – {NAZIV_STANICE[stanica]}
        </strong>
      </p>
      <p>Sto: {narudzba.stolovi.join(", ")}</p>
      <p>Konobar: {narudzba.konobar}</p>
      <p>{new Date(narudzba.kreirano).toLocaleString("bs-BA")}</p>
      <hr />
      <Stavke narudzba={narudzba} naPapiru />
    </div>,
    document.body,
  );
}

function FormaGotovo({ narudzba, zauzeto, posalji }: { narudzba: Narudzba; zauzeto: boolean; posalji: (tijelo: object) => void }) {
  const [cijena, postaviCijenu] = useState("");
  const [tezine, postaviTezine] = useState<Record<number, string>>({});
  const [upozoren, postaviUpozoren] = useState("");
  const [greska, postaviGresku] = useState("");
  const jagnjetina = narudzba.stavke.filter((s) => s.trebaTezinu && !s.stornoRazlog);
  const potpis = JSON.stringify([cijena, tezine]);

  function predaj(e: React.FormEvent) {
    e.preventDefault();
    const c = brojIzUnosa(cijena);
    if (Number.isNaN(c)) return postaviGresku("Unesite cijenu, na primjer 12,50.");
    const kg = jagnjetina.map((s) => ({ stavkaId: s.id, kg: brojIzUnosa(tezine[s.id] ?? "") }));
    if (kg.some((t) => Number.isNaN(t.kg))) return postaviGresku("Unesite stvarnu težinu za svako jagnjeće jelo, na primjer 0,62.");
    postaviGresku("");
    const sumnjivo = jagnjetina.some((s, i) => sumnjivaTezina(kg[i].kg, s.kolicina));
    if (sumnjivo && upozoren !== potpis) return postaviUpozoren(potpis);
    posalji({ status: "Gotovo", cijena: c, ...(kg.length ? { tezine: kg } : {}) });
  }

  const upozorenje = upozoren === potpis;
  return (
    <form onSubmit={predaj} className="flex flex-col gap-3 rounded-box border-2 border-dim p-3">
      <label className="flex flex-col gap-1">
        Cijena koju konobar plaća pečenjari (KM)
        <input inputMode="decimal" value={cijena} onChange={(e) => postaviCijenu(e.target.value)} className={polje} />
      </label>
      {jagnjetina.map((s) => (
        <label key={s.id} className="flex flex-col gap-1">
          Stvarna težina: {s.naziv} (naručeno {kol(s)}), kg
          <input
            inputMode="decimal"
            value={tezine[s.id] ?? ""}
            onChange={(e) => postaviTezine({ ...tezine, [s.id]: e.target.value })}
            className={polje}
          />
        </label>
      ))}
      {upozorenje && (
        <p role="alert" className="font-bold text-error">
          Provjerite težinu. Naručeno:{" "}
          {jagnjetina.map((s) => `${kol(s)}, upisano: ${tezine[s.id]} kg`).join("; ")}. Težina se ne može ispraviti. Ako je tačna, dodirnite ponovo.
        </p>
      )}
      <p role="alert" className="font-bold text-error">
        {greska}
      </p>
      <button type="submit" disabled={zauzeto} className={`${glavno} btn-xl btn-block`}>
        {upozorenje ? "Težina je tačna, označi Gotovo" : "Gotovo"}
      </button>
    </form>
  );
}

export default function RedStanice({ stanica }: { stanica: Stanica }) {
  const [red, postaviRed] = useState<{ sada: string; narudzbe: Narudzba[] } | null>(null);
  const [greska, postaviGresku] = useState("");
  const [zauzeto, postaviZauzeto] = useState<string | null>(null);
  const [forma, postaviFormu] = useState<string | null>(null);
  const [ispis, postaviIspis] = useState<{ n: Narudzba } | null>(null);
  const uToku = useRef(false);
  const zauzetoRef = useRef(false);
  const prijava = `/login?uloga=${stanica === "sank" ? "konobar" : stanica}`;

  const ucitaj = useCallback(async () => {
    if (document.visibilityState !== "visible" || uToku.current) return;
    uToku.current = true;
    try {
      const odgovor = await fetch(`/api/narudzbe?stanica=${stanica}`, { signal: AbortSignal.timeout(CEKANJE_MS) });
      if (odgovor.status === 401) return window.location.assign(prijava);
      if (!odgovor.ok) return postaviGresku(await greskaIz(odgovor));
      postaviRed(await odgovor.json());
      postaviGresku("");
    } catch {
      postaviGresku(NEMA_VEZE);
    } finally {
      uToku.current = false;
    }
  }, [stanica, prijava]);

  useEffect(() => {
    const prvi = setTimeout(ucitaj, 0);
    const sat = setInterval(ucitaj, 3000);
    document.addEventListener("visibilitychange", ucitaj);
    return () => {
      clearTimeout(prvi);
      clearInterval(sat);
      document.removeEventListener("visibilitychange", ucitaj);
    };
  }, [ucitaj]);

  const ocistiIspis = useCallback(() => postaviIspis(null), []);
  useIspis(ispis, ocistiIspis);

  async function posalji(n: Narudzba, tijelo: object) {
    // A ref, not state: two taps in the same frame both see the same render's state.
    if (zauzetoRef.current) return;
    zauzetoRef.current = true;
    postaviZauzeto(n.id);
    postaviGresku("");
    try {
      const odgovor = await fetch(`/api/narudzbe/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tijelo),
      });
      if (odgovor.status === 401) return window.location.assign(prijava);
      if (!odgovor.ok) postaviGresku(await greskaIz(odgovor));
      else postaviFormu(null);
    } catch {
      postaviGresku(NEMA_VEZE);
    }
    zauzetoRef.current = false;
    postaviZauzeto(null);
    // Also after an error: a 422 means the queue moved on, and the card must show the real state.
    while (uToku.current) await new Promise((r) => setTimeout(r, 100));
    await ucitaj();
  }

  // A kitchen ticket rail: orders to cook hang oldest first (the server's order), finished ones wait on the pass.
  // Any other state lands on the pass, so no order is ever hidden.
  const naSini = (n: Narudzba) => n.status === "Novo" || n.status === "U pripremi";
  const zone = [
    { naslov: "Priprema", sina: true, narudzbe: red?.narudzbe.filter(naSini) ?? [] },
    { naslov: "Za izdavanje", sina: false, narudzbe: red?.narudzbe.filter((n) => !naSini(n)) ?? [] },
  ].filter((z) => z.narudzbe.length > 0);
  const priprema = red ? zaPripremu(red.narudzbe) : [];
  const sada = red?.sada ?? "";

  // The held tap is only delayed, never decided here: the server still checks every change.
  const odgodaRef = useRef<{ n: Narudzba; tijelo: object; sat: ReturnType<typeof setTimeout> } | null>(null);
  const [odgoda, postaviOdgodu] = useState<string | null>(null);

  function posaljiOdgodu() {
    const o = odgodaRef.current;
    if (!o) return;
    clearTimeout(o.sat);
    // posalji drops a call while another is in flight, so wait for it instead of losing the tap.
    if (zauzetoRef.current) {
      o.sat = setTimeout(posaljiOdgodu, 200);
      return;
    }
    odgodaRef.current = null;
    postaviOdgodu(null);
    return posalji(o.n, o.tijelo);
  }

  async function odgodi(n: Narudzba, tijelo: object) {
    if (zauzetoRef.current) return;
    await posaljiOdgodu(); // an earlier held tap goes out first
    odgodaRef.current = { n, tijelo, sat: setTimeout(posaljiOdgodu, ODGODA_MS) };
    postaviOdgodu(n.id);
  }

  function vrati() {
    if (odgodaRef.current) clearTimeout(odgodaRef.current.sat);
    odgodaRef.current = null;
    postaviOdgodu(null);
  }

  // Leaving the page must not lose a held tap: send it now, even as the page unloads.
  useEffect(
    () => () => {
      const o = odgodaRef.current;
      if (!o) return;
      clearTimeout(o.sat);
      void fetch(`/api/narudzbe/${o.n.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o.tijelo), keepalive: true }).catch(() => {});
    },
    [],
  );

  const gotovoPecenjare = (n: Narudzba) => stanica === "pecenjara" && n.sljedeci === "Gotovo";

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="font-bold text-error">
        {greska}
      </p>
      {!red && !greska && <p role="status">Učitavam red…</p>}
      {red?.narudzbe.length === 0 && <p role="status">Nema narudžbi. Nove se pojavljuju same.</p>}
      {priprema.length > 0 && (
        <section aria-labelledby="za-pripremu" className="flex flex-wrap items-center gap-2">
          <h2 id="za-pripremu" className="font-bold text-dim">
            Ukupno za pripremu:
          </h2>
          {priprema.map((z) => (
            <span key={`${z.naziv} ${z.jedinica}`} className="badge badge-lg h-auto gap-2 border-0 bg-base-200 py-2 font-bold">
              <span className="font-broj text-h3 text-primary">{kol(z)}</span>
              {z.naziv}
            </span>
          ))}
        </section>
      )}
      <div className="flex flex-col gap-6">
        {zone.map((z) => (
          <section key={z.naslov} aria-labelledby={z.sina ? "zona-priprema" : "zona-izdavanje"} className="flex flex-col gap-3">
            <h2 id={z.sina ? "zona-priprema" : "zona-izdavanje"} className="text-h3 font-bold">
              {z.naslov} <span className="text-dim">{z.narudzbe.length}</span>
            </h2>
            {/* The rail is copper; each slip is paper, so it takes the light theme even on the dark screen. */}
            <ul className={`grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] items-start gap-3 ${z.sina ? "border-t-8 border-primary" : ""}`}>
              {z.narudzbe.map((n) => (
                <li
                  key={n.id}
                  data-theme="svijetla"
                  className={`card bg-base-200 text-base-content ${z.sina ? "rounded-t-none " : ""}${n.cekaDugo ? "border-4 border-error" : "border-2 border-base-300"}${n.status === "Gotovo" ? " listic-gotovo" : ""}`}
                >
                  <div className="card-body gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="flex flex-col">
                        <span className="font-broj text-broj-xl font-bold leading-none">Sto {n.stolovi.join(", ")}</span>
                        <span className="text-dim">
                          Narudžba {n.broj}, {n.konobar}
                        </span>
                      </h3>
                      <button type="button" aria-label={`Ispiši listić, narudžba ${n.broj}`} onClick={() => postaviIspis({ n })} className="btn btn-outline h-11 border-dim">
                        Ispiši
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className={`badge badge-lg h-auto py-1 text-h3 font-bold ${ZNACKA[n.status] ?? "badge-outline"}`}>
                        {n.status === "Gotovo" && <span aria-hidden="true">✓</span>}
                        {n.status}
                      </span>
                      <p>
                        Čeka <span className={`font-broj text-broj-xl ${n.cekaDugo ? "text-error" : ""}`}>{minute(sada, n.kreirano)}</span> min
                      </p>
                    </div>
                    {n.cekaDugo && <strong className="text-error">Čeka dugo (15 min ili više)</strong>}
                    <Stavke narudzba={n} />
                    {forma === n.id && gotovoPecenjare(n) ? (
                      <FormaGotovo narudzba={n} zauzeto={zauzeto !== null} posalji={(t) => posalji(n, t)} />
                    ) : odgoda === n.id ? (
                      <button type="button" onClick={vrati} className={`${dugme} btn-xl btn-block`}>
                        Vrati – šaljem „{n.sljedeci}“
                      </button>
                    ) : (
                      n.sljedeci && (
                        <button
                          type="button"
                          disabled={zauzeto !== null}
                          aria-label={`${n.stavke.every((s) => s.stornoRazlog) ? "Ukloni storno" : n.sljedeci}, narudžba ${n.broj}`}
                          onClick={() => (gotovoPecenjare(n) ? postaviFormu(n.id) : odgodi(n, { status: n.sljedeci }))}
                          className={`${glavno} btn-xl btn-block`}
                        >
                          {n.stavke.every((s) => s.stornoRazlog) ? "Ukloni storno" : n.sljedeci}
                        </button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {ispis && <Listic narudzba={ispis.n} stanica={stanica} />}
    </div>
  );
}
