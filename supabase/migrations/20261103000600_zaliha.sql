-- Stock, the kitchen's requests to the butcher, and recipes. Orders never touch stock: recipes only feed purchase suggestions.

create type public.vrsta_prometa as enum ('popis', 'prodaja', 'isporuka');

-- Seeded from stock-and-recipes.csv. Its quantities are marked demo values, so every item starts
-- at 0 and the first manual count sets the real number. It has no selling prices, so butcher
-- sales are refused until the manager sets one.
create table public.zaliha_artikli (
  id uuid primary key default gen_random_uuid(),
  naziv text not null unique check (char_length(naziv) between 1 and 80),
  jedinica public.jedinica not null,
  stanje numeric(10, 3) not null default 0 check (stanje >= 0),
  minimum numeric(10, 3) not null default 0 check (minimum >= 0),
  nabavna_cijena numeric(10, 2) check (nabavna_cijena >= 0),
  prodajna_cijena numeric(10, 2) check (prodajna_cijena >= 0)
);
alter table public.zaliha_artikli enable row level security;
revoke all on table public.zaliha_artikli from public, anon, authenticated, service_role;

insert into public.zaliha_artikli (naziv, jedinica, minimum, nabavna_cijena) values
  ('Kotlet', 'kg', 2, 15),
  ('Teletina', 'kg', 3, 22),
  ('Junetina', 'kg', 3, 16),
  ('Biftek', 'kg', 1, 30),
  ('Ramstek', 'kg', 1, 28),
  ('Ćevapi', 'kg', 5, 12),
  ('Suho meso', 'kg', 1, 30),
  ('Sudžuk', 'kg', 1, 16),
  ('Stelja', 'kg', 1, 14),
  ('Piletina', 'kg', 3, 6),
  ('Janjetina', 'kg', 5, 22),
  ('Pomfrit', 'kg', 5, null),
  ('Lepinja', 'kom', 20, null);

create table public.recepti (
  proizvod_id uuid not null references public.proizvodi (id),
  zaliha_id uuid not null references public.zaliha_artikli (id),
  kolicina numeric(10, 3) not null check (kolicina > 0),
  primary key (proizvod_id, zaliha_id)
);
alter table public.recepti enable row level security;
revoke all on table public.recepti from public, anon, authenticated, service_role;

insert into public.recepti (proizvod_id, zaliha_id, kolicina)
select p.id, z.id, x.kolicina
from (values
  ('jela-po-narudzbi', 'Natur šnicla', 'Teletina', 0.2),
  ('rostilj', 'Ćevapi – velika porcija', 'Ćevapi', 1),
  ('rostilj', 'Ćevapi – velika porcija', 'Lepinja', 2),
  ('prilozi', 'Pomfrit', 'Pomfrit', 0.2)
) as x (kategorija, jelo, artikal, kolicina)
join public.proizvodi p on p.kategorija_id = x.kategorija and p.naziv = x.jelo
join public.zaliha_artikli z on z.naziv = x.artikal;

create table public.zahtjevi_mesnici (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  zaliha_id uuid not null references public.zaliha_artikli (id),
  trazeno numeric(10, 3) check (trazeno > 0),
  status text not null default 'nov' check (status in ('nov', 'isporucen', 'nema_na_stanju')),
  isporuceno numeric(10, 3) check (isporuceno > 0),
  kreirao_id uuid not null references public.zaposlenici (id),
  kreirano timestamptz not null default now(),
  obradio_id uuid references public.zaposlenici (id),
  obradjeno timestamptz,
  check ((status = 'nov') = (obradjeno is null) and (status = 'nov') = (obradio_id is null)),
  check ((status = 'isporucen') = (isporuceno is not null))
);
alter table public.zahtjevi_mesnici enable row level security;
revoke all on table public.zahtjevi_mesnici from public, anon, authenticated, service_role;
create index zahtjevi_mesnici_red_idx on public.zahtjevi_mesnici (kreirano desc);

