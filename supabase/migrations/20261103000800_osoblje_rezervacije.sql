-- Staff admin and reservations.

create function public.zaposlenik_odgovor(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', z.id,
    'ime', z.ime,
    'uloga', z.uloga,
    'aktivan', z.aktivan,
    'ima_pin', z.pin_hash is not null,
    'ceka_aktivaciju', coalesce(z.aktivacija_do > now(), false)
  )
  from public.zaposlenici z
  where z.id = p_id;
$$;
revoke all on function public.zaposlenik_odgovor(uuid) from public, anon, authenticated, service_role;

-- p_id null adds a person, who then gets a code to choose a PIN. A new role also clears the PIN: two people in a
-- role with one PIN would break PIN-only login, and a PIN chosen for the kitchen should not open the manager's screens.
create function public.sacuvaj_zaposlenika(p_sefica uuid, p_id uuid, p_ime text, p_uloga public.uloga)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ime text := trim(p_ime);
  v_staro public.zaposlenici;
  v_id uuid := p_id;
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if coalesce(char_length(v_ime), 0) not between 2 and 80 then
    raise exception 'Ime mora imati od 2 do 80 znakova.' using errcode = 'P0001';
  end if;
  if p_uloga is null then
    raise exception 'Izaberite ulogu.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zaposlenici', 0));

  if exists (select 1 from public.zaposlenici z where z.ime = v_ime and z.id is distinct from p_id) then
    raise exception 'Zaposlenik s tim imenom već postoji.' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.zaposlenici (ime, uloga) values (v_ime, p_uloga) returning id into v_id;
    perform public.zapisi_radnju(p_sefica, 'zaposlenik_dodan', jsonb_build_object('zaposlenik', v_id, 'ime', v_ime, 'uloga', p_uloga));
  else
    select z.* into v_staro from public.zaposlenici z where z.id = p_id;
    if not found then
      raise exception 'Zaposlenik nije pronađen.' using errcode = 'P0001';
    end if;
    -- Her own role stays, so there is always an active manager to undo a mistake.
    if p_id = p_sefica and p_uloga <> v_staro.uloga then
      raise exception 'Ne možete promijeniti svoju ulogu.' using errcode = 'P0001';
    end if;

    update public.zaposlenici z
    set ime = v_ime,
        uloga = p_uloga,
        pin_hash = case when p_uloga <> v_staro.uloga then null else z.pin_hash end,
        aktivacija_hash = case when p_uloga <> v_staro.uloga then null else z.aktivacija_hash end,
        aktivacija_do = case when p_uloga <> v_staro.uloga then null else z.aktivacija_do end,
        -- The manager keeps her session, as in aktiviraj_pin. Anyone else's carries the old name and role.
        sesija_verzija = z.sesija_verzija + case when p_id <> p_sefica then 1 else 0 end
    where z.id = p_id;

    perform public.zapisi_radnju(
      p_sefica,
      'zaposlenik_izmijenjen',
      jsonb_build_object('zaposlenik', p_id, 'ime', v_ime, 'uloga', p_uloga, 'prethodnoIme', v_staro.ime, 'prethodnaUloga', v_staro.uloga)
    );
  end if;

  return public.zaposlenik_odgovor(v_id);
end;
$$;
revoke all on function public.sacuvaj_zaposlenika(uuid, uuid, text, public.uloga) from public, anon, authenticated;
grant execute on function public.sacuvaj_zaposlenika(uuid, uuid, text, public.uloga) to service_role;

-- Ends the person's sessions at once: every SQL function re-checks aktivan, and the version keeps an old cookie
-- dead even after they are reactivated. A pending activation code goes too, so it cannot outlive the deactivation.
create function public.postavi_aktivnost_zaposlenika(p_sefica uuid, p_id uuid, p_aktivan boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if p_aktivan is null then
    raise exception 'Izaberite stanje zaposlenika.' using errcode = 'P0001';
  end if;
  if p_id = p_sefica then
    raise exception 'Ne možete deaktivirati sami sebe.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zaposlenici', 0));

  if not exists (select 1 from public.zaposlenici z where z.id = p_id) then
    raise exception 'Zaposlenik nije pronađen.' using errcode = 'P0001';
  end if;

  update public.zaposlenici z
  set aktivan = p_aktivan,
      sesija_verzija = z.sesija_verzija + 1,
      aktivacija_hash = null,
      aktivacija_do = null
  where z.id = p_id and z.aktivan <> p_aktivan;

  if found then
    perform public.zapisi_radnju(
      p_sefica,
      case when p_aktivan then 'zaposlenik_aktiviran' else 'zaposlenik_deaktiviran' end,
      jsonb_build_object('zaposlenik', p_id)
    );
  end if;

  return public.zaposlenik_odgovor(p_id);
end;
$$;
revoke all on function public.postavi_aktivnost_zaposlenika(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.postavi_aktivnost_zaposlenika(uuid, uuid, boolean) to service_role;

-- shortcut: names and phones are kept forever, phase 7 adds the retention rule, as for debtors.
create table public.rezervacije (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  ime text not null check (char_length(ime) between 2 and 100),
  broj_gostiju smallint not null check (broj_gostiju between 1 and 200),
  vrijeme timestamptz not null,
  sto_id smallint references public.stolovi (id),
  telefon text check (char_length(telefon) between 1 and 40),
  napomena text check (char_length(napomena) between 1 and 500),
  status text not null default 'aktivna' check (status in ('aktivna', 'realizovana', 'otkazana')),
  kreirao_id uuid not null references public.zaposlenici (id),
  kreirano timestamptz not null default now()
);
alter table public.rezervacije enable row level security;
revoke all on table public.rezervacije from public, anon, authenticated, service_role;
create index rezervacije_vrijeme_idx on public.rezervacije (vrijeme);

create function public.rezervacija_odgovor(p public.rezervacije)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'ime', p.ime,
    'brojGostiju', p.broj_gostiju,
    'vrijeme', p.vrijeme,
    'stoId', p.sto_id,
    'telefon', p.telefon,
    'napomena', p.napomena,
    'status', p.status,
    'kreirao', (select z.ime from public.zaposlenici z where z.id = p.kreirao_id)
  );
