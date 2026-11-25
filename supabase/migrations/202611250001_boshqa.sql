begin;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100)
);

create table public.company_members (
  company_id uuid not null references public.companies(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'supplier', 'customer')),
  primary key (company_id, user_id)
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null check (char_length(trim(name)) between 2 and 80),
  stock integer not null default 0 check (stock >= 0),
  minimum integer not null default 0 check (minimum >= 0),
  unique (company_id, id),
  unique (company_id, name)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  product_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000000),
  direction text not null check (direction in ('inbound', 'outbound')),
  delivery_address text not null check (char_length(trim(delivery_address)) between 5 and 250),
  status text not null default 'pending' check (status in ('pending', 'approved', 'shipped', 'delivered', 'rejected')),
  created_by uuid not null references auth.users(id),
  supplier_id uuid references auth.users(id),
  customer_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (company_id, product_id) references public.products(company_id, id)
);

create table public.stock_movements (
  order_id uuid not null references public.orders(id),
  event text not null check (event in ('reserve', 'receive')),
  delta integer not null check (delta <> 0),
  created_at timestamptz not null default now(),
  primary key (order_id, event)
);

create index on public.company_members(user_id);
create index on public.orders(company_id, created_at desc);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.companies, public.company_members, public.platform_admins, public.products, public.orders, public.stock_movements from anon, authenticated;
grant select on public.companies, public.company_members, public.platform_admins, public.orders, public.stock_movements to authenticated;
grant select (id, company_id, name) on public.products to authenticated;

create function public.company_role(p_company uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.company_members where company_id = p_company and user_id = auth.uid()
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.platform_admins where user_id = auth.uid())
$$;

create policy company_read on public.companies for select to authenticated
using (public.company_role(id) is not null or public.is_platform_admin());
create policy member_read on public.company_members for select to authenticated
using (user_id = auth.uid() or public.company_role(company_id) in ('owner', 'manager'));
create policy admin_read on public.platform_admins for select to authenticated using (user_id = auth.uid());
create policy catalog_read on public.products for select to authenticated
using (public.company_role(company_id) is not null);
create policy order_read on public.orders for select to authenticated using (
  public.company_role(company_id) in ('owner', 'manager')
  or (public.company_role(company_id) = 'customer' and customer_id = auth.uid())
  or (public.company_role(company_id) = 'supplier' and supplier_id = auth.uid() and status <> 'pending')
);
create policy movement_read on public.stock_movements for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and public.company_role(o.company_id) in ('owner', 'manager'))
);

create function public.inventory(p_company uuid) returns setof public.products
language sql stable security definer set search_path = '' as $$
  select * from public.products where company_id = p_company and public.company_role(p_company) in ('owner', 'manager')
  order by name
$$;