-- The three ways stock may change, and promet_zalihe is the only code that writes stanje.
create table public.prometi_zaliha (
  id bigint generated always as identity primary key,
  request_id uuid unique,
  zaliha_id uuid not null references public.zaliha_artikli (id),
  vrsta public.vrsta_prometa not null,
  promjena numeric(10, 3) not null,
  stanje numeric(10, 3) not null check (stanje >= 0),
  razlog text check (razlog in ('Popis', 'Prijem robe', 'Višak', 'Otpis')),
  cijena numeric(10, 2) check (cijena >= 0),
  iznos numeric(12, 2) generated always as (round(-promjena * cijena, 2)) stored,
  zahtjev_id uuid references public.zahtjevi_mesnici (id),
  zaposlenik_id uuid not null references public.zaposlenici (id),
  vrijeme timestamptz not null default now(),
  check ((vrsta = 'popis') = (razlog is not null)),
  check ((vrsta = 'prodaja') = (cijena is not null)),
  check ((vrsta = 'isporuka') = (zahtjev_id is not null)),
  check (vrsta = 'popis' or promjena < 0)
);
alter table public.prometi_zaliha enable row level security;
revoke all on table public.prometi_zaliha from public, anon, authenticated, service_role;
create index prometi_zaliha_artikal_idx on public.prometi_zaliha (zaliha_id, id desc);
create index prometi_zaliha_vrsta_idx on public.prometi_zaliha (vrsta, vrijeme);

-- Purchase suggestions read orders by age.
create index narudzbe_kreirano_idx on public.narudzbe (kreirano);

-- Callers hold the 'zaliha' lock, so two devices cannot both spend the same stock.
create function public.promet_zalihe(
  p_zaposlenik uuid,
  p_request_id uuid,
  p_zaliha uuid,
  p_vrsta public.vrsta_prometa,
  p_promjena numeric,
  p_razlog text,
  p_cijena numeric,
  p_zahtjev uuid
)
returns public.prometi_zaliha
language plpgsql
set search_path = ''
as $$
declare
  v_z public.zaliha_artikli;
  v_p public.prometi_zaliha;
begin
  select z.* into v_z from public.zaliha_artikli z where z.id = p_zaliha;
  if v_z.stanje + p_promjena < 0 then
    raise exception 'Nema dovoljno na stanju. Trenutno stanje: % %.', replace(trim_scale(v_z.stanje)::text, '.', ','), v_z.jedinica using errcode = 'P0001';
  end if;

  update public.zaliha_artikli z set stanje = z.stanje + p_promjena where z.id = p_zaliha returning z.* into v_z;

  insert into public.prometi_zaliha (request_id, zaliha_id, vrsta, promjena, stanje, razlog, cijena, zahtjev_id, zaposlenik_id)
  values (p_request_id, p_zaliha, p_vrsta, p_promjena, v_z.stanje, p_razlog, p_cijena, p_zahtjev, p_zaposlenik)
  returning * into v_p;

  perform public.zapisi_radnju(
    p_zaposlenik,
    'zaliha_' || p_vrsta,
    jsonb_build_object(
      'artikal', v_z.naziv,
      'promjena', v_p.promjena,
      'stanje', v_p.stanje,
      'razlog', v_p.razlog,
      'iznos', v_p.iznos,
      'zahtjev', v_p.zahtjev_id
    )
  );
  return v_p;
end;
$$;
revoke all on function public.promet_zalihe(uuid, uuid, uuid, public.vrsta_prometa, numeric, text, numeric, uuid) from public, anon, authenticated, service_role;

-- The kitchen only picks what to ask for. The butcher works with stock and selling prices, and purchase prices are the manager's.
create function public.zaliha_pregled(p_zaposlenik uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uloga public.uloga;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['kuhinja', 'mesnica', 'sefica']::public.uloga[]);
  select z.uloga into v_uloga from public.zaposlenici z where z.id = p_zaposlenik;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object('id', a.id, 'naziv', a.naziv, 'jedinica', a.jedinica)
      || case when v_uloga <> 'kuhinja' then jsonb_build_object(
        'stanje', a.stanje,
        'minimum', a.minimum,
        'ispodMinimuma', a.stanje <= a.minimum,
        'prodajnaCijena', a.prodajna_cijena
      ) else '{}'::jsonb end
      || case when v_uloga = 'sefica' then jsonb_build_object('nabavnaCijena', a.nabavna_cijena) else '{}'::jsonb end
      order by a.naziv
    ), '[]'::jsonb)
    from public.zaliha_artikli a
  );
