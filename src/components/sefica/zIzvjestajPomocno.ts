export function danasUSarajevu(sada = new Date()): string {
  const dijelovi = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sarajevo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(sada);
  const godina = dijelovi.find((dio) => dio.type === "year")?.value;
  const mjesec = dijelovi.find((dio) => dio.type === "month")?.value;
  const dan = dijelovi.find((dio) => dio.type === "day")?.value;

  if (!godina || !mjesec || !dan) throw new Error("Nije moguće odrediti datum u Sarajevu.");
  return `${godina}-${mjesec}-${dan}`;
}
