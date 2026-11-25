begin;

create function public.ensure_own_company_membership() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_meta jsonb;
begin
  if v_user is null or public.is_platform_admin() then return null; end if;

  -- Lock this account so that concurrent sign-ins cannot create two companies.
  select raw_app_meta_data into v_meta from auth.users where id = v_user for update;
  if (v_meta->>'boshqa_kind') is distinct from 'company'
    or v_meta->>'must_change_password' = 'true' then
    return null;
  end if;

  select company_id into v_company from public.company_members
  where user_id = v_user and role = 'owner' order by company_id limit 1;
  if v_company is not null then return v_company; end if;
  if exists (select 1 from public.company_members where user_id = v_user) then return null; end if;

  -- Re-run the established provisioning trigger using only server-owned metadata.
  update auth.users set raw_app_meta_data = raw_app_meta_data where id = v_user;
  select company_id into v_company from public.company_members
  where user_id = v_user and role = 'owner' order by company_id limit 1;
  return v_company;
end
$$;

revoke execute on function public.ensure_own_company_membership() from public, anon, authenticated;
grant execute on function public.ensure_own_company_membership() to authenticated;
notify pgrst, 'reload schema';
commit;