end;
$$;
revoke all on function public.zaliha_pregled(uuid) from public, anon, authenticated;
grant execute on function public.zaliha_pregled(uuid) to service_role;

create function public.izmijeni_artikal_zalihe(p_sefica uuid, p_zaliha uuid, p_minimum numeric, p_nabavna numeric, p_prodajna numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staro public.zaliha_artikli;
  v_novo public.zaliha_artikli;
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if p_minimum is null or p_minimum < 0 or p_minimum > 100000 or p_minimum <> round(p_minimum, 3) then
    raise exception 'Minimum mora biti od 0 do 100.000.' using errcode = 'P0001';
  end if;
  if p_nabavna < 0 or p_nabavna > 99999.99 or p_nabavna <> round(p_nabavna, 2)
    or p_prodajna < 0 or p_prodajna > 99999.99 or p_prodajna <> round(p_prodajna, 2)
  then
    raise exception 'Cijena mora biti od 0 do 99.999,99 KM, zaokružena na fening.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zaliha', 0));

  select z.* into v_staro from public.zaliha_artikli z where z.id = p_zaliha;
  if not found then
    raise exception 'Artikal zalihe nije pronađen.' using errcode = 'P0001';
  end if;

  update public.zaliha_artikli z
  set minimum = p_minimum, nabavna_cijena = p_nabavna, prodajna_cijena = p_prodajna
  where z.id = p_zaliha
  returning z.* into v_novo;

  perform public.zapisi_radnju(
    p_sefica,
    'zaliha_izmjena',
    jsonb_build_object(
      'artikal', v_novo.naziv,
      'minimum', p_minimum,
      'nabavnaCijena', p_nabavna,
      'prodajnaCijena', p_prodajna,
      'prethodno', jsonb_build_object(
        'minimum', v_staro.minimum,
        'nabavnaCijena', v_staro.nabavna_cijena,
        'prodajnaCijena', v_staro.prodajna_cijena
      )
    )
  );
  return jsonb_build_object(
    'id', v_novo.id,
    'minimum', v_novo.minimum,
    'nabavnaCijena', v_novo.nabavna_cijena,
    'prodajnaCijena', v_novo.prodajna_cijena
  );
end;
$$;
revoke all on function public.izmijeni_artikal_zalihe(uuid, uuid, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.izmijeni_artikal_zalihe(uuid, uuid, numeric, numeric, numeric) to service_role;

-- The count is the real number, so the server works out the change: a change computed on a screen would be stale
-- if a sale landed in between. Goods coming in are also recorded this way, as in the old app.
create function public.popisi_zalihu(p_zaposlenik uuid, p_request_id uuid, p_zaliha uuid, p_stanje numeric, p_razlog text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.prometi_zaliha;
  v_staro numeric;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['mesnica', 'sefica']::public.uloga[]);
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_stanje is null or p_stanje < 0 or p_stanje > 100000 or p_stanje <> round(p_stanje, 3) then
    raise exception 'Stanje mora biti od 0 do 100.000, s najviše tri decimale.' using errcode = 'P0001';
  end if;
  if p_razlog is null or p_razlog not in ('Popis', 'Prijem robe', 'Višak', 'Otpis') then
    raise exception 'Izaberite razlog promjene stanja.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zaliha', 0));

  select p.* into v_p from public.prometi_zaliha p where p.request_id = p_request_id;
  if found then
    return jsonb_build_object('zalihaId', v_p.zaliha_id, 'promjena', v_p.promjena, 'stanje', v_p.stanje);
  end if;

  select z.stanje into v_staro from public.zaliha_artikli z where z.id = p_zaliha;
  if not found then
    raise exception 'Artikal zalihe nije pronađen.' using errcode = 'P0001';
  end if;

  v_p := public.promet_zalihe(p_zaposlenik, p_request_id, p_zaliha, 'popis', p_stanje - v_staro, p_razlog, null, null);
  return jsonb_build_object('zalihaId', v_p.zaliha_id, 'promjena', v_p.promjena, 'stanje', v_p.stanje);
