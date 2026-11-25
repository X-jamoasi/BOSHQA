begin;

alter table public.products
  add column unit text not null default 'dona' check (unit in ('dona','blok','kg','qop','tonna','litr','metr','quti','paket','juft')),
  add column barcode text check (barcode ~ '^[0-9]{4,32}$'),
  add column price numeric(14,2) check (price >= 0),
  add column image_path text;
create unique index company_product_barcode on public.products(company_id, barcode) where barcode is not null;

create table public.customer_shops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  created_by uuid not null references auth.users(id),
  name text not null check (char_length(trim(name)) between 2 and 100),
  legal_type text not null check (legal_type in ('yatt','mchj')),
  legal_name text not null check (char_length(trim(legal_name)) between 2 and 150),
  phone text not null check (phone ~ '^[+][1-9][0-9]{7,14}$'),
  address text not null check (char_length(trim(address)) between 5 and 250),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create index on public.customer_shops(company_id, created_by, created_at desc);
alter table public.customer_shops enable row level security;
revoke all on public.customer_shops from public, anon, authenticated;

create table public.product_discounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  enabled boolean not null default true,
  foreign key (company_id, product_id) references public.products(company_id,id)
);
create index on public.product_discounts(company_id, product_id) where enabled;
alter table public.product_discounts enable row level security;
revoke all on public.product_discounts from public, anon, authenticated;

alter table public.orders
  add column shop_id uuid,
  add column shop_name text,
  add column delivery_latitude numeric(9,6),
  add column delivery_longitude numeric(9,6),
  add column order_unit text,
  add column unit_price numeric(14,2),
  add column discount_percent numeric(5,2),
  add column order_total numeric(20,2),
  add constraint order_shop_company foreign key (company_id, shop_id) references public.customer_shops(company_id,id);

revoke select on public.orders from authenticated;
grant select (id,company_id,product_id,quantity,direction,delivery_address,status,created_by,supplier_id,customer_id,created_at,
  shop_id,shop_name,delivery_latitude,delivery_longitude,order_unit) on public.orders to authenticated;

create function public.order_sale_totals(p_company uuid)
returns table(id uuid, discount_percent numeric, order_total numeric)
language sql stable security definer set search_path = '' as $$
  select o.id,o.discount_percent,o.order_total
  from public.orders o
  where o.company_id=p_company and o.order_total is not null
    and (public.company_role(p_company) in ('owner','manager')
      or (public.company_role(p_company) = 'customer' and o.customer_id=auth.uid()))
  order by o.created_at desc,o.id
$$;
revoke execute on function public.order_sale_totals(uuid) from public,anon,authenticated;
grant execute on function public.order_sale_totals(uuid) to authenticated;

create function public.shop_directory(p_company uuid)
returns table(id uuid, name text, legal_type text, legal_name text, phone text, address text, latitude numeric, longitude numeric, agent text)
language sql stable security definer set search_path = '' as $$
  select s.id,s.name,s.legal_type,s.legal_name,s.phone,s.address,s.latitude,s.longitude,
    coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.raw_app_meta_data->>'login',split_part(u.email,'@',1),'Noma’lum')
  from public.customer_shops s join auth.users u on u.id = s.created_by
  where s.company_id = p_company and (public.company_role(p_company) in ('owner','manager')
    or (public.company_role(p_company) = 'customer' and s.created_by=auth.uid()))
  order by s.created_at desc,s.id
$$;

