begin;
alter table public.products add column average_cost numeric(20,6) check(average_cost>=0);

create table public.inventory_operations (
 id uuid primary key, company_id uuid not null references public.companies(id),
 kind text not null check(kind in ('receipt','production','damage','expired','supplier_return','other','count')),
 reference text not null check(char_length(reference) between 1 and 100),
 reason text not null check(char_length(reason) between 1 and 500),
 operation_date date not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 approved_by uuid references auth.users(id), approved_at timestamptz,
 status text not null default 'draft' check(status in ('draft','approved','cancelled'))
);
create index inventory_operations_tenant on public.inventory_operations(company_id,created_at desc,id);
create table public.inventory_operation_lines (
 operation_id uuid not null references public.inventory_operations(id),
 product_id uuid not null references public.products(id), quantity integer not null check(quantity between 0 and 1000000),
 input_cost numeric(16,2) check(input_cost>=0), expected_stock integer not null,
 applied_delta integer, cost_before numeric(20,6), cost_after numeric(20,6),
 discrepancy_value numeric, primary key(operation_id,product_id)
);
alter table public.inventory_operations enable row level security;
alter table public.inventory_operation_lines enable row level security;
revoke all on public.inventory_operations,public.inventory_operation_lines from public,anon,authenticated;
grant select on public.inventory_operations,public.inventory_operation_lines to authenticated;
create policy inventory_operation_read on public.inventory_operations for select to authenticated
 using(public.company_role(company_id) in ('owner','manager'));
create policy inventory_operation_line_read on public.inventory_operation_lines for select to authenticated
 using(exists(select 1 from public.inventory_operations o where o.id=operation_id));

create function public.create_inventory_operation(p_company uuid,p_id uuid,p_kind text,p_reference text,p_reason text,p_date date,p_lines jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item record; quantity_on_hand integer;
begin
 if coalesce(public.company_role(p_company),'') not in ('owner','manager') then raise exception 'Ruxsat yo‘q' using errcode='42501'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Mahsulotlarni kiriting'; end if;
 if jsonb_array_length(p_lines) not between 1 and 100 then raise exception '1–100 ta mahsulot kiriting'; end if;
 insert into public.inventory_operations(id,company_id,kind,reference,reason,operation_date,created_by)
 values(p_id,p_company,p_kind,trim(p_reference),trim(p_reason),p_date,auth.uid()) on conflict do nothing;
 if not found then
  if exists(select 1 from public.inventory_operations where id=p_id and company_id=p_company and created_by=auth.uid()) then return; end if;
  raise exception 'Hujjat identifikatori band';
 end if;
 for item in select * from jsonb_to_recordset(p_lines) l(product uuid,quantity integer,cost numeric) loop
  select stock into quantity_on_hand from public.products where id=item.product and company_id=p_company;
  if not found then raise exception 'Mahsulot topilmadi'; end if;
  if (p_kind<>'count' and item.quantity<=0) or
    (p_kind='receipt' and (item.cost is null or item.cost<0 or round(item.cost,2)<>item.cost)) then
    raise exception 'Miqdor yoki xarid narxi yaroqsiz';
  end if;
  insert into public.inventory_operation_lines(operation_id,product_id,quantity,input_cost,expected_stock)
  values(p_id,item.product,item.quantity,case when p_kind='receipt' then item.cost end,quantity_on_hand);
 end loop;
end $$;

create function public.review_inventory_operation(p_company uuid,p_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare op public.inventory_operations; item record; product public.products; change_qty integer; cost numeric;
begin
 select * into op from public.inventory_operations where id=p_id and company_id=p_company for update;
 if not found or p_accept is null or coalesce(public.company_role(p_company),'') not in ('owner','manager')
   or (op.kind='count' and p_accept and public.company_role(p_company)<>'owner') then
   raise exception 'Ruxsat yo‘q' using errcode='42501';
 end if;
 if op.status<>'draft' then raise exception 'Hujjat ko‘rib chiqilgan'; end if;
 if p_accept then
  for item in select * from public.inventory_operation_lines where operation_id=p_id order by product_id loop
   select * into strict product from public.products where id=item.product_id and company_id=p_company for update;
   if op.kind='count' and product.stock<>item.expected_stock then raise exception 'Qoldiq o‘zgargan. Qayta sanang'; end if;
   change_qty:=case op.kind when 'count' then item.quantity-product.stock when 'receipt' then item.quantity else -item.quantity end;
   if product.stock+change_qty<0 then raise exception 'Omborda qoldiq yetarli emas'; end if;
   cost:=case when op.kind<>'receipt' then product.average_cost
     when product.stock=0 then item.input_cost
     when product.average_cost is null then null
     else round((product.stock*product.average_cost+item.quantity*item.input_cost)/(product.stock+item.quantity),6) end;
   update public.products set stock=stock+change_qty,average_cost=cost where id=product.id;
   update public.inventory_operation_lines set applied_delta=change_qty,cost_before=product.average_cost,cost_after=cost,
     discrepancy_value=case when op.kind='count' then product.average_cost*change_qty end
    where operation_id=p_id and product_id=item.product_id;
  end loop;
 end if;
 update public.inventory_operations set status=case when p_accept then 'approved' else 'cancelled' end,
   approved_by=auth.uid(),approved_at=now() where id=p_id;
end $$;
revoke execute on function public.create_inventory_operation(uuid,uuid,text,text,text,date,jsonb),public.review_inventory_operation(uuid,uuid,boolean) from public,anon;
grant execute on function public.create_inventory_operation(uuid,uuid,text,text,text,date,jsonb),public.review_inventory_operation(uuid,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
