-- Tables, bills, orders and sides.
-- No line or bill total is stored: phase 3 corrects kolicina (real lamb weight) and phase 4 zeroes cijena (voids),
-- and iznos and every total follow. Later phases add their own nullable columns (storno, popust, naplata).
create type public.status_racuna as enum ('otvoren', 'placen', 'na_dug', 'spojen');
create type public.status_narudzbe as enum ('Novo', 'U pripremi', 'Gotovo', 'Izdato');

create table public.stolovi (
  id smallint primary key check (id between 1 and 20)
);
alter table public.stolovi enable row level security;
revoke all on table public.stolovi from public, anon, authenticated, service_role;
insert into public.stolovi (id) select generate_series(1, 20);

create table public.racuni (
  id uuid primary key default gen_random_uuid(),
  broj bigint generated always as identity unique,
  sto_id smallint not null references public.stolovi (id), -- for receipts, once racun_stolovi no longer lists the bill
  konobar_id uuid not null references public.zaposlenici (id),
  status public.status_racuna not null default 'otvoren',
  otvoren timestamptz not null default now(),
  zatvoren timestamptz,
  check ((status = 'otvoren') = (zatvoren is null))
);
alter table public.racuni enable row level security;
revoke all on table public.racuni from public, anon, authenticated, service_role;
create index racuni_sto_idx on public.racuni (sto_id);
create index racuni_konobar_idx on public.racuni (konobar_id);

-- Holds open bills only, and the one way from a table to its bill, so a merged table resolves
-- everywhere. Whatever closes a bill must delete its rows here.
create table public.racun_stolovi (
  sto_id smallint primary key references public.stolovi (id),
  racun_id uuid not null references public.racuni (id)
);
alter table public.racun_stolovi enable row level security;
revoke all on table public.racun_stolovi from public, anon, authenticated, service_role;
create index racun_stolovi_racun_idx on public.racun_stolovi (racun_id);

create table public.narudzbe (
  id uuid primary key default gen_random_uuid(),
  racun_id uuid not null references public.racuni (id),
  request_id uuid not null,
  stanica public.stanica not null,
  status public.status_narudzbe not null default 'Novo',
  konobar_id uuid not null references public.zaposlenici (id),
  kreirano timestamptz not null default now(),
  unique (request_id, stanica)
);
alter table public.narudzbe enable row level security;
revoke all on table public.narudzbe from public, anon, authenticated, service_role;
create index narudzbe_racun_idx on public.narudzbe (racun_id);
create index narudzbe_konobar_idx on public.narudzbe (konobar_id);
create index narudzbe_red_idx on public.narudzbe (stanica, status, kreirano);

-- A side is its own row in its own station's order, so the kitchen sees it and a void can follow prilog_uz.
create table public.stavke_narudzbe (
  id bigint generated always as identity primary key,
  narudzba_id uuid not null references public.narudzbe (id),
  proizvod_id uuid not null references public.proizvodi (id),
  naziv text not null,
  jedinica public.jedinica not null,
  kolicina numeric(10, 3) not null check (kolicina > 0),
  cijena numeric(10, 2) not null check (cijena >= 0),
  iznos numeric(10, 2) generated always as (round(kolicina * cijena, 2)) stored,
  napomena text check (char_length(napomena) <= 500),
  prilog_uz bigint references public.stavke_narudzbe (id),
  poseban boolean not null default false,
  check (not poseban or prilog_uz is not null)
);
alter table public.stavke_narudzbe enable row level security;
revoke all on table public.stavke_narudzbe from public, anon, authenticated, service_role;
create index stavke_narudzbe_narudzba_idx on public.stavke_narudzbe (narudzba_id);
create index stavke_narudzbe_proizvod_idx on public.stavke_narudzbe (proizvod_id);
create index stavke_narudzbe_prilog_uz_idx on public.stavke_narudzbe (prilog_uz) where prilog_uz is not null;

-- The free-side rule, the only copy of it. Case is spelled out because ILIKE and lower()
-- only fold Ć under some database locales. Gulaš alone leaves the choice to the waiter.
create function public.pravilo_priloga(
  p_kategorija text,
  p_naziv text,
  out besplatni text[],
  out unaprijed boolean
)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when p_kategorija in ('jela-po-narudzbi', 'piletina') and p_naziv !~ '[Mm]ućkalica' then array['Pomfrit']
      when p_kategorija = 'kuhana-jela' and p_naziv ~ '^[Ll]ešo teletina' then array['Miješano povrće']
      when p_kategorija = 'kuhana-jela' and p_naziv ~ '^[Gg]ulaš' then array['Pire krompir', 'Riža', 'Makaroni']
      when p_kategorija = 'riba' then array['Pomfrit', 'Krompir salata']
      when p_kategorija = 'pecenja' and p_naziv ~ '[Tt]eletina ispod sača' then array['Pekarski krompir', 'Pomfrit']
      when p_kategorija = 'rostilj' and p_naziv !~ '[Ćć]evap|[Ss]udžuk' then array['Pomfrit']
      else array[]::text[]
    end,
    not (p_kategorija = 'kuhana-jela' and p_naziv ~ '^[Gg]ulaš');
