import type { NextRequest } from "next/server";
import { ruta } from "@/lib/api/greske";
import { rpc } from "@/lib/api/rpc";
import { zahtijevajSesiju } from "@/lib/auth/requestSession";
import { SLIKE } from "@/lib/data/slike";

type Meni = {
  kategorije: { id: string; proizvodi: { naziv: string }[] }[];
  prilozi: string[];
};

export const GET = ruta(async (request: NextRequest) => {
  const sesija = await zahtijevajSesiju(request);
  const meni = await rpc<Meni>("meni", { p_zaposlenik: sesija.id });

  return Response.json({
    prilozi: meni.prilozi,
    kategorije: meni.kategorije.map((k) => ({
      ...k,
      proizvodi: k.proizvodi.map((p) => {
        const slika = SLIKE[`${k.id}/${p.naziv}`];
        return { ...p, slika: slika ? { putanja: slika.putanja, zasluge: slika.zasluge } : null };
      }),
    })),
  });
});
