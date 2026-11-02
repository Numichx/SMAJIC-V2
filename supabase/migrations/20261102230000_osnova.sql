-- Base rules: the app reaches the database only through functions, as service_role.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter default privileges in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- There is no sank role: konobar and sefica open the bar screens with their own PIN.
create type public.uloga as enum ('konobar', 'kuhinja', 'pecenjara', 'mesnica', 'sefica');

create table public.dnevnik_radnji (
  id bigint generated always as identity primary key,
  vrijeme timestamptz not null default now(),
  zaposlenik_id uuid,
  radnja text not null,
  detalji jsonb not null default '{}'::jsonb
);
alter table public.dnevnik_radnji enable row level security;
revoke all on table public.dnevnik_radnji from public, anon, authenticated, service_role;
create index dnevnik_radnji_vrijeme_idx on public.dnevnik_radnji (vrijeme desc);
create index dnevnik_radnji_zaposlenik_idx on public.dnevnik_radnji (zaposlenik_id);

create function public.zapisi_radnju(p_zaposlenik uuid, p_radnja text, p_detalji jsonb default '{}'::jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.dnevnik_radnji (zaposlenik_id, radnja, detalji)
  values (p_zaposlenik, p_radnja, p_detalji);
$$;
revoke all on function public.zapisi_radnju(uuid, text, jsonb) from public, anon, authenticated, service_role;
