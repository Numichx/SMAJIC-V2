"use client";

import { useRef, useState } from "react";
import { brojIzUnosa } from "@/components/stanice/unos";
import { greskaIz } from "@/lib/api/greskaIz";
import { podjelaPoOsobi, pregledNaplate, RAZLOZI_POPUSTA } from "@/lib/domain/naplata";
import { formatBroj, formatKM } from "@/lib/format";
import type { Racun } from "./RacunPrikaz";
import { dugme, glavno, polje } from "./stil";
import { NEMA_VEZE, PRIJAVA } from "./useMeni";

export type Placeno = {
  racunId: string;
  nacin: string;
  bruto: number;
  popust: number;
  ukupno: number;
  gostDao: number;
  gotovina: number;
  kartica: number;
  kusur: number;
  baksis: number;
  podijeljenoNa: number | null;
  podjela: number[] | null;
  stolovi: number[];
  vrijeme: string;
};

type Nacin = "gotovina" | "kartica" | "kombinovano" | "dug";
const NACINI: { id: Nacin; naziv: string }[] = [
  { id: "gotovina", naziv: "Gotovina" },
  { id: "kartica", naziv: "Kartica" },
  { id: "kombinovano", naziv: "Gotovina i kartica" },
  { id: "dug", naziv: "Na dug" },
];

const zarez = (n: number) => n.toFixed(2).replace(".", ",");

async function posaljiJson(adresa: string, tijelo: object) {
  return fetch(adresa, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tijelo) });
}

