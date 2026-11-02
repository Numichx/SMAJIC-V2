"use client";

import { useState } from "react";

export default function Odjava() {
  const [greska, postaviGresku] = useState("");

  async function odjavi() {
    postaviGresku("");
    try {
      const odgovor = await fetch("/api/sesija", { method: "DELETE" });
      if (odgovor.ok) return window.location.assign("/");
    } catch {}
    // The session survives a failed request, so the next person on this device would work under this name.
    postaviGresku("Odjava nije uspjela. Provjerite vezu i pokušajte ponovo.");
  }

  return (
    <>
      <p role="alert" className="font-semibold text-greska">
        {greska}
      </p>
      <button type="button" onClick={odjavi} className="min-h-12 rounded-lg border-2 border-okvir px-4">
        Odjava
      </button>
    </>
  );
}
