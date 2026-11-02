-- Fixes from the security review of the PIN functions.

-- Lets a session be ended without logging out everyone. Every session carries the
-- version it was issued under.
alter table public.zaposlenici add column sesija_verzija integer not null default 1;

create function public.sesija_vazeca(p_id uuid, p_verzija integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select z.aktivan and z.sesija_verzija = p_verzija from public.zaposlenici z where z.id = p_id),
    false
  );
$$;
revoke all on function public.sesija_vazeca(uuid, integer) from public, anon, authenticated;
grant execute on function public.sesija_vazeca(uuid, integer) to service_role;

-- Other SQL still uses this one, but the app now asks about a session, not a person.
revoke all on function public.zaposlenik_aktivan(uuid) from service_role;

-- A new code ends the person's old sessions at once, so a stolen phone stops working
-- before the employee gets around to choosing a new PIN. The manager keeps her own
-- session when she issues a code to herself, or she would lose the code on screen.
create or replace function public.aktiviraj_pin(p_zaposlenik uuid, p_sefica uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kod text;
begin
  if not exists (
    select 1 from public.zaposlenici s
    where s.id = p_sefica and s.uloga = 'sefica'::public.uloga and s.aktivan
  ) then
    raise exception 'Nemate pravo na ovu radnju.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.zaposlenici z where z.id = p_zaposlenik and z.aktivan) then
    raise exception 'Zaposlenik nije pronađen.' using errcode = 'P0001';
  end if;

  v_kod := public.novi_aktivacijski_kod(p_zaposlenik);
  update public.zaposlenici z
  set sesija_verzija = z.sesija_verzija + 1
  where z.id = p_zaposlenik and z.id <> p_sefica;

  perform public.zapisi_radnju(p_sefica, 'aktivacija_pina', jsonb_build_object('zaposlenik', p_zaposlenik));
  return v_kod;
end;
$$;

-- Picked with skip locked: deleting a row another attempt holds, while holding the
-- global row it is waiting for, was a rare deadlock.
create or replace function public.pin_zabiljezi_gresku(p_kljucevi text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_kljuc text;
  v_limit integer;
  v_trajanje interval;
begin
  foreach v_kljuc in array p_kljucevi loop
    if v_kljuc like 'uredjaj:%' then
      v_limit := 5;
      v_trajanje := interval '5 minutes';
    elsif v_kljuc like 'ip:%' then
      v_limit := 20;
      v_trajanje := interval '15 minutes';
    else
      v_limit := 100;
      v_trajanje := interval '15 minutes';
    end if;

    insert into public.pin_pokusaji as p (kljuc, pogresni, prozor_od)
    values (v_kljuc, 1, now())
    on conflict (kljuc) do update set
      pogresni = case when p.prozor_od < now() - interval '15 minutes' then 1 else p.pogresni + 1 end,
      prozor_od = case when p.prozor_od < now() - interval '15 minutes' then now() else p.prozor_od end;

    update public.pin_pokusaji p
    set zakljucano_do = now() + v_trajanje, pogresni = 0, prozor_od = now()
    where p.kljuc = v_kljuc and p.pogresni >= v_limit;

    if found then
      perform public.zapisi_radnju(null, 'pin_zakljucano', jsonb_build_object('vrsta', split_part(v_kljuc, ':', 1)));
    end if;
  end loop;

  -- Rows hold hashed IPs, so they go as soon as they stop mattering.
  delete from public.pin_pokusaji p
  where p.kljuc in (
    select s.kljuc from public.pin_pokusaji s
    where s.prozor_od < now() - interval '1 day' and (s.zakljucano_do is null or s.zakljucano_do < now())
    for update skip locked
  );
end;
$$;

-- The return type changes, so this one is dropped rather than replaced.
drop function public.prijava_pinom(public.uloga[], uuid, text, text, text);

create function public.prijava_pinom(
  p_uloge public.uloga[],
  p_zaposlenik uuid,
  p_pin text,
  p_uredjaj text,
  p_ip text
)
returns table (status text, retry_after integer, id uuid, ime text, uloga public.uloga, sesija_verzija integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uredjaj text := 'uredjaj:' || p_uredjaj;
  v_ip text := 'ip:' || p_ip;
  v_kljucevi text[] := array[v_uredjaj, v_ip, 'globalno'];
  v_preostalo integer;
  v_broj integer;
  v_id uuid;
begin
  -- Serializes attempts, so parallel requests cannot slip past the limit. IP first, always, to avoid deadlocks.
  perform pg_advisory_xact_lock(hashtextextended(v_ip, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_uredjaj, 0));

  v_preostalo := public.pin_preostalo(v_kljucevi);
  if v_preostalo > 0 then
    return query select 'zakljucano'::text, v_preostalo, null::uuid, null::text, null::public.uloga, null::integer;
    return;
  end if;

  select count(*), min(z.id::text)::uuid into v_broj, v_id
  from public.zaposlenici z
  where z.aktivan
    and z.uloga = any (p_uloge)
    and (p_zaposlenik is null or z.id = p_zaposlenik)
    and p_pin ~ '^[0-9]{4,8}$'
    and z.pin_hash = extensions.crypt(p_pin, z.pin_hash);

  if v_broj <> 1 then
    perform public.pin_zabiljezi_gresku(v_kljucevi);
    v_preostalo := public.pin_preostalo(v_kljucevi);
    return query select
      case when v_preostalo > 0 then 'zakljucano' else 'pogresan' end::text,
      v_preostalo, null::uuid, null::text, null::public.uloga, null::integer;
    return;
  end if;

  -- Device only. If a valid PIN also cleared the IP counter, anyone holding one could
  -- guess at the manager's PIN forever by logging in as themselves between guesses.
  delete from public.pin_pokusaji p where p.kljuc = v_uredjaj;
  perform public.zapisi_radnju(v_id, 'prijava');

  return query
    select 'ok'::text, 0, z.id, z.ime, z.uloga, z.sesija_verzija
    from public.zaposlenici z
    where z.id = v_id;
end;
$$;
revoke all on function public.prijava_pinom(public.uloga[], uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.prijava_pinom(public.uloga[], uuid, text, text, text) to service_role;

create or replace function public.postavi_pin_kodom(p_kod text, p_novi_pin text, p_uredjaj text, p_ip text)
returns table (status text, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uredjaj text := 'uredjaj:' || p_uredjaj;
  v_ip text := 'ip:' || p_ip;
  v_kljucevi text[] := array[v_uredjaj, v_ip, 'globalno'];
  v_preostalo integer;
  v_id uuid;
  v_uloga public.uloga;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_ip, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_uredjaj, 0));

  v_preostalo := public.pin_preostalo(v_kljucevi);
  if v_preostalo > 0 then
    return query select 'zakljucano'::text, v_preostalo;
    return;
  end if;

  if public.pin_je_slab(p_novi_pin) then
    raise exception 'Taj PIN je previše jednostavan. Izaberite drugi.' using errcode = 'P0001';
  end if;

  select z.id, z.uloga into v_id, v_uloga
  from public.zaposlenici z
  where z.aktivan
    and z.aktivacija_do > now()
    and p_kod ~ '^[0-9]{6}$'
    and z.aktivacija_hash = extensions.crypt(p_kod, z.aktivacija_hash)
  limit 1;

  if v_id is null then
    perform public.pin_zabiljezi_gresku(v_kljucevi);
    v_preostalo := public.pin_preostalo(v_kljucevi);
    return query select
      case when v_preostalo > 0 then 'zakljucano' else 'pogresan' end::text,
      v_preostalo;
    return;
  end if;

  -- Two people in one role with the same PIN would make PIN-only login ambiguous, but
  -- refusing reveals that a colleague uses that PIN. So a refusal uses up the code and
  -- is logged: one guess per code the manager issues, never unlimited guesses.
  if exists (
    select 1 from public.zaposlenici z
    where z.uloga = v_uloga and z.id <> v_id and z.pin_hash = extensions.crypt(p_novi_pin, z.pin_hash)
  ) then
    perform public.pin_zabiljezi_gresku(v_kljucevi);
    update public.zaposlenici z set aktivacija_hash = null, aktivacija_do = null where z.id = v_id;
    perform public.zapisi_radnju(v_id, 'pin_zauzet');
    return query select 'zauzet'::text, 0;
    return;
  end if;

  update public.zaposlenici z
  set pin_hash = extensions.crypt(p_novi_pin, extensions.gen_salt('bf', 10)),
      aktivacija_hash = null,
      aktivacija_do = null,
      sesija_verzija = z.sesija_verzija + 1
  where z.id = v_id;

  delete from public.pin_pokusaji p where p.kljuc = v_uredjaj;
  perform public.zapisi_radnju(v_id, 'pin_postavljen');

  return query select 'ok'::text, 0;
end;
$$;
