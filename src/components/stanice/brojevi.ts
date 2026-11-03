import { brojIzUnosa } from "./unos";

// NaN for anything the server would refuse for a reason a tablet can say sooner.
const saDecimalama = (tekst: string, n: number) => {
  const x = brojIzUnosa(tekst);
  return Math.abs(x * 10 ** n - Math.round(x * 10 ** n)) < 1e-6 ? x : NaN;
};

export const novacIzUnosa = (tekst: string) => saDecimalama(tekst, 2);
export const kolicinaIzUnosa = (tekst: string) => saDecimalama(tekst, 3);
export const cijeliIzUnosa = (tekst: string) => {
  const x = brojIzUnosa(tekst);
  return Number.isInteger(x) ? x : NaN;
};