$$;
revoke all on function public.pravilo_priloga(text, text) from public, anon, authenticated, service_role;

-- What the old order screen offered as a side.
create function public.je_prilog(p_kategorija text, p_naziv text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kategorija = 'prilozi' or (p_kategorija = 'salate' and p_naziv ~ '[Kk]rompir');
$$;
revoke all on function public.je_prilog(text, text) from public, anon, authenticated, service_role;

create function public.meni(p_zaposlenik uuid)
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
            'prilog', case when p.stanica <> 'sank' then jsonb_build_object(
              'besplatni', coalesce(b.lista, '[]'::jsonb),
              'podrazumijevani', case when r.unaprijed then b.lista -> 0 end,
              'jednaPorcija', p.jedinica = 'kg'
            ) end
          )
          order by p.redoslijed
        ) as proizvodi
        from public.proizvodi p
        cross join lateral public.pravilo_priloga(p.kategorija_id, p.naziv) r
        cross join lateral (
          select jsonb_agg(s.id order by array_position(r.besplatni, s.naziv)) as lista
          from public.proizvodi s
          where s.aktivan and s.naziv = any (r.besplatni)
        ) b
        where p.kategorija_id = k.id and p.aktivan
      ) l
    ),
    'prilozi', (
      select jsonb_agg(p.id order by k.redoslijed, p.redoslijed)
      from public.proizvodi p
      join public.kategorije k on k.id = p.kategorija_id
      where p.aktivan and public.je_prilog(p.kategorija_id, p.naziv)
    )
  );
end;
$$;
revoke all on function public.meni(uuid) from public, anon, authenticated;
grant execute on function public.meni(uuid) to service_role;

create function public.zahtijevaj_konobara(p_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.zaposlenici z
    where z.id = p_id and z.uloga = 'konobar'::public.uloga and z.aktivan
  ) then
    raise exception 'Nemate pravo na ovu radnju.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.zahtijevaj_konobara(uuid) from public, anon, authenticated, service_role;

-- The manager's personal PIN, under the same lockout as login. Returns a status,
-- because raising would roll back the counter. Phase 4 discounts use this too.
create function public.provjeri_pin_sefice(
  p_pin text,
  p_uredjaj text,
  p_ip text,
  out status text,
  out retry_after integer,
  out sefica uuid
)
language plpgsql
set search_path = ''
as $$
declare
  v_uredjaj text := 'uredjaj:' || p_uredjaj;
  v_ip text := 'ip:' || p_ip;
  v_kljucevi text[] := array[v_uredjaj, v_ip, 'globalno'];
begin
  -- Same lock order as prijava_pinom.
  perform pg_advisory_xact_lock(hashtextextended(v_ip, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_uredjaj, 0));

  retry_after := public.pin_preostalo(v_kljucevi);
  if retry_after > 0 then
    status := 'zakljucano';
    return;
  end if;

  select z.id into sefica
  from public.zaposlenici z
  where z.aktivan
    and z.uloga = 'sefica'::public.uloga
    and p_pin ~ '^[0-9]{4,8}$'
    and z.pin_hash = extensions.crypt(p_pin, z.pin_hash)
  limit 1;

  if sefica is null then
    perform public.pin_zabiljezi_gresku(v_kljucevi);
    retry_after := public.pin_preostalo(v_kljucevi);
    status := case when retry_after > 0 then 'zakljucano' else 'pogresan' end;
    return;
  end if;

  -- Device only, as in prijava_pinom, so a valid PIN cannot wipe the IP counter.
  delete from public.pin_pokusaji p where p.kljuc = v_uredjaj;
  status := 'ok';
end;
$$;
revoke all on function public.provjeri_pin_sefice(text, text, text) from public, anon, authenticated, service_role;

