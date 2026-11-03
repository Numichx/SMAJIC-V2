-- Station queues, status moves, the grill's price and lamb weight, waiter notifications.

alter table public.narudzbe
  add column broj bigint generated always as identity unique,
  -- What the waiter owes the grill for this order (phase 5 debt). It never touches the guest's bill.
  add column cijena_pecenjari numeric(10, 2) check (cijena_pecenjari >= 0);

-- The quantity as ordered, set only when the grill weighs the line. kolicina is what gets billed.
alter table public.stavke_narudzbe add column naruceno numeric(10, 3) check (naruceno > 0);

-- The queues read only unfinished orders, which stay few while the table keeps growing.
drop index public.narudzbe_red_idx;
create index narudzbe_red_idx on public.narudzbe (stanica, kreirano) where status <> 'Izdato';

-- Who made each step and when. Novo is on the order itself (kreirano, konobar_id).
-- id doubles as the notification cursor, so rows are only ever added under the 'racuni' lock.
create table public.statusi_narudzbe (
  id bigint generated always as identity primary key,
  narudzba_id uuid not null references public.narudzbe (id),
  status public.status_narudzbe not null,
  zaposlenik_id uuid not null references public.zaposlenici (id),
  vrijeme timestamptz not null default now(),
  unique (narudzba_id, status)
);
alter table public.statusi_narudzbe enable row level security;
revoke all on table public.statusi_narudzbe from public, anon, authenticated, service_role;
create index statusi_narudzbe_zaposlenik_idx on public.statusi_narudzbe (zaposlenik_id);

-- The same rule as PRISTUP in lib/auth/session.ts: the bar has no staff of its own.
create function public.zahtijevaj_stanicu(p_id uuid, p_stanica public.stanica)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.zaposlenici z
    where z.id = p_id
      and z.aktivan
      and z.uloga = any (case p_stanica
        when 'kuhinja' then array['kuhinja']::public.uloga[]
        when 'pecenjara' then array['pecenjara']::public.uloga[]
        else array['konobar', 'sefica']::public.uloga[]
      end)
  ) then
    raise exception 'Nemate pravo na ovu radnju.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.zahtijevaj_stanicu(uuid, public.stanica) from public, anon, authenticated, service_role;

-- Every station takes all four steps. At the grill, Gotovo is also where its price and the lamb's weight go in.
create function public.sljedeci_status(p_status public.status_narudzbe)
returns public.status_narudzbe
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'Novo' then 'U pripremi'::public.status_narudzbe
    when 'U pripremi' then 'Gotovo'::public.status_narudzbe
    when 'Gotovo' then 'Izdato'::public.status_narudzbe
  end;
$$;
revoke all on function public.sljedeci_status(public.status_narudzbe) from public, anon, authenticated, service_role;

-- shortcut: matches the name as the old app did, so renaming the dish drops it from weighing. Move to a product flag with the menu admin screen.
create function public.je_jagnjetina(p_naziv text, p_jedinica public.jedinica)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_jedinica = 'kg' and p_naziv ilike '%jagnjetina%';
$$;
revoke all on function public.je_jagnjetina(text, public.jedinica) from public, anon, authenticated, service_role;

create function public.red_stanice(p_zaposlenik uuid, p_stanica public.stanica)
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
          'sljedeci', public.sljedeci_status(n.status),
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
                'trebaTezinu', n.stanica = 'pecenjara' and public.je_jagnjetina(s.naziv, s.jedinica)
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
revoke all on function public.red_stanice(uuid, public.stanica) from public, anon, authenticated;
grant execute on function public.red_stanice(uuid, public.stanica) to service_role;

-- p_cijena and p_tezine ([{stavkaId, kg}]) count only on the grill's move to Gotovo.
create function public.promijeni_status_narudzbe(
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
    if p_status is distinct from public.sljedeci_status(v_n.status) then
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
        where s.narudzba_id = p_narudzba and public.je_jagnjetina(s.naziv, s.jedinica)
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
    'sljedeci', public.sljedeci_status(v_n.status)
  );
end;
$$;
revoke all on function public.promijeni_status_narudzbe(uuid, uuid, public.status_narudzbe, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.promijeni_status_narudzbe(uuid, uuid, public.status_narudzbe, numeric, jsonb) to service_role;

-- Reaches both the waiter who placed the order and the one holding the bill. They differ after a
-- merge or when a colleague adds to a table, and a beep too many beats food left waiting.
-- p_od null (the first poll) returns only the current cursor.
-- Volatile on purpose: it must read what committed while it waited for the lock.
create function public.obavijesti_konobara(p_konobar uuid, p_od bigint)
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
            where s.narudzba_id = i.id
          )
        )
        order by i.kursor
      ), '[]'::jsonb)
    )
    from izdate i
  );
end;
$$;
revoke all on function public.obavijesti_konobara(uuid, bigint) from public, anon, authenticated;
grant execute on function public.obavijesti_konobara(uuid, bigint) to service_role;
