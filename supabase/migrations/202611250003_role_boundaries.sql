begin;

create or replace function public.company_role(p_company uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role
  from public.company_members m join auth.users u on u.id = m.user_id
  where m.company_id = p_company and m.user_id = auth.uid()
    and not public.is_platform_admin()
    and u.raw_app_meta_data->>'must_change_password' is distinct from 'true'
    and auth.jwt()->'app_metadata'->>'must_change_password' is distinct from 'true'
$$;

drop policy company_read on public.companies;
create policy company_read on public.companies for select to authenticated
using (public.company_role(id) is not null);

-- Some Auth writes attach app metadata after inserting the identity.
-- Provision from the trusted metadata on either write and repair existing accounts.
create or replace function public.provision_boshqa_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_account jsonb := new.raw_app_meta_data;
  v_company uuid;
  v_owner uuid;
begin
  if exists (select 1 from public.platform_admins where user_id = new.id)
    or exists (select 1 from public.company_members where user_id = new.id) then
    return new;
  end if;
  if v_account->>'boshqa_kind' = 'company' then
    if v_account->>'sector' is null or v_account->>'contact' is null then
      raise exception 'Korxona yo‘nalishi va aloqa ma’lumoti talab qilinadi';
    end if;
    insert into public.companies(name, sector, contact)
    values (trim(v_account->>'company_name'), v_account->>'sector', v_account->>'contact')
    returning id into v_company;
    insert into public.company_members values (v_company, new.id, 'owner');
  elsif v_account->>'boshqa_kind' = 'staff' then
    v_company := (v_account->>'company_id')::uuid;
    v_owner := (v_account->>'created_by')::uuid;
    if not exists (
      select 1 from public.company_members
      where company_id = v_company and user_id = v_owner and role = 'owner'
    ) or exists (select 1 from public.platform_admins where user_id = v_owner)
      or v_account->>'role' is null or v_account->>'role' not in ('manager', 'supplier', 'customer') then
      raise exception 'Xodim qo‘shish uchun ruxsat yo‘q';
    end if;
    insert into public.company_members values (v_company, new.id, v_account->>'role');
  end if;
  return new;
end
$$;

drop trigger provision_boshqa_account on auth.users;
create trigger provision_boshqa_account
after insert or update of raw_app_meta_data on auth.users
for each row execute function public.provision_boshqa_account();

update auth.users u set raw_app_meta_data = u.raw_app_meta_data
where u.raw_app_meta_data->>'boshqa_kind' = 'company'
  and not exists (select 1 from public.company_members where user_id = u.id)
  and not exists (select 1 from public.platform_admins where user_id = u.id);

notify pgrst, 'reload schema';
commit;
