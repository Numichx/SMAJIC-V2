-- Shifts: one at a time, as in the old app. The bar opens and closes it, and the grill counts inside it.
-- Locks, always in this order: 'racuni', then 'smjene'.

create function public.zahtijevaj_ulogu(p_id uuid, p_uloge public.uloga[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.zaposlenici z
    where z.id = p_id and z.aktivan and z.uloga = any (p_uloge)
  ) then
    raise exception 'Nemate pravo na ovu radnju.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.zahtijevaj_ulogu(uuid, public.uloga[]) from public, anon, authenticated, service_role;

-- A page is 50 rows. Lists fetch one more, to learn whether another page follows.
create function public.pomak_strane(p_strana integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_strana is null or p_strana < 1 or p_strana > 100000 then
    raise exception 'Stranica nije ispravna.' using errcode = 'P0001';
  end if;
  return (p_strana - 1) * 50;
end;
$$;
revoke all on function public.pomak_strane(integer) from public, anon, authenticated, service_role;

create table public.smjene (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  oznaka text not null check (oznaka in ('I', 'II')),
  otvorio_id uuid not null references public.zaposlenici (id),
  pocetak timestamptz not null default now(),
  -- Where this shift's takings start: where the previous one stopped, so an order issued
  -- between two shifts lands in the next one instead of in none.
  statusi_od bigint not null,
  naplate_od timestamptz not null,
  zatvaranje_request_id uuid unique,
  zatvorio_id uuid references public.zaposlenici (id),
  kraj timestamptz,
  statusi_do bigint,
  predani_pazar numeric(10, 2) check (predani_pazar >= 0),
  pazar_sanka numeric(12, 2) check (pazar_sanka >= 0),
  pazar_stanica numeric(12, 2) check (pazar_stanica >= 0),
  ocekivani_pazar numeric(12, 2) generated always as (pazar_sanka + pazar_stanica) stored,
  razlika numeric(12, 2) generated always as (predani_pazar - pazar_sanka - pazar_stanica) stored,
  -- What the bills in this window took, shown beside the difference. It explains a gap, it is not part of it.
  naplate jsonb,
  check (num_nonnulls(zatvaranje_request_id, zatvorio_id, kraj, statusi_do, predani_pazar, pazar_sanka, pazar_stanica, naplate) in (0, 8))
);
alter table public.smjene enable row level security;
revoke all on table public.smjene from public, anon, authenticated, service_role;
create unique index smjene_jedna_otvorena on public.smjene ((true)) where kraj is null;
create index smjene_kraj_idx on public.smjene (kraj desc) where kraj is not null;

create table public.popisi_sanka (
  smjena_id uuid not null references public.smjene (id),
  proizvod_id uuid not null references public.proizvodi (id),
  pocetno numeric(10, 3) not null check (pocetno >= 0),
  dopune numeric(10, 3) not null default 0 check (dopune >= 0),
  zavrsno numeric(10, 3) check (zavrsno >= 0),
  -- The price at closing, so a later menu change leaves this shift's figures alone.
  cijena numeric(10, 2) check (cijena >= 0),
  prodato numeric(10, 3) generated always as (pocetno + dopune - zavrsno) stored check (prodato >= 0),
  primary key (smjena_id, proizvod_id),
  check ((zavrsno is null) = (cijena is null))
);
alter table public.popisi_sanka enable row level security;
revoke all on table public.popisi_sanka from public, anon, authenticated, service_role;

create table public.dopune_sanka (
  request_id uuid primary key,
  smjena_id uuid not null,
  proizvod_id uuid not null,
  kolicina numeric(10, 3) not null check (kolicina > 0),
  zaposlenik_id uuid not null references public.zaposlenici (id),
  vrijeme timestamptz not null default now(),
  foreign key (smjena_id, proizvod_id) references public.popisi_sanka (smjena_id, proizvod_id)
);
alter table public.dopune_sanka enable row level security;
revoke all on table public.dopune_sanka from public, anon, authenticated, service_role;

create table public.popisi_pecenjare (
  smjena_id uuid primary key references public.smjene (id),
  request_id uuid not null unique,
  otvorio_id uuid not null references public.zaposlenici (id),
  otvoreno timestamptz not null default now(),
  pocetne_koke_pecene integer not null check (pocetne_koke_pecene >= 0),
  pocetne_koke_sirove integer not null check (pocetne_koke_sirove >= 0),
  pocetna_janjetina_kg numeric(10, 3) not null check (pocetna_janjetina_kg >= 0),
  zatvaranje_request_id uuid unique,
  zatvorio_id uuid references public.zaposlenici (id),
  zatvoreno timestamptz,
  dodatne_koke integer check (dodatne_koke >= 0),
  dodatna_janjetina_kg numeric(10, 3) check (dodatna_janjetina_kg >= 0),
  preostale_koke integer check (preostale_koke >= 0),
  preostala_janjetina_kg numeric(10, 3) check (preostala_janjetina_kg >= 0),
  cijena_koke numeric(10, 2) check (cijena_koke >= 0),
  cijena_janjetine numeric(10, 2) check (cijena_janjetine >= 0),
  predani_pazar numeric(10, 2) check (predani_pazar >= 0),
  prodane_koke integer generated always as (pocetne_koke_pecene + pocetne_koke_sirove + dodatne_koke - preostale_koke) stored
    check (prodane_koke >= 0),
  prodana_janjetina_kg numeric(10, 3) generated always as (pocetna_janjetina_kg + dodatna_janjetina_kg - preostala_janjetina_kg) stored
    check (prodana_janjetina_kg >= 0),
  pazar_po_popisu numeric(12, 2) generated always as (
    round(
      (pocetne_koke_pecene + pocetne_koke_sirove + dodatne_koke - preostale_koke) * cijena_koke
      + (pocetna_janjetina_kg + dodatna_janjetina_kg - preostala_janjetina_kg) * cijena_janjetine,
      2
    )
  ) stored,
  razlika numeric(12, 2) generated always as (
    predani_pazar - round(
      (pocetne_koke_pecene + pocetne_koke_sirove + dodatne_koke - preostale_koke) * cijena_koke
      + (pocetna_janjetina_kg + dodatna_janjetina_kg - preostala_janjetina_kg) * cijena_janjetine,
      2
    )
  ) stored,
  check (num_nonnulls(
    zatvaranje_request_id, zatvorio_id, zatvoreno, dodatne_koke, dodatna_janjetina_kg,
    preostale_koke, preostala_janjetina_kg, cijena_koke, cijena_janjetine, predani_pazar
  ) in (0, 10))
);
alter table public.popisi_pecenjare enable row level security;
revoke all on table public.popisi_pecenjare from public, anon, authenticated, service_role;
create index popisi_pecenjare_otvoreno_idx on public.popisi_pecenjare (otvoreno desc);

-- What a waiter pays the grill. What they owe comes from narudzbe.cijena_pecenjari.
create table public.uplate_pecenjari (
  request_id uuid primary key,
  konobar_id uuid not null references public.zaposlenici (id),
  iznos numeric(10, 2) not null check (iznos > 0),
  zaposlenik_id uuid not null references public.zaposlenici (id),
  vrijeme timestamptz not null default now()
);
alter table public.uplate_pecenjari enable row level security;
revoke all on table public.uplate_pecenjari from public, anon, authenticated, service_role;
create index uplate_pecenjari_konobar_idx on public.uplate_pecenjari (konobar_id);
create index narudzbe_dug_pecenjari_idx on public.narudzbe (konobar_id) include (cijena_pecenjari)
  where stanica = 'pecenjara' and status = 'Izdato' and cijena_pecenjari is not null;

create function public.smjena_odgovor(p public.smjene)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'oznaka', p.oznaka,
    'pocetak', p.pocetak,
    'otvorio', (select z.ime from public.zaposlenici z where z.id = p.otvorio_id),
    'kraj', p.kraj,
    'zatvorio', (select z.ime from public.zaposlenici z where z.id = p.zatvorio_id),
    'pazarSanka', p.pazar_sanka,
    'pazarStanica', p.pazar_stanica,
    'ocekivaniPazar', p.ocekivani_pazar,
    'predaniPazar', p.predani_pazar,
    'razlika', p.razlika,
    'naplate', p.naplate
  );
$$;
revoke all on function public.smjena_odgovor(public.smjene) from public, anon, authenticated, service_role;

-- p_proizvodi is what the count must hold: each exactly once, nothing else. A drink left out
-- of a closing count would read as all sold, so a missing one is refused rather than taken as 0.
create function public.provjeri_popis_sanka(p_popis jsonb, p_proizvodi uuid[])
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_naziv text;
begin
  if jsonb_typeof(p_popis) is distinct from 'array' then
    raise exception 'Popis šanka nije ispravan.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_popis) > 500 then
    raise exception 'Popis šanka nije ispravan.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_popis) as x("proizvodId" uuid, kolicina numeric)
    where x.kolicina is null or x.kolicina < 0 or x.kolicina > 100000 or x.kolicina <> round(x.kolicina, 3)
  ) then
    raise exception 'Količina u popisu mora biti od 0 do 100.000, s najviše tri decimale.' using errcode = 'P0001';
  end if;

  if (
    select count(*) <> count(distinct x."proizvodId")
      or count(*) filter (where x."proizvodId" is null or x."proizvodId" <> all (p_proizvodi)) > 0
    from jsonb_to_recordset(p_popis) as x("proizvodId" uuid, kolicina numeric)
  ) then
    raise exception 'Popis sadrži nešto što nije piće ove smjene, ili isto piće dva puta.' using errcode = 'P0001';
  end if;

  select p.naziv into v_naziv
  from public.proizvodi p
  where p.id = any (p_proizvodi)
    and not exists (
      select 1 from jsonb_to_recordset(p_popis) as x("proizvodId" uuid, kolicina numeric)
      where x."proizvodId" = p.id
    )
  order by p.naziv
  limit 1;
  if found then
    raise exception 'Nedostaje količina za „%“.', v_naziv using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.provjeri_popis_sanka(jsonb, uuid[]) from public, anon, authenticated, service_role;

