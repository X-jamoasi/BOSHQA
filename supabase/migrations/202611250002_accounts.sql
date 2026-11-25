begin;

alter table public.companies
  add column sector text check (sector in ('Oziq-ovqat', 'Qurilish mollari', 'To‘qimachilik', 'Metall va uskunalar', 'Qishloq xo‘jaligi', 'Boshqa')),
  add column contact text check (char_length(contact) between 5 and 254);

-- Auth inserts the identity and its initial company or membership in one transaction.
create function public.provision_boshqa_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_account jsonb := new.raw_app_meta_data;
  v_company uuid;
begin
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
    if not exists (
      select 1 from public.company_members
      where company_id = v_company and user_id = (v_account->>'created_by')::uuid and role = 'owner'
    ) or v_account->>'role' is null or v_account->>'role' not in ('manager', 'supplier', 'customer') then
      raise exception 'Xodim qo‘shish uchun ruxsat yo‘q';
    end if;
    insert into public.company_members values (v_company, new.id, v_account->>'role');
  end if;
  return new;
end
$$;
revoke execute on function public.provision_boshqa_account() from public, anon, authenticated;
create trigger provision_boshqa_account
after insert on auth.users for each row execute function public.provision_boshqa_account();

create or replace function public.company_role(p_company uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.company_members m join auth.users u on u.id = m.user_id
  where m.company_id = p_company and m.user_id = auth.uid()
    and u.raw_app_meta_data->>'must_change_password' is distinct from 'true'
    and auth.jwt()->'app_metadata'->>'must_change_password' is distinct from 'true'
$$;

drop policy member_read on public.company_members;
create policy member_read on public.company_members for select to authenticated
using (public.company_role(company_id) in ('owner', 'manager') or
  (user_id = auth.uid() and public.company_role(company_id) is not null));

create or replace function public.company_suppliers(p_company uuid) returns table(user_id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(u.raw_app_meta_data->>'login', u.email::text)
  from public.company_members m join auth.users u on u.id = m.user_id
  where m.company_id = p_company and m.role = 'supplier' and public.company_role(p_company) in ('owner', 'manager')
  order by 2
$$;

-- Signup and staff provisioning now run only through the server.
revoke execute on function public.create_company(text), public.add_company_member(uuid,text,text) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