end;
$$;
revoke all on function public.popisi_zalihu(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.popisi_zalihu(uuid, uuid, uuid, numeric, text) to service_role;

create function public.prodaj_zalihu(p_zaposlenik uuid, p_request_id uuid, p_zaliha uuid, p_kolicina numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_z public.zaliha_artikli;
  v_p public.prometi_zaliha;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['mesnica']::public.uloga[]);
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_kolicina is null or p_kolicina <= 0 or p_kolicina > 100000 or p_kolicina <> round(p_kolicina, 3) then
    raise exception 'Količina za prodaju mora biti od 0,001 do 100.000.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zaliha', 0));

  select p.* into v_p from public.prometi_zaliha p where p.request_id = p_request_id;
  if not found then
    select z.* into v_z from public.zaliha_artikli z where z.id = p_zaliha;
    if not found then
      raise exception 'Artikal zalihe nije pronađen.' using errcode = 'P0001';
    end if;
    if v_z.jedinica <> 'kg' then
      raise exception 'Direktna prodaja dozvoljena je samo za robu na kilogram.' using errcode = 'P0001';
    end if;
    if v_z.prodajna_cijena is null then
      raise exception 'Prodajna cijena artikla nije podešena. Javite se šefici.' using errcode = 'P0001';
    end if;
    v_p := public.promet_zalihe(p_zaposlenik, p_request_id, p_zaliha, 'prodaja', -p_kolicina, null, v_z.prodajna_cijena, null);
  end if;

  return jsonb_build_object(
    'zalihaId', v_p.zaliha_id,
    'kolicina', -v_p.promjena,
    'cijena', v_p.cijena,
    'iznos', v_p.iznos,
    'stanje', v_p.stanje
  );
end;
$$;
revoke all on function public.prodaj_zalihu(uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.prodaj_zalihu(uuid, uuid, uuid, numeric) to service_role;

create function public.prometi_zalihe(p_zaposlenik uuid, p_zaliha uuid, p_vrsta public.vrsta_prometa, p_strana integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pomak integer := public.pomak_strane(p_strana);
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['mesnica', 'sefica']::public.uloga[]);

  return (
    select jsonb_build_object(
      'prometi', coalesce(jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'artikal', a.naziv,
          'jedinica', a.jedinica,
          'vrsta', p.vrsta,
          'promjena', p.promjena,
          'stanje', p.stanje,
          'razlog', p.razlog,
          'cijena', p.cijena,
          'iznos', p.iznos,
          'zaposlenik', z.ime,
          'vrijeme', p.vrijeme
        )
        order by p.id desc
      ), '[]'::jsonb) - 50,
      'imaJos', count(*) > 50
    )
    from (
      select t.*
      from public.prometi_zaliha t
      where (p_zaliha is null or t.zaliha_id = p_zaliha) and (p_vrsta is null or t.vrsta = p_vrsta)
      order by t.id desc
      limit 51 offset v_pomak
    ) p
    join public.zaliha_artikli a on a.id = p.zaliha_id
    join public.zaposlenici z on z.id = p.zaposlenik_id
  );
end;
$$;
revoke all on function public.prometi_zalihe(uuid, uuid, public.vrsta_prometa, integer) from public, anon, authenticated;
grant execute on function public.prometi_zalihe(uuid, uuid, public.vrsta_prometa, integer) to service_role;

