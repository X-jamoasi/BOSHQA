begin;

alter table public.companies add column legal_address text
  check (char_length(legal_address) between 5 and 250);

revoke select on public.companies from authenticated;
grant select (id, name, sector, contact, registered_at) on public.companies to authenticated;

create function public.company_profile(p_company uuid)
returns table(name text, sector text, contact text, legal_address text)
language sql stable security definer set search_path = '' as $$
  select c.name, c.sector, c.contact, c.legal_address from public.companies c
  where c.id = p_company and public.company_role(p_company) in ('owner', 'manager')
$$;

revoke execute on function public.company_profile(uuid) from public, anon, authenticated;
grant execute on function public.company_profile(uuid) to authenticated;

create function public.update_company_profile(
  p_company uuid, p_name text, p_sector text, p_contact text, p_legal_address text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.company_role(p_company) is distinct from 'owner' then
    raise exception 'Korxona ma’lumotlarini faqat egasi o‘zgartirishi mumkin' using errcode = '42501';
  end if;
  update public.companies
  set name = trim(p_name), sector = p_sector,
    contact = nullif(trim(p_contact), ''), legal_address = nullif(trim(p_legal_address), '')
  where id = p_company;
end
$$;

revoke execute on function public.update_company_profile(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.update_company_profile(uuid,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
