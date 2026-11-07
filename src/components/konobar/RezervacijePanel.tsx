"use client";

import { useRef, useState } from "react";
import { cijeliIzUnosa } from "@/components/stanice/brojevi";
import { idPokusaja, pozovi, useLista } from "@/components/stanice/pozivi";
import { danasSarajevo, dodajDan, sarajevoUIso, satSarajevo } from "@/components/stanice/vrijeme";
import { dugme, glavno, polje } from "./stil";

const PRIJAVA = "/login?uloga=konobar";
type Rezervacija = {
  id: string;
  ime: string;
  brojGostiju: number;
  vrijeme: string;
  stoId: number | null;
  telefon: string | null;
  napomena: string | null;
  status: "aktivna" | "realizovana" | "otkazana";
};
const STATUS = { aktivna: "Aktivna", realizovana: "Realizovana", otkazana: "Otkazana" };

export default function RezervacijePanel() {
  const [dan, postaviDan] = useState(() => danasSarajevo());
  const lista = useLista<Rezervacija, { rezervacije: Rezervacija[]; imaJos: boolean }>(`/api/rezervacije?datum=${dan}`, "rezervacije", PRIJAVA);
  const [ime, postaviIme] = useState("");
  const [gosti, postaviGoste] = useState("");
  const [datum, postaviDatum] = useState(dan);
  const [sat, postaviSat] = useState("");
  const [sto, postaviSto] = useState("");
  const [telefon, postaviTelefon] = useState("");
  const [napomena, postaviNapomenu] = useState("");
  const [greska, postaviGresku] = useState("");
  const zauzeto = useRef(false);
  const pokusaj = useRef<{ kljuc: string; id: string } | null>(null);

  async function jednom(radi: () => Promise<void>) {
    if (zauzeto.current) return;
    zauzeto.current = true;
    postaviGresku("");
    try {
      await radi();
    } finally {
      zauzeto.current = false;
    }
  }

  function nova(e: React.FormEvent) {
    e.preventDefault();
    const g = cijeliIzUnosa(gosti);
    const s = sto.trim() === "" ? null : cijeliIzUnosa(sto);
    if (Number.isNaN(g) || g < 1) return postaviGresku("Unesite broj gostiju.");
    if (s !== null && (Number.isNaN(s) || s < 1 || s > 20)) return postaviGresku("Sto mora biti od 1 do 20, ili ostavite prazno.");
    if (!datum || !sat) return postaviGresku("Unesite datum i vrijeme.");
    const tijelo = {
      ime: ime.trim(),
      brojGostiju: g,
      vrijeme: sarajevoUIso(datum, sat),
      ...(s !== null && { stoId: s }),
      ...(telefon.trim() && { telefon: telefon.trim() }),
      ...(napomena.trim() && { napomena: napomena.trim() }),
    };
    return jednom(async () => {
      const id = idPokusaja(pokusaj, JSON.stringify(tijelo));
      const r = await pozovi("/api/rezervacije", PRIJAVA, "POST", { requestId: id, ...tijelo });
      if (!r.ok) return postaviGresku(r.greska);
      pokusaj.current = null;
      postaviIme("");
      postaviGoste("");
      postaviSto("");
      postaviTelefon("");
      postaviNapomenu("");
      // Show the day the reservation landed on.
      if (datum === dan) await lista.iznova();
      else postaviDan(datum);
    });
  }

  function promijeni(id: string, status: "realizovana" | "otkazana") {
    return jednom(async () => {
      const r = await pozovi("/api/rezervacije", PRIJAVA, "PATCH", { id, status });
      if (!r.ok) postaviGresku(r.greska);
      await lista.iznova();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="font-bold text-error">
        {greska || lista.greska}
      </p>

      <section aria-label="Rezervacije za dan" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={dugme} onClick={() => postaviDan(dodajDan(dan, -1))}>
            Prethodni dan
          </button>
          <label className="flex flex-col gap-1">
            Dan
            <input type="date" value={dan} onChange={(e) => e.target.value && postaviDan(e.target.value)} className={polje} />
          </label>
          <button type="button" className={dugme} onClick={() => postaviDan(dodajDan(dan, 1))}>
            Sljedeći dan
          </button>
        </div>
        {!lista.stavke && !lista.greska && <p role="status">Učitavam…</p>}
        {lista.stavke?.length === 0 && <p role="status">Nema rezervacija za ovaj dan.</p>}
        <ul className="grid gap-3 xl:grid-cols-2">
          {lista.stavke?.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-lg border-2 border-okvir bg-povrsina p-3">
              <strong className="text-lg">
                {satSarajevo(r.vrijeme)} {r.ime}
              </strong>
              <p>
                Gostiju: {r.brojGostiju}
                {r.stoId && `, sto ${r.stoId}`}
              </p>
              {r.telefon && <p>Telefon: {r.telefon}</p>}
              {r.napomena && <p>Napomena: {r.napomena}</p>}
              <p className="font-bold">{STATUS[r.status]}</p>
              {r.status === "aktivna" && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={dugme} aria-label={`Realizovana: ${satSarajevo(r.vrijeme)} ${r.ime}`} onClick={() => promijeni(r.id, "realizovana")}>
                    Realizovana
                  </button>
                  <button type="button" className={dugme} aria-label={`Otkazana: ${satSarajevo(r.vrijeme)} ${r.ime}`} onClick={() => promijeni(r.id, "otkazana")}>
                    Otkazana
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {lista.imaJos && (
          <button type="button" className={dugme} onClick={lista.jos}>
            Još rezervacija
          </button>
        )}
      </section>

      <form onSubmit={nova} aria-label="Nova rezervacija" className="flex flex-col gap-3 rounded-lg border-2 border-okvir p-3">
        <h2 className="text-xl font-bold">Nova rezervacija</h2>
        <label className="flex flex-col gap-1">
          Ime gosta
          <input value={ime} onChange={(e) => postaviIme(e.target.value)} maxLength={100} className={polje} />
        </label>
        <label className="flex flex-col gap-1">
          Broj gostiju
          <input inputMode="numeric" value={gosti} onChange={(e) => postaviGoste(e.target.value)} className={polje} />
        </label>
        <label className="flex flex-col gap-1">
          Datum
          <input type="date" value={datum} onChange={(e) => postaviDatum(e.target.value)} className={polje} />
        </label>
        <label className="flex flex-col gap-1">
          Vrijeme
          <input type="time" value={sat} onChange={(e) => postaviSat(e.target.value)} className={polje} />
        </label>
        <label className="flex flex-col gap-1">
          Sto (nije obavezan)
          <input inputMode="numeric" value={sto} onChange={(e) => postaviSto(e.target.value)} className={polje} />
        </label>
        <label className="flex flex-col gap-1">
          Telefon (nije obavezan)
          <input inputMode="tel" value={telefon} onChange={(e) => postaviTelefon(e.target.value)} maxLength={40} className={polje} />
        </label>
        <label className="flex flex-col gap-1">
          Napomena (nije obavezna)
          <input value={napomena} onChange={(e) => postaviNapomenu(e.target.value)} maxLength={500} className={polje} />
        </label>
        <button type="submit" className={glavno}>
          Spremi rezervaciju
        </button>
      </form>
    </div>
  );
}
