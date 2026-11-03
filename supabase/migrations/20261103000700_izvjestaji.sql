-- Reports, the daily close, guest debts, the audit log and waiter stats.
-- A "day" is a calendar day in Sarajevo, whatever the server's clock says, and is 23 or 25 hours long at a clock change.

create function public.pocetak_dana(p_datum date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_datum::timestamp at time zone 'Europe/Sarajevo';
$$;
revoke all on function public.pocetak_dana(date) from public, anon, authenticated, service_role;

create function public.danas_u_sarajevu()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Sarajevo')::date;
$$;
revoke all on function public.danas_u_sarajevu() from public, anon, authenticated, service_role;

drop index public.naplate_konobar_idx;
create index naplate_konobar_vrijeme_idx on public.naplate (konobar_id, vrijeme);
create index naplate_vrijeme_idx on public.naplate (vrijeme);
create index racuni_otvoreni_idx on public.racuni (status, otvoren) where status in ('otvoren', 'na_dug');
-- A void's time and value live in its log entry: a voided line keeps no timestamp of its own.
create index dnevnik_radnji_storno_idx on public.dnevnik_radnji (vrijeme) where radnja = 'storno';

-- Collecting keeps the original naplate row, so a closed day's figures never change afterwards.
-- The old app overwrote it, which moved the debt's takings into the collection day and hid that it had been a debt.
create table public.naplate_dugova (
  racun_id uuid primary key references public.naplate (racun_id),
  request_id uuid not null unique,
  nacin text not null check (nacin in ('gotovina', 'kartica')),
  iznos numeric(10, 2) not null check (iznos > 0),
  zaposlenik_id uuid not null references public.zaposlenici (id),
  vrijeme timestamptz not null default now()
);
alter table public.naplate_dugova enable row level security;
revoke all on table public.naplate_dugova from public, anon, authenticated, service_role;
create index naplate_dugova_vrijeme_idx on public.naplate_dugova (vrijeme);

create table public.dnevni_zakljucci (
  datum date primary key,
  zaposlenik_id uuid not null references public.zaposlenici (id),
  vrijeme timestamptz not null default now(),
  izvjestaj jsonb not null
);
alter table public.dnevni_zakljucci enable row level security;
revoke all on table public.dnevni_zakljucci from public, anon, authenticated, service_role;

-- Inclusive dates. A bill counts on the day it was paid. Nothing here depends on the moment of the call, so a
-- daily close can compare two runs. Line amounts in poProizvodu are before the bill's discount. No guest names.
create function public.izvjestaj_raspona(p_od date, p_do date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with granice as (
    select public.pocetak_dana(p_od) as od, public.pocetak_dana(p_do + 1) as kraj
  ),
  naplacene as (
    select n.racun_id, n.nacin, n.bruto, n.popust, n.ukupno, n.gotovina, n.kartica, n.kusur, n.baksis, n.konobar_id,
      (n.vrijeme at time zone 'Europe/Sarajevo')::date as dan,
      r.popust_razlog
    from public.naplate n
    join public.racuni r on r.id = n.racun_id
    cross join granice g
    where n.vrijeme >= g.od and n.vrijeme < g.kraj
  ),
  naplaceni_dugovi as (
    select u.nacin, u.iznos
    from public.naplate_dugova u
    cross join granice g
    where u.vrijeme >= g.od and u.vrijeme < g.kraj
  ),
  storna as (
    select d.detalji ->> 'razlog' as razlog, (s ->> 'vrijednost')::numeric as vrijednost
    from public.dnevnik_radnji d
    cross join granice g
    cross join lateral jsonb_array_elements(d.detalji -> 'stavke') s
    where d.radnja = 'storno' and d.vrijeme >= g.od and d.vrijeme < g.kraj
  )
  select jsonb_build_object(
    'od', p_od,
    'do', p_do,
    'racuni', u.racuni,
    'bruto', u.bruto,
    'popust', u.popust,
    'ukupno', u.ukupno,
    'naplaceno', u.naplaceno,
    -- Cash kept and card charged, both with the tip in them.
    'gotovina', u.gotovina,
    'kartica', u.kartica,
    'baksis', u.baksis,
    'noviDug', u.novi_dug,
    'naplaceniDugovi', (
      select jsonb_build_object(
        'broj', count(*),
        'gotovina', coalesce(sum(d.iznos) filter (where d.nacin = 'gotovina'), 0),
        'kartica', coalesce(sum(d.iznos) filter (where d.nacin = 'kartica'), 0)
      )
      from naplaceni_dugovi d
    ),
    'poNacinu', (
      select coalesce(jsonb_agg(
        jsonb_build_object('nacin', t.nacin, 'broj', t.broj, 'ukupno', t.ukupno, 'baksis', t.baksis)
        order by t.nacin
      ), '[]'::jsonb)
      from (
        select n.nacin, count(*) as broj, sum(n.ukupno) as ukupno, sum(n.baksis) as baksis
        from naplacene n
        group by n.nacin
      ) t
    ),
    'popusti', (
      select coalesce(jsonb_agg(
        jsonb_build_object('razlog', t.popust_razlog, 'broj', t.broj, 'iznos', t.iznos)
        order by t.popust_razlog
      ), '[]'::jsonb)
      from (
        select n.popust_razlog, count(*) as broj, sum(n.popust) as iznos
        from naplacene n
        where n.popust > 0
        group by n.popust_razlog
      ) t
    ),
    'storna', (
      select coalesce(jsonb_agg(
        jsonb_build_object('razlog', t.razlog, 'broj', t.broj, 'vrijednost', t.vrijednost)
        order by t.razlog
      ), '[]'::jsonb)
      from (
        select s.razlog, count(*) as broj, sum(s.vrijednost) as vrijednost
        from storna s
        group by s.razlog
      ) t
    ),
    'poKonobaru', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'ime', z.ime,
          'racuni', t.racuni,
          'naplaceno', t.naplaceno,
          'dug', t.dug,
          'popust', t.popust,
          'baksis', t.baksis
        )
        order by z.ime
      ), '[]'::jsonb)
      from (
        select n.konobar_id, count(*) as racuni,
          coalesce(sum(n.ukupno) filter (where n.nacin <> 'dug'), 0) as naplaceno,
          coalesce(sum(n.ukupno) filter (where n.nacin = 'dug'), 0) as dug,
          sum(n.popust) as popust,
          sum(n.baksis) as baksis
        from naplacene n
        group by n.konobar_id
      ) t
      join public.zaposlenici z on z.id = t.konobar_id
    ),
    'poProizvodu', (
      select coalesce(jsonb_agg(
        jsonb_build_object('naziv', t.naziv, 'jedinica', t.jedinica, 'kolicina', t.kolicina, 'iznos', t.iznos)
        order by t.iznos desc, t.naziv, t.jedinica
      ), '[]'::jsonb)
      from (
        select s.naziv, s.jedinica, sum(s.kolicina) as kolicina, sum(s.iznos) as iznos
        from naplacene n
        join public.narudzbe o on o.racun_id = n.racun_id
        join public.stavke_narudzbe s on s.narudzba_id = o.id
        where s.storno_razlog is null
        group by s.naziv, s.jedinica
      ) t
    ),
    'poDanu', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'datum', t.dan,
          'racuni', t.racuni,
          'bruto', t.bruto,
          'popust', t.popust,
          'ukupno', t.ukupno,
          'baksis', t.baksis
        )
        order by t.dan
      ), '[]'::jsonb)
      from (
        select n.dan, count(*) as racuni, sum(n.bruto) as bruto, sum(n.popust) as popust, sum(n.ukupno) as ukupno, sum(n.baksis) as baksis
        from naplacene n
        group by n.dan
      ) t
    ),
    'mesnica', (
      select jsonb_build_object('broj', count(*), 'iznos', coalesce(sum(p.iznos), 0))
      from public.prometi_zaliha p
      cross join granice g
      where p.vrsta = 'prodaja' and p.vrijeme >= g.od and p.vrijeme < g.kraj
    )
  )
  from (
    select
      count(*) as racuni,
      coalesce(sum(n.bruto), 0) as bruto,
      coalesce(sum(n.popust), 0) as popust,
      coalesce(sum(n.ukupno), 0) as ukupno,
      coalesce(sum(n.ukupno) filter (where n.nacin <> 'dug'), 0) as naplaceno,
      coalesce(sum(n.gotovina - n.kusur), 0) as gotovina,
      coalesce(sum(n.kartica), 0) as kartica,
      coalesce(sum(n.baksis), 0) as baksis,
      coalesce(sum(n.ukupno) filter (where n.nacin = 'dug'), 0) as novi_dug
    from naplacene n
  ) u;
