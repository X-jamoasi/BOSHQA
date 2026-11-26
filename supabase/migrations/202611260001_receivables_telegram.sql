begin;
create table public.order_receivables (
  order_id uuid primary key references public.orders(id),
  total numeric(20,2) not null check (total >= 0),
  received numeric(20,2) not null check (received >= 0 and received <= total),
  due_on date,
  check ((received = total and due_on is null) or (received < total and due_on is not null))
);
create table public.receipt_submissions (
  id uuid primary key,
  order_id uuid not null references public.orders(id),
  sent_by uuid not null references auth.users(id),
  amount numeric(20,2) not null check (amount >= 0),
  proposed_total numeric(20,2),
  due_on date,
  state text not null check (state in ('pending','approved','rejected')),
  sent_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);
create unique index one_pending_receipt on public.receipt_submissions(order_id) where state='pending';
create index on public.receipt_submissions(order_id,sent_at desc);
alter table public.order_receivables enable row level security;
alter table public.receipt_submissions enable row level security;
revoke all on public.order_receivables,public.receipt_submissions from public,anon,authenticated;

create function public.apply_order_receipt(p_order uuid,p_amount numeric,p_total numeric,p_due date)
returns void language plpgsql set search_path='' as $$
declare
  v_total numeric;
  v_received numeric;
begin
  select coalesce(r.total,o.order_total,p_total),coalesce(r.received,0)+p_amount into v_total,v_received
  from public.orders o left join public.order_receivables r on r.order_id=o.id where o.id=p_order;
  if v_total is null or v_total < 0 or v_received > v_total then
    raise exception 'Buyurtma summasi yoki olingan pul miqdori yaroqsiz';
  end if;
  if v_received < v_total and p_due is null then raise exception 'Qolgan qarz uchun oxirgi sanani kiriting'; end if;
  insert into public.order_receivables values(p_order,v_total,v_received,case when v_received < v_total then p_due end)
  on conflict(order_id) do update set received=excluded.received,due_on=excluded.due_on;
end
$$;
revoke execute on function public.apply_order_receipt(uuid,numeric,numeric,date) from public,anon,authenticated;

