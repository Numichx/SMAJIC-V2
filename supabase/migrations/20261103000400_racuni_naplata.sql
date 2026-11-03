-- Voids, whole-bill discounts, payment and the receipt's data.
-- An open bill still stores no total. naplate holds the amounts once it closes.

create type public.nacin_naplate as enum ('gotovina', 'kartica', 'kombinovano', 'dug');

-- A void zeroes cijena, so the generated iznos and every total follow, and keeps the line's old value here.
alter table public.stavke_narudzbe
  add column storno_razlog text check (storno_razlog in ('Pogrešan unos', 'Gost odustao', 'Greška kuhinje', 'Drugo')),
  add column storno_vrijednost numeric(10, 2) check (storno_vrijednost >= 0),
  add constraint stavke_narudzbe_storno_check check (
    (storno_razlog is null) = (storno_vrijednost is null) and (storno_razlog is null or cijena = 0)
  );

-- A percentage, not an amount, so a line voided later stays correct.
alter table public.racuni
  add column popust_procenat numeric(5, 2) not null default 0 check (popust_procenat between 0 and 100),
  add column popust_razlog text check (popust_razlog in ('Obrok osoblja', 'Častimo', 'Stalni gost', 'Reklamacija', 'Drugo')),
  add constraint racuni_popust_check check (
    (popust_procenat = 0) = (popust_razlog is null)
    and (popust_razlog not in ('Obrok osoblja', 'Častimo') or popust_procenat = 100)
  );

-- A discount needs the manager's PIN, so a line added later must not inherit it without one. Otherwise a
-- comp approved on a coffee would make everything ordered after it free. A trigger, so no path can miss it.
create function public.narudzba_bez_popusta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.racuni r where r.id = new.racun_id and r.popust_procenat > 0) then
    raise exception 'Račun ima popust. Šefica prvo treba ukloniti popust, pa onda dodajte narudžbu.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.narudzba_bez_popusta() from public, anon, authenticated, service_role;
create trigger narudzba_bez_popusta before insert on public.narudzbe for each row execute function public.narudzba_bez_popusta();

-- One payment per bill. Generated columns keep the discount, the handed-over total and the tip from drifting.
-- gost_duznik is personal data, so it lives only here and stays out of dnevnik_radnji and receipts.
-- shortcut: guest names are kept forever, phase 7 adds the retention rule.
create table public.naplate (
  racun_id uuid primary key references public.racuni (id),
  request_id uuid not null unique,
  nacin public.nacin_naplate not null,
  bruto numeric(10, 2) not null check (bruto >= 0),
  ukupno numeric(10, 2) not null check (ukupno between 0 and bruto),
  popust numeric(10, 2) generated always as (bruto - ukupno) stored,
  gotovina numeric(10, 2) not null check (gotovina >= 0),
  kartica numeric(10, 2) not null check (kartica >= 0),
  kusur numeric(10, 2) not null check (kusur >= 0 and kusur <= gotovina),
  gost_dao numeric(10, 2) generated always as (gotovina + kartica) stored,
  baksis numeric(10, 2) generated always as (
    case when nacin = 'dug' then 0 else gotovina + kartica - kusur - ukupno end
  ) stored check (baksis >= 0),
  gost_duznik text check (char_length(gost_duznik) between 2 and 100),
  podijeljeno_na smallint check (podijeljeno_na between 1 and 100),
  stolovi smallint[] not null,
  konobar_id uuid not null references public.zaposlenici (id),
  vrijeme timestamptz not null default now(),
  check ((nacin = 'dug') = (gost_duznik is not null)),
  check (nacin <> 'dug' or gotovina + kartica = 0)
);
alter table public.naplate enable row level security;
revoke all on table public.naplate from public, anon, authenticated, service_role;
create index naplate_konobar_idx on public.naplate (konobar_id);

