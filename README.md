# Smajić – Narudžbe

Web aplikacija za narudžbe i naplatu u restoranu. Jedan uređaj pripada jednoj ulozi.

## Pokretanje

Potrebno je Node 22.12 ili noviji.

```bash
npm install
cp .env.example .env.local
npm run dev
```

U `.env.local` upišite `SESSION_SECRET` (naredba je u `.env.example`). Ako Supabase vrijednosti ostanu prazne, aplikacija u razvoju radi u demo načinu.

Provjera rada: <http://localhost:3000/api/status> vraća način rada (`supabase`, `demo` ili `misconfigured`).

## Prva prijava

Niko nema PIN dok ga sam ne izabere.

1. **Šefica, prvi put:** u Supabase SQL editoru pokrenite `select aktiviraj_prvu_seficu();`. Naredba vraća aktivacijski kod koji vrijedi 15 minuta. U demo načinu kod se ispisuje u terminalu pri prvom pokretanju.
2. Šefica na ekranu za prijavu izabere „Imam aktivacijski kod“, upiše kod i izabere svoj PIN.
3. **Ostali:** šefica u Administraciji pritisne „Izdaj kod“ i da zaposleniku kod. Zaposlenik ga upiše na ekranu za prijavu i izabere svoj PIN.

PIN ima 4 do 8 cifara. Lagani PIN-ovi (1111, 1234, 2580, godine) nisu dozvoljeni.

## Šefica

Navigacija šefice: Izvještaji, Zatvaranje dana, Smjene, Popis pečenjare, Zaliha, Recepti, Meni, Dugovi, Osoblje, Dnevnik, Z-izvještaj, Privatnost, Šank i Pomoć.

- **Meni:** dodavanje proizvoda, izmjena naziva, cijene, kategorije, jedinice, stanice i redoslijeda, te „Označi rasprodano“ / „Vrati u ponudu“. Promjena cijene traži potvrdu. Vaganje i besplatne priloge određuje aplikacija i ne uređuju se ovdje. Izmjene ne mijenjaju već poslane narudžbe.
- **Z-izvještaj:** za zatvoren dan prikazuje sačuvani zaključak, inače trenutne podatke. Gotovina i kartica uključuju bakšiš. PDV nije podešen i izvještaj nije fiskalni račun.
- **Privatnost:** anonimizira stare naplaćene dugove i rezervacije (rok od 30 do 3.650 dana). Radnja je nepovratna i traži dodatnu potvrdu.

## Naredbe

| Naredba | Opis |
|---|---|
| `npm run dev` | Pokreće aplikaciju za razvoj |
| `npm run lint` | Provjerava kod |
| `npm test` | Pokreće testove |
| `npm run build` | Pravi produkcijsku verziju |
| `npm run db:start` | Pokreće lokalnu bazu (potreban je Docker) |
| `npm run db:reset` | Ponovo pravi lokalnu bazu |
| `npm run db:types` | Pravi tipove iz lokalne baze |
| `npm run db:types:linked` | Pravi tipove iz povezane Supabase baze |

## Tajni podaci

Ključevi idu samo u `.env.local` i u postavke na Vercelu. PIN-ove biraju zaposlenici sami i ne upisuju se ni u jednu datoteku.
