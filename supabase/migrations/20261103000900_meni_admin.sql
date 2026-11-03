-- Phase 7 menu admin. A renamed dish must keep its rules, so what the name used to decide now lives on the product.
-- Replaces the name lookups marked shortcut: in 20261103000300 (je_jagnjetina) and 20261103000500 (cijene_pecenjare).
alter table public.proizvodi
  add column tezina boolean not null default false,
  -- Which grill count takes its price from this product.
  add column cijena_popisa text unique check (cijena_popisa in ('koka', 'janjetina')),
  add column prilog boolean not null default false,
  -- In the order the screen offers them, the first being the default side. No foreign key on an array, but products are never deleted.
  add column besplatni_prilozi uuid[] not null default '{}',
  add column prilog_unaprijed boolean not null default true,
  -- "<category id>/<item name>" at this migration, never edited. Null for items added later, which have no photo.
  -- Photos stay in lib/data/slike.ts under this key: the admin screen has no upload, so moving 161 rows of credits gains nothing.
  -- shortcut: path and credit are not in the database as the prompt asks, move them when a photo upload is built.
  add column izvorni_kljuc text unique,
  add constraint proizvodi_tezina_po_kg check (not tezina or jedinica = 'kg');

update public.proizvodi p
set izvorni_kljuc = p.kategorija_id || '/' || p.naziv,
    tezina = public.je_jagnjetina(p.naziv, p.jedinica),
    prilog = public.je_prilog(p.kategorija_id, p.naziv),
    cijena_popisa = case
      when p.kategorija_id = 'pecenja' and p.naziv = 'Pečeno pile' then 'koka'
      when p.kategorija_id = 'pecenja' and p.naziv = 'Jagnjetina s ražnja' then 'janjetina'
    end;

-- The free-side list of pravilo_priloga as side ids. Finds a side by its original name, so a renamed Pomfrit stays on the list.
-- shortcut: pravilo_priloga, je_prilog and je_jagnjetina still read the name, but only when an item is added or changes
-- category, never on a rename. Replace them with fields on the admin screen if the owner wants to choose free sides per dish.
create function public.besplatni_po_pravilu(p_kategorija text, p_naziv text)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(s.id order by array_position(r.besplatni, split_part(s.izvorni_kljuc, '/', 2))), '{}')
  from public.pravilo_priloga(p_kategorija, p_naziv) r
  join public.proizvodi s on split_part(s.izvorni_kljuc, '/', 2) = any (r.besplatni);
$$;
revoke all on function public.besplatni_po_pravilu(text, text) from public, anon, authenticated, service_role;

update public.proizvodi p
set besplatni_prilozi = public.besplatni_po_pravilu(p.kategorija_id, p.naziv),
    prilog_unaprijed = (select r.unaprijed from public.pravilo_priloga(p.kategorija_id, p.naziv) r);

-- Unchanged but for finding the two products by flag, so an inactive or renamed one still gives its price.
create or replace function public.cijene_pecenjare(out koka numeric, out janjetina numeric)
language sql
stable
set search_path = ''
as $$
  select
    (select p.cijena from public.proizvodi p where p.cijena_popisa = 'koka'),
    (select p.cijena from public.proizvodi p where p.cijena_popisa = 'janjetina');
$$;

create or replace function public.meni(p_zaposlenik uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.zaposlenik_aktivan(p_zaposlenik) then
    raise exception 'Nemate pravo na ovu radnju.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'kategorije', (
      select jsonb_agg(
        jsonb_build_object('id', k.id, 'naziv', k.naziv, 'proizvodi', coalesce(l.proizvodi, '[]'::jsonb))
        order by k.redoslijed
      )
      from public.kategorije k
      cross join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'naziv', p.naziv,
            'cijena', p.cijena,
            'jedinica', p.jedinica,
            'stanica', p.stanica,
            'slikaKljuc', p.izvorni_kljuc,
            'prilog', case when p.stanica <> 'sank' then jsonb_build_object(
              'besplatni', coalesce(b.lista, '[]'::jsonb),
              'podrazumijevani', case when p.prilog_unaprijed then b.lista -> 0 end,
              'jednaPorcija', p.jedinica = 'kg'
            ) end
          )
          order by p.redoslijed, p.naziv
        ) as proizvodi
        from public.proizvodi p
        cross join lateral (
          select jsonb_agg(s.id order by array_position(p.besplatni_prilozi, s.id)) as lista
          from public.proizvodi s
          where s.aktivan and s.prilog and s.id = any (p.besplatni_prilozi)
        ) b
        where p.kategorija_id = k.id and p.aktivan
      ) l
    ),
    'prilozi', (
      select jsonb_agg(p.id order by k.redoslijed, p.redoslijed, p.naziv)
      from public.proizvodi p
      join public.kategorije k on k.id = p.kategorija_id
      where p.aktivan and p.prilog
    )
  );
