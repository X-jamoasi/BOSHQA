begin;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(replace(gen_random_uuid()::text,'-','')),
  owner_id uuid not null unique references auth.users(id),
  name text not null check (char_length(trim(name)) between 2 and 100),
  legal_type text check (legal_type in ('yatt','mchj')),
  legal_name text check (char_length(trim(legal_name)) between 2 and 150),
  phone text check (phone ~ '^[+][1-9][0-9]{7,14}$'),
  address text check (char_length(trim(address)) between 5 and 250),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180)
);
create table public.company_store_links (
  company_id uuid not null references public.companies(id),
  store_id uuid not null references public.stores(id),
  linked_by uuid not null references auth.users(id),
  active boolean not null default true,
  linked_at timestamptz not null default now(),
  primary key(company_id,store_id)
);
alter table public.customer_shops add column store_id uuid references public.stores(id);
create unique index company_agent_store on public.customer_shops(company_id,created_by,store_id) where store_id is not null;
create index on public.customer_shops(store_id);
alter table public.orders add column expected_delivery_date date;
create index orders_store_shop on public.orders(shop_id) where direction='outbound';
grant select(expected_delivery_date) on public.orders to authenticated;
create table public.store_delivery_decisions (
  order_id uuid primary key references public.orders(id),
  decision text not null check (decision in ('accepted','rejected')),
  note text check (char_length(note) <= 500),
  decided_at timestamptz not null default now()
);
alter table public.stores enable row level security;
alter table public.company_store_links enable row level security;
alter table public.store_delivery_decisions enable row level security;
revoke all on public.stores,public.company_store_links,public.store_delivery_decisions from public,anon,authenticated;

create function public.ensure_store_workspace() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_meta jsonb; v_store uuid;
begin
  if v_user is null or public.is_platform_admin() then return null; end if;
  select raw_app_meta_data into v_meta from auth.users where id=v_user for update;
  if v_meta->>'boshqa_kind' is distinct from 'store' then return null; end if;
  select id into v_store from public.stores where owner_id=v_user;
  if v_store is null then
    insert into public.stores(owner_id,name) values(v_user,trim(v_meta->>'store_name')) returning id into v_store;
  end if;
  return v_store;
end
$$;

