"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NEMA_VEZE } from "@/components/konobar/useMeni";
import { greskaIz } from "@/lib/api/greskaIz";
import { formatBroj, NAZIV_STANICE } from "@/lib/format";
import { CEKANJE_MS } from "@/lib/offline/sync";
import { useIspis } from "./useIspis";
import { brojIzUnosa, poredajStavke, sumnjivaTezina, type Stavka } from "./unos";

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

const kol = (s: Stavka) => `${formatBroj(s.kolicina)} ${s.jedinica}`;
const minute = (sada: string, kreirano: string) => Math.max(0, Math.floor((Date.parse(sada) - Date.parse(kreirano)) / 60000));

function Stavke({ narudzba }: { narudzba: Narudzba }) {
  return (
    <ul className="flex flex-col gap-2">
      {poredajStavke(narudzba.stavke).map(({ stavka, prilozi, uz }) => (
        <li key={stavka.id}>
          <span className={`text-lg font-semibold${stavka.stornoRazlog ? " line-through" : ""}`}>
            {kol(stavka)} {stavka.naziv}
            {uz && ` uz ${uz}`}
          </span>
          {stavka.stornoRazlog && <p className="font-bold">STORNO: {stavka.stornoRazlog}</p>}
          {stavka.napomena && <p>Napomena: {stavka.napomena}</p>}
          {prilozi.length > 0 && (
            <ul className="ml-6 list-disc">
              {prilozi.map((p) => (
                <li key={p.id}>
                  <span className={p.stornoRazlog ? "line-through" : ""}>
                    {kol(p)} {p.naziv} (uz)
                  </span>
                  {p.stornoRazlog && <p className="font-bold">STORNO: {p.stornoRazlog}</p>}
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
      <Stavke narudzba={narudzba} />
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
    <form onSubmit={predaj} className="flex flex-col gap-3 rounded-lg border-2 border-okvir p-3">
      <label className="flex flex-col gap-1">
        Cijena koju konobar plaća pečenjari (KM)
        <input inputMode="decimal" value={cijena} onChange={(e) => postaviCijenu(e.target.value)} className="min-h-12 rounded-lg border-2 border-okvir px-3" />
      </label>
      {jagnjetina.map((s) => (
        <label key={s.id} className="flex flex-col gap-1">
          Stvarna težina: {s.naziv} (naručeno {kol(s)}), kg
          <input
            inputMode="decimal"
            value={tezine[s.id] ?? ""}
            onChange={(e) => postaviTezine({ ...tezine, [s.id]: e.target.value })}
            className="min-h-12 rounded-lg border-2 border-okvir px-3"
          />
        </label>
      ))}
      {upozorenje && (
        <p role="alert" className="font-semibold text-greska">
          Provjerite težinu. Naručeno:{" "}
          {jagnjetina.map((s) => `${kol(s)}, upisano: ${tezine[s.id]} kg`).join("; ")}. Težina se ne može ispraviti. Ako je tačna, dodirnite ponovo.
        </p>
      )}
      <p role="alert" className="font-semibold text-greska">
        {greska}
      </p>
      <button type="submit" disabled={zauzeto} className="min-h-14 rounded-lg bg-akcent px-4 text-lg font-bold text-akcent-tekst disabled:opacity-60">
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

  const gotovoPecenjare = (n: Narudzba) => stanica === "pecenjara" && n.sljedeci === "Gotovo";

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="font-semibold text-greska">
        {greska}
      </p>
      {!red && !greska && <p role="status">Učitavam red…</p>}
      {red?.narudzbe.length === 0 && <p role="status">Nema narudžbi.</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {red?.narudzbe.map((n) => (
          <li key={n.id} className="flex flex-col gap-3 rounded-lg border-2 border-okvir bg-povrsina p-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-xl font-bold">Narudžba {n.broj}</h2>
              <span>Sto {n.stolovi.join(", ")}</span>
              <span>Konobar: {n.konobar}</span>
              <span>{n.status}</span>
            </div>
            <p>
              Čeka {minute(red.sada, n.kreirano)} min
              {n.cekaDugo && <strong className="ml-2 text-greska">Čeka dugo (15 min ili više)</strong>}
            </p>
            <Stavke narudzba={n} />
            {forma === n.id && gotovoPecenjare(n) ? (
              <FormaGotovo narudzba={n} zauzeto={zauzeto !== null} posalji={(t) => posalji(n, t)} />
            ) : (
              n.sljedeci && (
                <button
                  type="button"
                  disabled={zauzeto !== null}
                  aria-label={`${n.stavke.every((s) => s.stornoRazlog) ? "Ukloni storno" : n.sljedeci}, narudžba ${n.broj}`}
                  onClick={() => (gotovoPecenjare(n) ? postaviFormu(n.id) : posalji(n, { status: n.sljedeci }))}
                  className="min-h-14 rounded-lg bg-akcent px-4 text-lg font-bold text-akcent-tekst disabled:opacity-60"
                >
                  {n.stavke.every((s) => s.stornoRazlog) ? "Ukloni storno" : n.sljedeci}
                </button>
              )
            )}
            <button type="button" aria-label={`Ispiši listić, narudžba ${n.broj}`} onClick={() => postaviIspis({ n })} className="min-h-12 rounded-lg border-2 border-okvir px-4">
              Ispiši listić
            </button>
          </li>
        ))}
      </ul>
      {ispis && <Listic narudzba={ispis.n} stanica={stanica} />}
    </div>
  );
}
