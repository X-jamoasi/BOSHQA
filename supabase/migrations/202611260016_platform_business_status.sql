begin;
alter table public.companies add column account_status text not null default 'active' check(account_status in ('active','frozen','archived'));
alter table public.stores add column account_status text not null default 'active' check(account_status in ('active','frozen','archived'));

create function public.platform_business_directory(p_kind text,p_query text,p_status text,p_offset integer)
returns table(id uuid,name text,details text,account_status text)
language sql stable security definer set search_path='' as $$
 select b.id,b.name,b.details,b.account_status
 from (
   select c.id,c.name,c.sector details,c.account_status from public.companies c where p_kind='company'
   union all
   select s.id,s.name,concat_ws(' · ',a.region,a.locality),s.account_status from public.stores s
     left join public.store_areas a on a.id=s.area_id where p_kind='store'
 ) b
 where public.is_platform_admin() and (p_status is null or b.account_status=p_status)
   and (p_query is null or strpos(lower(b.name),lower(p_query))>0)
 order by b.name,b.id limit 25 offset greatest(0,p_offset)
$$;

create function public.set_platform_business_status(p_kind text,p_id uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare business_name text; prior text;
begin
 if not public.is_platform_admin() then raise exception 'Ruxsat yo‘q' using errcode='42501'; end if;
 if p_status is null or p_status not in ('active','frozen','archived') then raise exception 'Holat yaroqsiz'; end if;
 if p_kind='company' then
   select name,account_status into business_name,prior from public.companies where id=p_id for update;
   if prior<>p_status then update public.companies set account_status=p_status where id=p_id; end if;
 elsif p_kind='store' then
   select name,account_status into business_name,prior from public.stores where id=p_id for update;
   if prior<>p_status then update public.stores set account_status=p_status where id=p_id; end if;
 end if;
 if business_name is null then raise exception 'Yozuv topilmadi'; end if;
 if prior<>p_status then
   insert into public.platform_activity(description) values(
    (case when p_kind='company' then 'Korxona' else 'Do‘kon' end)||' · '||business_name||' · '||
    (case p_status when 'active' then 'Qayta faollashtirildi' when 'frozen' then 'Muzlatildi' else 'Arxivlandi' end));
 end if;
end $$;
revoke execute on function public.platform_business_directory(text,text,text,integer),public.set_platform_business_status(text,uuid,text) from public,anon,authenticated;
grant execute on function public.platform_business_directory(text,text,text,integer),public.set_platform_business_status(text,uuid,text) to authenticated;

create or replace function public.company_role(p_company uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role
  from public.company_members m join auth.users u on u.id = m.user_id
  where exists(select 1 from public.companies c where c.id=p_company and c.account_status='active') and m.company_id = p_company and m.user_id = auth.uid()
    and not public.is_platform_admin()
    and u.raw_app_meta_data->>'must_change_password' is distinct from 'true'
    and auth.jwt()->'app_metadata'->>'must_change_password' is distinct from 'true'
$$;

create or replace function public.telegram_active_role(p_company uuid,p_user uuid) returns text
language sql stable security definer set search_path='' as $$
  select m.role from public.company_members m join auth.users u on u.id=m.user_id
  where exists(select 1 from public.companies c where c.id=p_company and c.account_status='active') and m.company_id=p_company and m.user_id=p_user and m.role in ('manager','supplier','customer')
    and u.raw_app_meta_data->>'must_change_password' is distinct from 'true'
    and not exists(select 1 from public.platform_admins where user_id=m.user_id)
$$;

create or replace function public.store_company_access(p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not public.is_platform_admin() and exists(select 1 from public.company_store_links l
 join public.stores s on s.id=l.store_id join public.companies c on c.id=l.company_id
 where c.account_status='active' and s.account_status='active' and l.company_id=p_company and l.active and s.owner_id=auth.uid())
$$;

create or replace function public.store_workspace() returns jsonb
language sql stable security definer set search_path='' as $$
  with mine as (
    select * from public.stores where owner_id=auth.uid() and account_status='active' and not public.is_platform_admin()
  ), orders as (
    select o.id,o.status,o.company_id,c.name as company_name,p.name as product,o.quantity,o.order_unit,o.order_total,
      o.created_at,o.order_number,o.expected_delivery_date,d.decision,d.note
    from mine m join public.customer_shops sh on sh.store_id=m.id
    join public.orders o on o.company_id=sh.company_id and o.shop_id=sh.id and o.direction='outbound'
    join public.companies c on c.id=o.company_id join public.products p on p.id=o.product_id
    left join public.store_delivery_decisions d on d.order_id=o.id
  ), debt as (
    select o.company_id,o.company_name,sum(r.total-r.received) as amount,min(r.due_on) as due_on,
      count(*) filter(where r.due_on<timezone('Asia/Tashkent',now())::date) as overdue
    from orders o join public.order_receivables r on r.order_id=o.id where r.total>r.received
    group by o.company_id,o.company_name
  ), clock as (
    select date_trunc('month',timezone('Asia/Tashkent',now())) as current_month
  ), spending as (
    select coalesce(sum(r.amount) filter(where r.reviewed_at >= c.current_month at time zone 'Asia/Tashkent'),0) as current_cost,
      coalesce(sum(r.amount) filter(where r.reviewed_at >= (c.current_month-interval '1 month') at time zone 'Asia/Tashkent'
        and r.reviewed_at < c.current_month at time zone 'Asia/Tashkent'),0) as previous_cost
    from orders o join public.receipt_submissions r on r.order_id=o.id and r.state='approved' cross join clock c
  )
  select jsonb_build_object(
    'profile',to_jsonb(m)-'owner_id',
    'companies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sector',c.sector,'active',l.active) order by c.name)
      from public.company_store_links l join public.companies c on c.id=l.company_id where l.store_id=m.id and l.active and c.account_status='active'),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc,o.id)
      from orders o),'[]'::jsonb),
    'debts',coalesce((select jsonb_agg(to_jsonb(d) order by d.due_on,d.company_name) from debt d),'[]'::jsonb),
    'stats',jsonb_build_object('monthly_expenses',sp.current_cost,'previous_expenses',sp.previous_cost,
      'change_percent',case when sp.previous_cost>0 then round((sp.current_cost-sp.previous_cost)*100/sp.previous_cost,1) end,
      'active_orders',(select count(*) from orders where status in ('pending','approved','shipped')),
      'completed_orders',(select count(*) from orders where status in ('delivered','rejected')),
      'accepted_orders',(select count(*) from orders where decision='accepted'),
      'debt_total',(select coalesce(sum(amount),0) from debt),
      'late_orders',(select count(*) from orders where status in ('pending','approved','shipped') and expected_delivery_date<timezone('Asia/Tashkent',now())::date))
  ) from mine m cross join spending sp