create function public.create_company(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  if auth.uid() is null then raise exception 'Kirish talab qilinadi'; end if;
  insert into public.companies(name) values (trim(p_name)) returning id into v_company;
  insert into public.company_members values (v_company, auth.uid(), 'owner');
  return v_company;
end
$$;

create function public.add_company_member(p_company uuid, p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if public.company_role(p_company) is distinct from 'owner' then raise exception 'Ruxsat yo‘q'; end if;
  if p_role is null or p_role not in ('manager', 'supplier', 'customer') then raise exception 'Rol yaroqsiz'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'Tasdiqlangan hisob topilmadi'; end if;
  insert into public.company_members values (p_company, v_user, p_role);
end
$$;

create function public.company_suppliers(p_company uuid) returns table(user_id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text from public.company_members m join auth.users u on u.id = m.user_id
  where m.company_id = p_company and m.role = 'supplier' and public.company_role(p_company) in ('owner', 'manager')
  order by u.email
$$;

create function public.add_product(p_company uuid, p_name text, p_stock integer, p_minimum integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.company_role(p_company), '') not in ('owner', 'manager') then raise exception 'Ruxsat yo‘q'; end if;
  insert into public.products(company_id, name, stock, minimum) values (p_company, trim(p_name), p_stock, p_minimum);
end
$$;

create function public.create_order(p_company uuid, p_product uuid, p_quantity integer, p_direction text, p_address text, p_supplier uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role text := coalesce(public.company_role(p_company), '');
begin
  if p_direction = 'outbound' and v_role = 'customer' and p_supplier is null then
    insert into public.orders(company_id, product_id, quantity, direction, delivery_address, created_by, customer_id)
    values (p_company, p_product, p_quantity, p_direction, trim(p_address), auth.uid(), auth.uid());
  elsif p_direction = 'inbound' and v_role in ('owner', 'manager') then
    if not exists (select 1 from public.company_members where company_id = p_company and user_id = p_supplier and role = 'supplier') then
      raise exception 'Korxonadan ta’minotchi tanlang';
    end if;
    insert into public.orders(company_id, product_id, quantity, direction, delivery_address, created_by, supplier_id)
    values (p_company, p_product, p_quantity, p_direction, trim(p_address), auth.uid(), p_supplier);
  else
    raise exception 'Ruxsat yo‘q';
  end if;
end
$$;

create function public.advance_order(p_order uuid, p_next text, p_supplier uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_role text;
begin
  select * into v_order from public.orders where id = p_order for update;
  v_role := coalesce(public.company_role(v_order.company_id), '');

  if v_role in ('owner', 'manager') and v_order.status = 'pending' and p_next in ('approved', 'rejected') then
    if p_next = 'approved' and v_order.direction = 'outbound' then
      if not exists (select 1 from public.company_members where company_id = v_order.company_id and user_id = p_supplier and role = 'supplier') then
        raise exception 'Korxonadan yetkazuvchini tanlang';
      end if;
      update public.products set stock = stock - v_order.quantity
      where id = v_order.product_id and company_id = v_order.company_id and stock >= v_order.quantity;
      if not found then raise exception 'Omborda mahsulot yetarli emas'; end if;
      insert into public.stock_movements(order_id, event, delta) values (p_order, 'reserve', -v_order.quantity);
      v_order.supplier_id := p_supplier;
    end if;
  elsif v_role = 'supplier' and v_order.supplier_id = auth.uid() and v_order.status = 'approved' and p_next = 'shipped' then
    null;
  elsif v_order.status = 'shipped' and p_next = 'delivered'
    and ((v_order.direction = 'inbound' and v_role in ('owner', 'manager'))
      or (v_order.direction = 'outbound' and v_role = 'supplier' and v_order.supplier_id = auth.uid())) then
    if v_order.direction = 'inbound' then
      update public.products set stock = stock + v_order.quantity
      where id = v_order.product_id and company_id = v_order.company_id;
      insert into public.stock_movements(order_id, event, delta) values (p_order, 'receive', v_order.quantity);
    end if;
  else
    raise exception 'Bu amal uchun ruxsat yo‘q yoki buyurtma holati o‘zgargan';
  end if;

  update public.orders set status = p_next, supplier_id = v_order.supplier_id where id = p_order;
end
$$;

create function public.platform_summary() returns table(company_id uuid, name text, order_count bigint, member_count bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, (select count(*) from public.orders o where o.company_id = c.id),
    (select count(*) from public.company_members m where m.company_id = c.id)
  from public.companies c where public.is_platform_admin() order by c.name
$$;

revoke execute on function public.company_role(uuid), public.is_platform_admin(), public.inventory(uuid),
  public.create_company(text), public.add_company_member(uuid,text,text), public.company_suppliers(uuid),
  public.add_product(uuid,text,integer,integer), public.create_order(uuid,uuid,integer,text,text,uuid),
  public.advance_order(uuid,text,uuid), public.platform_summary() from public, anon, authenticated;
grant execute on function public.company_role(uuid), public.is_platform_admin(), public.inventory(uuid),
  public.create_company(text), public.add_company_member(uuid,text,text), public.company_suppliers(uuid),
  public.add_product(uuid,text,integer,integer), public.create_order(uuid,uuid,integer,text,text,uuid),
  public.advance_order(uuid,text,uuid), public.platform_summary() to authenticated;
create table public.inventory_analysis_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null
);
alter table public.inventory_analysis_requests enable row level security;
revoke all on public.inventory_analysis_requests from anon, authenticated;

create function public.allow_inventory_analysis(p_company uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.company_role(p_company), '') not in ('owner', 'manager') then return false; end if;
  insert into public.inventory_analysis_requests as limits(user_id, requested_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set requested_at = excluded.requested_at
  where limits.requested_at <= now() - interval '1 minute';
  return found;
end
$$;
revoke execute on function public.allow_inventory_analysis(uuid) from public, anon, authenticated;
grant execute on function public.allow_inventory_analysis(uuid) to authenticated;
commit;