create function public.narudzba_stornirana(p_narudzba uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(bool_and(s.storno_razlog is not null), false)
  from public.stavke_narudzbe s
  where s.narudzba_id = p_narudzba;
$$;
revoke all on function public.narudzba_stornirana(uuid) from public, anon, authenticated, service_role;

-- A fully voided order skips every step: nothing is left to make, price or weigh.
create function public.sljedeci_status_narudzbe(p_narudzba uuid, p_status public.status_narudzbe)
returns public.status_narudzbe
language sql
stable
set search_path = ''
as $$
  select case
    when p_status <> 'Izdato' and public.narudzba_stornirana(p_narudzba) then 'Izdato'::public.status_narudzbe
    else public.sljedeci_status(p_status)
  end;
$$;
revoke all on function public.sljedeci_status_narudzbe(uuid, public.status_narudzbe) from public, anon, authenticated, service_role;

create function public.racun_bruto(p_racun uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(s.iznos), 0)
  from public.narudzbe n
  join public.stavke_narudzbe s on s.narudzba_id = n.id
  where n.racun_id = p_racun;
$$;
revoke all on function public.racun_bruto(uuid) from public, anon, authenticated, service_role;

-- Rounds what the guest pays. The discount is the rest, so the two always add up to the gross.
create function public.sa_popustom(p_bruto numeric, p_procenat numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(p_bruto * (100 - p_procenat) / 100, 2);
$$;
revoke all on function public.sa_popustom(numeric, numeric) from public, anon, authenticated, service_role;

-- The one rule for "can this be paid", shared by the screen's sveIzdato and by naplati_racun.
create function public.racun_izdat(p_racun uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.narudzbe n
    where n.racun_id = p_racun and n.status <> 'Izdato' and not public.narudzba_stornirana(n.id)
  );
$$;
revoke all on function public.racun_izdat(uuid) from public, anon, authenticated, service_role;

-- Whole fenings, with the leftovers on the first shares, so the shares always add up to the bill.
create function public.podjela_racuna(p_ukupno numeric, p_osoba integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_agg(round(((f.fen / p_osoba) + (case when i <= f.fen % p_osoba then 1 else 0 end))::numeric / 100, 2) order by i)
  from (select (p_ukupno * 100)::bigint as fen) f
  cross join generate_series(1, p_osoba) i;
$$;
revoke all on function public.podjela_racuna(numeric, integer) from public, anon, authenticated, service_role;

create function public.naplata_odgovor(p public.naplate)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'racunId', p.racun_id,
    'nacin', p.nacin,
    'bruto', p.bruto,
    'popust', p.popust,
    'ukupno', p.ukupno,
    'gostDao', p.gost_dao,
    'gotovina', p.gotovina,
    'kartica', p.kartica,
    'kusur', p.kusur,
    'baksis', p.baksis,
    'podijeljenoNa', p.podijeljeno_na,
    'podjela', case when p.podijeljeno_na is not null then public.podjela_racuna(p.ukupno, p.podijeljeno_na) end,
    'stolovi', to_jsonb(p.stolovi),
    'vrijeme', p.vrijeme
  );
$$;
revoke all on function public.naplata_odgovor(public.naplate) from public, anon, authenticated, service_role;

-- ukupno is what the guest pays, after any discount.
create or replace function public.racun_sazetak(p_racun uuid)
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
    'bruto', b.bruto,
    'popust', case when r.popust_procenat > 0 then jsonb_build_object(
      'procenat', r.popust_procenat,
      'razlog', r.popust_razlog,
      'iznos', b.bruto - public.sa_popustom(b.bruto, r.popust_procenat)
    ) end,
    'ukupno', public.sa_popustom(b.bruto, r.popust_procenat),
    'sveIzdato', public.racun_izdat(r.id)
  )
  from public.racuni r
  join public.zaposlenici z on z.id = r.konobar_id
  cross join lateral (select public.racun_bruto(r.id) as bruto) b
  where r.id = p_racun;
$$;

create or replace function public.racun_za_sto(p_konobar uuid, p_sto smallint)
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
                'poseban', s.poseban,
                'stornoRazlog', s.storno_razlog,
                'stornoVrijednost', s.storno_vrijednost
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
                'trebaTezinu', n.stanica = 'pecenjara' and public.je_jagnjetina(s.naziv, s.jedinica) and s.storno_razlog is null,
                -- This is the station's alert: the line stays on the card, marked. No money, as everywhere in a queue.
                'stornoRazlog', s.storno_razlog
              )
              order by s.id
            )
            from public.stavke_narudzbe s
            left join public.stavke_narudzbe j on j.id = s.prilog_uz
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
        where s.narudzba_id = p_narudzba and public.je_jagnjetina(s.naziv, s.jedinica) and s.storno_razlog is null
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