create function public.update_store_workspace(p_name text,p_legal_type text,p_legal_name text,p_phone text,p_address text,p_latitude numeric,p_longitude numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_store uuid;
begin
  if public.is_platform_admin() then raise exception 'Ruxsat yo‘q'; end if;
  select id into v_store from public.stores where owner_id=auth.uid() for update;
  if not found then raise exception 'Do‘kon topilmadi'; end if;
  if p_legal_type is null or p_legal_name is null or p_phone is null or p_address is null
    or p_latitude is null or p_longitude is null then raise exception 'Do‘kon ma’lumotlarini to‘liq kiriting'; end if;
  update public.stores set name=trim(p_name),legal_type=p_legal_type,legal_name=trim(p_legal_name),phone=trim(p_phone),
    address=trim(p_address),latitude=p_latitude,longitude=p_longitude where id=v_store;
  update public.customer_shops set name=trim(p_name),legal_type=p_legal_type,legal_name=trim(p_legal_name),phone=trim(p_phone),
    address=trim(p_address),latitude=p_latitude,longitude=p_longitude where store_id=v_store;
end
$$;

create function public.link_store_by_code(p_company uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare v_store public.stores;
begin
  if public.company_role(p_company) is distinct from 'customer' then raise exception 'Ruxsat yo‘q'; end if;
  select * into v_store from public.stores where code=upper(trim(p_code)) for share;
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

create function public.company_store_connections(p_company uuid)
returns table(store_id uuid,name text,legal_name text,active boolean)
language sql stable security definer set search_path='' as $$
  select s.id,s.name,s.legal_name,l.active from public.company_store_links l join public.stores s on s.id=l.store_id
  where l.company_id=p_company and public.company_role(p_company) in ('owner','manager') order by s.name
$$;

create function public.set_company_store_connection(p_company uuid,p_store uuid,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if public.company_role(p_company) is distinct from 'manager' then raise exception 'Aloqani faqat firma menejeri boshqaradi'; end if;
  update public.company_store_links set active=p_active where company_id=p_company and store_id=p_store;
  if not found then raise exception 'Do‘kon aloqasi topilmadi'; end if;
end
$$;

create or replace function public.shop_directory(p_company uuid)
returns table(id uuid, name text, legal_type text, legal_name text, phone text, address text, latitude numeric, longitude numeric, agent text)
language sql stable security definer set search_path = '' as $$
  select s.id,s.name,s.legal_type,s.legal_name,s.phone,s.address,s.latitude,s.longitude,
    coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.raw_app_meta_data->>'login',split_part(u.email,'@',1),'Noma’lum')
  from public.customer_shops s join auth.users u on u.id=s.created_by
  left join public.company_store_links l on l.company_id=s.company_id and l.store_id=s.store_id
  where s.company_id=p_company and (public.company_role(p_company) in ('owner','manager')
    or (public.company_role(p_company)='customer' and s.created_by=auth.uid()))
    and (s.store_id is null or l.active)
  order by s.created_at desc,s.id
$$;

-- Keep old shop records and orders usable. New agent links come from registered store IDs.
revoke execute on function public.add_customer_shop(uuid,text,text,text,text,text,numeric,numeric) from public,anon,authenticated;

create function public.check_store_order_link() returns trigger
language plpgsql set search_path='' as $$
declare v_store uuid; v_active boolean;
begin
  if new.shop_id is not null then
    select store_id into v_store from public.customer_shops where id=new.shop_id and company_id=new.company_id;
    if v_store is not null then
      select active into v_active from public.company_store_links
      where company_id=new.company_id and store_id=v_store for share;
      if v_active is distinct from true then raise exception 'Do‘kon va firma o‘rtasidagi aloqa faol emas'; end if;
    end if;
  end if;
  return new;
end
$$;
revoke execute on function public.check_store_order_link() from public,anon,authenticated;
create trigger check_store_order_link before insert on public.orders for each row execute function public.check_store_order_link();

create function public.approve_shop_delivery(p_company uuid,p_order uuid,p_supplier uuid,p_expected date)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.company_role(p_company),'') not in ('owner','manager') then raise exception 'Ruxsat yo‘q'; end if;
  if not exists(select 1 from public.orders where id=p_order and company_id=p_company and direction='outbound') then raise exception 'Buyurtma topilmadi'; end if;
  perform public.advance_order(p_order,'approved',p_supplier);
  update public.orders set expected_delivery_date=p_expected where id=p_order and company_id=p_company;
end
$$;

create function public.decide_store_delivery(p_order uuid,p_accept boolean,p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_accept is null or public.is_platform_admin() or not exists(
    select 1 from public.orders o join public.customer_shops sh on sh.id=o.shop_id and sh.company_id=o.company_id
    join public.stores s on s.id=sh.store_id where o.id=p_order and o.direction='outbound' and o.status='delivered' and s.owner_id=auth.uid()
  ) then raise exception 'Faqat yetkazilgan o‘z buyurtmangizni tekshira olasiz'; end if;
  insert into public.store_delivery_decisions(order_id,decision,note)
  values(p_order,case when p_accept then 'accepted' else 'rejected' end,nullif(trim(p_note),''))
  on conflict(order_id) do nothing;
  if not found then raise exception 'Bu buyurtma allaqachon ko‘rib chiqilgan'; end if;
end
$$;

create function public.company_store_delivery_decisions(p_company uuid)
returns table(order_id uuid,decision text,note text)
language sql stable security definer set search_path='' as $$
  select d.order_id,d.decision,d.note from public.store_delivery_decisions d join public.orders o on o.id=d.order_id
  where o.company_id=p_company and (public.company_role(p_company) in ('owner','manager')
    or (public.company_role(p_company)='supplier' and o.supplier_id=auth.uid())
    or (public.company_role(p_company)='customer' and o.customer_id=auth.uid()))
  order by o.created_at desc,o.id
$$;

create function public.store_workspace() returns jsonb
language sql stable security definer set search_path='' as $$
  with mine as (
    select * from public.stores where owner_id=auth.uid() and not public.is_platform_admin()
  ), orders as (
    select o.id,o.status,o.company_id,c.name as company_name,p.name as product,o.quantity,o.order_unit,o.order_total,
      o.created_at,o.expected_delivery_date,d.decision,d.note
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
      from public.company_store_links l join public.companies c on c.id=l.company_id where l.store_id=m.id and l.active),'[]'::jsonb),
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

create function public.allow_store_ai_chat() returns text
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or public.is_platform_admin() or not exists(select 1 from public.stores where owner_id=auth.uid()) then
    raise exception 'Ruxsat yo‘q' using errcode='42501';
  end if;
  insert into public.ai_chat_requests as limits(user_id,requested_at) values(auth.uid(),now())
  on conflict(user_id) do update set requested_at=excluded.requested_at where limits.requested_at<=now()-interval '10 seconds';
  if not found then return null; end if;
  return 'store';
end
$$;

revoke execute on function public.ensure_store_workspace(),public.update_store_workspace(text,text,text,text,text,numeric,numeric),
 public.link_store_by_code(uuid,text),public.company_store_connections(uuid),public.set_company_store_connection(uuid,uuid,boolean),
 public.approve_shop_delivery(uuid,uuid,uuid,date),public.decide_store_delivery(uuid,boolean,text),
 public.company_store_delivery_decisions(uuid),public.store_workspace(),public.allow_store_ai_chat() from public,anon,authenticated;
grant execute on function public.ensure_store_workspace(),public.update_store_workspace(text,text,text,text,text,numeric,numeric),
 public.link_store_by_code(uuid,text),public.company_store_connections(uuid),public.set_company_store_connection(uuid,uuid,boolean),
 public.approve_shop_delivery(uuid,uuid,uuid,date),public.decide_store_delivery(uuid,boolean,text),
 public.company_store_delivery_decisions(uuid),public.store_workspace(),public.allow_store_ai_chat() to authenticated;

create table public.store_telegram_links (
  user_id uuid primary key references public.stores(owner_id) on delete cascade,
  chat_id text unique, link_hash text unique, link_expires_at timestamptz,
  check ((link_hash is null)=(link_expires_at is null))
);
alter table public.store_telegram_links enable row level security;
revoke all on public.store_telegram_links from public,anon,authenticated;
grant select,delete on public.store_telegram_links to service_role;

create function public.prepare_store_telegram_link(p_user uuid,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or not exists(select 1 from public.stores where owner_id=p_user)
    or exists(select 1 from public.platform_admins where user_id=p_user) then return false; end if;
  insert into public.store_telegram_links as links(user_id,link_hash,link_expires_at)
  values(p_user,p_hash,now()+interval '15 minutes')
  on conflict(user_id) do update set link_hash=excluded.link_hash,link_expires_at=excluded.link_expires_at where links.chat_id is null;
  return found;
end
$$;

create or replace function public.link_shared_telegram_chat(p_chat text,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_chat is null or p_chat !~ '^[1-9][0-9]{0,15}$' then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_chat,48931));
  if exists(select 1 from public.store_telegram_links where chat_id=p_chat) then return false; end if;
  update public.shared_telegram_links set chat_id=p_chat,link_hash=null,link_expires_at=null
  where chat_id is null and link_hash=p_hash and link_expires_at>now()
    and public.telegram_active_role(company_id,user_id) is not null;
  return found;
exception when unique_violation then return false;
end
$$;

create function public.link_store_telegram_chat(p_chat text,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_chat is null or p_chat !~ '^[1-9][0-9]{0,15}$' then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_chat,48931));
  if exists(select 1 from public.shared_telegram_links where chat_id=p_chat) then return false; end if;
  update public.store_telegram_links as l set chat_id=p_chat,link_hash=null,link_expires_at=null
  where l.chat_id is null and l.link_hash=p_hash and l.link_expires_at>now()
    and not exists(select 1 from public.platform_admins a where a.user_id=l.user_id);
  return found;