-- Returns status 'ok', or 'pogresan' or 'zakljucano' for the PIN, with nothing written.
create function public.posalji_narudzbu(
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
  v_besplatni text[];
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

      select r.besplatni into v_besplatni from public.pravilo_priloga(v_jelo.kategorija_id, v_jelo.naziv) r;
      v_odabrani := '{}';

      for v_ulaz_priloga in select e from jsonb_array_elements(v_prilozi) e loop
        select p.* into v_prilog from public.proizvodi p where p.id = (v_ulaz_priloga ->> 'proizvodId')::uuid;
        if not found or not public.je_prilog(v_prilog.kategorija_id, v_prilog.naziv) then
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
        v_besplatan := not v_poseban and v_prilog.naziv = any (v_besplatni);
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

create function public.racun_sazetak(p_racun uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'broj', r.broj,
    'otvoren', r.otvoren,
    'konobar', z.ime,
    'stolovi', (select jsonb_agg(rs.sto_id order by rs.sto_id) from public.racun_stolovi rs where rs.racun_id = r.id),
    'ukupno', (
      select coalesce(sum(s.iznos), 0)
      from public.narudzbe n
      join public.stavke_narudzbe s on s.narudzba_id = n.id
      where n.racun_id = r.id
    ),
    'sveIzdato', not exists (
      select 1 from public.narudzbe n where n.racun_id = r.id and n.status <> 'Izdato'
    )
  )
  from public.racuni r
  join public.zaposlenici z on z.id = r.konobar_id
  where r.id = p_racun;
$$;
revoke all on function public.racun_sazetak(uuid) from public, anon, authenticated, service_role;

create function public.stolovi_pregled(p_konobar uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_konobara(p_konobar);

  return (
    select jsonb_agg(jsonb_build_object('id', s.id, 'racun', public.racun_sazetak(rs.racun_id)) order by s.id)
    from public.stolovi s
    left join public.racun_stolovi rs on rs.sto_id = s.id
  );
end;
$$;
revoke all on function public.stolovi_pregled(uuid) from public, anon, authenticated;
grant execute on function public.stolovi_pregled(uuid) to service_role;

create function public.racun_za_sto(p_konobar uuid, p_sto smallint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_konobara(p_konobar);

  return (
    select public.racun_sazetak(rs.racun_id) || jsonb_build_object('narudzbe', (
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'stanica', n.stanica,
          'status', n.status,
          'kreirano', n.kreirano,
          'stavke', (
            select jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'naziv', s.naziv,
                'jedinica', s.jedinica,
                'kolicina', s.kolicina,
                'cijena', s.cijena,
                'iznos', s.iznos,
                'napomena', s.napomena,
                'prilogUz', s.prilog_uz,
                'poseban', s.poseban
              )
              order by s.id
            )
            from public.stavke_narudzbe s
            where s.narudzba_id = n.id
          )
        )
        order by n.kreirano, n.stanica
      )
      from public.narudzbe n
      where n.racun_id = rs.racun_id
    ))
    from public.racun_stolovi rs
    where rs.sto_id = p_sto
  );
end;
$$;
revoke all on function public.racun_za_sto(uuid, smallint) from public, anon, authenticated;
grant execute on function public.racun_za_sto(uuid, smallint) to service_role;

-- premjesti: the bill leaves p_sto_iz for a free table. spoji: p_sto_iz's bill joins p_sto_u's.
-- dodaj: free table p_sto_u joins p_sto_iz's bill. Merging is never implicit: it cannot be undone.
create function public.premjesti_sto(p_konobar uuid, p_radnja text, p_sto_iz smallint, p_sto_u smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_iz uuid;
  v_u uuid;
begin
  perform public.zahtijevaj_konobara(p_konobar);

  if p_radnja is null or p_radnja not in ('premjesti', 'spoji', 'dodaj') then
    raise exception 'Nepoznata radnja.' using errcode = 'P0001';
  end if;
  if p_sto_iz = p_sto_u then
    raise exception 'Izaberite dva različita stola.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.stolovi s where s.id in (p_sto_iz, p_sto_u)) <> 2 then
    raise exception 'Sto ne postoji.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));

  select rs.racun_id into v_iz from public.racun_stolovi rs where rs.sto_id = p_sto_iz;
  select rs.racun_id into v_u from public.racun_stolovi rs where rs.sto_id = p_sto_u;
  if v_iz is null then
    raise exception 'Sto % nema otvoren račun.', p_sto_iz using errcode = 'P0001';
  end if;

  if p_radnja = 'spoji' then
    if v_u is null then
      raise exception 'Sto % nema otvoren račun.', p_sto_u using errcode = 'P0001';
    end if;
    if v_u = v_iz then
      raise exception 'Stolovi su već na istom računu.' using errcode = 'P0001';
    end if;
    update public.narudzbe n set racun_id = v_u where n.racun_id = v_iz;
    update public.racun_stolovi rs set racun_id = v_u where rs.racun_id = v_iz;
    update public.racuni r set status = 'spojen', zatvoren = now() where r.id = v_iz;
  else
    if v_u is not null then
      raise exception 'Sto % je zauzet.', p_sto_u using errcode = 'P0001';
    end if;
    if p_radnja = 'premjesti' then
      update public.racun_stolovi rs set sto_id = p_sto_u where rs.sto_id = p_sto_iz;
      update public.racuni r set sto_id = p_sto_u where r.id = v_iz and r.sto_id = p_sto_iz;
    else
      insert into public.racun_stolovi (sto_id, racun_id) values (p_sto_u, v_iz);
    end if;
    v_u := v_iz;
  end if;

  perform public.zapisi_radnju(
    p_konobar,
    'sto_' || p_radnja,
    jsonb_build_object('iz', p_sto_iz, 'u', p_sto_u, 'racun', v_iz, 'ostaje', v_u)
  );

  return jsonb_build_object(
    'racunId', v_u,
    'stolovi', (select jsonb_agg(rs.sto_id order by rs.sto_id) from public.racun_stolovi rs where rs.racun_id = v_u)
  );
end;
$$;
revoke all on function public.premjesti_sto(uuid, text, smallint, smallint) from public, anon, authenticated;
grant execute on function public.premjesti_sto(uuid, text, smallint, smallint) to service_role;