create function public.submit_order_receipt(p_company uuid,p_order uuid,p_amount numeric,p_total numeric,p_due date,p_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_role text := public.company_role(p_company);
  v_order public.orders;
  v_account public.order_receivables;
  v_total numeric;
begin
  select * into v_order from public.orders where id=p_order and company_id=p_company for update;
  if not found or coalesce(v_role,'') not in ('owner','manager','supplier')
    or (v_role='supplier' and v_order.supplier_id is distinct from auth.uid())
    or v_order.status <> 'delivered' or v_order.direction <> 'outbound' then raise exception 'Bu to‘lov uchun ruxsat yo‘q'; end if;
  if exists(select 1 from public.receipt_submissions where id=p_request and order_id=p_order and sent_by=auth.uid()) then return; end if;
  if p_amount is null or p_amount not between 0 and 999999999999999999.99 or round(p_amount,2) <> p_amount or
    (p_total is not null and (p_total not between 0 and 999999999999999999.99 or round(p_total,2) <> p_total)) then raise exception 'Summani to‘g‘ri kiriting'; end if;
  if exists(select 1 from public.receipt_submissions where order_id=p_order and state='pending') then
    raise exception 'Avval tasdiq kutilayotgan yozuvni ko‘rib chiqing';
  end if;
  select * into v_account from public.order_receivables where order_id=p_order;
  v_total := coalesce(v_account.total,v_order.order_total,p_total);
  if v_total is null or coalesce(v_account.received,0)+p_amount > v_total then
    raise exception 'Olingan pul buyurtma qoldig‘idan oshmasligi kerak. Eski buyurtma uchun to‘liq summani kiriting.';
  end if;
  if coalesce(v_account.received,0)+p_amount < v_total and p_due is null then
    raise exception 'Qolgan qarz uchun oxirgi sanani kiriting';
  end if;
  if v_role='supplier' then
    insert into public.receipt_submissions(id,order_id,sent_by,amount,proposed_total,due_on,state)
    values(p_request,p_order,auth.uid(),p_amount,v_total,p_due,'pending');
  else
    perform public.apply_order_receipt(p_order,p_amount,v_total,p_due);
    insert into public.receipt_submissions(id,order_id,sent_by,amount,proposed_total,due_on,state,reviewed_by,reviewed_at)
    values(p_request,p_order,auth.uid(),p_amount,v_total,p_due,'approved',auth.uid(),now());
  end if;
end
$$;

create function public.review_order_receipt(p_company uuid,p_submission uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_record public.receipt_submissions;
begin
  if coalesce(public.company_role(p_company),'') not in ('owner','manager') then raise exception 'Ruxsat yo‘q'; end if;
  perform 1 from public.orders o join public.receipt_submissions s on s.order_id=o.id
  where s.id=p_submission and o.company_id=p_company for update of o;
  if not found then raise exception 'To‘lov yozuvi topilmadi'; end if;
  select * into v_record from public.receipt_submissions where id=p_submission;
  if v_record.state <> 'pending' or p_accept is null then raise exception 'Bu yozuv allaqachon ko‘rib chiqilgan'; end if;
  if p_accept then perform public.apply_order_receipt(v_record.order_id,v_record.amount,v_record.proposed_total,v_record.due_on); end if;
  update public.receipt_submissions set state=case when p_accept then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),reviewed_at=now() where id=p_submission;
end
$$;

create function public.company_receivables(p_company uuid)
returns table(order_id uuid,shop_name text,legal_name text,legal_type text,total numeric,received numeric,balance numeric,due_on date,
  state text,pending_id uuid,pending_amount numeric,pending_total numeric,pending_due date,last_submission text)
language sql stable security definer set search_path='' as $$
  select o.id,o.shop_name,s.legal_name,s.legal_type,coalesce(r.total,o.order_total),r.received,r.total-r.received,r.due_on,
    case when r.order_id is null then 'unrecorded' when r.received=r.total then 'paid'
      when r.due_on < timezone('Asia/Tashkent',now())::date then 'overdue' else 'due' end,
    a.id,a.amount,a.proposed_total,a.due_on,b.state
  from public.orders o
  left join public.customer_shops s on s.id=o.shop_id and s.company_id=o.company_id
  left join public.order_receivables r on r.order_id=o.id
  cross join lateral (select public.company_role(p_company) as role) access
  left join lateral (select q.id,q.amount,q.proposed_total,q.due_on from public.receipt_submissions q
    where q.order_id=o.id and q.state='pending' and access.role<>'customer' limit 1) a on true
  left join lateral (select q.state from public.receipt_submissions q where q.order_id=o.id and access.role<>'customer'
    order by q.sent_at desc,q.id desc limit 1) b on true
  where o.company_id=p_company and o.direction='outbound' and o.status='delivered'
    and (access.role in ('owner','manager') or (access.role='supplier' and o.supplier_id=auth.uid())
      or (access.role='customer' and o.customer_id=auth.uid() and r.order_id is not null))
  order by (r.due_on < timezone('Asia/Tashkent',now())::date and r.received < r.total) desc nulls last,
    (a.id is not null) desc,o.created_at desc,o.id
$$;

create function public.overdue_receivables_count(p_company uuid) returns bigint
language sql stable security definer set search_path='' as $$
  select count(*) from public.orders o join public.order_receivables r on r.order_id=o.id
  where o.company_id=p_company and public.company_role(p_company) in ('owner','manager')
    and r.received < r.total and r.due_on < timezone('Asia/Tashkent',now())::date
$$;

revoke execute on function public.submit_order_receipt(uuid,uuid,numeric,numeric,date,uuid),
  public.review_order_receipt(uuid,uuid,boolean),public.company_receivables(uuid),public.overdue_receivables_count(uuid)
  from public,anon,authenticated;
grant execute on function public.submit_order_receipt(uuid,uuid,numeric,numeric,date,uuid),
  public.review_order_receipt(uuid,uuid,boolean),public.company_receivables(uuid),public.overdue_receivables_count(uuid)
  to authenticated;

create function public.company_payment_summary(p_company uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  with clock as (select timezone('Asia/Tashkent',now())::date as today),
  periods as (select p.* from clock cross join lateral (values
    ('bugun',today),('kecha',today-1),('oxirgi_7_kun',today-6),('oxirgi_30_kun',today-29),
    ('shu_oy',date_trunc('month',today::timestamp)::date)) p(label,start_day)),
  payments as (
    select round(coalesce(sum(s.amount),0),2) as total,count(s.id) as count,p.label
    from periods p
    left join (public.receipt_submissions s join public.orders o on o.id=s.order_id and o.company_id=p_company)
      on s.state='approved' and s.amount>0
      and s.reviewed_at >= p.start_day::timestamp at time zone 'Asia/Tashkent'
      and (p.label <> 'kecha' or s.reviewed_at < (p.start_day+1)::timestamp at time zone 'Asia/Tashkent')
    group by p.label
  )
  select case when public.company_role(p_company)='owner' then
    jsonb_object_agg(label,jsonb_build_object('tasdiqlangan_tolovlar_summasi',total,'yozuvlar_soni',count)) end from payments
$$;
revoke execute on function public.company_payment_summary(uuid) from public,anon,authenticated;
grant execute on function public.company_payment_summary(uuid) to authenticated;

create table public.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  bot_id text not null unique,
  bot_username text not null,
  token_ciphertext text not null,
  webhook_hash text not null,
  link_hash text,
  link_expires_at timestamptz,
  chat_id text,
  unique(company_id,user_id),
  foreign key(company_id,user_id) references public.company_members(company_id,user_id) on delete cascade
);
alter table public.telegram_connections enable row level security;
revoke all on public.telegram_connections from public,anon,authenticated;
grant select,insert,update,delete on public.telegram_connections to service_role;

create function public.telegram_active_role(p_company uuid,p_user uuid) returns text
language sql stable security definer set search_path='' as $$
  select m.role from public.company_members m join auth.users u on u.id=m.user_id
  where m.company_id=p_company and m.user_id=p_user and m.role in ('manager','supplier','customer')
    and u.raw_app_meta_data->>'must_change_password' is distinct from 'true'
    and not exists(select 1 from public.platform_admins where user_id=m.user_id)
$$;
revoke execute on function public.telegram_active_role(uuid,uuid) from public,anon,authenticated;

create function public.telegram_link_chat(p_id uuid,p_chat text,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.telegram_connections set chat_id=p_chat,link_hash=null,link_expires_at=null
  where id=p_id and chat_id is null and link_hash=p_hash and link_expires_at > now()
    and public.telegram_active_role(company_id,user_id) is not null;
  return found;
end
$$;

create function public.telegram_bot_data(p_id uuid,p_chat text,p_command text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_bot public.telegram_connections;
  v_role text;
  v_items jsonb;
begin
  select * into v_bot from public.telegram_connections where id=p_id and chat_id=p_chat;
  if not found then return null; end if;
  v_role := public.telegram_active_role(v_bot.company_id,v_bot.user_id);
  if v_role is null then return null; end if;
  if p_command = 'orders' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
    from (
      select p.name as product,o.quantity,o.order_unit,o.status,o.direction,o.shop_name,o.delivery_address,
        o.delivery_latitude,o.delivery_longitude,
        case when v_role='supplier' then s.phone end as shop_phone
      from public.orders o join public.products p on p.company_id=o.company_id and p.id=o.product_id
      left join public.customer_shops s on s.id=o.shop_id and s.company_id=o.company_id
      where o.company_id=v_bot.company_id and (v_role='manager'
        or (v_role='supplier' and o.supplier_id=v_bot.user_id and o.status <> 'pending')
        or (v_role='customer' and o.customer_id=v_bot.user_id))
      order by case when o.status in ('approved','shipped','pending') then 0 else 1 end,o.created_at desc,o.id
      limit 5
    ) x;
  elsif p_command='debts' and v_role in ('manager','customer') then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
    from (
      select o.shop_name,r.total-r.received as balance,r.due_on,
        r.due_on < timezone('Asia/Tashkent',now())::date as overdue
      from public.orders o join public.order_receivables r on r.order_id=o.id
      where o.company_id=v_bot.company_id and r.received<r.total
        and (v_role='manager' or o.customer_id=v_bot.user_id)
      order by r.due_on,o.id limit 10
    ) x;
  end if;
  return jsonb_build_object('role',v_role,'items',v_items);
end
$$;
revoke execute on function public.telegram_link_chat(uuid,text,text),public.telegram_bot_data(uuid,text,text) from public,anon,authenticated;
grant execute on function public.telegram_link_chat(uuid,text,text),public.telegram_bot_data(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