create function public.otvori_smjenu(p_zaposlenik uuid, p_request_id uuid, p_oznaka text, p_popis jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.smjene;
  v_prethodna public.smjene;
begin
  perform public.zahtijevaj_stanicu(p_zaposlenik, 'sank');
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_oznaka is null or p_oznaka not in ('I', 'II') then
    raise exception 'Izaberite prvu ili drugu smjenu.' using errcode = 'P0001';
  end if;

  -- 'racuni' so the highest status id cannot be overtaken by one still being written.
  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));
  perform pg_advisory_xact_lock(hashtextextended('smjene', 0));

  select s.* into v_s from public.smjene s where s.request_id = p_request_id;
  if found then
    return public.smjena_odgovor(v_s);
  end if;
  if exists (select 1 from public.smjene s where s.kraj is null) then
    raise exception 'Već postoji otvorena smjena.' using errcode = 'P0001';
  end if;

  perform public.provjeri_popis_sanka(
    p_popis,
    array(select p.id from public.proizvodi p where p.stanica = 'sank' and p.aktivan)
  );

  select s.* into v_prethodna from public.smjene s where s.kraj is not null order by s.kraj desc limit 1;

  insert into public.smjene (request_id, oznaka, otvorio_id, statusi_od, naplate_od)
  values (
    p_request_id, p_oznaka, p_zaposlenik,
    coalesce(v_prethodna.statusi_do, (select max(k.id) from public.statusi_narudzbe k), 0),
    coalesce(v_prethodna.kraj, now())
  )
  returning * into v_s;

  insert into public.popisi_sanka (smjena_id, proizvod_id, pocetno)
  select v_s.id, x."proizvodId", x.kolicina
  from jsonb_to_recordset(p_popis) as x("proizvodId" uuid, kolicina numeric);

  perform public.zapisi_radnju(p_zaposlenik, 'smjena_otvorena', jsonb_build_object('smjena', v_s.id, 'oznaka', p_oznaka));
  return public.smjena_odgovor(v_s);