end;
$$;
revoke all on function public.meni(uuid) from public, anon, authenticated;
grant execute on function public.meni(uuid) to service_role;

-- Returns status 'ok', or 'pogresan' or 'zakljucano' for the PIN, with nothing written.
create or replace function public.posalji_narudzbu(
  p_konobar uuid,
  p_request_id uuid,
  p_sto smallint,
  p_stavke jsonb,
  p_poseban_pin text,
  p_uredjaj text,
  p_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_racun uuid;
  v_pin record;
  v_ulaz jsonb;
  v_ulaz_priloga jsonb;
  v_prilozi jsonb;
  v_jelo public.proizvodi;
  v_prilog public.proizvodi;
  v_kolicina numeric;
  v_napomena text;
  v_stavka bigint;
  v_besplatni uuid[];
  v_odabrani uuid[];
  v_poseban boolean;
  v_besplatan boolean;
  v_posebni text[] := '{}';
begin
  perform public.zahtijevaj_konobara(p_konobar);
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;

  -- One lock for every change to bills and tables, because a merge moves orders between bills and
  -- racun_stolovi rows between tables. Few waiters, short transactions. Phase 4 closing a bill takes it too.
  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));

  if not exists (select 1 from public.narudzbe n where n.request_id = p_request_id) then
    if (case when jsonb_typeof(p_stavke) = 'array' then jsonb_array_length(p_stavke) else 0 end) not between 1 and 100 then
      raise exception 'Narudžba mora imati od 1 do 100 stavki.' using errcode = 'P0001';
    end if;

    -- Before any write, so returning a PIN status leaves nothing behind. Any error later rolls back the whole order.
    if jsonb_path_exists(p_stavke, '$[*].prilozi[*] ? (@.poseban == true)') then
      if p_poseban_pin is null or p_uredjaj is null or p_ip is null then
        raise exception 'Za poseban prilog unesite PIN šefice.' using errcode = 'P0001';
      end if;
      select * into v_pin from public.provjeri_pin_sefice(p_poseban_pin, p_uredjaj, p_ip);
      if v_pin.status <> 'ok' then
        perform public.zapisi_radnju(p_konobar, 'poseban_prilog_odbijen', jsonb_build_object('sto', p_sto));
        return jsonb_build_object('status', v_pin.status, 'retry_after', v_pin.retry_after);
      end if;
    end if;

    select rs.racun_id into v_racun from public.racun_stolovi rs where rs.sto_id = p_sto;
    if v_racun is null then
      if not exists (select 1 from public.stolovi s where s.id = p_sto) then
        raise exception 'Sto ne postoji.' using errcode = 'P0001';
      end if;
      insert into public.racuni (sto_id, konobar_id) values (p_sto, p_konobar) returning id into v_racun;
      insert into public.racun_stolovi (sto_id, racun_id) values (p_sto, v_racun);
    end if;

    insert into public.narudzbe (racun_id, request_id, stanica, konobar_id)
    select distinct v_racun, p_request_id, p.stanica, p_konobar
    from public.proizvodi p
    where p.id in (select (t #>> '{}')::uuid from jsonb_path_query(p_stavke, '$.**.proizvodId') t);

    for v_ulaz in select e from jsonb_array_elements(p_stavke) e loop
      select p.* into v_jelo from public.proizvodi p where p.id = (v_ulaz ->> 'proizvodId')::uuid;
      if not found then
        raise exception 'Proizvod ne postoji. Osvježite meni.' using errcode = 'P0001';
      end if;
      if not v_jelo.aktivan then
        raise exception 'Proizvod „%“ trenutno nije dostupan.', v_jelo.naziv using errcode = 'P0001';
      end if;

      v_kolicina := (v_ulaz ->> 'kolicina')::numeric;
      if v_jelo.jedinica = 'kg' then
        if v_kolicina is null or v_kolicina <= 0 or v_kolicina > 100 or v_kolicina <> round(v_kolicina, 3) then
          raise exception 'Količina za „%“ mora biti od 0,001 do 100 kg.', v_jelo.naziv using errcode = 'P0001';
        end if;
      elsif v_kolicina is null or v_kolicina < 1 or v_kolicina > 200 or v_kolicina <> trunc(v_kolicina) then
        raise exception 'Količina za „%“ mora biti cijeli broj od 1 do 200.', v_jelo.naziv using errcode = 'P0001';
      end if;

      v_napomena := nullif(trim(v_ulaz ->> 'napomena'), '');
      if char_length(v_napomena) > 500 then
        raise exception 'Napomena je predugačka.' using errcode = 'P0001';
      end if;

      v_prilozi := coalesce(v_ulaz -> 'prilozi', '[]'::jsonb);
      if jsonb_typeof(v_prilozi) <> 'array' or jsonb_array_length(v_prilozi) > 4 then
        raise exception 'Uz jedno jelo možete izabrati najviše 4 priloga.' using errcode = 'P0001';
      end if;
      if v_jelo.stanica = 'sank' and jsonb_array_length(v_prilozi) > 0 then
        raise exception 'Uz piće se ne bira prilog.' using errcode = 'P0001';
      end if;

      insert into public.stavke_narudzbe (narudzba_id, proizvod_id, naziv, jedinica, kolicina, cijena, napomena)
      select n.id, v_jelo.id, v_jelo.naziv, v_jelo.jedinica, v_kolicina, v_jelo.cijena, v_napomena
      from public.narudzbe n
      where n.request_id = p_request_id and n.stanica = v_jelo.stanica
      returning id into v_stavka;

      v_besplatni := v_jelo.besplatni_prilozi;
      v_odabrani := '{}';

      for v_ulaz_priloga in select e from jsonb_array_elements(v_prilozi) e loop
        select p.* into v_prilog from public.proizvodi p where p.id = (v_ulaz_priloga ->> 'proizvodId')::uuid;
        if not found or not v_prilog.prilog then
          raise exception 'Odabrani prilog ne postoji.' using errcode = 'P0001';
        end if;
        if not v_prilog.aktivan then
          raise exception 'Prilog „%“ trenutno nije dostupan.', v_prilog.naziv using errcode = 'P0001';
        end if;
        if v_prilog.id = any (v_odabrani) then
          raise exception 'Isti prilog je izabran više puta.' using errcode = 'P0001';
        end if;
        v_odabrani := v_odabrani || v_prilog.id;

        -- The old screen charged a special side even when it was on the free list.
        v_poseban := coalesce(v_ulaz_priloga -> 'poseban' = 'true'::jsonb, false);
        v_besplatan := not v_poseban and v_prilog.id = any (v_besplatni);
        if v_poseban then
          v_posebni := v_posebni || v_prilog.naziv;
        end if;
        -- One free side per dish: the list says "this or that", not all of them.
        if v_besplatan then
          v_besplatni := '{}';
        end if;

        insert into public.stavke_narudzbe (narudzba_id, proizvod_id, naziv, jedinica, kolicina, cijena, prilog_uz, poseban)
        select n.id, v_prilog.id, v_prilog.naziv, v_prilog.jedinica,
          case when v_jelo.jedinica = 'kg' then 1 else v_kolicina end, -- one portion, whatever the weight
          case when v_besplatan then 0 else v_prilog.cijena end,
          v_stavka, v_poseban
        from public.narudzbe n
        where n.request_id = p_request_id and n.stanica = v_prilog.stanica;
      end loop;
    end loop;

    if cardinality(v_posebni) > 0 then
      perform public.zapisi_radnju(
        p_konobar,
        'poseban_prilog',
        jsonb_build_object('racun', v_racun, 'sto', p_sto, 'odobrila', v_pin.sefica, 'prilozi', to_jsonb(v_posebni))
      );
    end if;
  end if;

  -- Read back, not stored: a retry after a merge must name the bill that is still open.
  return (
    select jsonb_build_object(
      'status', 'ok',
      'racunId', (array_agg(n.racun_id))[1],
      'narudzbe', jsonb_agg(jsonb_build_object('id', n.id, 'stanica', n.stanica) order by n.stanica)
    )
    from public.narudzbe n
    where n.request_id = p_request_id
  );
end;
$$;
revoke all on function public.posalji_narudzbu(uuid, uuid, smallint, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.posalji_narudzbu(uuid, uuid, smallint, jsonb, text, text, text) to service_role;

create or replace function public.red_stanice(p_zaposlenik uuid, p_stanica public.stanica)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_stanicu(p_zaposlenik, p_stanica);

  return jsonb_build_object(
    'sada', now(),
    'narudzbe', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'broj', n.broj,
          'status', n.status,
          'sljedeci', public.sljedeci_status_narudzbe(n.id, n.status),
          'kreirano', n.kreirano,
          'cekaDugo', n.kreirano <= now() - interval '15 minutes',
          'konobar', z.ime,
          'stolovi', (select jsonb_agg(rs.sto_id order by rs.sto_id) from public.racun_stolovi rs where rs.racun_id = n.racun_id),
          'stavke', (
            select jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'naziv', s.naziv,
                'jedinica', s.jedinica,
                'kolicina', s.kolicina,
                'napomena', s.napomena,
                'prilogUz', s.prilog_uz,
                -- The dish may be in another station's order, so the id alone tells this screen nothing.
                'prilogUzNaziv', j.naziv,
                'trebaTezinu', n.stanica = 'pecenjara' and p.tezina and s.storno_razlog is null,
                -- This is the station's alert: the line stays on the card, marked. No money, as everywhere in a queue.
                'stornoRazlog', s.storno_razlog
              )
              order by s.id
            )
            from public.stavke_narudzbe s
            left join public.stavke_narudzbe j on j.id = s.prilog_uz
            join public.proizvodi p on p.id = s.proizvod_id
            where s.narudzba_id = n.id
          )
        )
        order by n.kreirano, n.id
      )
      from public.narudzbe n
      join public.racuni r on r.id = n.racun_id
      join public.zaposlenici z on z.id = n.konobar_id
      where n.stanica = p_stanica and n.status <> 'Izdato' and r.status = 'otvoren'
    ), '[]'::jsonb)
  );
