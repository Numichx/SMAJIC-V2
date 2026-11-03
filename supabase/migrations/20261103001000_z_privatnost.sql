-- Phase 7: the Z-report and the retention rule for guests' personal data.

-- The fields the Z-report shows, from either a stored close or a live run of the one formula, izvjestaj_raspona.
create function public.z_polja(p_izvjestaj jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'racuni', p_izvjestaj -> 'racuni',
    'bruto', p_izvjestaj -> 'bruto',
    'popust', p_izvjestaj -> 'popust',
    'ukupno', p_izvjestaj -> 'ukupno',
    'naplaceno', p_izvjestaj -> 'naplaceno',
    'gotovina', p_izvjestaj -> 'gotovina',
    'kartica', p_izvjestaj -> 'kartica',
    'baksis', p_izvjestaj -> 'baksis',
    'poNacinu', p_izvjestaj -> 'poNacinu',
    'storna', p_izvjestaj -> 'storna',
    'popusti', p_izvjestaj -> 'popusti',
    'noviDug', p_izvjestaj -> 'noviDug',
    'naplaceniDugovi', p_izvjestaj -> 'naplaceniDugovi'
  );
$$;
revoke all on function public.z_polja(jsonb) from public, anon, authenticated, service_role;

-- A closed day shows what was stored, and says so. A debt collected or a bill paid late can move the live figures of a
-- closed day until the manager closes it again, so promijenjenoNakonZatvaranja tells her the two differ.
create function public.z_izvjestaj(p_sefica uuid, p_datum date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_danas date := public.danas_u_sarajevu();
  v_datum date := coalesce(p_datum, v_danas);
  v_uzivo jsonb;
  v_z public.dnevni_zakljucci;
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if v_datum > v_danas then
    raise exception 'Taj dan još nije počeo.' using errcode = 'P0001';
  end if;

  v_uzivo := public.z_polja(public.izvjestaj_raspona(v_datum, v_datum));
  select d.* into v_z from public.dnevni_zakljucci d where d.datum = v_datum;

  return jsonb_build_object(
    'datum', v_datum,
    'zatvoren', v_z.datum is not null,
    'zatvorenoU', v_z.vrijeme,
    'zatvorila', (select z.ime from public.zaposlenici z where z.id = v_z.zaposlenik_id),
    'promijenjenoNakonZatvaranja', v_z.datum is not null and public.z_polja(v_z.izvjestaj) <> v_uzivo,
    -- shortcut: no VAT is computed, because the owner has not given the rates or the fiscal device. Fill this with the fiscal work.
    'pdv', null
  ) || case when v_z.datum is not null then public.z_polja(v_z.izvjestaj) else v_uzivo end;
end;
$$;
revoke all on function public.z_izvjestaj(uuid, date) from public, anon, authenticated;
grant execute on function public.z_izvjestaj(uuid, date) to service_role;

-- Replaces the shortcuts in 20261103000400 and 20261103000800. Open debts are never touched: only a debt collected has a
-- naplate_dugova row. The name is replaced, not cleared, because the checks on naplate and rezervacije require one.
-- 365 and 90 days are the builder's defaults for the owner to confirm, not a legal rule. The floor of 30 stops a typo erasing
-- recent debts or bookings at once, because this cannot be undone.
-- shortcut: runs only when the manager presses the button, as the prompt asks for no cron. Add a schedule if she forgets.
create function public.anonimiziraj_licne_podatke(p_sefica uuid, p_dani_dugovi integer, p_dani_rezervacije integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dani_dugovi integer := coalesce(p_dani_dugovi, 365);
  v_dani_rezervacije integer := coalesce(p_dani_rezervacije, 90);
  v_dugovi bigint;
  v_rezervacije bigint;
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if v_dani_dugovi not between 30 and 3650 or v_dani_rezervacije not between 30 and 3650 then
    raise exception 'Rok mora biti od 30 do 3.650 dana.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));
  perform pg_advisory_xact_lock(hashtextextended('rezervacije', 0));

  update public.naplate n
  set gost_duznik = 'Anonimizirano'
  from public.naplate_dugova u
  where u.racun_id = n.racun_id
    and u.vrijeme < now() - make_interval(days => v_dani_dugovi)
    and n.gost_duznik <> 'Anonimizirano';
  get diagnostics v_dugovi = row_count;

  -- By the reservation's own time, because one can be booked up to a year ahead.
  update public.rezervacije r
  set ime = 'Anonimizirano', telefon = null, napomena = null
  where r.vrijeme < now() - make_interval(days => v_dani_rezervacije)
    and (r.ime <> 'Anonimizirano' or r.telefon is not null or r.napomena is not null);
  get diagnostics v_rezervacije = row_count;

  perform public.zapisi_radnju(
    p_sefica,
    'licni_podaci_anonimizirani',
    jsonb_build_object('dugovi', v_dugovi, 'rezervacije', v_rezervacije, 'daniDugovi', v_dani_dugovi, 'daniRezervacije', v_dani_rezervacije)
  );
  return jsonb_build_object('dugovi', v_dugovi, 'rezervacije', v_rezervacije, 'daniDugovi', v_dani_dugovi, 'daniRezervacije', v_dani_rezervacije);
end;
$$;
revoke all on function public.anonimiziraj_licne_podatke(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.anonimiziraj_licne_podatke(uuid, integer, integer) to service_role;
