-- Supabase installed rls_auto_enable() for its ensure_rls event trigger, with EXECUTE for everyone, so the
-- advisor flags it as a public SECURITY DEFINER function. The event trigger does not need EXECUTE to fire.
-- It is not in our migrations and is absent locally (PGlite), so only touch it where it exists.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