end;
$$;

-- p_cijena and p_tezine ([{stavkaId, kg}]) count only on the grill's move to Gotovo.
create or replace function public.promijeni_status_narudzbe(
  p_zaposlenik uuid,
  p_narudzba uuid,
  p_status public.status_narudzbe,
  p_cijena numeric,
  p_tezine jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n public.narudzbe;
  v_stavka public.stavke_narudzbe;
  v_kg numeric;
  v_iznos numeric;
  v_tezine jsonb := '[]'::jsonb;
begin
  -- A weight changes a bill, so this must not cross a merge or a closing. It also settles a double tap,
  -- and keeps statusi_narudzbe ids in commit order for the notification cursor.
  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));

  select n.* into v_n from public.narudzbe n where n.id = p_narudzba;
  if not found then
    raise exception 'Narudžba nije pronađena.' using errcode = 'P0001';
  end if;
  perform public.zahtijevaj_stanicu(p_zaposlenik, v_n.stanica);

  -- Already there means a double tap: the first one won, so this one only reports the state.
  if v_n.status <> p_status then
    if p_status <> 'Izdato' and public.narudzba_stornirana(p_narudzba) then
      raise exception 'Sve stavke ove narudžbe su stornirane. Samo je sklonite s reda.' using errcode = 'P0001';
    end if;
    if p_status is distinct from public.sljedeci_status_narudzbe(p_narudzba, v_n.status) then
      raise exception 'Narudžba je u statusu „%“ i ne može preći u „%“.', v_n.status, p_status using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.racuni r where r.id = v_n.racun_id and r.status = 'otvoren') then
      raise exception 'Račun je zatvoren.' using errcode = 'P0001';
    end if;

    if p_status = 'Gotovo' and v_n.stanica = 'pecenjara' then
      if p_cijena is null or p_cijena < 0 or p_cijena > 99999.99 or p_cijena <> round(p_cijena, 2) then
        raise exception 'Unesite cijenu koju konobar plaća pečenjari, od 0 do 99.999,99 KM.' using errcode = 'P0001';
      end if;
      if jsonb_typeof(p_tezine) <> 'array' then
        raise exception 'Stvarna količina nije ispravna.' using errcode = 'P0001';
      end if;

      -- Every lamb line, not just the first as in the old app: one order can hold the dish twice.
      for v_stavka in
        select s.* from public.stavke_narudzbe s
        join public.proizvodi p on p.id = s.proizvod_id
        where s.narudzba_id = p_narudzba and p.tezina and s.storno_razlog is null
        order by s.id
      loop
        select (e ->> 'kg')::numeric into v_kg
        from jsonb_array_elements(p_tezine) e
        where e ->> 'stavkaId' = v_stavka.id::text;
        if v_kg is null or v_kg <= 0 or v_kg > 100 or v_kg <> round(v_kg, 3) then
          raise exception 'Unesite stvarnu količinu za „%“, od 0,001 do 100 kg.', v_stavka.naziv using errcode = 'P0001';
        end if;

        update public.stavke_narudzbe s
        set kolicina = v_kg, naruceno = s.kolicina
        where s.id = v_stavka.id
        returning s.iznos into v_iznos;

        v_tezine := v_tezine || jsonb_build_object(
          'stavka', v_stavka.id,
          'naziv', v_stavka.naziv,
          'staraKolicina', v_stavka.kolicina,
          'novaKolicina', v_kg,
          'cijena', v_stavka.cijena,
          'stariIznos', v_stavka.iznos,
          'noviIznos', v_iznos
        );
      end loop;

      if coalesce(jsonb_array_length(p_tezine), 0) <> jsonb_array_length(v_tezine) then
        raise exception 'Stvarna količina se upisuje samo na jagnjetinu iz ove narudžbe, jednom po stavci.' using errcode = 'P0001';
      end if;

      update public.narudzbe n set cijena_pecenjari = p_cijena where n.id = p_narudzba;
      perform public.zapisi_radnju(
        p_zaposlenik,
        'pecenjara_gotovo',
        jsonb_build_object('narudzba', p_narudzba, 'racun', v_n.racun_id, 'cijena', p_cijena, 'tezine', v_tezine)
      );
    end if;

    update public.narudzbe n set status = p_status where n.id = p_narudzba;
    insert into public.statusi_narudzbe (narudzba_id, status, zaposlenik_id) values (p_narudzba, p_status, p_zaposlenik);
    v_n.status := p_status;
  end if;

  return jsonb_build_object(
    'id', v_n.id,
    'status', v_n.status,
    'sljedeci', public.sljedeci_status_narudzbe(p_narudzba, v_n.status)
  );
