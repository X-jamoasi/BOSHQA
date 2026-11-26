begin;
create sequence public.order_document_number;
alter table public.orders add column order_number bigint;
with groups as materialized (
 select company_id,coalesce(checkout_batch_id,id) as key,nextval('public.order_document_number') as number
 from public.orders group by company_id,coalesce(checkout_batch_id,id)
)
update public.orders o set order_number=g.number from groups g
where o.company_id=g.company_id and coalesce(o.checkout_batch_id,o.id)=g.key;
alter table public.orders alter column order_number set not null;
create index orders_document_lookup on public.orders(company_id,order_number);
grant select(order_number) on public.orders to authenticated;

create function public.assign_order_number() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 select o.order_number into new.order_number from public.orders o
 where new.checkout_batch_id is not null and o.company_id=new.company_id and o.checkout_batch_id=new.checkout_batch_id limit 1;
 new.order_number:=coalesce(new.order_number,nextval('public.order_document_number'));
 return new;
end $$;
create trigger assign_order_number before insert on public.orders
for each row execute function public.assign_order_number();

create table public.order_documents (
 company_id uuid not null references public.companies(id),
 order_number bigint not null,
 payload jsonb not null,
 primary key(company_id,order_number)
);
alter table public.order_documents enable row level security;
revoke all on public.order_documents from public,anon,authenticated;

create function public.capture_order_document(p_order public.orders,p_approved_at timestamptz) returns void
language sql security definer set search_path='' as $$
 insert into public.order_documents(company_id,order_number,payload)
 select c.id,p_order.order_number,jsonb_build_object(
  'number',p_order.order_number::text,'approved_at',p_approved_at,'created_at',p_order.created_at,
  'direction',p_order.direction,'company',c.name,'company_legal',concat_ws(' ',c.legal_name,c.legal_type),
  'company_address',c.legal_address,'company_contact',c.contact,
  'shop',coalesce(p_order.shop_name,sh.name),'shop_legal',concat_ws(' ',sh.legal_name,upper(sh.legal_type)),
  'shop_code',coalesce(s.code,sh.id::text),'shop_phone',sh.phone,'address',p_order.delivery_address,
  'agent_phone',coalesce(nullif(agent.raw_user_meta_data->>'profile_phone',''),agent.phone),
  'courier_phone',coalesce(nullif(courier.raw_user_meta_data->>'profile_phone',''),courier.phone),
  'items',lines.items,'total',lines.total
 )
 from public.companies c
 left join public.customer_shops sh on sh.company_id=c.id and sh.id=p_order.shop_id
 left join public.stores s on s.id=sh.store_id
 left join auth.users agent on agent.id=case when s.owner_id=p_order.customer_id then sh.created_by
  when p_order.direction='outbound' then p_order.customer_id end
 left join auth.users courier on courier.id=p_order.supplier_id
 cross join lateral (
  select jsonb_agg(jsonb_build_object('code',p.barcode,'name',p.name,'unit',coalesce(o.order_unit,p.unit),
   'quantity',o.quantity,'price',o.unit_price,'discount',o.discount_percent,'total',o.order_total) order by p.name,o.id) items,
   case when count(*)=count(o.order_total) then sum(o.order_total) end total
  from public.orders o join public.products p on p.id=o.product_id and p.company_id=o.company_id
  where o.company_id=c.id and o.order_number=p_order.order_number
 ) lines
 where c.id=p_order.company_id
 on conflict(company_id,order_number) do nothing
$$;

create function public.snapshot_approved_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.capture_order_document(new,now());
 return new;
end $$;
create trigger snapshot_approved_order after update of status on public.orders
for each row when (old.status='pending' and new.status='approved')
execute function public.snapshot_approved_order();

-- Historical confirmations have no approval timestamp. Keep their order date separate.
do $$
declare line public.orders;
begin
 for line in select distinct on (company_id,order_number) * from public.orders
 where status in ('approved','shipped','delivered') order by company_id,order_number,id loop
   perform public.capture_order_document(line,null);
 end loop;
end $$;

create function public.order_documents_for_user(p_company uuid default null,p_number bigint default null) returns setof jsonb
language sql stable security definer set search_path='' as $$
 select d.payload from public.order_documents d
 where auth.uid() is not null and not public.is_platform_admin()
 and (p_number is null or d.order_number=p_number)
 and (
  (p_company=d.company_id and (
    public.company_role(d.company_id) in ('owner','manager') or exists(
     select 1 from public.orders o where o.company_id=d.company_id and o.order_number=d.order_number
     and ((public.company_role(d.company_id)='supplier' and o.supplier_id=auth.uid())
       or (public.company_role(d.company_id)='customer' and o.customer_id=auth.uid()))
    )
  )) or (p_company is null and exists(
   select 1 from public.orders o join public.customer_shops sh on sh.id=o.shop_id and sh.company_id=o.company_id
   join public.stores s on s.id=sh.store_id
   where o.company_id=d.company_id and o.order_number=d.order_number and s.owner_id=auth.uid()
  ))
 )
 order by d.order_number desc
$$;
revoke execute on function public.assign_order_number(),public.capture_order_document(public.orders,timestamptz),
 public.snapshot_approved_order(),public.order_documents_for_user(uuid,bigint) from public,anon,authenticated;
grant execute on function public.order_documents_for_user(uuid,bigint) to authenticated;
create or replace function public.store_workspace() returns jsonb
language sql stable security definer set search_path='' as $$
  with mine as (
    select * from public.stores where owner_id=auth.uid() and not public.is_platform_admin()
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

notify pgrst,'reload schema';
commit;
