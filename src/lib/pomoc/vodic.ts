import type { Uloga } from "@/lib/auth/session";

export const PRVA_PRIJAVA = [
  "Šefica u odjeljku Osoblje pronađe vaše ime i pritisne „Izdaj kod“.",
  "Kod vrijedi 15 minuta i može se iskoristiti samo jednom.",
  "Na prijavi pritisnite „Imam aktivacijski kod“ i unesite kod od šest cifara.",
  "Izaberite svoj PIN od 4 do 8 cifara i unesite ga ponovo. Laki PIN-ovi, poput 1111 i 1234, nisu dozvoljeni.",
  "Nakon toga se prijavljujte svojim imenom i PIN-om.",
] as const;

export const VODIC = {
  konobar: {
    naziv: "Konobar",
    koraci: [
      "Na ekranu Stolovi izaberite sto za koji radite.",
      "U Novoj narudžbi dodajte stavke u korpu i provjerite količine.",
      "Pritisnite „Pošalji narudžbu“. Stavke koje su još u korpi nisu poslane.",
      "Ako narudžba čeka vezu, još nije u kuhinji ni na računu; sačekajte da se pošalje.",
      "Neposlana korpa blokira naplatu: pošaljite narudžbu ili uklonite stavke iz korpe.",
      "Naplata je moguća tek kada kuhinja, pečenjara i šank označe sve svoje narudžbe „Izdato“.",
      "Na stranici Šank otvorite „Smjena šanka“: izaberite smjenu i unesite početni popis pića; pri zatvaranju unesite završni popis i predani pazar.",
      "Na ispisu računa piše „Ovo nije fiskalni račun“.",
    ],
  },
  kuhinja: {
    naziv: "Kuhinja",
    koraci: [
      "Na ekranu Kuhinja pratite red narudžbi i otvorite stavke za pripremu.",
      "Kada počnete raditi narudžbu, promijenite status u „U pripremi“.",
      "Kada je jelo spremno, označite „Gotovo“.",
      "Kada je narudžba izdata, označite „Izdato“; dok sve stanice to ne urade, konobar ne može naplatiti račun.",
      "Ako vam treba roba iz mesnice, otvorite Mesnica, pošaljite zahtjev i pratite njegov status.",
      "Na listi zahtjeva provjerite da li je roba isporučena ili je nema na stanju.",
    ],
  },
  pecenjara: {
    naziv: "Pečenjara",
    koraci: [
      "Na ekranu Pečenjara pratite red i vrijeme čekanja narudžbi.",
      "Ažurirajte status narudžbe dok je pripremate, pa je označite „Gotovo“ kada je jelo spremno.",
      "Za jagnjeća jela koja traže unos upišite stvarnu težinu prije spremanja.",
      "Ako se pojavi upozorenje za sumnjivu težinu, ponovo provjerite broj. Drugi dodir potvrđuje unos; spremljena težina se ne može ispraviti.",
      "Kada je narudžba izdata, označite „Izdato“.",
      "Na Popisu unesite početne količine pečenih i sirovih pilića i jagnjetine za smjenu.",
      "Pri završetku unesite dodatne i preostale količine te predani pazar. Provjerite prikaz i potvrdite zaključavanje popisa.",
    ],
  },
  mesnica: {
    naziv: "Mesnica",
    koraci: [
      "Na vrhu ekrana provjerite nove zahtjeve iz kuhinje.",
      "Zahtjev označite isporučenim uz količinu koju ste predali ili označite da robe nema na stanju.",
      "U zalihi potražite artikal i provjerite trenutno stanje i minimum.",
      "Za popis unesite stvarno stanje na polici, izaberite razlog i sačuvajte promjenu.",
      "Prodaja je dostupna za artikle koji se mjere u kilogramima i imaju unesenu prodajnu cijenu.",
      "U Historiji prometa provjerite ranije popise, isporuke i prodaje.",
    ],
  },
  sefica: {
    naziv: "Šefica",
    koraci: [
      "Na Izvještajima pregledajte današnji promet ili izaberite period od 7 ili 30 dana.",
      "Provjerite Z-izvještaj za željeni datum. Gotovina i kartica uključuju bakšiš; PDV nije podešen.",
      "U Smjenama provjerite koja je smjena otvorena i pregledajte zatvorene smjene i razlike.",
      "Prije zatvaranja dana pregledajte odabrani datum. Otvoreni računi ili smjena moraju se prvo zatvoriti.",
      "U Zatvaranju dana izaberite danas ili jučer, provjerite prikazane iznose i zatvorite dan kada nema prepreka.",
      "U Zaliha provjerite stanje i artikle ispod minimuma; po potrebi unesite popis.",
      "Na Šanku možete otvoriti ili zatvoriti smjenu pića i pregledati njen popis.",
    ],
  },
} satisfies Record<Uloga, { naziv: string; koraci: readonly string[] }>;