$$;
revoke all on function public.rezervacija_odgovor(public.rezervacije) from public, anon, authenticated, service_role;

create function public.nova_rezervacija(
  p_zaposlenik uuid,
  p_request_id uuid,
  p_ime text,
  p_broj_gostiju smallint,
  p_vrijeme timestamptz,
  p_sto smallint,
  p_telefon text,
  p_napomena text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ime text := trim(p_ime);
  v_telefon text := nullif(trim(p_telefon), '');
  v_napomena text := nullif(trim(p_napomena), '');
  v_r public.rezervacije;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['konobar', 'sefica']::public.uloga[]);
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rezervacije', 0));

  select r.* into v_r from public.rezervacije r where r.request_id = p_request_id;
  if found then
    return public.rezervacija_odgovor(v_r);
  end if;

  if coalesce(char_length(v_ime), 0) not between 2 and 100 then
    raise exception 'Ime gosta mora imati od 2 do 100 znakova.' using errcode = 'P0001';
  end if;
  if p_broj_gostiju is null or p_broj_gostiju not between 1 and 200 then
    raise exception 'Broj gostiju mora biti od 1 do 200.' using errcode = 'P0001';
  end if;
  if p_vrijeme is null or p_vrijeme <= now() then
    raise exception 'Vrijeme rezervacije mora biti u budućnosti.' using errcode = 'P0001';
  end if;
  if p_vrijeme > now() + interval '1 year' then
    raise exception 'Rezervacija može biti najviše godinu dana unaprijed.' using errcode = 'P0001';
  end if;
  if p_sto is not null and p_sto not between 1 and 20 then
    raise exception 'Sto ne postoji.' using errcode = 'P0001';
  end if;
  if char_length(v_telefon) > 40 or char_length(v_napomena) > 500 then
    raise exception 'Telefon može imati do 40, a napomena do 500 znakova.' using errcode = 'P0001';
  end if;

  insert into public.rezervacije (request_id, ime, broj_gostiju, vrijeme, sto_id, telefon, napomena, kreirao_id)
  values (p_request_id, v_ime, p_broj_gostiju, p_vrijeme, p_sto, v_telefon, v_napomena, p_zaposlenik)
  returning * into v_r;

  perform public.zapisi_radnju(
    p_zaposlenik,
    'rezervacija_nova',
    jsonb_build_object('rezervacija', v_r.id, 'vrijeme', p_vrijeme, 'gosti', p_broj_gostiju, 'sto', p_sto)
  );
  return public.rezervacija_odgovor(v_r);
end;
$$;
revoke all on function public.nova_rezervacija(uuid, uuid, text, smallint, timestamptz, smallint, text, text) from public, anon, authenticated;
grant execute on function public.nova_rezervacija(uuid, uuid, text, smallint, timestamptz, smallint, text, text) to service_role;

create function public.rezervacije_za_dan(p_zaposlenik uuid, p_datum date, p_strana integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pomak integer := public.pomak_strane(p_strana);
  v_datum date := coalesce(p_datum, public.danas_u_sarajevu());
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['konobar', 'sefica']::public.uloga[]);

  return (
    select jsonb_build_object(
      'datum', v_datum,
      'rezervacije', coalesce(jsonb_agg(public.rezervacija_odgovor(t.r) order by (t.r).vrijeme, (t.r).id), '[]'::jsonb) - 50,
      'imaJos', count(*) > 50
    )
    from (
      select r
      from public.rezervacije r
      where r.vrijeme >= public.pocetak_dana(v_datum) and r.vrijeme < public.pocetak_dana(v_datum + 1)
      order by r.vrijeme, r.id
      limit 51 offset v_pomak
    ) t
  );
end;
$$;
revoke all on function public.rezervacije_za_dan(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.rezervacije_za_dan(uuid, date, integer) to service_role;

create function public.promijeni_status_rezervacije(p_zaposlenik uuid, p_rezervacija uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.rezervacije;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['konobar', 'sefica']::public.uloga[]);
  if p_status is null or p_status not in ('realizovana', 'otkazana') then
    raise exception 'Rezervacija može biti realizovana ili otkazana.' using errcode = 'P0001';
  end if;

  select r.* into v_r from public.rezervacije r where r.id = p_rezervacija for update;
  if not found then
    raise exception 'Rezervacija nije pronađena.' using errcode = 'P0001';
  end if;
  if v_r.status = p_status then
    return public.rezervacija_odgovor(v_r);
  end if;
  if v_r.status <> 'aktivna' then
    raise exception 'Rezervacija je već obrađena.' using errcode = 'P0001';
  end if;

  update public.rezervacije r set status = p_status where r.id = p_rezervacija returning r.* into v_r;

  perform public.zapisi_radnju(
    p_zaposlenik,
    'rezervacija_status',
    jsonb_build_object('rezervacija', p_rezervacija, 'status', p_status)
  );
  return public.rezervacija_odgovor(v_r);
end;
$$;
revoke all on function public.promijeni_status_rezervacije(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.promijeni_status_rezervacije(uuid, uuid, text) to service_role;
