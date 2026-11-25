begin;

create function public.finalize_staff_membership(
  p_company uuid, p_actor uuid, p_role text, p_email text, p_user uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if p_role is null or p_role not in ('manager', 'supplier', 'customer') or not exists (
    select 1 from public.company_members m join auth.users u on u.id = m.user_id
    where m.company_id = p_company and m.user_id = p_actor and m.role = 'owner'
      and u.raw_app_meta_data->>'must_change_password' is distinct from 'true'
      and not exists (select 1 from public.platform_admins where user_id = p_actor)
  ) then
    return null;
  end if;

  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(p_email)
    and (p_user is null or u.id = p_user)
    and u.raw_app_meta_data->>'boshqa_kind' = 'staff'
    and u.raw_app_meta_data->>'created_by' = p_actor::text
    and u.raw_app_meta_data->>'company_id' = p_company::text
    and u.raw_app_meta_data->>'role' = p_role
    and u.raw_app_meta_data->>'must_change_password' = 'true'
    and not exists (select 1 from public.platform_admins where user_id = u.id)
  for update of u;

  if v_user is null then return null; end if;
  if exists (select 1 from public.company_members where user_id = v_user) then
    if p_user is not null and exists (
      select 1 from public.company_members where company_id = p_company and user_id = v_user and role = p_role
    ) then return v_user; end if;
    return null;
  end if;

  insert into public.company_members(company_id, user_id, role)
  values (p_company, v_user, p_role);
  return v_user;
end
$$;

revoke execute on function public.finalize_staff_membership(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.finalize_staff_membership(uuid,uuid,text,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
