import type { NextRequest } from "next/server";
import type { z } from "zod";

export class ApiGreska extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function jePoslovna(greska: unknown): greska is { code: string; message: string } {
  return typeof greska === "object" && greska !== null && "code" in greska && greska.code === "P0001";
}

export function odgovorGreske(greska: unknown) {
  if (greska instanceof ApiGreska) return Response.json({ greska: greska.message }, { status: greska.status });
  if (jePoslovna(greska)) return Response.json({ greska: greska.message }, { status: 422 });

  console.error(greska);
  return Response.json({ greska: "Došlo je do greške. Pokušajte ponovo." }, { status: 500 });
}

export function ruta<A extends unknown[]>(obrada: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await obrada(...args);
    } catch (greska) {
      return odgovorGreske(greska);
    }
  };
}

export async function procitajTijelo<T extends z.ZodType>(request: NextRequest, shema: T): Promise<z.infer<T>> {
  const tijelo = await request.json().catch(() => undefined);
  const rezultat = shema.safeParse(tijelo);
  if (!rezultat.success) throw new ApiGreska(400, "Podaci nisu ispravni. Osvježite stranicu i pokušajte ponovo.");
  return rezultat.data;
}