$$;

create or replace function public.update_store_workspace(p_name text,p_legal_type text,p_legal_name text,p_phone text,p_address text,p_latitude numeric,p_longitude numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_store uuid;
begin
  if public.is_platform_admin() then raise exception 'Ruxsat yo‘q'; end if;
  select id into v_store from public.stores where owner_id=auth.uid() and account_status='active' for update;
  if not found then raise exception 'Do‘kon topilmadi yoki faol emas'; end if;
  if p_legal_type is null or p_legal_name is null or p_phone is null or p_address is null
    or p_latitude is null or p_longitude is null then raise exception 'Do‘kon ma’lumotlarini to‘liq kiriting'; end if;
  update public.stores set name=trim(p_name),legal_type=p_legal_type,legal_name=trim(p_legal_name),phone=trim(p_phone),
    address=trim(p_address),latitude=p_latitude,longitude=p_longitude where id=v_store;
  update public.customer_shops set name=trim(p_name),legal_type=p_legal_type,legal_name=trim(p_legal_name),phone=trim(p_phone),
    address=trim(p_address),latitude=p_latitude,longitude=p_longitude where store_id=v_store;
end
$$;

create or replace function public.allow_store_ai_chat() returns text
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or public.is_platform_admin() or not exists(select 1 from public.stores where owner_id=auth.uid() and account_status='active') then
    raise exception 'Ruxsat yo‘q' using errcode='42501';
  end if;
  insert into public.ai_chat_requests as limits(user_id,requested_at) values(auth.uid(),now())
  on conflict(user_id) do update set requested_at=excluded.requested_at where limits.requested_at<=now()-interval '10 seconds';
  if not found then return null; end if;
  return 'store';
end
$$;

create or replace function public.decide_store_delivery(p_order uuid,p_accept boolean,p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_accept is null or public.is_platform_admin() or not exists(
    select 1 from public.orders o join public.customer_shops sh on sh.id=o.shop_id and sh.company_id=o.company_id
    join public.stores s on s.id=sh.store_id where o.id=p_order and o.direction='outbound' and o.status='delivered' and s.owner_id=auth.uid() and s.account_status='active'
      and exists(select 1 from public.companies c where c.id=o.company_id and c.account_status='active')
  ) then raise exception 'Faqat yetkazilgan o‘z buyurtmangizni tekshira olasiz'; end if;
  insert into public.store_delivery_decisions(order_id,decision,note)
  values(p_order,case when p_accept then 'accepted' else 'rejected' end,nullif(trim(p_note),''))
  on conflict(order_id) do nothing;
  if not found then raise exception 'Bu buyurtma allaqachon ko‘rib chiqilgan'; end if;
end
$$;

create or replace function public.offer_store_directory(p_company uuid,p_region text,p_area integer default null)
returns table(id uuid,name text,locality text)
language sql stable security definer set search_path='' as $$
 select s.id,s.name,a.locality from public.stores s join public.store_areas a on a.id=s.area_id
 where public.company_role(p_company) in ('owner','manager') and s.account_status='active' and a.region=p_region
 and (p_area is null or a.id=p_area)
 order by s.name,s.id
$$;

create or replace function public.send_store_offer(p_company uuid,p_store uuid,p_message text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.company_role(p_company),'') not in ('owner','manager') then
   raise exception 'Ruxsat yo‘q' using errcode='42501';
 end if;
 if not exists(select 1 from public.stores where id=p_store and account_status='active' and area_id is not null) then
   raise exception 'Do‘kon topilmadi';
 end if;
 insert into public.store_offers(company_id,store_id,message) values(p_company,p_store,trim(p_message));
end $$;

create or replace function public.reply_store_offer(p_offer uuid,p_reply text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_reply is null or char_length(trim(p_reply)) not between 1 and 2000 then raise exception 'Javob matnini kiriting'; end if;
 update public.store_offers o set reply=trim(p_reply),replied_at=now()
 where o.id=p_offer and o.reply is null and not public.is_platform_admin()
 and exists(select 1 from public.stores s where s.id=o.store_id and s.owner_id=auth.uid() and s.account_status='active');
 if not found then raise exception 'Taklif topilmadi yoki javob yuborilgan'; end if;
end $$;

alter function public.store_telegram_bot_data(text,text) rename to store_telegram_bot_data_unfiltered;
revoke execute on function public.store_telegram_bot_data_unfiltered(text,text) from public,anon,authenticated,service_role;
create function public.store_telegram_bot_data(p_chat text,p_command text) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.store_telegram_bot_data_unfiltered(p_chat,p_command)
 where exists(select 1 from public.store_telegram_links l join public.stores s on s.owner_id=l.user_id
  where l.chat_id=p_chat and s.account_status='active')
$$;
revoke execute on function public.store_telegram_bot_data(text,text) from public,anon,authenticated;
grant execute on function public.store_telegram_bot_data(text,text) to service_role;

create function public.block_inactive_business_checkout() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.companies where id=new.company_id and account_status='active' for share)
 or exists(select 1 from public.customer_shops sh join public.stores s on s.id=sh.store_id
   where sh.id=new.shop_id and sh.company_id=new.company_id and s.account_status<>'active' for share of s)
 then raise exception 'Korxona yoki do‘kon vaqtincha faol emas'; end if;
 return new;
end $$;
revoke execute on function public.block_inactive_business_checkout() from public,anon,authenticated;
create trigger block_inactive_business_checkout before insert on public.orders
for each row execute function public.block_inactive_business_checkout();
create or replace function public.link_store_by_code(p_company uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare v_store public.stores;
begin
  if public.company_role(p_company) is distinct from 'customer' then raise exception 'Ruxsat yo‘q'; end if;
  select * into v_store from public.stores where account_status='active' and code=upper(trim(p_code)) for share;
  if not found then raise exception 'Bu ID bo‘yicha do‘kon topilmadi'; end if;
  if v_store.address is null then raise exception 'Do‘kon egasi avval profilini to‘ldirishi kerak'; end if;
  insert into public.company_store_links(company_id,store_id,linked_by) values(p_company,v_store.id,auth.uid())
  on conflict(company_id,store_id) do nothing;
  if not exists(select 1 from public.company_store_links where company_id=p_company and store_id=v_store.id and active) then
    raise exception 'Firma bu do‘kon bilan aloqani uzgan. Menejerga murojaat qiling.';
  end if;
  insert into public.customer_shops(company_id,created_by,name,legal_type,legal_name,phone,address,latitude,longitude,store_id)
  values(p_company,auth.uid(),v_store.name,v_store.legal_type,v_store.legal_name,v_store.phone,v_store.address,v_store.latitude,v_store.longitude,v_store.id)
  on conflict(company_id,created_by,store_id) where store_id is not null do nothing;
end
$$;
notify pgrst,'reload schema';
commit;