-- Reaches both the waiter who placed the order and the one holding the bill. They differ after a
-- merge or when a colleague adds to a table, and a beep too many beats food left waiting.
-- p_od null (the first poll) returns only the current cursor.
-- Volatile on purpose: it must read what committed while it waited for the lock.
create or replace function public.obavijesti_konobara(p_konobar uuid, p_od bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kraj bigint;
begin
  perform public.zahtijevaj_konobara(p_konobar);

  -- An id alone is not a safe cursor: a lower one could commit after a higher one was read. Moves hold
  -- this lock until they commit, so once it is ours nothing below the highest id can still appear.
  perform pg_advisory_xact_lock_shared(hashtextextended('racuni', 0));

  select coalesce(max(k.id), 0) into v_kraj from public.statusi_narudzbe k;

  return (
    with izdate as (
      select k.id as kursor, n.id, n.broj, n.stanica, n.racun_id, r.sto_id
      from public.statusi_narudzbe k
      join public.narudzbe n on n.id = k.narudzba_id
      join public.racuni r on r.id = n.racun_id
      where k.id > p_od and k.status = 'Izdato' and p_konobar in (n.konobar_id, r.konobar_id)
        -- A fully voided order was cleared, not issued, so there is nothing to carry out.
        and not public.narudzba_stornirana(n.id)
      order by k.id
      limit 50
    )
    select jsonb_build_object(
      -- A full page may have more behind it, so the next poll continues from its last row.
      'kursor', case when count(*) = 50 then max(i.kursor) else v_kraj end,
      'obavijesti', coalesce(jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'broj', i.broj,
          'stanica', i.stanica,
          -- A bill paid before this poll no longer has rows in racun_stolovi.
          'stolovi', coalesce(
            (select jsonb_agg(rs.sto_id order by rs.sto_id) from public.racun_stolovi rs where rs.racun_id = i.racun_id),
            jsonb_build_array(i.sto_id)
          ),
          'stavke', (
            select jsonb_agg(jsonb_build_object('naziv', s.naziv, 'kolicina', s.kolicina, 'jedinica', s.jedinica) order by s.id)
            from public.stavke_narudzbe s
            where s.narudzba_id = i.id and s.storno_razlog is null
          )
        )
        order by i.kursor
      ), '[]'::jsonb)
    )
    from izdate i
  );
end;
$$;

-- premjesti: the bill leaves p_sto_iz for a free table. spoji: p_sto_iz's bill joins p_sto_u's.
-- dodaj: free table p_sto_u joins p_sto_iz's bill. Merging is never implicit: it cannot be undone.
create or replace function public.premjesti_sto(p_konobar uuid, p_radnja text, p_sto_iz smallint, p_sto_u smallint)
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
    -- A merge would silently drop one bill's discount or stretch the other's over lines nobody approved.
    if exists (select 1 from public.racuni r where r.id in (v_iz, v_u) and r.popust_procenat > 0) then
      raise exception 'Račun s popustom se ne može spojiti. Šefica prvo treba ukloniti popust.' using errcode = 'P0001';
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