$$;
revoke all on function public.izvjestaj_raspona(date, date) from public, anon, authenticated, service_role;

-- 1 day is today from midnight in Sarajevo, 7 days is today and the 6 before it.
create function public.izvjestaj_perioda(p_sefica uuid, p_dani integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_danas date := public.danas_u_sarajevu();
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if p_dani is null or p_dani not in (1, 7, 30) then
    raise exception 'Period mora biti 1, 7 ili 30 dana.' using errcode = 'P0001';
  end if;

  return public.izvjestaj_raspona(v_danas - (p_dani - 1), v_danas) || jsonb_build_object(
    'dani', p_dani,
    'otvoreniRacuni', (select count(*) from public.racuni r where r.status = 'otvoren'),
    'otvoreniDugovi', (
      select jsonb_build_object('broj', count(*), 'ukupno', coalesce(sum(n.ukupno), 0))
      from public.racuni r
      join public.naplate n on n.racun_id = r.id
      where r.status = 'na_dug'
    )
  );
end;
$$;
revoke all on function public.izvjestaj_perioda(uuid, integer) from public, anon, authenticated;
grant execute on function public.izvjestaj_perioda(uuid, integer) to service_role;

create function public.statistika_konobara(p_konobar uuid, p_dani integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_konobara(p_konobar);
  if p_dani is null or p_dani not in (1, 7, 30) then
    raise exception 'Period mora biti 1, 7 ili 30 dana.' using errcode = 'P0001';
  end if;

  return (
    select jsonb_build_object(
      'dani', p_dani,
      'brojRacuna', count(*),
      'naplaceno', coalesce(sum(n.ukupno) filter (where n.nacin <> 'dug'), 0),
      'dug', coalesce(sum(n.ukupno) filter (where n.nacin = 'dug'), 0),
      'prosjecanRacun', coalesce(round(avg(n.ukupno) filter (where n.nacin <> 'dug'), 2), 0),
      'baksis', coalesce(sum(n.baksis), 0)
    )
    from public.naplate n
    where n.konobar_id = p_konobar and n.vrijeme >= public.pocetak_dana(public.danas_u_sarajevu() - (p_dani - 1))
  );
end;
$$;
revoke all on function public.statistika_konobara(uuid, integer) from public, anon, authenticated;
grant execute on function public.statistika_konobara(uuid, integer) to service_role;

create function public.zakljucak_odgovor(p public.dnevni_zakljucci)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'datum', p.datum,
    'vrijeme', p.vrijeme,
    'zatvorila', (select z.ime from public.zaposlenici z where z.id = p.zaposlenik_id),
    'izvjestaj', p.izvjestaj
  );
$$;
revoke all on function public.zakljucak_odgovor(public.dnevni_zakljucci) from public, anon, authenticated, service_role;

create function public.dan_pregled(p_sefica uuid, p_datum date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_danas date := public.danas_u_sarajevu();
  v_datum date := coalesce(p_datum, v_danas);
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if v_datum > v_danas then
    raise exception 'Taj dan još nije počeo.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'danas', v_danas,
    'datum', v_datum,
    'zakljucak', (select public.zakljucak_odgovor(d) from public.dnevni_zakljucci d where d.datum = v_datum),
    'pregled', public.izvjestaj_raspona(v_datum, v_datum),
    'otvoreniRacuni', (
      select count(*) from public.racuni r
      where r.status = 'otvoren' and r.otvoren < public.pocetak_dana(v_datum + 1)
    ),
    'otvorenaSmjena', exists (
      select 1 from public.smjene s
      where s.kraj is null and s.pocetak < public.pocetak_dana(v_datum + 1)
    )
  );
end;
$$;
revoke all on function public.dan_pregled(uuid, date) from public, anon, authenticated;
grant execute on function public.dan_pregled(uuid, date) to service_role;

-- Takes a date because a restaurant closes up after midnight, when "today" is already the next day.
-- A bill or shift from after that date does not hold it back. Closing again with nothing changed does nothing,
-- so a double tap is safe. A payment taken after the close refreshes the figures, and the log keeps both.
create function public.zatvori_dan(p_sefica uuid, p_datum date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datum date := coalesce(p_datum, public.danas_u_sarajevu());
  v_kraj timestamptz := public.pocetak_dana(v_datum + 1);
  v_izvjestaj jsonb;
  v_z public.dnevni_zakljucci;
  v_otvoreni bigint;
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if v_datum > public.danas_u_sarajevu() then
    raise exception 'Taj dan još nije počeo.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));

  v_izvjestaj := public.izvjestaj_raspona(v_datum, v_datum);
  select d.* into v_z from public.dnevni_zakljucci d where d.datum = v_datum;
  if found and v_z.izvjestaj = v_izvjestaj then
    return public.zakljucak_odgovor(v_z);
  end if;

  select count(*) into v_otvoreni from public.racuni r where r.status = 'otvoren' and r.otvoren < v_kraj;
  if v_otvoreni > 0 then
    raise exception 'Dan se ne može zatvoriti dok ima otvorenih računa iz tog dana (%).', v_otvoreni using errcode = 'P0001';
  end if;
  if exists (select 1 from public.smjene s where s.kraj is null and s.pocetak < v_kraj) then
    raise exception 'Dan se ne može zatvoriti dok je smjena otvorena.' using errcode = 'P0001';
  end if;

  if v_z.datum is null then
    insert into public.dnevni_zakljucci (datum, zaposlenik_id, izvjestaj)
    values (v_datum, p_sefica, v_izvjestaj)
    returning * into v_z;
    perform public.zapisi_radnju(
      p_sefica,
      'dan_zatvoren',
      jsonb_build_object('datum', v_datum, 'racuni', v_izvjestaj -> 'racuni', 'naplaceno', v_izvjestaj -> 'naplaceno')
    );
  else
    perform public.zapisi_radnju(
      p_sefica,
      'dan_ponovo_zatvoren',
      jsonb_build_object(
        'datum', v_datum,
        'racuni', v_izvjestaj -> 'racuni',
        'naplaceno', v_izvjestaj -> 'naplaceno',
        'prethodno', jsonb_build_object('racuni', v_z.izvjestaj -> 'racuni', 'naplaceno', v_z.izvjestaj -> 'naplaceno')
      )
    );
    update public.dnevni_zakljucci d
    set zaposlenik_id = p_sefica, vrijeme = now(), izvjestaj = v_izvjestaj
    where d.datum = v_datum
    returning d.* into v_z;
  end if;

  return public.zakljucak_odgovor(v_z);
end;
$$;
revoke all on function public.zatvori_dan(uuid, date) from public, anon, authenticated;
grant execute on function public.zatvori_dan(uuid, date) to service_role;

-- The only place a guest's name leaves the database.
create function public.dugovi_gostiju(p_sefica uuid, p_strana integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pomak integer := public.pomak_strane(p_strana);
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);

  return (
    with stranica as (
      select r.id, r.broj, n.gost_duznik, n.ukupno, n.vrijeme, n.stolovi, z.ime as konobar
      from public.racuni r
      join public.naplate n on n.racun_id = r.id
      join public.zaposlenici z on z.id = n.konobar_id
      where r.status = 'na_dug'
      order by n.vrijeme, r.id
      limit 51 offset v_pomak
    )
    select jsonb_build_object(
      'dugovi', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'racunId', s.id,
            'broj', s.broj,
            'gostDuznik', s.gost_duznik,
            'iznos', s.ukupno,
            'vrijeme', s.vrijeme,
            'stolovi', to_jsonb(s.stolovi),
            'konobar', s.konobar
          )
          order by s.vrijeme, s.id
        )
        from stranica s
      ), '[]'::jsonb) - 50,
      'imaJos', (select count(*) from stranica) > 50,
      'broj', u.broj,
      'ukupno', u.ukupno
    )
    from (
      select count(*) as broj, coalesce(sum(n.ukupno), 0) as ukupno
      from public.racuni r
      join public.naplate n on n.racun_id = r.id
      where r.status = 'na_dug'
    ) u
  );