end;
$$;
revoke all on function public.otvori_smjenu(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.otvori_smjenu(uuid, uuid, text, jsonb) to service_role;

-- Takings difference, as in the old app: what was handed over, minus the bar's sales by count plus the
-- kitchen's and grill's issued lines. Issued orders go by status id, not time: ids are written under the
-- 'racuni' lock in commit order, so each order lands in exactly one shift. Voided lines are worth 0.
create function public.zatvori_smjenu(p_zaposlenik uuid, p_smjena uuid, p_request_id uuid, p_popis jsonb, p_predani numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.smjene;
  v_naziv text;
  v_do bigint;
  v_sank numeric;
  v_stanica numeric;
  v_naplate jsonb;
begin
  perform public.zahtijevaj_stanicu(p_zaposlenik, 'sank');
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_predani is null or p_predani < 0 or p_predani > 999999.99 or p_predani <> round(p_predani, 2) then
    raise exception 'Predani pazar mora biti od 0 do 999.999,99 KM, zaokružen na fening.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));
  perform pg_advisory_xact_lock(hashtextextended('smjene', 0));

  -- Under the lock, so a double tap finds the first closing and gets the same answer.
  select s.* into v_s from public.smjene s where s.zatvaranje_request_id = p_request_id;
  if found then
    if v_s.id <> p_smjena then
      raise exception 'Oznaka zahtjeva je već iskorištena na drugoj smjeni.' using errcode = 'P0001';
    end if;
    return public.smjena_odgovor(v_s);
  end if;

  select s.* into v_s from public.smjene s where s.id = p_smjena;
  if not found then
    raise exception 'Smjena nije pronađena.' using errcode = 'P0001';
  end if;
  if v_s.kraj is not null then
    raise exception 'Smjena je već zatvorena.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.popisi_pecenjare pp where pp.smjena_id = p_smjena and pp.zatvoreno is not null) then
    raise exception 'Smjena se ne može zatvoriti dok pečenjara ne zaključi svoj popis.' using errcode = 'P0001';
  end if;

  perform public.provjeri_popis_sanka(
    p_popis,
    array(select ps.proizvod_id from public.popisi_sanka ps where ps.smjena_id = p_smjena)
  );

  select p.naziv into v_naziv
  from jsonb_to_recordset(p_popis) as x("proizvodId" uuid, kolicina numeric)
  join public.popisi_sanka ps on ps.smjena_id = p_smjena and ps.proizvod_id = x."proizvodId"
  join public.proizvodi p on p.id = ps.proizvod_id
  where x.kolicina > ps.pocetno + ps.dopune
  order by p.naziv
  limit 1;
  if found then
    raise exception 'Završno stanje za „%“ je veće od početnog stanja i dopuna.', v_naziv using errcode = 'P0001';
  end if;

  update public.popisi_sanka ps
  set zavrsno = x.kolicina, cijena = p.cijena
  from jsonb_to_recordset(p_popis) as x("proizvodId" uuid, kolicina numeric), public.proizvodi p
  where ps.smjena_id = p_smjena and ps.proizvod_id = x."proizvodId" and p.id = ps.proizvod_id;

  select coalesce(round(sum(ps.prodato * ps.cijena), 2), 0) into v_sank
  from public.popisi_sanka ps
  where ps.smjena_id = p_smjena;

  select coalesce(max(k.id), v_s.statusi_od) into v_do from public.statusi_narudzbe k;

  select coalesce(sum(s.iznos), 0) into v_stanica
  from public.statusi_narudzbe k
  join public.narudzbe n on n.id = k.narudzba_id
  join public.stavke_narudzbe s on s.narudzba_id = n.id
  where k.id > v_s.statusi_od and k.id <= v_do and k.status = 'Izdato' and n.stanica <> 'sank';

  select jsonb_build_object(
    'naplaceno', coalesce(sum(n.ukupno) filter (where n.nacin <> 'dug'), 0),
    'gotovina', coalesce(sum(n.gotovina - n.kusur), 0),
    'kartica', coalesce(sum(n.kartica), 0),
    'baksis', coalesce(sum(n.baksis), 0),
    'popust', coalesce(sum(n.popust), 0),
    'dug', coalesce(sum(n.ukupno) filter (where n.nacin = 'dug'), 0)
  )
  into v_naplate
  from public.naplate n
  where n.vrijeme >= v_s.naplate_od and n.vrijeme < now();

  update public.smjene s
  set zatvaranje_request_id = p_request_id,
      zatvorio_id = p_zaposlenik,
      kraj = now(),
      statusi_do = v_do,
      predani_pazar = p_predani,
      pazar_sanka = v_sank,
      pazar_stanica = v_stanica,
      naplate = v_naplate
  where s.id = p_smjena
  returning s.* into v_s;

  perform public.zapisi_radnju(
    p_zaposlenik,
    'smjena_zatvorena',
    jsonb_build_object(
      'smjena', p_smjena,
      'pazarSanka', v_s.pazar_sanka,
      'pazarStanica', v_s.pazar_stanica,
      'ocekivaniPazar', v_s.ocekivani_pazar,
      'predaniPazar', v_s.predani_pazar,
      'razlika', v_s.razlika
    )
  );
  return public.smjena_odgovor(v_s);
end;
$$;
revoke all on function public.zatvori_smjenu(uuid, uuid, uuid, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.zatvori_smjenu(uuid, uuid, uuid, jsonb, numeric) to service_role;

-- History holds the money, so it is the manager's. Whoever closes a shift sees its result in the answer.
create function public.smjene_pregled(p_zaposlenik uuid, p_strana integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pomak integer := public.pomak_strane(p_strana);
begin
  perform public.zahtijevaj_stanicu(p_zaposlenik, 'sank');

  return jsonb_build_object(
    'otvorena', (
      select public.smjena_odgovor(s) || jsonb_build_object(
        'popisPecenjare', case when pp.smjena_id is null then 'nema' when pp.zatvoreno is null then 'otvoren' else 'zatvoren' end
      )
      from public.smjene s
      left join public.popisi_pecenjare pp on pp.smjena_id = s.id
      where s.kraj is null
    )
  ) || (
    select jsonb_build_object(
      'smjene', coalesce(jsonb_agg(public.smjena_odgovor(r.s) order by (r.s).kraj desc), '[]'::jsonb) - 50,
      'imaJos', count(*) > 50
    )
    from (
      select s
      from public.smjene s
      where s.kraj is not null
        and exists (select 1 from public.zaposlenici z where z.id = p_zaposlenik and z.uloga = 'sefica')
      order by s.kraj desc
      limit 51 offset v_pomak
    ) r
  );
end;
$$;
revoke all on function public.smjene_pregled(uuid, integer) from public, anon, authenticated;
grant execute on function public.smjene_pregled(uuid, integer) to service_role;

create function public.sank_artikli(p_zaposlenik uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.smjene;
begin
  perform public.zahtijevaj_stanicu(p_zaposlenik, 'sank');
  select s.* into v_s from public.smjene s where s.kraj is null;

  return jsonb_build_object(
    'smjena', case when v_s.id is not null then jsonb_build_object('id', v_s.id, 'oznaka', v_s.oznaka, 'pocetak', v_s.pocetak) end,
    'artikli', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'naziv', p.naziv,
          'jedinica', p.jedinica,
          'pocetno', ps.pocetno,
          'dopune', coalesce(ps.dopune, 0)
        )
        order by k.redoslijed, p.redoslijed
      ), '[]'::jsonb)
      from public.proizvodi p
      join public.kategorije k on k.id = p.kategorija_id
      left join public.popisi_sanka ps on ps.smjena_id = v_s.id and ps.proizvod_id = p.id
      where p.stanica = 'sank' and (p.aktivan or ps.smjena_id is not null)
    )
  );
end;
$$;
revoke all on function public.sank_artikli(uuid) from public, anon, authenticated;
grant execute on function public.sank_artikli(uuid) to service_role;

create function public.dopuni_sank(p_zaposlenik uuid, p_request_id uuid, p_proizvod uuid, p_kolicina numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.smjene;
  v_d public.dopune_sanka;
  v_dopune numeric;
begin
  perform public.zahtijevaj_stanicu(p_zaposlenik, 'sank');
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_kolicina is null or p_kolicina <= 0 or p_kolicina > 100000 or p_kolicina <> round(p_kolicina, 3) then
    raise exception 'Količina dopune mora biti od 0,001 do 100.000.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('smjene', 0));

  select d.* into v_d from public.dopune_sanka d where d.request_id = p_request_id;
  if found then
    select ps.dopune into v_dopune
    from public.popisi_sanka ps
    where ps.smjena_id = v_d.smjena_id and ps.proizvod_id = v_d.proizvod_id;
    return jsonb_build_object('proizvodId', v_d.proizvod_id, 'dopune', v_dopune);
  end if;

  select s.* into v_s from public.smjene s where s.kraj is null;
  if not found then
    raise exception 'Prvo otvorite smjenu.' using errcode = 'P0001';
  end if;

  update public.popisi_sanka ps
  set dopune = ps.dopune + p_kolicina
  where ps.smjena_id = v_s.id and ps.proizvod_id = p_proizvod
  returning ps.dopune into v_dopune;
  if not found then
    raise exception 'Tog pića nema u popisu ove smjene.' using errcode = 'P0001';
  end if;

  insert into public.dopune_sanka (request_id, smjena_id, proizvod_id, kolicina, zaposlenik_id)
  values (p_request_id, v_s.id, p_proizvod, p_kolicina, p_zaposlenik);

  perform public.zapisi_radnju(
    p_zaposlenik,
    'dopuna_sanka',
    jsonb_build_object('smjena', v_s.id, 'proizvod', p_proizvod, 'kolicina', p_kolicina)
  );
  return jsonb_build_object('proizvodId', p_proizvod, 'dopune', v_dopune);
end;
$$;
revoke all on function public.dopuni_sank(uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.dopuni_sank(uuid, uuid, uuid, numeric) to service_role;

-- shortcut: finds the two prices by menu name, as je_jagnjetina does. Move to product flags with the menu admin screen.
create function public.cijene_pecenjare(out koka numeric, out janjetina numeric)
language sql
stable
set search_path = ''
as $$
  select
    (select p.cijena from public.proizvodi p where p.kategorija_id = 'pecenja' and p.naziv = 'Pečeno pile'),
    (select p.cijena from public.proizvodi p where p.kategorija_id = 'pecenja' and p.naziv = 'Jagnjetina s ražnja');
$$;
revoke all on function public.cijene_pecenjare() from public, anon, authenticated, service_role;

create function public.popis_pecenjare_odgovor(p public.popisi_pecenjare)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'smjenaId', p.smjena_id,
    'otvoreno', p.otvoreno,
    'pocetneKokePecene', p.pocetne_koke_pecene,
    'pocetneKokeSirove', p.pocetne_koke_sirove,
    'pocetnaJanjetinaKg', p.pocetna_janjetina_kg,
    'zatvoreno', p.zatvoreno,
    'dodatneKoke', p.dodatne_koke,
    'dodatnaJanjetinaKg', p.dodatna_janjetina_kg,
    'preostaleKoke', p.preostale_koke,
    'preostalaJanjetinaKg', p.preostala_janjetina_kg,
    'prodaneKoke', p.prodane_koke,
    'prodanaJanjetinaKg', p.prodana_janjetina_kg,
    'cijenaKoke', p.cijena_koke,
    'cijenaJanjetine', p.cijena_janjetine,
    'pazarPoPopisu', p.pazar_po_popisu,
    'predaniPazar', p.predani_pazar,
    'razlika', p.razlika
  );
$$;
revoke all on function public.popis_pecenjare_odgovor(public.popisi_pecenjare) from public, anon, authenticated, service_role;

create function public.pecenjara_pregled(p_zaposlenik uuid, p_strana integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pomak integer := public.pomak_strane(p_strana);
  v_s public.smjene;
  v_cijene record;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['pecenjara', 'sefica']::public.uloga[]);
  select s.* into v_s from public.smjene s where s.kraj is null;
  select * into v_cijene from public.cijene_pecenjare();

  return (
    select jsonb_build_object(
      'smjena', case when v_s.id is not null then jsonb_build_object('id', v_s.id, 'oznaka', v_s.oznaka, 'pocetak', v_s.pocetak) end,
      'popis', (select public.popis_pecenjare_odgovor(o) from public.popisi_pecenjare o where o.smjena_id = v_s.id),
      'cijene', jsonb_build_object('koka', v_cijene.koka, 'janjetina', v_cijene.janjetina),
      'historija', coalesce(jsonb_agg(public.popis_pecenjare_odgovor(r.pp) order by (r.pp).otvoreno desc), '[]'::jsonb) - 50,
      'imaJos', count(*) > 50
    )
    from (
      select pp
      from public.popisi_pecenjare pp
      where pp.zatvoreno is not null
      order by pp.otvoreno desc
      limit 51 offset v_pomak
    ) r
  );
end;
$$;
revoke all on function public.pecenjara_pregled(uuid, integer) from public, anon, authenticated;
grant execute on function public.pecenjara_pregled(uuid, integer) to service_role;

-- The manager may count too: with the grill off sick, a shift could otherwise never close.
create function public.otvori_popis_pecenjare(
  p_zaposlenik uuid,
  p_request_id uuid,
  p_koke_pecene integer,
  p_koke_sirove integer,
  p_janjetina_kg numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.smjene;
  v_p public.popisi_pecenjare;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['pecenjara', 'sefica']::public.uloga[]);
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_koke_pecene is null or p_koke_pecene not between 0 and 100000
    or p_koke_sirove is null or p_koke_sirove not between 0 and 100000
    or p_janjetina_kg is null or p_janjetina_kg not between 0 and 100000 or p_janjetina_kg <> round(p_janjetina_kg, 3)
  then
    raise exception 'Početni popis nije ispravan.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('smjene', 0));

  select pp.* into v_p from public.popisi_pecenjare pp where pp.request_id = p_request_id;
  if found then
    return public.popis_pecenjare_odgovor(v_p);
  end if;

  select s.* into v_s from public.smjene s where s.kraj is null;
  if not found then
    raise exception 'Nema otvorene smjene. Smjenu otvara konobar ili šefica na šanku.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.popisi_pecenjare pp where pp.smjena_id = v_s.id) then
    raise exception 'Popis pečenjare za ovu smjenu je već otvoren.' using errcode = 'P0001';
  end if;

  insert into public.popisi_pecenjare (
    smjena_id, request_id, otvorio_id, pocetne_koke_pecene, pocetne_koke_sirove, pocetna_janjetina_kg
  )
  values (v_s.id, p_request_id, p_zaposlenik, p_koke_pecene, p_koke_sirove, p_janjetina_kg)
  returning * into v_p;

  perform public.zapisi_radnju(
    p_zaposlenik,
    'popis_pecenjare_otvoren',
    jsonb_build_object(
      'smjena', v_s.id,
      'kokePecene', p_koke_pecene,
      'kokeSirove', p_koke_sirove,
      'janjetinaKg', p_janjetina_kg
    )
  );
  return public.popis_pecenjare_odgovor(v_p);
end;
$$;
revoke all on function public.otvori_popis_pecenjare(uuid, uuid, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.otvori_popis_pecenjare(uuid, uuid, integer, integer, numeric) to service_role;

create function public.zatvori_popis_pecenjare(
  p_zaposlenik uuid,
  p_request_id uuid,
  p_dodatne_koke integer,
  p_dodatna_kg numeric,
  p_preostale_koke integer,
  p_preostala_kg numeric,
  p_predani numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.popisi_pecenjare;
  v_cijene record;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['pecenjara', 'sefica']::public.uloga[]);
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_dodatne_koke is null or p_dodatne_koke not between 0 and 100000
    or p_preostale_koke is null or p_preostale_koke not between 0 and 100000
    or p_dodatna_kg is null or p_dodatna_kg not between 0 and 100000 or p_dodatna_kg <> round(p_dodatna_kg, 3)
    or p_preostala_kg is null or p_preostala_kg not between 0 and 100000 or p_preostala_kg <> round(p_preostala_kg, 3)
  then
    raise exception 'Završni popis nije ispravan.' using errcode = 'P0001';
  end if;
  if p_predani is null or p_predani < 0 or p_predani > 999999.99 or p_predani <> round(p_predani, 2) then
    raise exception 'Predani pazar mora biti od 0 do 999.999,99 KM, zaokružen na fening.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('smjene', 0));

  select pp.* into v_p from public.popisi_pecenjare pp where pp.zatvaranje_request_id = p_request_id;
  if found then
    return public.popis_pecenjare_odgovor(v_p);
  end if;

  select pp.* into v_p
  from public.smjene s
  join public.popisi_pecenjare pp on pp.smjena_id = s.id
  where s.kraj is null;
  if not found then
    raise exception 'Nema otvorenog popisa pečenjare.' using errcode = 'P0001';
  end if;
  if v_p.zatvoreno is not null then
    raise exception 'Popis pečenjare je već zaključen.' using errcode = 'P0001';
  end if;
  if p_preostale_koke > v_p.pocetne_koke_pecene + v_p.pocetne_koke_sirove + p_dodatne_koke
    or p_preostala_kg > v_p.pocetna_janjetina_kg + p_dodatna_kg
  then
    raise exception 'Završno stanje ne može biti veće od raspoložive količine.' using errcode = 'P0001';
  end if;

  select * into v_cijene from public.cijene_pecenjare();
  if v_cijene.koka is null or v_cijene.janjetina is null then
    raise exception 'U meniju nedostaje cijena pečenog pileta ili jagnjetine.' using errcode = 'P0001';
  end if;

  update public.popisi_pecenjare pp
  set zatvaranje_request_id = p_request_id,
      zatvorio_id = p_zaposlenik,
      zatvoreno = now(),
      dodatne_koke = p_dodatne_koke,
      dodatna_janjetina_kg = p_dodatna_kg,
      preostale_koke = p_preostale_koke,
      preostala_janjetina_kg = p_preostala_kg,
      cijena_koke = v_cijene.koka,
      cijena_janjetine = v_cijene.janjetina,
      predani_pazar = p_predani
  where pp.smjena_id = v_p.smjena_id
  returning pp.* into v_p;

  perform public.zapisi_radnju(
    p_zaposlenik,
    'popis_pecenjare_zatvoren',
    jsonb_build_object(
      'smjena', v_p.smjena_id,
      'prodaneKoke', v_p.prodane_koke,
      'prodanaJanjetinaKg', v_p.prodana_janjetina_kg,
      'pazarPoPopisu', v_p.pazar_po_popisu,
      'predaniPazar', v_p.predani_pazar,
      'razlika', v_p.razlika
    )
  );
  return public.popis_pecenjare_odgovor(v_p);
end;
$$;
revoke all on function public.zatvori_popis_pecenjare(uuid, uuid, integer, numeric, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function public.zatvori_popis_pecenjare(uuid, uuid, integer, numeric, integer, numeric, numeric) to service_role;

-- A debt grows when the grill issues a priced order, whoever holds the bill by then. As in the old app,
-- a void does not lower it: the grill already made the food, and its price is per order, not per line.
create function public.dug_konobara_pecenjari(p_konobar uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select
    coalesce((
      select sum(n.cijena_pecenjari) from public.narudzbe n
      where n.konobar_id = p_konobar and n.stanica = 'pecenjara' and n.status = 'Izdato' and n.cijena_pecenjari is not null
    ), 0)
    - coalesce((select sum(u.iznos) from public.uplate_pecenjari u where u.konobar_id = p_konobar), 0);
$$;
revoke all on function public.dug_konobara_pecenjari(uuid) from public, anon, authenticated, service_role;

create function public.dugovi_pecenjari(p_zaposlenik uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['pecenjara', 'sefica']::public.uloga[]);

  return (
    with izdato as (
      select n.konobar_id, sum(n.cijena_pecenjari) as iznos
      from public.narudzbe n
      where n.stanica = 'pecenjara' and n.status = 'Izdato' and n.cijena_pecenjari is not null
      group by n.konobar_id
    ),
    placeno as (
      select u.konobar_id, sum(u.iznos) as iznos
      from public.uplate_pecenjari u
      group by u.konobar_id
    )
    select jsonb_build_object(
      'dugovi', coalesce(jsonb_agg(
        jsonb_build_object(
          'konobarId', i.konobar_id,
          'ime', z.ime,
          'izdato', i.iznos,
          'placeno', coalesce(p.iznos, 0),
          'dug', i.iznos - coalesce(p.iznos, 0)
        )
        order by i.iznos - coalesce(p.iznos, 0) desc, z.ime
      ), '[]'::jsonb),
      'ukupno', coalesce(sum(i.iznos - coalesce(p.iznos, 0)), 0)
    )
    from izdato i
    join public.zaposlenici z on z.id = i.konobar_id
    left join placeno p on p.konobar_id = i.konobar_id
    where i.iznos - coalesce(p.iznos, 0) > 0
  );
end;
$$;
revoke all on function public.dugovi_pecenjari(uuid) from public, anon, authenticated;
grant execute on function public.dugovi_pecenjari(uuid) to service_role;

create function public.uplati_pecenjari(p_zaposlenik uuid, p_request_id uuid, p_konobar uuid, p_iznos numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.uplate_pecenjari;
  v_dug numeric;
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['pecenjara']::public.uloga[]);
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_iznos is null or p_iznos <= 0 or p_iznos > 999999.99 or p_iznos <> round(p_iznos, 2) then
    raise exception 'Iznos uplate mora biti od 0,01 do 999.999,99 KM.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('uplate_pecenjari', 0));

  select u.* into v_u from public.uplate_pecenjari u where u.request_id = p_request_id;
  if found then
    return jsonb_build_object('konobarId', v_u.konobar_id, 'iznos', v_u.iznos, 'preostaliDug', public.dug_konobara_pecenjari(v_u.konobar_id));
  end if;

  v_dug := public.dug_konobara_pecenjari(p_konobar);
  if p_iznos > v_dug then
    raise exception 'Uplata prelazi dug konobara (% KM).', replace(greatest(v_dug, 0)::text, '.', ',') using errcode = 'P0001';
  end if;

  insert into public.uplate_pecenjari (request_id, konobar_id, iznos, zaposlenik_id)
  values (p_request_id, p_konobar, p_iznos, p_zaposlenik);

  perform public.zapisi_radnju(
    p_zaposlenik,
    'uplata_pecenjari',
    jsonb_build_object('konobar', p_konobar, 'iznos', p_iznos, 'preostaliDug', v_dug - p_iznos)
  );
  return jsonb_build_object('konobarId', p_konobar, 'iznos', p_iznos, 'preostaliDug', v_dug - p_iznos);
end;
$$;
revoke all on function public.uplati_pecenjari(uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.uplati_pecenjari(uuid, uuid, uuid, numeric) to service_role;