exception when unique_violation then return false;
end
$$;

create function public.store_telegram_bot_data(p_chat text,p_command text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('role','store','items',case
    when p_command='orders' then coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select p.name as product,o.quantity,o.order_unit,o.status,c.name as shop_name
        from public.customer_shops sh join public.orders o on o.shop_id=sh.id and o.company_id=sh.company_id
        join public.products p on p.id=o.product_id join public.companies c on c.id=o.company_id
        where sh.store_id=s.id and o.direction='outbound' order by o.created_at desc limit 5
      ) x),'[]'::jsonb)
    when p_command='debts' then coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select c.name as shop_name,sum(r.total-r.received) as balance,min(r.due_on) as due_on,
          bool_or(r.due_on<timezone('Asia/Tashkent',now())::date) as overdue
        from public.customer_shops sh join public.orders o on o.shop_id=sh.id and o.company_id=sh.company_id
        join public.companies c on c.id=o.company_id join public.order_receivables r on r.order_id=o.id
        where sh.store_id=s.id and o.direction='outbound' and r.received<r.total
        group by c.id,c.name order by due_on limit 10
      ) x),'[]'::jsonb)
    else null end)
  from public.store_telegram_links l join public.stores s on s.owner_id=l.user_id
  where l.chat_id=p_chat and not exists(select 1 from public.platform_admins where user_id=l.user_id)
$$;

revoke execute on function public.prepare_store_telegram_link(uuid,text),public.link_store_telegram_chat(text,text),
 public.store_telegram_bot_data(text,text) from public,anon,authenticated;
grant execute on function public.prepare_store_telegram_link(uuid,text),public.link_store_telegram_chat(text,text),
 public.store_telegram_bot_data(text,text) to service_role;
notify pgrst,'reload schema';
commit;
