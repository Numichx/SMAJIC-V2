export type Jedinica = "porcija" | "kom" | "kg" | "l";

export type Proizvod = {
  id: string;
  naziv: string;
  cijena: number;
  jedinica: Jedinica;
  stanica: "kuhinja" | "pecenjara" | "sank";
  slika: { putanja: string; zasluge: string | null } | null;
  prilog: null | { besplatni: string[]; podrazumijevani: string | null; jednaPorcija: boolean };
};

export type Meni = {
  prilozi: string[];
  kategorije: { id: string; naziv: string; proizvodi: Proizvod[] }[];
};
