const OPSTA_GRESKA = "Došlo je do greške. Pokušajte ponovo.";

export async function greskaIz(odgovor: Response) {
  try {
    const tijelo = await odgovor.json();
    return typeof tijelo?.greska === "string" ? tijelo.greska : OPSTA_GRESKA;
  } catch {
    return OPSTA_GRESKA;
  }
}
