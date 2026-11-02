"use client";

import { useState, useSyncExternalStore } from "react";

function jeTamna() {
  const tema = document.documentElement.dataset.tema;
  return tema ? tema === "tamna" : window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function PrekidacTeme() {
  const [, osvjezi] = useState(0);
  // The server cannot know the system theme, so the label corrects itself after hydration.
  const tamna = useSyncExternalStore(() => () => {}, jeTamna, () => false);

  function prebaci() {
    const nova = tamna ? "svijetla" : "tamna";
    document.documentElement.dataset.tema = nova;
    document.cookie = `tema=${nova}; path=/; max-age=31536000; samesite=lax`;
    osvjezi((n) => n + 1);
  }

  return (
    <button type="button" onClick={prebaci} className="min-h-12 rounded-lg border-2 border-okvir px-4">
      {tamna ? "Svijetla tema" : "Tamna tema"}
    </button>
  );
}