create function public.zahtjev_mesnici_odgovor(p public.zahtjevi_mesnici)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'zalihaId', p.zaliha_id,
    'artikal', a.naziv,
    'jedinica', a.jedinica,
    'trazeno', p.trazeno,
    'status', p.status,
    'isporuceno', p.isporuceno,
    'kreirao', k.ime,
    'kreirano', p.kreirano,
    'obradio', o.ime,
    'obradjeno', p.obradjeno
  )
  from public.zaliha_artikli a
  join public.zaposlenici k on k.id = p.kreirao_id
  left join public.zaposlenici o on o.id = p.obradio_id
  where a.id = p.zaliha_id;
$$;
revoke all on function public.zahtjev_mesnici_odgovor(public.zahtjevi_mesnici) from public, anon, authenticated, service_role;

create function public.zahtjevi_mesnici_pregled(p_zaposlenik uuid, p_strana integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pomak integer := public.pomak_strane(p_strana);
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['kuhinja', 'mesnica', 'sefica']::public.uloga[]);

  return (
    select jsonb_build_object(
      'zahtjevi', coalesce(jsonb_agg(public.zahtjev_mesnici_odgovor(r.z) order by (r.z).kreirano desc, (r.z).id), '[]'::jsonb) - 50,
      'imaJos', count(*) > 50
    )
    from (
      select z from public.zahtjevi_mesnici z
      order by z.kreirano desc, z.id
      limit 51 offset v_pomak
    ) r
  );
end;
$$;
revoke all on function public.zahtjevi_mesnici_pregled(uuid, integer) from public, anon, authenticated;
grant execute on function public.zahtjevi_mesnici_pregled(uuid, integer) to service_role;

-- trazeno is optional, as in the old app: the kitchen may ask for "more veal" and the butcher decides how much.
create function public.posalji_zahtjev_mesnici(p_zaposlenik uuid, p_request_id uuid, p_zaliha uuid, p_kolicina numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_z public.zahtjevi_mesnici;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['kuhinja', 'sefica']::public.uloga[]);
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_kolicina <= 0 or p_kolicina > 100000 or p_kolicina <> round(p_kolicina, 3) then
    raise exception 'Količina mora biti od 0,001 do 100.000.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zaliha', 0));

  select z.* into v_z from public.zahtjevi_mesnici z where z.request_id = p_request_id;
  if found then
    return public.zahtjev_mesnici_odgovor(v_z);
  end if;
  if not exists (select 1 from public.zaliha_artikli a where a.id = p_zaliha) then
    raise exception 'Artikal zalihe nije pronađen.' using errcode = 'P0001';
  end if;

  insert into public.zahtjevi_mesnici (request_id, zaliha_id, trazeno, kreirao_id)
  values (p_request_id, p_zaliha, p_kolicina, p_zaposlenik)
  returning * into v_z;

  return public.zahtjev_mesnici_odgovor(v_z);
end;
$$;
revoke all on function public.posalji_zahtjev_mesnici(uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.posalji_zahtjev_mesnici(uuid, uuid, uuid, numeric) to service_role;

-- A delivery leaves the butcher's stock for the kitchen, so stock goes down.
create function public.obradi_zahtjev_mesnici(p_zaposlenik uuid, p_zahtjev uuid, p_radnja text, p_kolicina numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_z public.zahtjevi_mesnici;
  v_status text := case p_radnja when 'isporuci' then 'isporucen' when 'nema_na_stanju' then 'nema_na_stanju' end;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['mesnica']::public.uloga[]);
  if v_status is null then
    raise exception 'Nepoznata radnja.' using errcode = 'P0001';
  end if;
  if p_radnja = 'isporuci' and (p_kolicina is null or p_kolicina <= 0 or p_kolicina > 100000 or p_kolicina <> round(p_kolicina, 3)) then
    raise exception 'Količina isporuke mora biti od 0,001 do 100.000.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zaliha', 0));

  select z.* into v_z from public.zahtjevi_mesnici z where z.id = p_zahtjev;
  if not found then
    raise exception 'Zahtjev nije pronađen.' using errcode = 'P0001';
  end if;

  -- Already there means a double tap: the first one won, so this one only reports the state.
  if v_z.status = v_status then
    return public.zahtjev_mesnici_odgovor(v_z);
  end if;
  if v_z.status <> 'nov' then
    raise exception 'Zahtjev je već obrađen.' using errcode = 'P0001';
  end if;

  if p_radnja = 'isporuci' then
    perform public.promet_zalihe(p_zaposlenik, null, v_z.zaliha_id, 'isporuka', -p_kolicina, null, null, p_zahtjev);
  else
    perform public.zapisi_radnju(p_zaposlenik, 'zahtjev_nema_na_stanju', jsonb_build_object('zahtjev', p_zahtjev));
  end if;

  update public.zahtjevi_mesnici z
  set status = v_status,
      isporuceno = case when p_radnja = 'isporuci' then p_kolicina end,
      obradio_id = p_zaposlenik,
      obradjeno = now()
  where z.id = p_zahtjev
  returning z.* into v_z;

  return public.zahtjev_mesnici_odgovor(v_z);
