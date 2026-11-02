"use client";

import { useEffect, useRef, useState } from "react";
import { greskaIz } from "@/lib/api/greskaIz";
import type { Odjeljak } from "@/lib/auth/session";

type Zaposlenik = { id: string; ime: string };

const NEMA_VEZE = "Nema veze sa serverom. Pokušajte ponovo.";

const dugme = "min-h-12 rounded-lg border-2 border-okvir bg-povrsina px-4 text-lg font-semibold";
const glavno = "min-h-12 rounded-lg bg-akcent px-4 text-lg font-semibold text-akcent-tekst aria-disabled:opacity-60";
const polje = "min-h-12 w-full rounded-lg border-2 border-okvir bg-background px-3 text-lg";

export default function LoginForm({ uloga }: { uloga: Odjeljak }) {
  const [aktivacija, postaviAktivaciju] = useState(false);
  const [saImenom, postaviSaImenom] = useState(false);
  const [zaposlenici, postaviZaposlenike] = useState<Zaposlenik[]>([]);
  const [ucitano, postaviUcitano] = useState(false);
  const [odabran, postaviOdabranog] = useState<string | null>(null);
  const [pin, postaviPin] = useState("");
  const [kod, postaviKod] = useState("");
  const [noviPin, postaviNoviPin] = useState("");
  const [ponovljeni, postaviPonovljeni] = useState("");
  const [greska, postaviGresku] = useState("");
  const [poruka, postaviPoruku] = useState("");
  const [saljem, postaviSaljem] = useState(false);

  const [osvjezenje, osvjezi] = useState(0);

  const prvo = useRef<HTMLInputElement>(null);
  const prviPut = useRef(true);
  useEffect(() => {
    if (prviPut.current) {
      prviPut.current = false;
      return;
    }
    prvo.current?.focus();
  }, [aktivacija]);

  useEffect(() => {
    fetch(`/api/prijava?uloga=${uloga}`)
      .then(async (odgovor) => {
        if (!odgovor.ok) return postaviGresku(await greskaIz(odgovor));
        const tijelo = await odgovor.json();
        postaviSaImenom(tijelo.saImenom);
        postaviZaposlenike(tijelo.zaposlenici);
        postaviUcitano(true);
      })
      .catch(() => postaviGresku(NEMA_VEZE));
  }, [uloga, osvjezenje]);

  async function prijavi(e: React.FormEvent) {
    e.preventDefault();
    if (saljem) return;
    if (saImenom && !odabran) return postaviGresku("Izaberite svoje ime.");
    if (pin.length < 4) return postaviGresku("PIN ima 4 do 8 cifara.");
    postaviGresku("");
    postaviPoruku("");
    postaviSaljem(true);
    try {
      const odgovor = await fetch("/api/prijava", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saImenom && odabran ? { uloga, pin, zaposlenikId: odabran } : { uloga, pin }),
      });
      if (odgovor.ok) {
        const tijelo = await odgovor.json();
        window.location.assign(tijelo.pocetna);
        return;
      }
      postaviGresku(await greskaIz(odgovor));
      postaviPin("");
    } catch {
      postaviGresku(NEMA_VEZE);
    }
    postaviSaljem(false);
  }

  async function postaviNovi(e: React.FormEvent) {
    e.preventDefault();
    if (saljem) return;
    postaviGresku("");
    if (kod.length !== 6) return postaviGresku("Aktivacijski kod ima 6 cifara.");
    if (!/^\d{4,8}$/.test(noviPin)) return postaviGresku("PIN mora imati 4 do 8 cifara.");
    if (noviPin !== ponovljeni) return postaviGresku("PIN-ovi se ne podudaraju.");
    postaviSaljem(true);
    try {
      const odgovor = await fetch("/api/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kod, noviPin }),
      });
      if (odgovor.ok) {
        postaviKod("");
        postaviNoviPin("");
        postaviPonovljeni("");
        postaviAktivaciju(false);
        postaviPoruku("PIN je postavljen. Možete se prijaviti.");
        osvjezi((n) => n + 1);
      } else {
        postaviGresku(await greskaIz(odgovor));
      }
    } catch {
      postaviGresku(NEMA_VEZE);
    }
    postaviSaljem(false);
  }

  function prebaci(uAktivaciju: boolean) {
    postaviGresku("");
    postaviPoruku("");
    postaviAktivaciju(uAktivaciju);
  }

  const poruke = (
    <div>
      <p role="status">{poruka}</p>
      <p id="greska-forme" role="alert" className="font-semibold text-greska">
        {greska}
      </p>
    </div>
  );

  if (aktivacija) {
    return (
      <form onSubmit={postaviNovi} noValidate className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Aktivacijski kod
          <input
            className={polje}
            value={kod}
            onChange={(e) => postaviKod(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            ref={prvo}
            aria-invalid={!!greska}
            aria-describedby="greska-forme"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>
            Novi PIN <span id="novi-pin-savjet" className="text-base">4 do 8 cifara</span>
          </span>
          <input
            className={polje}
            type="password"
            value={noviPin}
            onChange={(e) => postaviNoviPin(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={8}
            aria-invalid={!!greska}
            aria-describedby="novi-pin-savjet greska-forme"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>
            Ponovite PIN <span id="ponovljeni-pin-savjet" className="text-base">4 do 8 cifara</span>
          </span>
          <input
            className={polje}
            type="password"
            value={ponovljeni}
            onChange={(e) => postaviPonovljeni(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={8}
            aria-describedby="ponovljeni-pin-savjet greska-forme"
          />
        </label>
        {poruke}
        <button type="submit" className={glavno} aria-disabled={saljem}>
          {saljem ? "Postavljam…" : "Postavi PIN"}
        </button>
        <button type="button" className={dugme} onClick={() => prebaci(false)}>
          Nazad na prijavu
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={prijavi} noValidate className="flex flex-col gap-4">
      {saImenom && ucitano && zaposlenici.length === 0 && (
        <p>Još nijedan zaposlenik nema PIN. Aktivacijski kod dobijate od šefice. Pritisnite „Imam aktivacijski kod“.</p>
      )}
      {saImenom && zaposlenici.length > 0 && (
        <div role="group" aria-label="Ime zaposlenika" aria-describedby="greska-forme" className="grid gap-2 sm:grid-cols-2">
          {zaposlenici.map((z) => (
            <button
              key={z.id}
              type="button"
              aria-pressed={odabran === z.id}
              className={`${dugme} aria-pressed:border-akcent aria-pressed:bg-akcent aria-pressed:text-akcent-tekst`}
              onClick={() => {
                postaviOdabranog(z.id);
                postaviGresku("");
              }}
            >
              {z.ime}
            </button>
          ))}
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span>
          PIN <span id="pin-savjet" className="text-base">4 do 8 cifara</span>
        </span>
        <input
          className={polje}
          type="password"
          value={pin}
          onChange={(e) => postaviPin(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          ref={prvo}
          aria-invalid={!!greska}
          aria-describedby="pin-savjet greska-forme"
        />
      </label>
      {poruke}
      <button type="submit" className={glavno} aria-disabled={saljem}>
        {saljem ? "Prijavljujem…" : "Prijava"}
      </button>
      <button type="button" className={dugme} onClick={() => prebaci(true)}>
        Imam aktivacijski kod
      </button>
    </form>
  );
}
