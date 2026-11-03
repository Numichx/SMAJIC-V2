import { z } from "zod";
import { ApiGreska } from "@/lib/api/greske";

// Query values for report and list routes. A bad one is a 400, like a bad body.
function procitaj<T extends z.ZodType>(shema: T, vrijednost: string | null): z.infer<T> {
  const rezultat = shema.safeParse(vrijednost ?? undefined);
  if (!rezultat.success) throw new ApiGreska(400, "Neispravni podaci.");
  return rezultat.data;
}

export const daniIz = (upit: URLSearchParams) => Number(procitaj(z.enum(["1", "7", "30"]).default("1"), upit.get("dani")));

export const stranaIz = (upit: URLSearchParams) =>
  procitaj(z.coerce.number().int().min(1).max(100000).default(1), upit.get("strana"));

export const datumIz = (upit: URLSearchParams) => procitaj(z.iso.date().optional(), upit.get("datum")) ?? null;
