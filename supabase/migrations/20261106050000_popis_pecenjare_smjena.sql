-- The grill close took whatever count was open. A tablet still showing shift I, after the manager had closed it
-- and shift II had opened, closed shift II's count with shift I's figures, and a closed count cannot be corrected.
-- The close now names the shift on screen. The old body stays, renamed and callable only from here.
alter function public.zatvori_popis_pecenjare(uuid, uuid, integer, numeric, integer, numeric, numeric)
  rename to zatvori_popis_pecenjare_otvoreni;
revoke all on function public.zatvori_popis_pecenjare_otvoreni(uuid, uuid, integer, numeric, integer, numeric, numeric)
  from public, anon, authenticated, service_role;

create function public.zatvori_popis_pecenjare(
  p_zaposlenik uuid,
  p_smjena uuid,
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
begin
  perform public.zahtijevaj_ulogu(p_zaposlenik, array['pecenjara', 'sefica']::public.uloga[]);
  perform pg_advisory_xact_lock(hashtextextended('smjene', 0));
  -- A retry of a close that already went through gets its answer, whatever is open now.
  if not exists (select 1 from public.popisi_pecenjare pp where pp.zatvaranje_request_id = p_request_id)
    and not exists (select 1 from public.smjene s where s.id = p_smjena and s.kraj is null)
  then
    raise exception 'Ta smjena više nije otvorena. Osvježite stranicu i provjerite koji popis zatvarate.' using errcode = 'P0001';
  end if;
  return public.zatvori_popis_pecenjare_otvoreni(
    p_zaposlenik, p_request_id, p_dodatne_koke, p_dodatna_kg, p_preostale_koke, p_preostala_kg, p_predani
  );
end;
$$;
revoke all on function public.zatvori_popis_pecenjare(uuid, uuid, uuid, integer, numeric, integer, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.zatvori_popis_pecenjare(uuid, uuid, uuid, integer, numeric, integer, numeric, numeric)
  to service_role;