function Popust({ racun, onOsvjezi, prijavi }: { racun: Racun; onOsvjezi: () => void; prijavi: (g: string) => void }) {
  const [procenat, postaviProcenat] = useState("");
  const [razlog, postaviRazlog] = useState("");
  const [pin, postaviPin] = useState("");
  const [saljem, postaviSaljem] = useState(false);
  const zauzeto = useRef(false);
  const sto = razlog === "Obrok osoblja" || razlog === "Častimo";

  async function posalji(ukloni: boolean) {
    if (zauzeto.current) return;
    const p = ukloni ? 0 : sto ? 100 : brojIzUnosa(procenat);
    if (Number.isNaN(p) || p > 100 || (!ukloni && p === 0)) return prijavi("Popust mora biti od 0 do 100 %, na primjer 10 ili 12,5.");
    if (!ukloni && !razlog) return prijavi("Izaberite razlog popusta.");
    if (!/^\d{4,8}$/.test(pin)) return prijavi("Unesite PIN šefice (4 do 8 cifara).");
    zauzeto.current = true;
    postaviSaljem(true);
    prijavi("");
    try {
      const odgovor = await posaljiJson(`/api/racuni/${racun.id}/popust`, { procenat: p, ...(!ukloni && { razlog }), pin });
      if (odgovor.status === 401) return window.location.assign(PRIJAVA);
      if (!odgovor.ok) prijavi(await greskaIz(odgovor));
      else {
        postaviProcenat("");
        postaviRazlog("");
        onOsvjezi();
      }
    } catch {
      prijavi(NEMA_VEZE);
    } finally {
      postaviPin("");
      zauzeto.current = false;
      postaviSaljem(false);
    }
  }

  return (
    <section aria-label="Popust" className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Popust</h3>
      {racun.popust && (
        <p>
          Popust {formatBroj(racun.popust.procenat)} % ({racun.popust.razlog}): −{formatKM(racun.popust.iznos)}
        </p>
      )}
      <label className="flex flex-col gap-1">
        Razlog popusta
        <select
          className={polje}
          value={razlog}
          onChange={(e) => postaviRazlog(e.target.value)}
        >
          <option value="">Izaberite razlog</option>
          {RAZLOZI_POPUSTA.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Popust (%)
        <input className={polje} value={sto ? "100" : procenat} readOnly={sto} onChange={(e) => postaviProcenat(e.target.value)} inputMode="decimal" autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1">
        PIN šefice za popust
        <input className={polje} type="password" value={pin} onChange={(e) => postaviPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="off" maxLength={8} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={glavno} aria-disabled={saljem} onClick={() => posalji(false)}>
          Primijeni popust
        </button>
        {racun.popust && (
          <button type="button" className={dugme} aria-disabled={saljem} onClick={() => posalji(true)}>
            Ukloni popust
          </button>
        )}
      </div>
    </section>
  );
}

export default function Naplata({ racun, neposlano, onPlaceno, onOsvjezi }: { racun: Racun; neposlano: string; onPlaceno: (p: Placeno) => void; onOsvjezi: () => void }) {
  const [nacin, postaviNacin] = useState<Nacin>("gotovina");
  const [gotovina, postaviGotovinu] = useState("");
  const [kartica, postaviKarticu] = useState("");
  const [kusurUnos, postaviKusur] = useState<string | null>(null);
  const [gost, postaviGosta] = useState("");
  const [osoba, postaviOsobe] = useState("1");
  const [greska, postaviGresku] = useState("");
  const [saljem, postaviSaljem] = useState(false);
  const zauzeto = useRef(false);
  const pokusaj = useRef<{ kljuc: string; id: string } | null>(null);

  const ukupno = racun.ukupno;
  const nula = ukupno === 0;
  const g = gotovina.trim() === "" ? 0 : brojIzUnosa(gotovina);
  const k = kartica.trim() === "" ? 0 : brojIzUnosa(kartica);
  const imaGotovinu = nacin === "gotovina" || nacin === "kombinovano";
  const dano = imaGotovinu && !Number.isNaN(g) ? g : 0;
  const naKartici = (nacin === "kartica" || nacin === "kombinovano") && !Number.isNaN(k) ? k : 0;
  const kusurTekst = kusurUnos ?? zarez(pregledNaplate(ukupno, dano, naKartici, 0).najveciKusur);
  const kusur = brojIzUnosa(kusurTekst);
  const baksis = pregledNaplate(ukupno, dano, naKartici, imaGotovinu && !Number.isNaN(kusur) ? kusur : 0).baksis;
  const n = Number(osoba);
  const brojOsoba = Number.isInteger(n) && n >= 1 && n <= 100 ? n : 1;
  const udjeli = brojOsoba > 1 ? podjelaPoOsobi(ukupno, brojOsoba) : null;

  async function naplati() {
    if (zauzeto.current || neposlano) return;
    if (!Number.isInteger(n) || n < 1 || n > 100) return postaviGresku("Broj osoba mora biti od 1 do 100.");
    let tijelo: Record<string, unknown>;
    if (nula) tijelo = { nacin: "gotovina", gotovina: 0, vraceniKusur: 0 };
    else if (nacin === "gotovina") {
      if (Number.isNaN(g) || gotovina.trim() === "" || Number.isNaN(kusur)) return postaviGresku("Unesite koliko je gost dao i vraćeni kusur, na primjer 20,00.");
      tijelo = { nacin, gotovina: g, vraceniKusur: kusur };
    } else if (nacin === "kartica") {
      if (Number.isNaN(k)) return postaviGresku("Unesite iznos sa terminala, na primjer 20,00.");
      tijelo = { nacin, ...(k > 0 && { kartica: k }) };
    } else if (nacin === "kombinovano") {
      if (!(g > 0) || !(k > 0) || Number.isNaN(kusur)) return postaviGresku("Unesite gotovinu i karticu veće od 0 i vraćeni kusur.");
      tijelo = { nacin, gotovina: g, kartica: k, vraceniKusur: kusur };
    } else {
      const ime = gost.trim();
      if (ime.length < 2 || ime.length > 100) return postaviGresku("Ime dužnika mora imati od 2 do 100 znakova.");
      tijelo = { nacin, gostDuznik: ime };
    }
    if (brojOsoba > 1) tijelo.podijeljenoNa = brojOsoba;
    // The same attempt keeps its requestId, so a retry after a lost answer cannot charge twice. New amounts, a new one.
    const kljuc = JSON.stringify([racun.id, ukupno, tijelo]);
    if (pokusaj.current?.kljuc !== kljuc) pokusaj.current = { kljuc, id: crypto.randomUUID() };

    zauzeto.current = true;
    postaviSaljem(true);
    postaviGresku("");
    try {
      const odgovor = await posaljiJson(`/api/racuni/${racun.id}/naplata`, { requestId: pokusaj.current.id, ocekivano: ukupno, ...tijelo });
      if (odgovor.status === 401) return window.location.assign(PRIJAVA);
      if (odgovor.ok) return onPlaceno((await odgovor.json()).naplata);
      const poruka = await greskaIz(odgovor);
      postaviGresku(poruka);
      onOsvjezi();
    } catch {
      postaviGresku(NEMA_VEZE);
    } finally {
      zauzeto.current = false;
      postaviSaljem(false);
    }
  }

  function promijeniNacin(x: Nacin) {
    postaviNacin(x);
    postaviKusur(null);
    postaviGresku("");
  }

  return (
    <div className="flex flex-col gap-6">
      <Popust racun={racun} onOsvjezi={onOsvjezi} prijavi={postaviGresku} />
      <section aria-label="Naplata" className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Naplata</h3>
        <p className="text-xl font-bold">Za platiti: {formatKM(ukupno)}</p>
        {neposlano ? (
          <p role="status" className="font-semibold">
            {neposlano}
          </p>
        ) : !racun.sveIzdato ? (
          <p role="status" className="font-semibold">
            Naplata nije moguća dok kuhinja, pečenjara i šank ne izdaju sve narudžbe.
          </p>
        ) : nula ? (
          <button type="button" className={glavno} aria-disabled={saljem} onClick={naplati}>
            {saljem ? "Šaljem…" : "Zatvori račun"}
          </button>
        ) : (
          <>
            <div role="group" aria-label="Način plaćanja" className="flex flex-wrap gap-2">
              {NACINI.map((x) => (
                <button key={x.id} type="button" className={dugme} aria-pressed={nacin === x.id} onClick={() => promijeniNacin(x.id)}>
                  {x.naziv}
                </button>
              ))}
            </div>
            {imaGotovinu && (
              <label className="flex flex-col gap-1">
                Gost dao gotovinu (KM)
                <input
                  className={polje}
                  value={gotovina}
                  onChange={(e) => {
                    postaviGotovinu(e.target.value);
                    postaviKusur(null);
                  }}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </label>
            )}
            {(nacin === "kartica" || nacin === "kombinovano") && (
              <label className="flex flex-col gap-1">
                {nacin === "kartica" ? "Naplaćeno na terminalu, ako je više od iznosa (KM)" : "Naplaćeno karticom (KM)"}
                <input
                  className={polje}
                  value={kartica}
                  onChange={(e) => {
                    postaviKarticu(e.target.value);
                    postaviKusur(null);
                  }}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </label>
            )}
            {imaGotovinu && (
              <label className="flex flex-col gap-1">
                Vraćeni kusur (KM)
                <input className={polje} value={kusurTekst} onChange={(e) => postaviKusur(e.target.value)} inputMode="decimal" autoComplete="off" />
              </label>
            )}
            {nacin === "dug" && (
              <label className="flex flex-col gap-1">
                Ime dužnika
                <input className={polje} value={gost} onChange={(e) => postaviGosta(e.target.value)} maxLength={100} autoComplete="off" />
              </label>
            )}
            {nacin !== "dug" && <p>Baksiš: {formatKM(baksis)}</p>}
            {nacin !== "dug" && (
              <label className="flex flex-col gap-1">
                Podijeli na osoba
                <input className={polje} value={osoba} onChange={(e) => postaviOsobe(e.target.value)} inputMode="numeric" autoComplete="off" />
              </label>
            )}
            {udjeli && (
              <ul aria-label="Udjeli po osobi">
                {udjeli.map((u, i) => (
                  <li key={i}>
                    Osoba {i + 1}: {formatKM(u)}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={glavno} aria-disabled={saljem} onClick={naplati}>
              {saljem ? "Šaljem…" : "Naplati"}
            </button>
          </>
        )}
        <p role="alert" className="font-semibold text-greska">
          {greska}
        </p>
      </section>
    </div>
  );
}