create function public.add_customer_shop(p_company uuid,p_name text,p_legal_type text,p_legal_name text,p_phone text,p_address text,p_latitude numeric,p_longitude numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.company_role(p_company) is distinct from 'customer' then raise exception 'Do‘konni buyurtmachi qo‘sha oladi'; end if;
  insert into public.customer_shops(company_id,created_by,name,legal_type,legal_name,phone,address,latitude,longitude)
  values(p_company,auth.uid(),trim(p_name),p_legal_type,trim(p_legal_name),trim(p_phone),trim(p_address),p_latitude,p_longitude);
end
$$;

create function public.add_catalog_product(p_company uuid,p_name text,p_stock integer,p_minimum integer,p_unit text,p_barcode text,p_price numeric,p_image text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.company_role(p_company),'') not in ('owner','manager') then raise exception 'Ruxsat yo‘q'; end if;
  if p_price is null then raise exception 'Narxni kiriting'; end if;
  if p_image is not null and (split_part(p_image,'/',1) <> p_company::text
      or not exists (select 1 from storage.objects where bucket_id='product-images' and name=p_image)) then
    raise exception 'Mahsulot rasmini topib bo‘lmadi';
  end if;
  insert into public.products(company_id,name,stock,minimum,unit,barcode,price,image_path)
  values(p_company,trim(p_name),p_stock,p_minimum,p_unit,nullif(trim(p_barcode),''),p_price,p_image);
end
$$;

create function public.product_discount_percent(p_company uuid,p_product uuid,p_day date) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(max(percent),0) from public.product_discounts
  where company_id=p_company and product_id=p_product and enabled and p_day between starts_on and ends_on
$$;
revoke execute on function public.product_discount_percent(uuid,uuid,date) from public, anon, authenticated;

create function public.sales_catalog(p_company uuid)
returns table(id uuid,name text,unit text,barcode text,price numeric,image_path text,discount numeric)
language sql stable security definer set search_path = '' as $$
  select p.id,p.name,p.unit,p.barcode,case when r.role <> 'supplier' then p.price end,p.image_path,
    case when r.role <> 'supplier' then public.product_discount_percent(p_company,p.id,timezone('Asia/Tashkent',now())::date) end
  from public.products p cross join lateral (select public.company_role(p_company) as role) r
  where p.company_id=p_company and r.role is not null order by p.name
$$;

create function public.company_discounts(p_company uuid) returns setof public.product_discounts
language sql stable security definer set search_path = '' as $$
  select * from public.product_discounts where company_id=p_company and public.company_role(p_company) in ('owner','manager')
  order by starts_on desc,id
$$;

create function public.add_product_discount(p_company uuid,p_product uuid,p_percent numeric,p_start date,p_end date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.company_role(p_company),'') not in ('owner','manager') then raise exception 'Ruxsat yo‘q'; end if;
  insert into public.product_discounts(company_id,product_id,percent,starts_on,ends_on) values(p_company,p_product,p_percent,p_start,p_end);
end
$$;

create function public.stop_product_discount(p_company uuid,p_discount uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.company_role(p_company),'') not in ('owner','manager') then raise exception 'Ruxsat yo‘q'; end if;
  update public.product_discounts set enabled=false where company_id=p_company and id=p_discount;
end
$$;

create function public.create_shop_order(p_company uuid,p_product uuid,p_quantity integer,p_shop uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shop public.customer_shops;
v_product public.products;
v_discount numeric;
begin
  if public.company_role(p_company) is distinct from 'customer' then raise exception 'Ruxsat yo‘q'; end if;
  select * into v_shop from public.customer_shops where company_id=p_company and id=p_shop and created_by=auth.uid();
  if not found then raise exception 'O‘zingiz kiritgan do‘konni tanlang'; end if;
  select * into v_product from public.products where company_id=p_company and id=p_product;
  if not found then raise exception 'Mahsulot topilmadi'; end if;
  v_discount := public.product_discount_percent(p_company,p_product,timezone('Asia/Tashkent',now())::date);
  insert into public.orders(company_id,product_id,quantity,direction,delivery_address,created_by,customer_id,
    shop_id,shop_name,delivery_latitude,delivery_longitude,order_unit,unit_price,discount_percent,order_total)
  values(p_company,p_product,p_quantity,'outbound',v_shop.address,auth.uid(),auth.uid(),
    v_shop.id,v_shop.name,v_shop.latitude,v_shop.longitude,v_product.unit,v_product.price,v_discount,
    round(v_product.price*p_quantity*(100-v_discount)/100,2));
end
$$;

create function public.product_image_access(p_path text,p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.companies c where c.id::text=split_part(p_path,'/',1) and
    (case when p_write then public.company_role(c.id) in ('owner','manager') else public.company_role(c.id) is not null end))
$$;
create function public.product_image_unattached(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.product_image_access(p_path,true)
    and not exists (select 1 from public.products where image_path=p_path)
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy product_image_read on storage.objects for select to authenticated
using(bucket_id='product-images' and public.product_image_access(name));
create policy product_image_insert on storage.objects for insert to authenticated
with check(bucket_id='product-images' and public.product_image_access(name,true));
create policy product_image_cleanup on storage.objects for delete to authenticated
using(bucket_id='product-images' and public.product_image_unattached(name));

revoke execute on function public.shop_directory(uuid),public.add_customer_shop(uuid,text,text,text,text,text,numeric,numeric),
  public.add_catalog_product(uuid,text,integer,integer,text,text,numeric,text),public.sales_catalog(uuid),
  public.company_discounts(uuid),public.add_product_discount(uuid,uuid,numeric,date,date),public.stop_product_discount(uuid,uuid),
  public.create_shop_order(uuid,uuid,integer,uuid),public.product_image_access(text,boolean),public.product_image_unattached(text)
  from public,anon,authenticated;
grant execute on function public.shop_directory(uuid),public.add_customer_shop(uuid,text,text,text,text,text,numeric,numeric),
  public.add_catalog_product(uuid,text,integer,integer,text,text,numeric,text),public.sales_catalog(uuid),
  public.company_discounts(uuid),public.add_product_discount(uuid,uuid,numeric,date,date),public.stop_product_discount(uuid,uuid),
  public.create_shop_order(uuid,uuid,integer,uuid),public.product_image_access(text,boolean),public.product_image_unattached(text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
