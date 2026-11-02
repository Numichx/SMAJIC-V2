-- Staff. Nobody has a PIN yet: each person chooses one with a one-time activation code.
create table public.zaposlenici (
  id uuid primary key default gen_random_uuid(),
  ime text not null unique check (char_length(ime) between 1 and 80),
  uloga public.uloga not null,
  aktivan boolean not null default true,
  pin_hash text,
  aktivacija_hash text,
  aktivacija_do timestamptz,
  kreirano timestamptz not null default now()
);
alter table public.zaposlenici enable row level security;
revoke all on table public.zaposlenici from public, anon, authenticated, service_role;
create index zaposlenici_uloga_idx on public.zaposlenici (uloga) where aktivan;

alter table public.dnevnik_radnji
  add constraint dnevnik_radnji_zaposlenik_fk foreign key (zaposlenik_id) references public.zaposlenici (id);

insert into public.zaposlenici (ime, uloga) values
  ('Nedžija Smajić', 'sefica'),
  ('Emsud Peco', 'konobar'),
  ('Gasal Mirza', 'konobar'),
  ('Numić Fadil', 'konobar'),
  ('Malanović Haris', 'pecenjara'),
  ('Hatarić Jasmin', 'pecenjara'),
  ('Aletić Haris', 'pecenjara'),
  ('Rebihić Aldina', 'kuhinja'),
  ('Mirzeta', 'kuhinja'),
  ('Nina', 'kuhinja'),
  ('Zolota Mujo', 'mesnica');

create function public.pin_je_slab(p_pin text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_pin !~ '^[0-9]{4,8}$'
    or p_pin ~ '^(.)\1+$'
    or position(p_pin in '01234567890123456789') > 0
    or position(p_pin in '98765432109876543210') > 0
    or p_pin in ('2580', '0852')
    or p_pin ~ '^(19|20)[0-9]{2}$',
    true
  );
$$;
revoke all on function public.pin_je_slab(text) from public, anon, authenticated, service_role;

create function public.zaposlenik_aktivan(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select z.aktivan from public.zaposlenici z where z.id = p_id), false);
$$;
revoke all on function public.zaposlenik_aktivan(uuid) from public, anon, authenticated;
grant execute on function public.zaposlenik_aktivan(uuid) to service_role;

create function public.zaposlenici_za_prijavu(p_uloge public.uloga[])
returns table (id uuid, ime text)
language sql
stable
security definer
set search_path = ''
as $$
  select z.id, z.ime
  from public.zaposlenici z
  where z.aktivan and z.pin_hash is not null and z.uloga = any (p_uloge)
  order by z.ime;
$$;
revoke all on function public.zaposlenici_za_prijavu(public.uloga[]) from public, anon, authenticated;
grant execute on function public.zaposlenici_za_prijavu(public.uloga[]) to service_role;

create function public.zaposlenici_pregled(p_sefica uuid)
returns table (id uuid, ime text, uloga public.uloga, aktivan boolean, ima_pin boolean, ceka_aktivaciju boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.zaposlenici s
    where s.id = p_sefica and s.uloga = 'sefica'::public.uloga and s.aktivan
  ) then
    raise exception 'Nemate pravo na ovu radnju.' using errcode = 'P0001';
  end if;

  return query
    select z.id, z.ime, z.uloga, z.aktivan, z.pin_hash is not null, coalesce(z.aktivacija_do > now(), false)
    from public.zaposlenici z
    order by z.uloga, z.ime;
end;
$$;
revoke all on function public.zaposlenici_pregled(uuid) from public, anon, authenticated;
grant execute on function public.zaposlenici_pregled(uuid) to service_role;

create function public.novi_aktivacijski_kod(p_zaposlenik uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_kod text;
begin
  v_kod := lpad(
    (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text,
    6, '0'
  );
  update public.zaposlenici z
  set aktivacija_hash = extensions.crypt(v_kod, extensions.gen_salt('bf', 10)),
      aktivacija_do = now() + interval '15 minutes'
  where z.id = p_zaposlenik;
  return v_kod;
end;
$$;
revoke all on function public.novi_aktivacijski_kod(uuid) from public, anon, authenticated, service_role;

create function public.aktiviraj_pin(p_zaposlenik uuid, p_sefica uuid)
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
  perform public.zapisi_radnju(p_sefica, 'aktivacija_pina', jsonb_build_object('zaposlenik', p_zaposlenik));
  return v_kod;
end;
$$;
revoke all on function public.aktiviraj_pin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.aktiviraj_pin(uuid, uuid) to service_role;

-- First PIN of all. Run once in the Supabase SQL editor: no grant, so the app cannot call it.
create function public.aktiviraj_prvu_seficu()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_kod text;
begin
  if exists (select 1 from public.zaposlenici z where z.uloga = 'sefica'::public.uloga and z.pin_hash is not null) then
    raise exception 'Šefica već ima PIN.' using errcode = 'P0001';
  end if;
  select z.id into v_id from public.zaposlenici z where z.uloga = 'sefica'::public.uloga and z.aktivan limit 1;
  if v_id is null then
    raise exception 'Nema aktivne šefice.' using errcode = 'P0001';
  end if;

  v_kod := public.novi_aktivacijski_kod(v_id);
  perform public.zapisi_radnju(null, 'aktivacija_prve_sefice', jsonb_build_object('zaposlenik', v_id));
  return v_kod;
end;
$$;
revoke all on function public.aktiviraj_prvu_seficu() from public, anon, authenticated, service_role;
