"use client";

import { useState, useSyncExternalStore } from "react";
import { dugme } from "@/components/konobar/stil";

// Dark is the default: only an explicit "svijetla" turns the app light.
function jeTamna() {
  return document.documentElement.dataset.theme !== "svijetla";
}

export default function PrekidacTeme() {
  const [, osvjezi] = useState(0);
  const tamna = useSyncExternalStore(() => () => {}, jeTamna, () => true);

  function prebaci() {
    const nova = tamna ? "svijetla" : "tamna";
    document.documentElement.dataset.theme = nova;
    document.cookie = `tema=${nova}; path=/; max-age=31536000; samesite=lax`;
    osvjezi((n) => n + 1);
  }

  return (
    <button type="button" onClick={prebaci} className={dugme}>
      {tamna ? "Svijetla tema" : "Tamna tema"}
    </button>
  );
}
