export type Celija = string | number | null;

// A spreadsheet runs a text cell starting with one of these as a formula, even behind spaces or
// control characters. A leading ' makes it plain text. A real number stays a number, even negative.
const FORMULA = /^[\s\p{Cc}]*[=+\-@＝＋－＠]/u;

function celija(vrijednost: Celija) {
  if (vrijednost === null) return "";
  if (typeof vrijednost === "number") return String(vrijednost).replace(".", ",");
  const tekst = FORMULA.test(vrijednost) ? `'${vrijednost}` : vrijednost;
  return `"${tekst.replaceAll('"', '""')}"`;
}

// For Excel with Bosnian settings: a BOM so č ć š ž đ survive, ; between cells, and a decimal comma.
export function uCsv(redovi: Celija[][]) {
  return `﻿${redovi.map((red) => red.map(celija).join(";")).join("\r\n")}\r\n`;
}

export type IzvjestajCsv = {
  od: string;
  do: string;
  racuni: number;
  bruto: number;
  popust: number;
  ukupno: number;
  naplaceno: number;
  gotovina: number;
  kartica: number;
  baksis: number;
  noviDug: number;
  naplaceniDugovi: { broj: number; gotovina: number; kartica: number };
  poNacinu: { nacin: string; broj: number; ukupno: number; baksis: number }[];
  popusti: { razlog: string; broj: number; iznos: number }[];
  storna: { razlog: string; broj: number; vrijednost: number }[];
  poKonobaru: { ime: string; racuni: number; naplaceno: number; baksis: number }[];
  poProizvodu: { naziv: string; kolicina: number; iznos: number }[];
  poDanu: { datum: string; racuni: number; ukupno: number; baksis: number }[];
  mesnica: { broj: number; iznos: number };
};

export function izvjestajUCsv(i: IzvjestajCsv) {
  return uCsv([
    ["Vrsta", "Naziv", "Broj", "Iznos KM", "Bakšiš KM"],
    ["Period", `${i.od} – ${i.do}`, null, null, null],
    ["Sažetak", "Bruto", i.racuni, i.bruto, null],
    ["Sažetak", "Popust", null, i.popust, null],
    ["Sažetak", "Za naplatu", null, i.ukupno, null],
    ["Sažetak", "Naplaćeno", null, i.naplaceno, i.baksis],
    ["Sažetak", "Gotovina s bakšišem", null, i.gotovina, null],
    ["Sažetak", "Kartica s bakšišem", null, i.kartica, null],
    ["Sažetak", "Novi dugovi", null, i.noviDug, null],
    ["Sažetak", "Naplaćeni dugovi, gotovina", null, i.naplaceniDugovi.gotovina, null],
    ["Sažetak", "Naplaćeni dugovi, kartica", null, i.naplaceniDugovi.kartica, null],
    ["Sažetak", "Mesnica", i.mesnica.broj, i.mesnica.iznos, null],
    ...i.poNacinu.map((r): Celija[] => ["Način plaćanja", r.nacin, r.broj, r.ukupno, r.baksis]),
    ...i.popusti.map((r): Celija[] => ["Popust", r.razlog, r.broj, r.iznos, null]),
    ...i.storna.map((r): Celija[] => ["Storno", r.razlog, r.broj, r.vrijednost, null]),
    ...i.poKonobaru.map((r): Celija[] => ["Konobar", r.ime, r.racuni, r.naplaceno, r.baksis]),
    ...i.poProizvodu.map((r): Celija[] => ["Proizvod", r.naziv, r.kolicina, r.iznos, null]),
    ...i.poDanu.map((r): Celija[] => ["Dan", r.datum, r.racuni, r.ukupno, r.baksis]),
  ]);
}
