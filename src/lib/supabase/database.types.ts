export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      dnevni_zakljucci: {
        Row: {
          datum: string
          izvjestaj: Json
          vrijeme: string
          zaposlenik_id: string
        }
        Insert: {
          datum: string
          izvjestaj: Json
          vrijeme?: string
          zaposlenik_id: string
        }
        Update: {
          datum?: string
          izvjestaj?: Json
          vrijeme?: string
          zaposlenik_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dnevni_zakljucci_zaposlenik_id_fkey"
            columns: ["zaposlenik_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
        ]
      }
      dnevnik_radnji: {
        Row: {
          detalji: Json
          id: number
          radnja: string
          vrijeme: string
          zaposlenik_id: string | null
        }
        Insert: {
          detalji?: Json
          id?: never
          radnja: string
          vrijeme?: string
          zaposlenik_id?: string | null
        }
        Update: {
          detalji?: Json
          id?: never
          radnja?: string
          vrijeme?: string
          zaposlenik_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dnevnik_radnji_zaposlenik_fk"
            columns: ["zaposlenik_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
        ]
      }
      dopune_sanka: {
        Row: {
          kolicina: number
          proizvod_id: string
          request_id: string
          smjena_id: string
          vrijeme: string
          zaposlenik_id: string
        }
        Insert: {
          kolicina: number
          proizvod_id: string
          request_id: string
          smjena_id: string
          vrijeme?: string
          zaposlenik_id: string
        }
        Update: {
          kolicina?: number
          proizvod_id?: string
          request_id?: string
          smjena_id?: string
          vrijeme?: string
          zaposlenik_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dopune_sanka_smjena_id_proizvod_id_fkey"
            columns: ["smjena_id", "proizvod_id"]
            isOneToOne: false
            referencedRelation: "popisi_sanka"
            referencedColumns: ["smjena_id", "proizvod_id"]
          },
          {
            foreignKeyName: "dopune_sanka_zaposlenik_id_fkey"
            columns: ["zaposlenik_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
        ]
      }
      kategorije: {
        Row: {
          id: string
          naziv: string
          redoslijed: number
        }
        Insert: {
          id: string
          naziv: string
          redoslijed: number
        }
        Update: {
          id?: string
          naziv?: string
          redoslijed?: number
        }
        Relationships: []
      }
      naplate: {
        Row: {
          baksis: number | null
          bruto: number
          gost_dao: number | null
          gost_duznik: string | null
          gotovina: number
          kartica: number
          konobar_id: string
          kusur: number
          nacin: Database["public"]["Enums"]["nacin_naplate"]
          podijeljeno_na: number | null
          popust: number | null
          racun_id: string
          request_id: string
          stolovi: number[]
          ukupno: number
          vrijeme: string
        }
        Insert: {
          baksis?: number | null
          bruto: number
          gost_dao?: number | null
          gost_duznik?: string | null
          gotovina: number
          kartica: number
          konobar_id: string
          kusur: number
          nacin: Database["public"]["Enums"]["nacin_naplate"]
          podijeljeno_na?: number | null
          popust?: number | null
          racun_id: string
          request_id: string
          stolovi: number[]
          ukupno: number
          vrijeme?: string
        }
        Update: {
          baksis?: number | null
          bruto?: number
          gost_dao?: number | null
          gost_duznik?: string | null
          gotovina?: number
          kartica?: number
          konobar_id?: string
          kusur?: number
          nacin?: Database["public"]["Enums"]["nacin_naplate"]
          podijeljeno_na?: number | null
          popust?: number | null
          racun_id?: string
          request_id?: string
          stolovi?: number[]
          ukupno?: number
          vrijeme?: string
        }
        Relationships: [
          {
            foreignKeyName: "naplate_konobar_id_fkey"
            columns: ["konobar_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "naplate_racun_id_fkey"
            columns: ["racun_id"]
            isOneToOne: true
            referencedRelation: "racuni"
            referencedColumns: ["id"]
          },
        ]
      }
      naplate_dugova: {
        Row: {
          iznos: number
          nacin: string
          racun_id: string
          request_id: string
          vrijeme: string
          zaposlenik_id: string
        }
        Insert: {
          iznos: number
          nacin: string
          racun_id: string
          request_id: string
          vrijeme?: string
          zaposlenik_id: string
        }
        Update: {
          iznos?: number
          nacin?: string
          racun_id?: string
          request_id?: string
          vrijeme?: string
          zaposlenik_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "naplate_dugova_racun_id_fkey"
            columns: ["racun_id"]
            isOneToOne: true
            referencedRelation: "naplate"
            referencedColumns: ["racun_id"]
          },
          {
            foreignKeyName: "naplate_dugova_zaposlenik_id_fkey"
            columns: ["zaposlenik_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
        ]
      }
      narudzbe: {
        Row: {
          broj: number
          cijena_pecenjari: number | null
          id: string
          konobar_id: string
          kreirano: string
          racun_id: string
          request_id: string
          stanica: Database["public"]["Enums"]["stanica"]
          status: Database["public"]["Enums"]["status_narudzbe"]
        }
        Insert: {
          broj?: never
          cijena_pecenjari?: number | null
          id?: string
          konobar_id: string
          kreirano?: string
          racun_id: string
          request_id: string
          stanica: Database["public"]["Enums"]["stanica"]
          status?: Database["public"]["Enums"]["status_narudzbe"]
        }
        Update: {
          broj?: never
          cijena_pecenjari?: number | null
          id?: string
          konobar_id?: string
          kreirano?: string
          racun_id?: string
          request_id?: string
          stanica?: Database["public"]["Enums"]["stanica"]
          status?: Database["public"]["Enums"]["status_narudzbe"]
        }
        Relationships: [
          {
            foreignKeyName: "narudzbe_konobar_id_fkey"
            columns: ["konobar_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narudzbe_racun_id_fkey"
            columns: ["racun_id"]
            isOneToOne: false
            referencedRelation: "racuni"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_pokusaji: {
        Row: {
          kljuc: string
          pogresni: number
          prozor_od: string
          zakljucano_do: string | null
        }
        Insert: {
          kljuc: string
          pogresni?: number
          prozor_od?: string
          zakljucano_do?: string | null
        }
        Update: {
          kljuc?: string
          pogresni?: number
          prozor_od?: string
          zakljucano_do?: string | null
        }
        Relationships: []
      }
      popisi_pecenjare: {
        Row: {
          cijena_janjetine: number | null
          cijena_koke: number | null
          dodatna_janjetina_kg: number | null
          dodatne_koke: number | null
          otvoreno: string
          otvorio_id: string
          pazar_po_popisu: number | null
          pocetna_janjetina_kg: number
          pocetne_koke_pecene: number
          pocetne_koke_sirove: number
          predani_pazar: number | null
          preostala_janjetina_kg: number | null
          preostale_koke: number | null
          prodana_janjetina_kg: number | null
          prodane_koke: number | null
          razlika: number | null
          request_id: string
          smjena_id: string
          zatvaranje_request_id: string | null
          zatvoreno: string | null
          zatvorio_id: string | null
        }
        Insert: {
          cijena_janjetine?: number | null
          cijena_koke?: number | null
          dodatna_janjetina_kg?: number | null
          dodatne_koke?: number | null
          otvoreno?: string
          otvorio_id: string
          pazar_po_popisu?: number | null
          pocetna_janjetina_kg: number
          pocetne_koke_pecene: number
          pocetne_koke_sirove: number
          predani_pazar?: number | null
          preostala_janjetina_kg?: number | null
          preostale_koke?: number | null
          prodana_janjetina_kg?: number | null
          prodane_koke?: number | null
          razlika?: number | null
          request_id: string
          smjena_id: string
          zatvaranje_request_id?: string | null
          zatvoreno?: string | null
          zatvorio_id?: string | null
        }
        Update: {
          cijena_janjetine?: number | null
          cijena_koke?: number | null
          dodatna_janjetina_kg?: number | null
          dodatne_koke?: number | null
          otvoreno?: string
          otvorio_id?: string
          pazar_po_popisu?: number | null
          pocetna_janjetina_kg?: number
          pocetne_koke_pecene?: number
          pocetne_koke_sirove?: number
          predani_pazar?: number | null
          preostala_janjetina_kg?: number | null
          preostale_koke?: number | null
          prodana_janjetina_kg?: number | null
          prodane_koke?: number | null
          razlika?: number | null
          request_id?: string
          smjena_id?: string
          zatvaranje_request_id?: string | null
          zatvoreno?: string | null
          zatvorio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "popisi_pecenjare_otvorio_id_fkey"
            columns: ["otvorio_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "popisi_pecenjare_smjena_id_fkey"
            columns: ["smjena_id"]
            isOneToOne: true
            referencedRelation: "smjene"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "popisi_pecenjare_zatvorio_id_fkey"
            columns: ["zatvorio_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
        ]
      }
      popisi_sanka: {
        Row: {
          cijena: number | null
          dopune: number
          pocetno: number
          prodato: number | null
          proizvod_id: string
          smjena_id: string
          zavrsno: number | null
        }
        Insert: {
          cijena?: number | null
          dopune?: number
          pocetno: number
          prodato?: number | null
          proizvod_id: string
          smjena_id: string
          zavrsno?: number | null
        }
        Update: {
          cijena?: number | null
          dopune?: number
          pocetno?: number
          prodato?: number | null
          proizvod_id?: string
          smjena_id?: string
          zavrsno?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "popisi_sanka_proizvod_id_fkey"
            columns: ["proizvod_id"]
            isOneToOne: false
            referencedRelation: "proizvodi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "popisi_sanka_smjena_id_fkey"
            columns: ["smjena_id"]
            isOneToOne: false
            referencedRelation: "smjene"
            referencedColumns: ["id"]
          },
        ]
      }
      proizvodi: {
        Row: {
          aktivan: boolean
          besplatni_prilozi: string[]
          cijena: number
          cijena_popisa: string | null
          id: string
          izvorni_kljuc: string | null
          jedinica: Database["public"]["Enums"]["jedinica"]
          kategorija_id: string
          naziv: string
          prilog: boolean
          prilog_unaprijed: boolean
          redoslijed: number
          stanica: Database["public"]["Enums"]["stanica"]
          tezina: boolean
        }
        Insert: {
          aktivan?: boolean
          besplatni_prilozi?: string[]
          cijena: number
          cijena_popisa?: string | null
          id?: string
          izvorni_kljuc?: string | null
          jedinica: Database["public"]["Enums"]["jedinica"]
          kategorija_id: string
          naziv: string
          prilog?: boolean
          prilog_unaprijed?: boolean
          redoslijed: number
          stanica: Database["public"]["Enums"]["stanica"]
          tezina?: boolean
        }
        Update: {
          aktivan?: boolean
          besplatni_prilozi?: string[]
          cijena?: number
          cijena_popisa?: string | null
          id?: string
          izvorni_kljuc?: string | null
          jedinica?: Database["public"]["Enums"]["jedinica"]
          kategorija_id?: string
          naziv?: string
          prilog?: boolean
          prilog_unaprijed?: boolean
          redoslijed?: number
          stanica?: Database["public"]["Enums"]["stanica"]
          tezina?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "proizvodi_kategorija_id_fkey"
            columns: ["kategorija_id"]
            isOneToOne: false
            referencedRelation: "kategorije"
            referencedColumns: ["id"]
          },
        ]
      }
      prometi_zaliha: {
        Row: {
          cijena: number | null
          id: number
          iznos: number | null
          promjena: number
          razlog: string | null
          request_id: string | null
          stanje: number
          vrijeme: string
          vrsta: Database["public"]["Enums"]["vrsta_prometa"]
          zahtjev_id: string | null
          zaliha_id: string
          zaposlenik_id: string
        }
        Insert: {
          cijena?: number | null
          id?: never
          iznos?: number | null
          promjena: number
          razlog?: string | null
          request_id?: string | null
          stanje: number
          vrijeme?: string
          vrsta: Database["public"]["Enums"]["vrsta_prometa"]
          zahtjev_id?: string | null
          zaliha_id: string
          zaposlenik_id: string
        }
        Update: {
          cijena?: number | null
          id?: never
          iznos?: number | null
          promjena?: number
          razlog?: string | null
          request_id?: string | null
          stanje?: number
          vrijeme?: string
          vrsta?: Database["public"]["Enums"]["vrsta_prometa"]
          zahtjev_id?: string | null
          zaliha_id?: string
          zaposlenik_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prometi_zaliha_zahtjev_id_fkey"
            columns: ["zahtjev_id"]
            isOneToOne: false
            referencedRelation: "zahtjevi_mesnici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prometi_zaliha_zaliha_id_fkey"
            columns: ["zaliha_id"]
            isOneToOne: false
            referencedRelation: "zaliha_artikli"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prometi_zaliha_zaposlenik_id_fkey"
            columns: ["zaposlenik_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
        ]
      }
      racun_stolovi: {
        Row: {
          racun_id: string
          sto_id: number
        }
        Insert: {
          racun_id: string
          sto_id: number
        }
        Update: {
          racun_id?: string
          sto_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "racun_stolovi_racun_id_fkey"
            columns: ["racun_id"]
            isOneToOne: false
            referencedRelation: "racuni"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "racun_stolovi_sto_id_fkey"
            columns: ["sto_id"]
            isOneToOne: true
            referencedRelation: "stolovi"
            referencedColumns: ["id"]
          },
        ]
      }
      racuni: {
        Row: {
          broj: number
          id: string
          konobar_id: string
          otvoren: string
          popust_procenat: number
          popust_razlog: string | null
          status: Database["public"]["Enums"]["status_racuna"]
          sto_id: number
          zatvoren: string | null
        }
        Insert: {
          broj?: never
          id?: string
          konobar_id: string
          otvoren?: string
          popust_procenat?: number
          popust_razlog?: string | null
          status?: Database["public"]["Enums"]["status_racuna"]
          sto_id: number
          zatvoren?: string | null
        }
        Update: {
          broj?: never
          id?: string
          konobar_id?: string
          otvoren?: string
          popust_procenat?: number
          popust_razlog?: string | null
          status?: Database["public"]["Enums"]["status_racuna"]
          sto_id?: number
          zatvoren?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "racuni_konobar_id_fkey"
            columns: ["konobar_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "racuni_sto_id_fkey"
            columns: ["sto_id"]
            isOneToOne: false
            referencedRelation: "stolovi"
            referencedColumns: ["id"]
          },
        ]
      }
      recepti: {
        Row: {
          kolicina: number
          proizvod_id: string
          zaliha_id: string
        }
        Insert: {
          kolicina: number
          proizvod_id: string
          zaliha_id: string
        }
        Update: {
          kolicina?: number
          proizvod_id?: string
          zaliha_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepti_proizvod_id_fkey"
            columns: ["proizvod_id"]
            isOneToOne: false
            referencedRelation: "proizvodi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepti_zaliha_id_fkey"
            columns: ["zaliha_id"]
            isOneToOne: false
            referencedRelation: "zaliha_artikli"
            referencedColumns: ["id"]
          },
        ]
      }
      rezervacije: {
        Row: {
          broj_gostiju: number
          id: string
          ime: string
          kreirano: string
          kreirao_id: string
          napomena: string | null
          request_id: string
          status: string
          sto_id: number | null
          telefon: string | null
          vrijeme: string
        }
        Insert: {
          broj_gostiju: number
          id?: string
          ime: string
          kreirano?: string
          kreirao_id: string
          napomena?: string | null
          request_id: string
          status?: string
          sto_id?: number | null
          telefon?: string | null
          vrijeme: string
        }
        Update: {
          broj_gostiju?: number
          id?: string
          ime?: string
          kreirano?: string
          kreirao_id?: string
          napomena?: string | null
          request_id?: string
          status?: string
          sto_id?: number | null
          telefon?: string | null
          vrijeme?: string
        }
        Relationships: [
          {
            foreignKeyName: "rezervacije_kreirao_id_fkey"
            columns: ["kreirao_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rezervacije_sto_id_fkey"
            columns: ["sto_id"]
            isOneToOne: false
            referencedRelation: "stolovi"
            referencedColumns: ["id"]
          },
        ]
      }
      smjene: {
        Row: {
          id: string
          kraj: string | null
          naplate: Json | null
          naplate_od: string
          ocekivani_pazar: number | null
          otvorio_id: string
          oznaka: string
          pazar_sanka: number | null
          pazar_stanica: number | null
          pocetak: string
          predani_pazar: number | null
          razlika: number | null
          request_id: string
          statusi_do: number | null
          statusi_od: number
          zatvaranje_request_id: string | null
          zatvorio_id: string | null
        }
        Insert: {
          id?: string
          kraj?: string | null
          naplate?: Json | null
          naplate_od: string
          ocekivani_pazar?: number | null
          otvorio_id: string
          oznaka: string
          pazar_sanka?: number | null
          pazar_stanica?: number | null
          pocetak?: string
          predani_pazar?: number | null
          razlika?: number | null
          request_id: string
          statusi_do?: number | null
          statusi_od: number
          zatvaranje_request_id?: string | null
          zatvorio_id?: string | null
        }
        Update: {
          id?: string
          kraj?: string | null
          naplate?: Json | null
          naplate_od?: string
          ocekivani_pazar?: number | null
          otvorio_id?: string
          oznaka?: string
          pazar_sanka?: number | null
          pazar_stanica?: number | null
          pocetak?: string
          predani_pazar?: number | null
          razlika?: number | null
          request_id?: string
          statusi_do?: number | null
          statusi_od?: number
          zatvaranje_request_id?: string | null
          zatvorio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smjene_otvorio_id_fkey"
            columns: ["otvorio_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smjene_zatvorio_id_fkey"
            columns: ["zatvorio_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
        ]
      }
      statusi_narudzbe: {
        Row: {
          id: number
          narudzba_id: string
          status: Database["public"]["Enums"]["status_narudzbe"]
          vrijeme: string
          zaposlenik_id: string
        }
        Insert: {
          id?: never
          narudzba_id: string
          status: Database["public"]["Enums"]["status_narudzbe"]
          vrijeme?: string
          zaposlenik_id: string
        }
        Update: {
          id?: never
          narudzba_id?: string
          status?: Database["public"]["Enums"]["status_narudzbe"]
          vrijeme?: string
          zaposlenik_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statusi_narudzbe_narudzba_id_fkey"
            columns: ["narudzba_id"]
            isOneToOne: false
            referencedRelation: "narudzbe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statusi_narudzbe_zaposlenik_id_fkey"
            columns: ["zaposlenik_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
        ]
      }
      stavke_narudzbe: {
        Row: {
          cijena: number
          id: number
          iznos: number | null
          jedinica: Database["public"]["Enums"]["jedinica"]
          kolicina: number
          napomena: string | null
          naruceno: number | null
          narudzba_id: string
          naziv: string
          poseban: boolean
          prilog_uz: number | null
          proizvod_id: string
          storno_razlog: string | null
          storno_vrijednost: number | null
        }
        Insert: {
          cijena: number
          id?: never
          iznos?: number | null
          jedinica: Database["public"]["Enums"]["jedinica"]
          kolicina: number
          napomena?: string | null
          naruceno?: number | null
          narudzba_id: string
          naziv: string
          poseban?: boolean
          prilog_uz?: number | null
          proizvod_id: string
          storno_razlog?: string | null
          storno_vrijednost?: number | null
        }
        Update: {
          cijena?: number
          id?: never
          iznos?: number | null
          jedinica?: Database["public"]["Enums"]["jedinica"]
          kolicina?: number
          napomena?: string | null
          naruceno?: number | null
          narudzba_id?: string
          naziv?: string
          poseban?: boolean
          prilog_uz?: number | null
          proizvod_id?: string
          storno_razlog?: string | null
          storno_vrijednost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stavke_narudzbe_narudzba_id_fkey"
            columns: ["narudzba_id"]
            isOneToOne: false
            referencedRelation: "narudzbe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stavke_narudzbe_prilog_uz_fkey"
            columns: ["prilog_uz"]
            isOneToOne: false
            referencedRelation: "stavke_narudzbe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stavke_narudzbe_proizvod_id_fkey"
            columns: ["proizvod_id"]
            isOneToOne: false
            referencedRelation: "proizvodi"
            referencedColumns: ["id"]
          },
        ]
      }
      stolovi: {
        Row: {
          id: number
        }
        Insert: {
          id: number
        }
        Update: {
          id?: number
        }
        Relationships: []
      }
      uplate_pecenjari: {
        Row: {
          iznos: number
          konobar_id: string
          request_id: string
          vrijeme: string
          zaposlenik_id: string
        }
        Insert: {
          iznos: number
          konobar_id: string
          request_id: string
          vrijeme?: string
          zaposlenik_id: string
        }
        Update: {
          iznos?: number
          konobar_id?: string
          request_id?: string
          vrijeme?: string
          zaposlenik_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uplate_pecenjari_konobar_id_fkey"
            columns: ["konobar_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uplate_pecenjari_zaposlenik_id_fkey"
            columns: ["zaposlenik_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
        ]
      }
      zahtjevi_mesnici: {
        Row: {
          id: string
          isporuceno: number | null
          kreirano: string
          kreirao_id: string
          obradio_id: string | null
          obradjeno: string | null
          request_id: string
          status: string
          trazeno: number | null
          zaliha_id: string
        }
        Insert: {
          id?: string
          isporuceno?: number | null
          kreirano?: string
          kreirao_id: string
          obradio_id?: string | null
          obradjeno?: string | null
          request_id: string
          status?: string
          trazeno?: number | null
          zaliha_id: string
        }
        Update: {
          id?: string
          isporuceno?: number | null
          kreirano?: string
          kreirao_id?: string
          obradio_id?: string | null
          obradjeno?: string | null
          request_id?: string
          status?: string
          trazeno?: number | null
          zaliha_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zahtjevi_mesnici_kreirao_id_fkey"
            columns: ["kreirao_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahtjevi_mesnici_obradio_id_fkey"
            columns: ["obradio_id"]
            isOneToOne: false
            referencedRelation: "zaposlenici"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahtjevi_mesnici_zaliha_id_fkey"
            columns: ["zaliha_id"]
            isOneToOne: false
            referencedRelation: "zaliha_artikli"
            referencedColumns: ["id"]
          },
        ]
      }
      zaliha_artikli: {
        Row: {
          id: string
          jedinica: Database["public"]["Enums"]["jedinica"]
          minimum: number
          nabavna_cijena: number | null
          naziv: string
          prodajna_cijena: number | null
          stanje: number
        }
        Insert: {
          id?: string
          jedinica: Database["public"]["Enums"]["jedinica"]
          minimum?: number
          nabavna_cijena?: number | null
          naziv: string
          prodajna_cijena?: number | null
          stanje?: number
        }
        Update: {
          id?: string
          jedinica?: Database["public"]["Enums"]["jedinica"]
          minimum?: number
          nabavna_cijena?: number | null
          naziv?: string
          prodajna_cijena?: number | null
          stanje?: number
        }
        Relationships: []
      }
      zaposlenici: {
        Row: {
          aktivacija_do: string | null
          aktivacija_hash: string | null
          aktivan: boolean
          id: string
          ime: string
          kreirano: string
          pin_hash: string | null
          sesija_verzija: number
          uloga: Database["public"]["Enums"]["uloga"]
        }
        Insert: {
          aktivacija_do?: string | null
          aktivacija_hash?: string | null
          aktivan?: boolean
          id?: string
          ime: string
          kreirano?: string
          pin_hash?: string | null
          sesija_verzija?: number
          uloga: Database["public"]["Enums"]["uloga"]
        }
        Update: {
          aktivacija_do?: string | null
          aktivacija_hash?: string | null
          aktivan?: boolean
          id?: string
          ime?: string
          kreirano?: string
          pin_hash?: string | null
          sesija_verzija?: number
          uloga?: Database["public"]["Enums"]["uloga"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aktiviraj_pin: {
        Args: { p_sefica: string; p_zaposlenik: string }
        Returns: string
      }
      aktiviraj_prvu_seficu: { Args: never; Returns: string }
      anonimiziraj_licne_podatke: {
        Args: {
          p_dani_dugovi: number
          p_dani_rezervacije: number
          p_sefica: string
        }
        Returns: Json
      }
      besplatni_po_pravilu: {
        Args: { p_kategorija: string; p_naziv: string }
        Returns: string[]
      }
      cijene_pecenjare: { Args: never; Returns: Record<string, unknown> }
      dan_pregled: {
        Args: { p_datum: string; p_sefica: string }
        Returns: Json
      }
      danas_u_sarajevu: { Args: never; Returns: string }
      dnevnik_pregled: {
        Args: { p_prije: number; p_sefica: string }
        Returns: Json
      }
      dopuni_sank: {
        Args: {
          p_kolicina: number
          p_proizvod: string
          p_request_id: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      dug_konobara_pecenjari: { Args: { p_konobar: string }; Returns: number }
      dugovi_gostiju: {
        Args: { p_sefica: string; p_strana: number }
        Returns: Json
      }
      dugovi_pecenjari: { Args: { p_zaposlenik: string }; Returns: Json }
      izmijeni_artikal_zalihe: {
        Args: {
          p_minimum: number
          p_nabavna: number
          p_prodajna: number
          p_sefica: string
          p_zaliha: string
        }
        Returns: Json
      }
      izvjestaj_perioda: {
        Args: { p_dani: number; p_sefica: string }
        Returns: Json
      }
      izvjestaj_raspona: { Args: { p_do: string; p_od: string }; Returns: Json }
      je_jagnjetina: {
        Args: {
          p_jedinica: Database["public"]["Enums"]["jedinica"]
          p_naziv: string
        }
        Returns: boolean
      }
      je_prilog: {
        Args: { p_kategorija: string; p_naziv: string }
        Returns: boolean
      }
      meni: { Args: { p_zaposlenik: string }; Returns: Json }
      meni_pregled: { Args: { p_sefica: string }; Returns: Json }
      naplata_odgovor: {
        Args: { p: Database["public"]["Tables"]["naplate"]["Row"] }
        Returns: Json
      }
      naplati_dug: {
        Args: {
          p_nacin: string
          p_racun: string
          p_request_id: string
          p_sefica: string
        }
        Returns: Json
      }
      naplati_racun: {
        Args: {
          p_gost_duznik: string
          p_gotovina: number
          p_kartica: number
          p_konobar: string
          p_kusur: number
          p_nacin: Database["public"]["Enums"]["nacin_naplate"]
          p_ocekivano: number
          p_osoba: number
          p_racun: string
          p_request_id: string
        }
        Returns: Json
      }
      narudzba_stornirana: { Args: { p_narudzba: string }; Returns: boolean }
      nova_rezervacija: {
        Args: {
          p_broj_gostiju: number
          p_ime: string
          p_napomena: string
          p_request_id: string
          p_sto: number
          p_telefon: string
          p_vrijeme: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      novi_aktivacijski_kod: { Args: { p_zaposlenik: string }; Returns: string }
      obavijesti_konobara: {
        Args: { p_konobar: string; p_od: number }
        Returns: Json
      }
      obradi_zahtjev_mesnici: {
        Args: {
          p_kolicina: number
          p_radnja: string
          p_zahtjev: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      odobri_popust: {
        Args: {
          p_ip: string
          p_pin: string
          p_procenat: number
          p_racun: string
          p_razlog: string
          p_uredjaj: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      otvori_popis_pecenjare: {
        Args: {
          p_janjetina_kg: number
          p_koke_pecene: number
          p_koke_sirove: number
          p_request_id: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      otvori_smjenu: {
        Args: {
          p_oznaka: string
          p_popis: Json
          p_request_id: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      pecenjara_pregled: {
        Args: { p_strana: number; p_zaposlenik: string }
        Returns: Json
      }
      pin_je_slab: { Args: { p_pin: string }; Returns: boolean }
      pin_preostalo: { Args: { p_kljucevi: string[] }; Returns: number }
      pin_zabiljezi_gresku: {
        Args: { p_kljucevi: string[] }
        Returns: undefined
      }
      pocetak_dana: { Args: { p_datum: string }; Returns: string }
      podjela_racuna: {
        Args: { p_osoba: number; p_ukupno: number }
        Returns: Json
      }
      pomak_strane: { Args: { p_strana: number }; Returns: number }
      popis_pecenjare_odgovor: {
        Args: { p: Database["public"]["Tables"]["popisi_pecenjare"]["Row"] }
        Returns: Json
      }
      popisi_zalihu: {
        Args: {
          p_razlog: string
          p_request_id: string
          p_stanje: number
          p_zaliha: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      posalji_narudzbu: {
        Args: {
          p_ip: string
          p_konobar: string
          p_poseban_pin: string
          p_request_id: string
          p_stavke: Json
          p_sto: number
          p_uredjaj: string
        }
        Returns: Json
      }
      posalji_zahtjev_mesnici: {
        Args: {
          p_kolicina: number
          p_request_id: string
          p_zaliha: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      postavi_aktivnost_zaposlenika: {
        Args: { p_aktivan: boolean; p_id: string; p_sefica: string }
        Returns: Json
      }
      postavi_pin_kodom: {
        Args: {
          p_ip: string
          p_kod: string
          p_novi_pin: string
          p_uredjaj: string
        }
        Returns: {
          retry_after: number
          status: string
        }[]
      }
      pravilo_priloga: {
        Args: { p_kategorija: string; p_naziv: string }
        Returns: Record<string, unknown>
      }
      premjesti_sto: {
        Args: {
          p_konobar: string
          p_radnja: string
          p_sto_iz: number
          p_sto_u: number
        }
        Returns: Json
      }
      prijava_pinom: {
        Args: {
          p_ip: string
          p_pin: string
          p_uloge: Database["public"]["Enums"]["uloga"][]
          p_uredjaj: string
          p_zaposlenik: string
        }
        Returns: {
          id: string
          ime: string
          retry_after: number
          sesija_verzija: number
          status: string
          uloga: Database["public"]["Enums"]["uloga"]
        }[]
      }
      prijedlog_nabavke: { Args: { p_sefica: string }; Returns: Json }
      prodaj_zalihu: {
        Args: {
          p_kolicina: number
          p_request_id: string
          p_zaliha: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      proizvod_odgovor: {
        Args: { p: Database["public"]["Tables"]["proizvodi"]["Row"] }
        Returns: Json
      }
      promet_zalihe: {
        Args: {
          p_cijena: number
          p_promjena: number
          p_razlog: string
          p_request_id: string
          p_vrsta: Database["public"]["Enums"]["vrsta_prometa"]
          p_zahtjev: string
          p_zaliha: string
          p_zaposlenik: string
        }
        Returns: {
          cijena: number | null
          id: number
          iznos: number | null
          promjena: number
          razlog: string | null
          request_id: string | null
          stanje: number
          vrijeme: string
          vrsta: Database["public"]["Enums"]["vrsta_prometa"]
          zahtjev_id: string | null
          zaliha_id: string
          zaposlenik_id: string
        }
        SetofOptions: {
          from: "*"
          to: "prometi_zaliha"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prometi_zalihe: {
        Args: {
          p_strana: number
          p_vrsta: Database["public"]["Enums"]["vrsta_prometa"]
          p_zaliha: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      promijeni_status_narudzbe: {
        Args: {
          p_cijena: number
          p_narudzba: string
          p_status: Database["public"]["Enums"]["status_narudzbe"]
          p_tezine: Json
          p_zaposlenik: string
        }
        Returns: Json
      }
      promijeni_status_rezervacije: {
        Args: { p_rezervacija: string; p_status: string; p_zaposlenik: string }
        Returns: Json
      }
      provjeri_pin_sefice: {
        Args: { p_ip: string; p_pin: string; p_uredjaj: string }
        Returns: Record<string, unknown>
      }
      provjeri_popis_sanka: {
        Args: { p_popis: Json; p_proizvodi: string[] }
        Returns: undefined
      }
      racun_bruto: { Args: { p_racun: string }; Returns: number }
      racun_izdat: { Args: { p_racun: string }; Returns: boolean }
      racun_sazetak: { Args: { p_racun: string }; Returns: Json }
      racun_za_stampu: {
        Args: { p_konobar: string; p_racun: string }
        Returns: Json
      }
      racun_za_sto: {
        Args: { p_konobar: string; p_sto: number }
        Returns: Json
      }
      recepti_pregled: { Args: { p_sefica: string }; Returns: Json }
      red_stanice: {
        Args: {
          p_stanica: Database["public"]["Enums"]["stanica"]
          p_zaposlenik: string
        }
        Returns: Json
      }
      rezervacija_odgovor: {
        Args: { p: Database["public"]["Tables"]["rezervacije"]["Row"] }
        Returns: Json
      }
      rezervacije_za_dan: {
        Args: { p_datum: string; p_strana: number; p_zaposlenik: string }
        Returns: Json
      }
      sa_popustom: {
        Args: { p_bruto: number; p_procenat: number }
        Returns: number
      }
      sacuvaj_proizvod: {
        Args: {
          p_aktivan: boolean
          p_cijena: number
          p_id: string
          p_jedinica: Database["public"]["Enums"]["jedinica"]
          p_kategorija: string
          p_naziv: string
          p_redoslijed: number
          p_sefica: string
          p_stanica: Database["public"]["Enums"]["stanica"]
        }
        Returns: Json
      }
      sacuvaj_recept: {
        Args: { p_proizvod: string; p_sastojci: Json; p_sefica: string }
        Returns: Json
      }
      sacuvaj_zaposlenika: {
        Args: {
          p_id: string
          p_ime: string
          p_sefica: string
          p_uloga: Database["public"]["Enums"]["uloga"]
        }
        Returns: Json
      }
      sank_artikli: { Args: { p_zaposlenik: string }; Returns: Json }
      sesija_vazeca: {
        Args: { p_id: string; p_verzija: number }
        Returns: boolean
      }
      sljedeci_status: {
        Args: { p_status: Database["public"]["Enums"]["status_narudzbe"] }
        Returns: Database["public"]["Enums"]["status_narudzbe"]
      }
      sljedeci_status_narudzbe: {
        Args: {
          p_narudzba: string
          p_status: Database["public"]["Enums"]["status_narudzbe"]
        }
        Returns: Database["public"]["Enums"]["status_narudzbe"]
      }
      smjena_odgovor: {
        Args: { p: Database["public"]["Tables"]["smjene"]["Row"] }
        Returns: Json
      }
      smjene_pregled: {
        Args: { p_strana: number; p_zaposlenik: string }
        Returns: Json
      }
      statistika_konobara: {
        Args: { p_dani: number; p_konobar: string }
        Returns: Json
      }
      stolovi_pregled: { Args: { p_konobar: string }; Returns: Json }
      storniraj_stavku: {
        Args: { p_konobar: string; p_razlog: string; p_stavka: number }
        Returns: Json
      }
      uplati_pecenjari: {
        Args: {
          p_iznos: number
          p_konobar: string
          p_request_id: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      z_izvjestaj: {
        Args: { p_datum: string; p_sefica: string }
        Returns: Json
      }
      z_polja: { Args: { p_izvjestaj: Json }; Returns: Json }
      zahtijevaj_konobara: { Args: { p_id: string }; Returns: undefined }
      zahtijevaj_stanicu: {
        Args: {
          p_id: string
          p_stanica: Database["public"]["Enums"]["stanica"]
        }
        Returns: undefined
      }
      zahtijevaj_ulogu: {
        Args: { p_id: string; p_uloge: Database["public"]["Enums"]["uloga"][] }
        Returns: undefined
      }
      zahtjev_mesnici_odgovor: {
        Args: { p: Database["public"]["Tables"]["zahtjevi_mesnici"]["Row"] }
        Returns: Json
      }
      zahtjevi_mesnici_pregled: {
        Args: { p_strana: number; p_zaposlenik: string }
        Returns: Json
      }
      zakljucak_odgovor: {
        Args: { p: Database["public"]["Tables"]["dnevni_zakljucci"]["Row"] }
        Returns: Json
      }
      zaliha_pregled: { Args: { p_zaposlenik: string }; Returns: Json }
      zapisi_radnju: {
        Args: { p_detalji?: Json; p_radnja: string; p_zaposlenik: string }
        Returns: undefined
      }
      zaposlenici_pregled: {
        Args: { p_sefica: string }
        Returns: {
          aktivan: boolean
          ceka_aktivaciju: boolean
          id: string
          ima_pin: boolean
          ime: string
          uloga: Database["public"]["Enums"]["uloga"]
        }[]
      }
      zaposlenici_za_prijavu: {
        Args: { p_uloge: Database["public"]["Enums"]["uloga"][] }
        Returns: {
          id: string
          ime: string
        }[]
      }
      zaposlenik_aktivan: { Args: { p_id: string }; Returns: boolean }
      zaposlenik_odgovor: { Args: { p_id: string }; Returns: Json }
      zatvori_dan: {
        Args: { p_datum: string; p_sefica: string }
        Returns: Json
      }
      zatvori_popis_pecenjare: {
        Args: {
          p_dodatna_kg: number
          p_dodatne_koke: number
          p_predani: number
          p_preostala_kg: number
          p_preostale_koke: number
          p_request_id: string
          p_zaposlenik: string
        }
        Returns: Json
      }
      zatvori_smjenu: {
        Args: {
          p_popis: Json
          p_predani: number
          p_request_id: string
          p_smjena: string
          p_zaposlenik: string
        }
        Returns: Json
      }
    }
    Enums: {
      jedinica: "porcija" | "kom" | "kg" | "l"
      nacin_naplate: "gotovina" | "kartica" | "kombinovano" | "dug"
      stanica: "kuhinja" | "pecenjara" | "sank"
      status_narudzbe: "Novo" | "U pripremi" | "Gotovo" | "Izdato"
      status_racuna: "otvoren" | "placen" | "na_dug" | "spojen"
      uloga: "konobar" | "kuhinja" | "pecenjara" | "mesnica" | "sefica"
      vrsta_prometa: "popis" | "prodaja" | "isporuka"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      jedinica: ["porcija", "kom", "kg", "l"],
      nacin_naplate: ["gotovina", "kartica", "kombinovano", "dug"],
      stanica: ["kuhinja", "pecenjara", "sank"],
      status_narudzbe: ["Novo", "U pripremi", "Gotovo", "Izdato"],
      status_racuna: ["otvoren", "placen", "na_dug", "spojen"],
      uloga: ["konobar", "kuhinja", "pecenjara", "mesnica", "sefica"],
      vrsta_prometa: ["popis", "prodaja", "isporuka"],
    },
  },
} as const