end;
$$;
revoke all on function public.dugovi_gostiju(uuid, integer) from public, anon, authenticated;
grant execute on function public.dugovi_gostiju(uuid, integer) to service_role;

-- The whole debt in one payment, as in the old app. The amount comes from the bill and carries no tip.
create function public.naplati_dug(p_sefica uuid, p_racun uuid, p_request_id uuid, p_nacin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_racun public.racuni;
  v_u public.naplate_dugova;
  v_iznos numeric;
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);
  if p_request_id is null then
    raise exception 'Nedostaje oznaka zahtjeva.' using errcode = 'P0001';
  end if;
  if p_nacin is null or p_nacin not in ('gotovina', 'kartica') then
    raise exception 'Dug se naplaćuje gotovinom ili karticom.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('racuni', 0));

  select u.* into v_u from public.naplate_dugova u where u.request_id = p_request_id;
  if found then
    if v_u.racun_id <> p_racun then
      raise exception 'Oznaka zahtjeva je već iskorištena na drugom računu.' using errcode = 'P0001';
    end if;
  else
    select r.* into v_racun from public.racuni r where r.id = p_racun;
    if not found then
      raise exception 'Račun nije pronađen.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.naplate_dugova u where u.racun_id = p_racun) then
      raise exception 'Dug je već naplaćen.' using errcode = 'P0001';
    end if;
    if v_racun.status <> 'na_dug' then
      raise exception 'Račun nije na dugu.' using errcode = 'P0001';
    end if;

    select n.ukupno into v_iznos from public.naplate n where n.racun_id = p_racun;

    insert into public.naplate_dugova (racun_id, request_id, nacin, iznos, zaposlenik_id)
    values (p_racun, p_request_id, p_nacin, v_iznos, p_sefica)
    returning * into v_u;

    update public.racuni r set status = 'placen' where r.id = p_racun;

    perform public.zapisi_radnju(
      p_sefica,
      'dug_naplacen',
      jsonb_build_object('racun', p_racun, 'iznos', v_iznos, 'nacin', p_nacin)
    );
  end if;

  return jsonb_build_object('racunId', v_u.racun_id, 'iznos', v_u.iznos, 'nacin', v_u.nacin, 'vrijeme', v_u.vrijeme);
