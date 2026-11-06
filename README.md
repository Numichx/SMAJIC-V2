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

## Okruženja

| Okruženje | Adresa | Baza |
|---|---|---|
| Produkcija | <https://smajic-pos.vercel.app> | Supabase `SMAJIC-V2` (prave narudžbe i novac) |
| Pregled (preview) | Link za svaki push na granu `razvoj`, zaštićen Vercel prijavom | Supabase `SMAJIC-V2-staging` (samo testni podaci) |
| Razvoj | <http://localhost:3000> | Demo baza na računaru |

Push na `main` objavljuje produkciju. Nove migracije idu prvo na staging, pa tek onda na pravu bazu.

Prijava i prvi PIN su zaštićeni Vercel BotID provjerom: rade u običnom pregledniku, a skripte i headless preglednici dobiju poruku „Provjera uređaja nije uspjela“.

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
| `npm run db:types:staging` | Pravi tipove iz staging baze (migracije idu prvo tamo) |

## Rezervna kopija

Besplatni Supabase plan ne pravi rezervne kopije. Kopiju pravite ovako (samo čita bazu):

```bash
node scripts/kopija.mjs izvoz clnnjqbogzilkwhxzgyz C:/Kopije/smajic-2026-11-06.json
```

Kopija sadrži hashove PIN-ova i imena gostiju: čuvajte je izvan OneDrive foldera. Povrat na novu bazu, nakon `supabase db push` s istim migracijama:

```bash
node scripts/kopija.mjs povrat C:/Kopije/smajic-2026-11-06.json povrat.sql
npx supabase db query --remote=<project-ref> -f povrat.sql
```

Povrat briše sve postojeće podatke u toj bazi i upisuje one iz kopije.

## Tajni podaci

Ključevi idu samo u `.env.local` i u postavke na Vercelu. PIN-ove biraju zaposlenici sami i ne upisuju se ni u jednu datoteku.
