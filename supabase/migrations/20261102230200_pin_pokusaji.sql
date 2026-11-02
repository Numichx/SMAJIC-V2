-- Lockout counters live here because Vercel functions do not share memory.
-- Keys are 'uredjaj:<id>', 'ip:<hmac>' and 'globalno'.
create table public.pin_pokusaji (
  kljuc text primary key check (char_length(kljuc) <= 120),
  pogresni integer not null default 0,
  prozor_od timestamptz not null default now(),
  zakljucano_do timestamptz
);
alter table public.pin_pokusaji enable row level security;
revoke all on table public.pin_pokusaji from public, anon, authenticated, service_role;

create function public.pin_preostalo(p_kljucevi text[])
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(ceil(extract(epoch from max(p.zakljucano_do) - now()))::integer, 0)
  from public.pin_pokusaji p
  where p.kljuc = any (p_kljucevi) and p.zakljucano_do > now();
$$;
revoke all on function public.pin_preostalo(text[]) from public, anon, authenticated, service_role;

-- The restaurant shares one IP, and anyone can reach the global counter. A limit of 5 on
-- those would let one mistyped run or one stranger lock out every device.
create function public.pin_zabiljezi_gresku(p_kljucevi text[])
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
  where p.prozor_od < now() - interval '1 day' and (p.zakljucano_do is null or p.zakljucano_do < now());
end;
$$;
revoke all on function public.pin_zabiljezi_gresku(text[]) from public, anon, authenticated, service_role;

-- Wrong PINs return a status instead of raising, because raising would roll back the counter.
create function public.prijava_pinom(
  p_uloge public.uloga[],
  p_zaposlenik uuid,
  p_pin text,
  p_uredjaj text,
  p_ip text
)
returns table (status text, retry_after integer, id uuid, ime text, uloga public.uloga)
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
    return query select 'zakljucano'::text, v_preostalo, null::uuid, null::text, null::public.uloga;
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
      v_preostalo, null::uuid, null::text, null::public.uloga;
    return;
  end if;

  delete from public.pin_pokusaji p where p.kljuc = any (array[v_uredjaj, v_ip]);
  perform public.zapisi_radnju(v_id, 'prijava');

  return query
    select 'ok'::text, 0, z.id, z.ime, z.uloga
    from public.zaposlenici z
    where z.id = v_id;
end;
$$;
revoke all on function public.prijava_pinom(public.uloga[], uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.prijava_pinom(public.uloga[], uuid, text, text, text) to service_role;

create function public.postavi_pin_kodom(p_kod text, p_novi_pin text, p_uredjaj text, p_ip text)
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

  -- Two people in one role with the same PIN would make PIN-only login ambiguous.
  if exists (
    select 1 from public.zaposlenici z
    where z.uloga = v_uloga and z.id <> v_id and z.pin_hash = extensions.crypt(p_novi_pin, z.pin_hash)
  ) then
    raise exception 'Izaberite drugi PIN.' using errcode = 'P0001';
  end if;

  update public.zaposlenici z
  set pin_hash = extensions.crypt(p_novi_pin, extensions.gen_salt('bf', 10)),
      aktivacija_hash = null,
      aktivacija_do = null
  where z.id = v_id;

  delete from public.pin_pokusaji p where p.kljuc = any (array[v_uredjaj, v_ip]);
  perform public.zapisi_radnju(v_id, 'pin_postavljen');

  return query select 'ok'::text, 0;
end;
$$;
revoke all on function public.postavi_pin_kodom(text, text, text, text) from public, anon, authenticated;
grant execute on function public.postavi_pin_kodom(text, text, text, text) to service_role;