end;
$$;

create function public.proizvod_odgovor(p public.proizvodi)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'kategorijaId', p.kategorija_id,
    'naziv', p.naziv,
    'cijena', p.cijena,
    'jedinica', p.jedinica,
    'stanica', p.stanica,
    'redoslijed', p.redoslijed,
    'aktivan', p.aktivan,
    'tezina', p.tezina,
    'jePrilog', p.prilog,
    'besplatniPrilozi', (
      select coalesce(jsonb_agg(s.naziv order by array_position(p.besplatni_prilozi, s.id)), '[]'::jsonb)
      from public.proizvodi s
      where s.id = any (p.besplatni_prilozi)
    ),
    'slikaKljuc', p.izvorni_kljuc
  );
$$;
revoke all on function public.proizvod_odgovor(public.proizvodi) from public, anon, authenticated, service_role;

-- Everything, sold-out items too, so the manager can bring them back.
create function public.meni_pregled(p_sefica uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);

  return jsonb_build_object(
    'kategorije', (select jsonb_agg(jsonb_build_object('id', k.id, 'naziv', k.naziv) order by k.redoslijed) from public.kategorije k),
    'proizvodi', (
      select jsonb_agg(public.proizvod_odgovor(p) order by k.redoslijed, p.redoslijed, p.naziv)
      from public.proizvodi p
      join public.kategorije k on k.id = p.kategorija_id
    )
  );
