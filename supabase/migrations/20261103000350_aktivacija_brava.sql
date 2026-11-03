-- A race on real Postgres let one activation code work seven times from ten devices at once, because the
-- locks were per device and per IP. One lock around the code check makes "works once" true, and also stops
-- two colleagues in a role taking the same PIN at the same moment. Activation is rare, so it costs nothing.

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

  perform pg_advisory_xact_lock(hashtextextended('aktivacija', 0));

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