end;
$$;
revoke all on function public.naplati_dug(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.naplati_dug(uuid, uuid, uuid, text) to service_role;

-- By id, newest first. sljedeci goes back in as p_prije, so entries added while reading cannot shift a page.
create function public.dnevnik_pregled(p_sefica uuid, p_prije bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);

  return (
    select jsonb_build_object(
      'dnevnik', coalesce(jsonb_agg(
        jsonb_build_object('id', d.id, 'vrijeme', d.vrijeme, 'zaposlenik', z.ime, 'radnja', d.radnja, 'detalji', d.detalji)
        order by d.id desc
      ), '[]'::jsonb) - 50,
      'sljedeci', case when count(*) > 50 then (array_agg(d.id order by d.id desc))[50] end
    )
    from (
      select t.* from public.dnevnik_radnji t
      where p_prije is null or t.id < p_prije
      order by t.id desc
      limit 51
    ) d
    left join public.zaposlenici z on z.id = d.zaposlenik_id
  );
end;
$$;
revoke all on function public.dnevnik_pregled(uuid, bigint) from public, anon, authenticated;
grant execute on function public.dnevnik_pregled(uuid, bigint) to service_role;

-- Last 7 days, today included: the recipes of what was ordered plus what the butcher sold, and 20 % on top, as in the old
-- app. Stock on hand is shown beside it and not subtracted. Most dishes have no recipe yet, so most items suggest 0.
create function public.prijedlog_nabavke(p_sefica uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_od timestamptz := public.pocetak_dana(public.danas_u_sarajevu() - 6);
begin
  perform public.zahtijevaj_ulogu(p_sefica, array['sefica']::public.uloga[]);

  return (
    with utrosak as (
      select r.zaliha_id, s.kolicina * r.kolicina as kolicina
      from public.narudzbe n
      join public.stavke_narudzbe s on s.narudzba_id = n.id
      join public.recepti r on r.proizvod_id = s.proizvod_id
      where n.kreirano >= v_od and s.storno_razlog is null
      union all
      select p.zaliha_id, -p.promjena
      from public.prometi_zaliha p
      where p.vrsta = 'prodaja' and p.vrijeme >= v_od
    ),
    ukupno as (
      select u.zaliha_id, sum(u.kolicina) as kolicina
      from utrosak u
      group by u.zaliha_id
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'naziv', a.naziv,
        'jedinica', a.jedinica,
        'stanje', a.stanje,
        'minimum', a.minimum,
        'ispodMinimuma', a.stanje <= a.minimum,
        'nabavnaCijena', a.nabavna_cijena,
        'utrosak7Dana', coalesce(u.kolicina, 0),
        'predlozenaNabavka', trim_scale(ceil(coalesce(u.kolicina, 0) * 1.2 * 1000) / 1000)
      )
      order by a.naziv
    ), '[]'::jsonb)
    from public.zaliha_artikli a
    left join ukupno u on u.zaliha_id = a.id
  );
end;
$$;
revoke all on function public.prijedlog_nabavke(uuid) from public, anon, authenticated;
grant execute on function public.prijedlog_nabavke(uuid) to service_role;
