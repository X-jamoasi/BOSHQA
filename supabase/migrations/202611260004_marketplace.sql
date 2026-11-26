begin;
alter table public.companies add column legal_type text check(legal_type in ('YaTT','MChJ','AJ','XK','Oilaviy korxona','Boshqa')),
  add column legal_name text check(char_length(legal_name) between 2 and 150),
  add column cover_path text;

create function public.store_company_access(p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not public.is_platform_admin() and exists(select 1 from public.company_store_links l
 join public.stores s on s.id=l.store_id where l.company_id=p_company and l.active and s.owner_id=auth.uid())
$$;
create or replace function public.product_image_access(p_path text,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.companies c where c.id::text=split_part(p_path,'/',1)
 and (case when p_write then public.company_role(c.id) in ('owner','manager') else
 public.company_role(c.id) is not null or public.store_company_access(c.id) end))
$$;
create or replace function public.product_image_unattached(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.product_image_access(p_path,true)
 and not exists(select 1 from public.products where image_path=p_path)
 and not exists(select 1 from public.companies where cover_path=p_path)
$$;

create function public.market_company_profile(p_company uuid default null)
returns table(id uuid,name text,sector text,contact text,legal_address text,legal_type text,legal_name text,cover_path text)
language sql stable security definer set search_path='' as $$
 select c.id,c.name,c.sector,c.contact,c.legal_address,c.legal_type,c.legal_name,c.cover_path
 from public.companies c where (p_company is null or p_company=c.id)
 and (public.store_company_access(c.id) or (p_company=c.id and public.company_role(c.id) in ('owner','manager'))) order by c.name
$$;
create function public.update_market_company(p_company uuid,p_name text,p_sector text,p_contact text,p_address text,
 p_type text,p_legal_name text,p_cover text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.update_company_profile(p_company,p_name,p_sector,p_contact,p_address);
 if p_cover is not null and (p_cover not like p_company::text||'/cover/%' or not exists(
 select 1 from storage.objects where bucket_id='product-images' and name=p_cover)) then raise exception 'Firma rasmi topilmadi'; end if;
 update public.companies set legal_type=nullif(p_type,''),legal_name=nullif(trim(p_legal_name),''),cover_path=p_cover where id=p_company;
end
$$;
create function public.store_sales_catalog(p_company uuid)
returns table(id uuid,name text,unit text,price numeric,image_path text,discount numeric)
language sql stable security definer set search_path='' as $$
 select p.id,p.name,p.unit,p.price,p.image_path,public.product_discount_percent(p_company,p.id,timezone('Asia/Tashkent',now())::date)
 from public.products p where p.company_id=p_company and p.price is not null and public.store_company_access(p_company) order by p.name
$$;

create function public.market_shop_list(p_company uuid)
returns table(id uuid,name text,legal_type text,legal_name text,phone text,address text,latitude numeric,longitude numeric,agent text,store_id uuid,active boolean)
language sql stable security definer set search_path='' as $$
 select s.id,s.name,s.legal_type,s.legal_name,s.phone,s.address,s.latitude,s.longitude,
 coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.raw_app_meta_data->>'login',split_part(u.email,'@',1)),
 s.store_id,coalesce(l.active,s.store_id is null)
 from public.customer_shops s join auth.users u on u.id=s.created_by
 left join public.company_store_links l on l.company_id=s.company_id and l.store_id=s.store_id
 where s.company_id=p_company and (public.company_role(p_company) in ('owner','manager') or
 (public.company_role(p_company)='customer' and s.created_by=auth.uid() and (s.store_id is null or l.active)))
 order by s.name,s.id
$$;
revoke execute on function public.market_shop_list(uuid) from public,anon;
grant execute on function public.market_shop_list(uuid) to authenticated;

create or replace function public.lock_order_members() returns trigger
language plpgsql set search_path = '' as $$
declare v_member uuid;
begin
  if tg_op = 'INSERT' and not (
    new.direction = 'outbound' and new.customer_id is not distinct from new.created_by
    and new.created_by is not distinct from auth.uid()
    and public.store_company_access(new.company_id)
    and exists(select 1 from public.customer_shops sh join public.stores s on s.id=sh.store_id
      where sh.id=new.shop_id and sh.company_id=new.company_id and s.owner_id=auth.uid())
  ) then
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

create table public.market_checkouts (
 user_id uuid not null references auth.users(id), request_id uuid not null, primary key(user_id,request_id)
);
alter table public.market_checkouts enable row level security;
revoke all on public.market_checkouts from public,anon,authenticated;
create function public.checkout_market_cart(p_company uuid,p_shop uuid,p_items jsonb,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_shop public.customer_shops; v_product public.products; v_store uuid; v_item record; v_discount numeric;
begin
 if auth.uid() is null or public.is_platform_admin() or p_request is null then raise exception 'Ruxsat yo‘q'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Savat yaroqsiz'; end if;
 if jsonb_array_length(p_items) not between 1 and 50 or
 (select count(distinct x.product) from jsonb_to_recordset(p_items) x(product uuid,quantity integer))<>jsonb_array_length(p_items)
 then raise exception 'Savatda 1–50 ta alohida mahsulot bo‘lishi kerak'; end if;
 if p_shop is null then
   select s.id into v_store from public.stores s where s.owner_id=auth.uid() for share;
   if not public.store_company_access(p_company) then raise exception 'Firma bilan aloqa faol emas'; end if;
   select sh.* into v_shop from public.customer_shops sh where sh.company_id=p_company and sh.store_id=v_store order by sh.created_at,sh.id limit 1;
 else
   if public.company_role(p_company) is distinct from 'customer' then raise exception 'Ruxsat yo‘q'; end if;
   select * into v_shop from public.customer_shops where company_id=p_company and id=p_shop and created_by=auth.uid();
 end if;
 if v_shop.id is null then raise exception 'Yetkaziladigan do‘kon topilmadi'; end if;
 insert into public.market_checkouts values(auth.uid(),p_request) on conflict do nothing;
 if not found then return; end if;
 for v_item in select * from jsonb_to_recordset(p_items) x(product uuid,quantity integer) order by product loop
   if v_item.quantity is null or v_item.quantity not between 1 and 1000000 then raise exception 'Miqdor yaroqsiz'; end if;
   select * into v_product from public.products where company_id=p_company and id=v_item.product and price is not null for share;
   if not found then raise exception 'Mahsulot yoki narxi topilmadi'; end if;
   v_discount:=coalesce(public.product_discount_percent(p_company,v_product.id,timezone('Asia/Tashkent',now())::date),0);
   insert into public.orders(company_id,product_id,quantity,direction,delivery_address,created_by,customer_id,
    shop_id,shop_name,delivery_latitude,delivery_longitude,order_unit,unit_price,discount_percent,order_total)
   values(p_company,v_product.id,v_item.quantity,'outbound',v_shop.address,auth.uid(),auth.uid(),
    v_shop.id,v_shop.name,v_shop.latitude,v_shop.longitude,v_product.unit,v_product.price,v_discount,
    round(v_product.price*v_item.quantity*(100-v_discount)/100,2));
 end loop;
end
$$;
revoke execute on function public.store_company_access(uuid),public.market_company_profile(uuid),
 public.update_market_company(uuid,text,text,text,text,text,text,text),public.store_sales_catalog(uuid),
 public.checkout_market_cart(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.store_company_access(uuid),public.market_company_profile(uuid),
 public.update_market_company(uuid,text,text,text,text,text,text,text),public.store_sales_catalog(uuid),
 public.checkout_market_cart(uuid,uuid,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
