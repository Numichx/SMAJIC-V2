"use client";

export default function Odjava() {
  async function odjavi() {
    try {
      await fetch("/api/sesija", { method: "DELETE" });
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <button type="button" onClick={odjavi} className="min-h-12 rounded-lg border-2 border-okvir px-4">
      Odjava
    </button>
  );
}
