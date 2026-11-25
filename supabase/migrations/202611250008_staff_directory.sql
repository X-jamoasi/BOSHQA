begin;

create function public.company_staff_directory(p_company uuid)
returns table(user_id uuid, role text, login text, name text, phone text, email text, pending_password boolean)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role,
    coalesce(u.raw_app_meta_data->>'login', nullif(split_part(u.email, '@login.boshqa-iota.vercel.app', 1), u.email), ''),
    coalesce(u.raw_user_meta_data->>'full_name', ''),
    coalesce(u.raw_user_meta_data->>'profile_phone', u.phone, ''),
    coalesce(u.raw_user_meta_data->>'profile_email',
      case when u.email not like '%@login.boshqa-iota.vercel.app' then u.email end, ''),
    coalesce(u.raw_app_meta_data->>'must_change_password' = 'true', false)
  from public.company_members m join auth.users u on u.id = m.user_id
  where m.company_id = p_company and m.role <> 'owner' and public.company_role(p_company) = 'owner'
  order by 4, 3, 1
$$;

create function public.company_staff_orders(p_company uuid, p_user uuid, p_offset integer default 0)
returns table(id uuid, product_name text, quantity integer, status text, direction text, created_at timestamptz, involvement text)
language sql stable security definer set search_path = '' as $$
  select o.id, p.name, o.quantity, o.status, o.direction, o.created_at,
    case when o.customer_id = p_user then 'customer' when o.supplier_id = p_user then 'supplier' else 'creator' end
  from public.orders o join public.products p on p.company_id = o.company_id and p.id = o.product_id
  where o.company_id = p_company and public.company_role(p_company) = 'owner'
    and exists (select 1 from public.company_members m where m.company_id = p_company and m.user_id = p_user and m.role <> 'owner')
    and p_user in (o.customer_id, o.supplier_id, o.created_by)
  order by o.created_at desc, o.id desc
  limit 21 offset greatest(coalesce(p_offset, 0), 0)
$$;

create function public.manage_company_staff(p_company uuid, p_user uuid, p_role text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if public.company_role(p_company) is distinct from 'owner' then
    raise exception 'Xodimlarni faqat korxona egasi boshqarishi mumkin' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('manager', 'supplier', 'customer') then
    raise exception 'Rol yaroqsiz' using errcode = '22023';
  end if;
  select role into v_role from public.company_members
  where company_id = p_company and user_id = p_user for update;

  if v_role is null or v_role = 'owner' then
    raise exception 'Xodim topilmadi yoki uning rolini boshqarib bo‘lmaydi' using errcode = '42501';
  end if;
  if v_role = p_role then return; end if;
  if exists (select 1 from public.orders o where o.company_id = p_company
    and o.status in ('pending', 'approved', 'shipped') and p_user in (o.customer_id, o.supplier_id, o.created_by)) then
    raise exception 'Xodimga bog‘liq faol buyurtmalar bor. Avval ularni yakunlang.' using errcode = '55000';
  end if;

  if p_role is null then
    update auth.users set raw_app_meta_data = raw_app_meta_data - array['boshqa_kind', 'company_id', 'created_by', 'role']
    where id = p_user and raw_app_meta_data->>'boshqa_kind' = 'staff'
      and raw_app_meta_data->>'company_id' = p_company::text;
    delete from public.company_members where company_id = p_company and user_id = p_user;
  else
    update public.company_members set role = p_role where company_id = p_company and user_id = p_user;
    update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p_role)
    where id = p_user and raw_app_meta_data->>'company_id' = p_company::text;
  end if;
end
$$;

-- Serialize new order participants with role changes and removals.
create function public.lock_order_members() returns trigger
language plpgsql set search_path = '' as $$
declare v_member uuid;
begin
  if tg_op = 'INSERT' then
    select user_id into v_member from public.company_members where company_id = new.company_id
      and user_id = new.created_by and role in ('owner', 'manager', 'customer') for share;
    if v_member is null then raise exception 'Buyurtma yaratuvchisining korxona roli o‘zgargan'; end if;

    if new.customer_id is not null then
      select user_id into v_member from public.company_members where company_id = new.company_id
        and user_id = new.customer_id and role = 'customer' for share;
      if v_member is null then raise exception 'Buyurtmachining korxona roli o‘zgargan'; end if;
    end if;
  end if;
  if new.supplier_id is not null and (tg_op = 'INSERT' or new.supplier_id is distinct from old.supplier_id) then
    select user_id into v_member from public.company_members where company_id = new.company_id
      and user_id = new.supplier_id and role = 'supplier' for share;
    if v_member is null then raise exception 'Yetkazib beruvchining korxona roli o‘zgargan'; end if;
  end if;
  return new;
end
$$;
revoke execute on function public.lock_order_members() from public, anon, authenticated;
create trigger lock_order_members before insert or update of supplier_id on public.orders
for each row execute function public.lock_order_members();

revoke execute on function public.company_staff_directory(uuid), public.company_staff_orders(uuid,uuid,integer),
  public.manage_company_staff(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.company_staff_directory(uuid), public.company_staff_orders(uuid,uuid,integer),
  public.manage_company_staff(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