end;
$$;
revoke all on function public.meni_pregled(uuid) from public, anon, authenticated;
grant execute on function public.meni_pregled(uuid) to service_role;

-- p_id null adds an item, and every field but p_redoslijed and p_aktivan is needed. On an edit, null keeps the value.
-- Order lines keep their own name, unit and price, so no change here reaches an order already sent.
create function public.sacuvaj_proizvod(
  p_sefica uuid,
  p_id uuid,
  p_naziv text,
  p_kategorija text,
  p_cijena numeric,
  p_jedinica public.jedinica,
  p_stanica public.stanica,
  p_redoslijed integer,
  p_aktivan boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staro public.proizvodi;
  v_novo public.proizvodi;
  v_smjena uuid;
  v_na_popisu boolean;
  v_promjene jsonb;
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  -- Before the row var: its numeric(10, 2) field would round this silently.
  if p_cijena < 0.01 or p_cijena > 9999.99 or p_cijena <> round(p_cijena, 2) then
    raise exception 'Cijena mora biti od 0,01 do 9.999,99 KM, s najviše dvije decimale.' using errcode = 'P0001';
  end if;
  if p_redoslijed not between 1 and 9999 then
    raise exception 'Redoslijed mora biti od 1 do 9.999.' using errcode = 'P0001';
  end if;

  -- The lock every shift count takes, so a price or a new drink cannot slip in beside a count being opened or closed.
  perform pg_advisory_xact_lock(hashtextextended('smjene', 0));

  if p_id is null then
    if p_naziv is null or p_kategorija is null or p_cijena is null or p_jedinica is null or p_stanica is null then
      raise exception 'Unesite naziv, kategoriju, cijenu, jedinicu i stanicu.' using errcode = 'P0001';
    end if;
    v_novo.id := gen_random_uuid();
    v_novo.aktivan := true;
  else
    select p.* into v_staro from public.proizvodi p where p.id = p_id;
    if not found then
      raise exception 'Proizvod nije pronađen.' using errcode = 'P0001';
    end if;
    v_novo := v_staro;
  end if;

  v_novo.naziv := coalesce(trim(p_naziv), v_novo.naziv);
  v_novo.kategorija_id := coalesce(p_kategorija, v_novo.kategorija_id);
  v_novo.cijena := coalesce(p_cijena, v_novo.cijena);
  v_novo.jedinica := coalesce(p_jedinica, v_novo.jedinica);
  v_novo.stanica := coalesce(p_stanica, v_novo.stanica);
  v_novo.redoslijed := coalesce(p_redoslijed, v_novo.redoslijed);
  v_novo.aktivan := coalesce(p_aktivan, v_novo.aktivan);

  if char_length(v_novo.naziv) not between 2 and 100 or v_novo.naziv ~ '[[:cntrl:]]' then
    raise exception 'Naziv mora imati od 2 do 100 znakova, u jednom redu.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.kategorije k where k.id = v_novo.kategorija_id) then
    raise exception 'Kategorija ne postoji.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.proizvodi p
    where p.kategorija_id = v_novo.kategorija_id and lower(p.naziv) = lower(v_novo.naziv) and p.id <> v_novo.id
  ) then
    raise exception 'Proizvod s tim nazivom već postoji u toj kategoriji.' using errcode = 'P0001';
  end if;

  -- Weighing bills by the kg and the grill count prices by the kg or the piece, at the grill.
  if (v_staro.tezina or v_staro.cijena_popisa is not null)
    and (v_novo.jedinica <> v_staro.jedinica or v_novo.stanica <> v_staro.stanica)
  then
    raise exception 'Ovaj proizvod se važe ili je u popisu pečenjare, pa mu se jedinica i stanica ne mijenjaju.' using errcode = 'P0001';
  end if;

  -- A shift's bar takings are the opening count less the closing count, at the price when it closes, for the drinks counted
  -- at opening. A price change would reprice drinks already sold, and a drink not on the count would sell uncounted.
  -- shortcut: refused until the shift closes, because the count has no price per sale, ask the owner after the trial week.
  select s.id into v_smjena from public.smjene s where s.kraj is null;
  if v_smjena is not null then
    v_na_popisu := exists (
      select 1 from public.popisi_sanka ps where ps.smjena_id = v_smjena and ps.proizvod_id = v_novo.id
    );
    if v_na_popisu and (v_novo.cijena <> v_staro.cijena or v_novo.stanica <> v_staro.stanica) then
      raise exception 'Dok je smjena otvorena, piću iz popisa se ne mijenjaju cijena ni stanica.' using errcode = 'P0001';
    end if;
    if v_novo.stanica = 'sank' and v_novo.aktivan and not v_na_popisu then
      raise exception 'Piće koje nije u popisu otvorene smjene može se dodati ili vratiti tek kad se smjena zatvori.' using errcode = 'P0001';
    end if;
  end if;
  if v_staro.cijena_popisa is not null and v_novo.cijena <> v_staro.cijena
    and exists (select 1 from public.popisi_pecenjare pp where pp.zatvoreno is null)
  then
    raise exception 'Dok je popis pečenjare otvoren, cijena ovog proizvoda se ne mijenja.' using errcode = 'P0001';
  end if;

  -- The rules follow a category, as they always did. A rename alone leaves them alone.
  if v_novo.kategorija_id is distinct from v_staro.kategorija_id then
    v_novo.prilog := public.je_prilog(v_novo.kategorija_id, v_novo.naziv);
    v_novo.besplatni_prilozi := public.besplatni_po_pravilu(v_novo.kategorija_id, v_novo.naziv);
    v_novo.prilog_unaprijed := (select r.unaprijed from public.pravilo_priloga(v_novo.kategorija_id, v_novo.naziv) r);
    if p_redoslijed is null then
      v_novo.redoslijed := (
        select coalesce(max(p.redoslijed), 0) + 1 from public.proizvodi p where p.kategorija_id = v_novo.kategorija_id
      );
    end if;
  end if;

  if p_id is null then
    v_novo.tezina := public.je_jagnjetina(v_novo.naziv, v_novo.jedinica);
    insert into public.proizvodi select (v_novo).*;
    perform public.zapisi_radnju(
      p_sefica,
      'proizvod_dodan',
      jsonb_build_object(
        'proizvod', v_novo.id,
        'naziv', v_novo.naziv,
        'kategorija', v_novo.kategorija_id,
        'cijena', v_novo.cijena,
        'jedinica', v_novo.jedinica,
        'stanica', v_novo.stanica,
        'besplatniPrilozi', to_jsonb(v_novo.besplatni_prilozi),
        'tezina', v_novo.tezina
      )
    );
  else
    select jsonb_object_agg(n.key, jsonb_build_object('staro', s.value, 'novo', n.value)) into v_promjene
    from jsonb_each(to_jsonb(v_novo)) n
    join jsonb_each(to_jsonb(v_staro)) s on s.key = n.key
    where n.value <> s.value;

    -- Nothing changed means a double tap, so nothing is logged.
    if v_promjene is not null then
      update public.proizvodi p
      set naziv = v_novo.naziv,
          kategorija_id = v_novo.kategorija_id,
          cijena = v_novo.cijena,
          jedinica = v_novo.jedinica,
          stanica = v_novo.stanica,
          redoslijed = v_novo.redoslijed,
          aktivan = v_novo.aktivan,
          prilog = v_novo.prilog,
          besplatni_prilozi = v_novo.besplatni_prilozi,
          prilog_unaprijed = v_novo.prilog_unaprijed
      where p.id = p_id;
      perform public.zapisi_radnju(
        p_sefica,
        'proizvod_izmijenjen',
        jsonb_build_object('proizvod', p_id, 'naziv', v_staro.naziv, 'promjene', v_promjene)
      );
    end if;
  end if;

  return public.proizvod_odgovor(v_novo);
end;
$$;
revoke all on function public.sacuvaj_proizvod(uuid, uuid, text, text, numeric, public.jedinica, public.stanica, integer, boolean) from public, anon, authenticated;
grant execute on function public.sacuvaj_proizvod(uuid, uuid, text, text, numeric, public.jedinica, public.stanica, integer, boolean) to service_role;