-- Any line on an open bill, even after Izdato, as in the old app: a guest can send a dish back.
-- A dish takes its sides with it, on whichever station's order they sit, and each keeps its own value.
create function public.storniraj_stavku(p_konobar uuid, p_stavka bigint, p_razlog text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stavka public.stavke_narudzbe;
  v_racun public.racuni;
  v_stornirane jsonb;
begin
  perform public.zahtijevaj_konobara(p_konobar);
  if p_razlog is null or p_razlog not in ('Pogrešan unos', 'Gost odustao', 'Greška kuhinje', 'Drugo') then
    raise exception 'Izaberite razlog storna.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));

  select s.* into v_stavka from public.stavke_narudzbe s where s.id = p_stavka;
  if not found then
    raise exception 'Stavka nije pronađena.' using errcode = 'P0001';
  end if;
  select r.* into v_racun
  from public.narudzbe n
  join public.racuni r on r.id = n.racun_id
  where n.id = v_stavka.narudzba_id;
  if v_racun.status <> 'otvoren' then
    raise exception 'Račun je zatvoren.' using errcode = 'P0001';
  end if;

  -- Already voided means a double tap: the first reason stands and nothing is logged twice.
  if v_stavka.storno_razlog is null then
    with stornirane as (
      update public.stavke_narudzbe s
      set cijena = 0, storno_razlog = p_razlog, storno_vrijednost = s.iznos
      where (s.id = p_stavka or s.prilog_uz = p_stavka) and s.storno_razlog is null
      returning s.id, s.naziv, s.kolicina, s.storno_vrijednost
    )
    select jsonb_agg(jsonb_build_object('stavka', t.id, 'naziv', t.naziv, 'kolicina', t.kolicina, 'vrijednost', t.storno_vrijednost) order by t.id)
    into v_stornirane
    from stornirane t;

    perform public.zapisi_radnju(
      p_konobar,
      'storno',
      jsonb_build_object('racun', v_racun.id, 'razlog', p_razlog, 'stavke', v_stornirane)
    );
  end if;

  return public.racun_sazetak(v_racun.id);
end;
$$;
revoke all on function public.storniraj_stavku(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.storniraj_stavku(uuid, bigint, text) to service_role;

-- Replaces any earlier discount, and procenat 0 removes it. Returns status 'ok', or 'pogresan' or
-- 'zakljucano' for the PIN with nothing changed. Every refusal comes before the PIN check,
-- because raising after it would roll back the wrong-PIN counter.
create function public.odobri_popust(
  p_zaposlenik uuid,
  p_racun uuid,
  p_procenat numeric,
  p_razlog text,
  p_pin text,
  p_uredjaj text,
  p_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_racun public.racuni;
  v_pin record;
  v_razlog text := case when p_procenat > 0 then p_razlog end;
begin
  if not exists (
    select 1 from public.zaposlenici z
    where z.id = p_zaposlenik and z.aktivan and z.uloga in ('konobar', 'sefica')
  ) then
    raise exception 'Nemate pravo na ovu radnju.' using errcode = 'P0001';
  end if;

  if p_procenat is null or p_procenat < 0 or p_procenat > 100 or p_procenat <> round(p_procenat, 2) then
    raise exception 'Popust mora biti od 0 do 100 %%, s najviše dvije decimale.' using errcode = 'P0001';
  end if;
  if p_procenat > 0 and (v_razlog is null or v_razlog not in ('Obrok osoblja', 'Častimo', 'Stalni gost', 'Reklamacija', 'Drugo')) then
    raise exception 'Izaberite razlog popusta.' using errcode = 'P0001';
  end if;
  if v_razlog in ('Obrok osoblja', 'Častimo') and p_procenat <> 100 then
    raise exception 'Obrok osoblja i častimo su uvijek 100 %%.' using errcode = 'P0001';
  end if;
  if p_pin is null or p_uredjaj is null or p_ip is null then
    raise exception 'Za popust unesite PIN šefice.' using errcode = 'P0001';
  end if;

  -- Same lock order as posalji_narudzbu: the bills lock first, the PIN's locks after it.
  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));

  select r.* into v_racun from public.racuni r where r.id = p_racun;
  if not found then
    raise exception 'Račun nije pronađen.' using errcode = 'P0001';
  end if;
  if v_racun.status <> 'otvoren' then
    raise exception 'Račun je zatvoren.' using errcode = 'P0001';
  end if;

  select * into v_pin from public.provjeri_pin_sefice(p_pin, p_uredjaj, p_ip);
  if v_pin.status <> 'ok' then
    perform public.zapisi_radnju(p_zaposlenik, 'popust_odbijen', jsonb_build_object('racun', p_racun));
    return jsonb_build_object('status', v_pin.status, 'retry_after', v_pin.retry_after);
  end if;

  update public.racuni r set popust_procenat = p_procenat, popust_razlog = v_razlog where r.id = p_racun;

  perform public.zapisi_radnju(
    p_zaposlenik,
    'popust',
    jsonb_build_object(
      'racun', p_racun,
      'procenat', p_procenat,
      'razlog', v_razlog,
      'prethodniProcenat', v_racun.popust_procenat,
      'odobrila', v_pin.sefica,
      'bruto', public.racun_bruto(p_racun)
    )
  );

  return jsonb_build_object('status', 'ok', 'racun', public.racun_sazetak(p_racun));
end;
$$;
revoke all on function public.odobri_popust(uuid, uuid, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.odobri_popust(uuid, uuid, numeric, text, text, text, text) to service_role;

-- p_ocekivano is the total the waiter was looking at. It is only compared, never charged: a colleague's
-- void between the screen and the tap would otherwise turn the difference into a tip, or misstate a card charge.
create function public.naplati_racun(
  p_konobar uuid,
  p_racun uuid,
  p_request_id uuid,
  p_ocekivano numeric,
  p_nacin public.nacin_naplate,
  p_gotovina numeric,
  p_kartica numeric,
  p_kusur numeric,
  p_gost_duznik text,
  p_osoba smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_racun public.racuni;
  v_naplata public.naplate;
  v_bruto numeric;
  v_ukupno numeric;
  v_gotovina numeric := coalesce(p_gotovina, 0);
  v_kartica numeric := coalesce(p_kartica, 0);
  v_kusur numeric := coalesce(p_kusur, 0);
  v_duznik text;
begin
  perform public.zahtijevaj_konobara(p_konobar);
  if p_request_id is null or p_nacin is null then
    raise exception 'Nedostaje oznaka zahtjeva ili način naplate.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));

  -- Under the lock, so a double tap finds the first payment and gets the same answer.
  select n.* into v_naplata from public.naplate n where n.request_id = p_request_id;
  if found then
    if v_naplata.racun_id <> p_racun then
      raise exception 'Oznaka zahtjeva je već iskorištena na drugom računu.' using errcode = 'P0001';
    end if;
    return public.naplata_odgovor(v_naplata);
  end if;

  select r.* into v_racun from public.racuni r where r.id = p_racun;
  if not found then
    raise exception 'Račun nije pronađen.' using errcode = 'P0001';
  end if;
  if v_racun.status = 'spojen' then
    raise exception 'Račun je spojen s drugim računom. Osvježite stranicu.' using errcode = 'P0001';
  end if;
  if v_racun.status <> 'otvoren' then
    raise exception 'Račun je već naplaćen.' using errcode = 'P0001';
  end if;
  if not public.racun_izdat(p_racun) then
    raise exception 'Račun se ne može naplatiti dok stanice ne izdaju sve narudžbe.' using errcode = 'P0001';
  end if;

  v_bruto := public.racun_bruto(p_racun);
  v_ukupno := public.sa_popustom(v_bruto, v_racun.popust_procenat);
  if p_ocekivano is distinct from v_ukupno then
    raise exception 'Iznos računa se promijenio. Provjerite novi iznos i pokušajte ponovo.' using errcode = 'P0001';
  end if;
  if greatest(v_gotovina, v_kartica, v_kusur) > 999999.99 or least(v_gotovina, v_kartica, v_kusur) < 0
    or v_gotovina <> round(v_gotovina, 2) or v_kartica <> round(v_kartica, 2) or v_kusur <> round(v_kusur, 2)
  then
    raise exception 'Iznos mora biti od 0 do 999.999,99 KM, zaokružen na fening.' using errcode = 'P0001';
  end if;

  if p_nacin = 'dug' then
    v_duznik := trim(p_gost_duznik);
    if num_nonnulls(p_gotovina, p_kartica, p_kusur) > 0 then
      raise exception 'Račun na dug ne prima uplatu.' using errcode = 'P0001';
    end if;
    if coalesce(char_length(v_duznik), 0) not between 2 and 100 then
      raise exception 'Za dug unesite ime gosta, od 2 do 100 znakova.' using errcode = 'P0001';
    end if;
    if v_ukupno = 0 then
      raise exception 'Račun je 0,00 KM, pa nema duga. Naplatite ga gotovinom.' using errcode = 'P0001';
    end if;
  else
    if p_osoba is not null and p_osoba not between 1 and 100 then
      raise exception 'Račun se može podijeliti na 1 do 100 osoba.' using errcode = 'P0001';
    end if;

    if p_nacin = 'gotovina' then
      if p_gotovina is null or p_kusur is null or p_kartica is not null then
        raise exception 'Unesite koliko je gost dao i koliki je kusur vraćen.' using errcode = 'P0001';
      end if;
      if v_gotovina < v_ukupno then
        raise exception 'Gost nije dao dovoljno novca za račun.' using errcode = 'P0001';
      end if;
    elsif p_nacin = 'kartica' then
      if p_gotovina is not null or p_kusur is not null then
        raise exception 'Plaćanje karticom ne prima gotovinu ni kusur.' using errcode = 'P0001';
      end if;
      v_kartica := coalesce(p_kartica, v_ukupno);
      if v_kartica < v_ukupno then
        raise exception 'Iznos na kartici je manji od računa.' using errcode = 'P0001';
      end if;
    else
      if p_gotovina is null or p_kartica is null or p_kusur is null or v_gotovina = 0 or v_kartica = 0 then
        raise exception 'Za kombinovano unesite gotovinu, karticu i vraćeni kusur.' using errcode = 'P0001';
      end if;
      if v_gotovina + v_kartica < v_ukupno then
        raise exception 'Gotovina i kartica zajedno moraju pokriti račun.' using errcode = 'P0001';
      end if;
    end if;

    -- Change comes out of the cash, and whatever is left over after it is the tip.
    if v_kusur > v_gotovina or v_kusur > v_gotovina + v_kartica - v_ukupno then
      raise exception 'Vraćeni kusur nije ispravan.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.naplate (
    racun_id, request_id, nacin, bruto, ukupno, gotovina, kartica, kusur, gost_duznik, podijeljeno_na, stolovi, konobar_id
  )
  values (
    p_racun, p_request_id, p_nacin, v_bruto, v_ukupno, v_gotovina, v_kartica, v_kusur, v_duznik,
    case when p_nacin <> 'dug' then p_osoba end,
    (select array_agg(rs.sto_id order by rs.sto_id) from public.racun_stolovi rs where rs.racun_id = p_racun),
    p_konobar
  )
  returning * into v_naplata;

  update public.racuni r
  set status = case when p_nacin = 'dug' then 'na_dug'::public.status_racuna else 'placen'::public.status_racuna end,
      zatvoren = now()
  where r.id = p_racun;

  -- All that can be left here are fully voided orders nobody cleared. Filed as issued, they never notify.
  with sklonjene as (
    update public.narudzbe n set status = 'Izdato'
    where n.racun_id = p_racun and n.status <> 'Izdato'
    returning n.id
  )
  insert into public.statusi_narudzbe (narudzba_id, status, zaposlenik_id)
  select s.id, 'Izdato'::public.status_narudzbe, p_konobar from sklonjene s;

  delete from public.racun_stolovi rs where rs.racun_id = p_racun;

  perform public.zapisi_radnju(
    p_konobar,
    'naplata',
    jsonb_build_object(
      'racun', p_racun,
      'nacin', p_nacin,
      'bruto', v_naplata.bruto,
      'popust', v_naplata.popust,
      'ukupno', v_naplata.ukupno,
      'gotovina', v_naplata.gotovina,
      'kartica', v_naplata.kartica,
      'kusur', v_naplata.kusur,
      'baksis', v_naplata.baksis
    )
  );

  return public.naplata_odgovor(v_naplata);
end;
$$;
revoke all on function public.naplati_racun(uuid, uuid, uuid, numeric, public.nacin_naplate, numeric, numeric, numeric, text, smallint) from public, anon, authenticated;
grant execute on function public.naplati_racun(uuid, uuid, uuid, numeric, public.nacin_naplate, numeric, numeric, numeric, text, smallint) to service_role;

-- What a 58 mm receipt prints, for an open or a closed bill: voided lines left out, and by id, because
-- posalji_narudzbu inserts each side right after its dish whichever station makes it.
-- naplata is null until the bill is paid. No guest name.
create function public.racun_za_stampu(p_konobar uuid, p_racun uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_racun public.racuni;
begin
  perform public.zahtijevaj_konobara(p_konobar);

  select r.* into v_racun from public.racuni r where r.id = p_racun;
  if not found then
    raise exception 'Račun nije pronađen.' using errcode = 'P0001';
  end if;
  if v_racun.status = 'spojen' then
    raise exception 'Račun je spojen s drugim računom. Osvježite stranicu.' using errcode = 'P0001';
  end if;

  return (
    select public.racun_sazetak(p_racun) - 'sveIzdato' || jsonb_build_object(
      'status', v_racun.status,
      'zatvoren', v_racun.zatvoren,
      'konobar', coalesce(
        (select z.ime from public.naplate n join public.zaposlenici z on z.id = n.konobar_id where n.racun_id = p_racun),
        (select z.ime from public.zaposlenici z where z.id = v_racun.konobar_id)
      ),
      'stolovi', coalesce(
        (select to_jsonb(n.stolovi) from public.naplate n where n.racun_id = p_racun),
        (select jsonb_agg(rs.sto_id order by rs.sto_id) from public.racun_stolovi rs where rs.racun_id = p_racun)
      ),
      'stavke', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'naziv', s.naziv,
            'jedinica', s.jedinica,
            'kolicina', s.kolicina,
            'cijena', s.cijena,
            'iznos', s.iznos,
            'prilog', s.prilog_uz is not null
          )
          order by s.id
        )
        from public.narudzbe n
        join public.stavke_narudzbe s on s.narudzba_id = n.id
        where n.racun_id = p_racun and s.storno_razlog is null
      ), '[]'::jsonb),
      'naplata', (select public.naplata_odgovor(n) from public.naplate n where n.racun_id = p_racun)
    )
  );
end;
$$;
revoke all on function public.racun_za_stampu(uuid, uuid) from public, anon, authenticated;
grant execute on function public.racun_za_stampu(uuid, uuid) to service_role;