end;
$$;
revoke all on function public.obradi_zahtjev_mesnici(uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.obradi_zahtjev_mesnici(uuid, uuid, text, numeric) to service_role;

create function public.recepti_pregled(p_sefica uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object('proizvodId', p.id, 'naziv', p.naziv, 'sastojci', l.sastojci)
      order by p.naziv
    ), '[]'::jsonb)
    from (
      select r.proizvod_id, jsonb_agg(
        jsonb_build_object('zalihaId', a.id, 'naziv', a.naziv, 'jedinica', a.jedinica, 'kolicina', r.kolicina)
        order by a.naziv
      ) as sastojci
      from public.recepti r
      join public.zaliha_artikli a on a.id = r.zaliha_id
      group by r.proizvod_id
    ) l
    join public.proizvodi p on p.id = l.proizvod_id
  );
end;
$$;
revoke all on function public.recepti_pregled(uuid) from public, anon, authenticated;
grant execute on function public.recepti_pregled(uuid) to service_role;

-- Replaces the dish's whole recipe. An empty list removes it.
create function public.sacuvaj_recept(p_sefica uuid, p_proizvod uuid, p_sastojci jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if jsonb_typeof(p_sastojci) is distinct from 'array' then
    raise exception 'Sastojci recepta nisu ispravni.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_sastojci) > 50 then
    raise exception 'Recept ima previše sastojaka.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_sastojci) as x("zalihaId" uuid, kolicina numeric)
    where x.kolicina is null or x.kolicina <= 0 or x.kolicina > 1000 or x.kolicina <> round(x.kolicina, 3)
  ) then
    raise exception 'Količina sastojka mora biti od 0,001 do 1.000.' using errcode = 'P0001';
  end if;
  if (
    select count(*) <> count(distinct x."zalihaId")
      or count(*) <> count(a.id)
    from jsonb_to_recordset(p_sastojci) as x("zalihaId" uuid, kolicina numeric)
    left join public.zaliha_artikli a on a.id = x."zalihaId"
  ) then
    raise exception 'Sastojak je nepoznat ili naveden dva puta.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zaliha', 0));

  if not exists (select 1 from public.proizvodi p where p.id = p_proizvod) then
    raise exception 'Proizvod nije pronađen.' using errcode = 'P0001';
  end if;

  delete from public.recepti r where r.proizvod_id = p_proizvod;
  insert into public.recepti (proizvod_id, zaliha_id, kolicina)
  select p_proizvod, x."zalihaId", x.kolicina
  from jsonb_to_recordset(p_sastojci) as x("zalihaId" uuid, kolicina numeric);

  perform public.zapisi_radnju(p_sefica, 'recept', jsonb_build_object('proizvod', p_proizvod, 'sastojci', p_sastojci));
  return jsonb_build_object('proizvodId', p_proizvod, 'sastojaka', jsonb_array_length(p_sastojci));
end;
$$;
revoke all on function public.sacuvaj_recept(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sacuvaj_recept(uuid, uuid, jsonb) to service_role;
