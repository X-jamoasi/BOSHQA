begin;
alter table public.receipt_submissions add column payment_group uuid;
create function public.submit_group_receipt(p_company uuid,p_order uuid,p_amount numeric,p_total numeric,p_due date,p_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare n bigint; line record; remaining numeric:=p_amount; allocated numeric; k uuid;
begin
 select order_number into n from public.orders where id=p_order and company_id=p_company;
 if not found or p_request is null or p_amount is null or p_amount<0 or p_amount>999999999999999999.99 or round(p_amount,2)<>p_amount then
   raise exception 'Buyurtma yoki summa yaroqsiz';
 end if;
 if coalesce(public.company_role(p_company),'') not in ('owner','manager','supplier') then raise exception 'Ruxsat yo‘q'; end if;
 perform 1 from public.orders where company_id=p_company and order_number=n order by id for update;
 if p_total is not null and (select count(*) from public.orders where company_id=p_company and order_number=n)>1
 then raise exception 'Har bir mahsulot narxi buyurtmada qayd etilgan bo‘lishi kerak'; end if;
 for line in select o.id,coalesce(r.total,o.order_total,p_total)-coalesce(r.received,0) as balance
 from public.orders o left join public.order_receivables r on r.order_id=o.id
 where o.company_id=p_company and o.order_number=n order by o.id loop
   k:=md5(p_request::text||line.id::text)::uuid;
   if exists(select 1 from public.receipt_submissions where id=k and order_id=line.id and sent_by=auth.uid()) then
     select remaining-amount into remaining from public.receipt_submissions where id=k;
   else
     if line.balance is null then raise exception 'Buyurtma narxi topilmadi'; end if;
     allocated:=least(remaining,line.balance);
     perform public.submit_order_receipt(p_company,line.id,allocated,p_total,p_due,k);
     update public.receipt_submissions set payment_group=p_request where id=k;
     remaining:=remaining-allocated;
   end if;
 end loop;
 if remaining<>0 then raise exception 'To‘lov buyurtmaning qolgan summasiga mos emas'; end if;
end $$;
create function public.review_group_receipt(p_company uuid,p_submission uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare g uuid; n bigint; line record;
begin
 if coalesce(public.company_role(p_company),'') not in ('owner','manager') then raise exception 'Ruxsat yo‘q'; end if;
 select s.payment_group,o.order_number into g,n from public.receipt_submissions s join public.orders o on o.id=s.order_id
 where s.id=p_submission and o.company_id=p_company;
 if not found then raise exception 'To‘lov yozuvi topilmadi'; end if;
 perform 1 from public.orders where company_id=p_company and order_number=n order by id for update;
 for line in select s.id from public.receipt_submissions s join public.orders o on o.id=s.order_id
 where o.company_id=p_company and o.order_number=n and (s.id=p_submission or s.payment_group=g)
 order by o.id loop
   perform public.review_order_receipt(p_company,line.id,p_accept);
 end loop;
end $$;
create function public.group_receipt_metadata(p_company uuid)
returns table(order_id uuid,order_number bigint,payment_group uuid)
language sql stable security definer set search_path='' as $$
 select r.order_id,o.order_number,s.payment_group from public.company_receivables(p_company) r
 join public.orders o on o.id=r.order_id left join public.receipt_submissions s on s.id=r.pending_id
$$;

create function public.inventory_coverage(p_company uuid)
returns table(id uuid,name text,unit text,stock integer,minimum integer,delivered_7d bigint,coverage_days numeric)
language sql stable security definer set search_path='' as $$
 with sales as (
 select o.product_id,sum(o.quantity) quantity from public.orders o
 where o.company_id=p_company and o.direction='outbound' and o.status='delivered'
 and o.delivered_at>=((timezone('Asia/Tashkent',now())::date-7)::timestamp at time zone 'Asia/Tashkent')
 and o.delivered_at<(timezone('Asia/Tashkent',now())::date::timestamp at time zone 'Asia/Tashkent')
 group by o.product_id)
 select p.id,p.name,p.unit,p.stock,p.minimum,coalesce(s.quantity,0),
 case when p.stock=0 then 0 when s.quantity>0 and c.registered_at<=now()-interval '8 days'
 then round(p.stock::numeric*7/s.quantity,1) end
 from public.products p join public.companies c on c.id=p.company_id left join sales s on s.product_id=p.id
 where p.company_id=p_company and public.company_role(p_company) in ('owner','manager')
 order by (p.stock<=p.minimum) desc,7 asc nulls last,p.id
$$;
revoke execute on function public.submit_group_receipt(uuid,uuid,numeric,numeric,date,uuid),public.review_group_receipt(uuid,uuid,boolean),
 public.group_receipt_metadata(uuid),public.inventory_coverage(uuid) from public,anon;
grant execute on function public.submit_group_receipt(uuid,uuid,numeric,numeric,date,uuid),public.review_group_receipt(uuid,uuid,boolean),
 public.group_receipt_metadata(uuid),public.inventory_coverage(uuid) to authenticated;

create table public.order_notifications (
 event text not null, order_number bigint not null, company_id uuid not null,
 user_id uuid not null, store_chat boolean not null default false,
 created_at timestamptz not null default now(), next_attempt timestamptz not null default now(),
 delivered_at timestamptz, primary key(event,order_number,user_id,store_chat)
);
alter table public.order_notifications enable row level security;
revoke all on public.order_notifications from public,anon,authenticated;
grant select,update on public.order_notifications to service_role;

create function public.queue_order_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.direction<>'outbound' then return new; end if;
 if tg_op='INSERT' then
   insert into public.order_notifications(event,order_number,company_id,user_id)
   select 'new',new.order_number,new.company_id,m.user_id from public.company_members m
   where m.company_id=new.company_id and m.role='manager' on conflict do nothing;
 elsif new.status is distinct from old.status then
   if new.status='approved' and new.supplier_id is not null then
     insert into public.order_notifications(event,order_number,company_id,user_id)
     values('assigned',new.order_number,new.company_id,new.supplier_id) on conflict do nothing;
   elsif new.status='delivered' then
     insert into public.order_notifications(event,order_number,company_id,user_id,store_chat)
     select 'delivered',new.order_number,new.company_id,s.owner_id,true
     from public.customer_shops sh join public.stores s on s.id=sh.store_id
     where sh.id=new.shop_id and sh.company_id=new.company_id on conflict do nothing;
   end if;
 end if;
 return new;
end $$;
create trigger queue_order_notification after insert or update of status on public.orders
for each row execute function public.queue_order_notification();

create function public.claim_order_notifications()
returns table(event text,order_number bigint,user_id uuid,store_chat boolean,chat_id text)
language plpgsql security definer set search_path='' as $$
begin
 insert into public.order_notifications(event,order_number,company_id,user_id,store_chat)
 select 'due:'||r.due_on,o.order_number,o.company_id,s.owner_id,true
 from public.order_receivables r join public.orders o on o.id=r.order_id
 join public.customer_shops sh on sh.id=o.shop_id and sh.company_id=o.company_id
 join public.stores s on s.id=sh.store_id
 where r.received<r.total and r.due_on between timezone('Asia/Tashkent',now())::date and timezone('Asia/Tashkent',now())::date+2
 on conflict do nothing;
 return query
 with ready as (
  select n.event,n.order_number,n.user_id,n.store_chat,coalesce(sl.chat_id,cl.chat_id) chat
  from public.order_notifications n
  left join public.store_telegram_links sl on n.store_chat and sl.user_id=n.user_id
  left join public.shared_telegram_links cl on not n.store_chat and cl.company_id=n.company_id and cl.user_id=n.user_id
    and public.telegram_active_role(cl.company_id,cl.user_id)=case n.event when 'new' then 'manager' else 'supplier' end
  where n.delivered_at is null and n.next_attempt<=now() and n.created_at>now()-interval '3 days'
  and coalesce(sl.chat_id,cl.chat_id) is not null
  and (n.event<>'delivered' or not exists(select 1 from public.orders o
    where o.company_id=n.company_id and o.order_number=n.order_number and o.status<>'delivered'))
  and (not n.store_chat or not exists(select 1 from public.platform_admins pa where pa.user_id=n.user_id))
  and (n.event not like 'due:%' or exists(select 1 from public.orders o join public.order_receivables r on r.order_id=o.id
    where o.order_number=n.order_number and o.company_id=n.company_id and r.received<r.total and n.event='due:'||r.due_on))
  order by n.created_at limit 20 for update of n skip locked
 ), claimed as (
  update public.order_notifications n set next_attempt=now()+interval '5 minutes' from ready q
  where (n.event,n.order_number,n.user_id,n.store_chat)=(q.event,q.order_number,q.user_id,q.store_chat)
  returning n.event,n.order_number,n.user_id,n.store_chat,q.chat
 )
 select * from claimed;
end $$;
revoke execute on function public.queue_order_notification(),public.claim_order_notifications() from public,anon,authenticated;
grant execute on function public.claim_order_notifications() to service_role;
notify pgrst,'reload schema';
commit;
