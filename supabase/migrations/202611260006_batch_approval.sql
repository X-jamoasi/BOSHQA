begin;
alter table public.orders add column checkout_batch_id uuid;
grant select(checkout_batch_id) on public.orders to authenticated;
create index orders_checkout_batch on public.orders(company_id,checkout_batch_id,id)
 where checkout_batch_id is not null;

create or replace function public.checkout_market_cart(p_company uuid,p_shop uuid,p_items jsonb,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_shop public.customer_shops; v_product public.products; v_store uuid; v_item record; v_discount numeric; v_batch uuid := gen_random_uuid();
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
    shop_id,shop_name,delivery_latitude,delivery_longitude,order_unit,unit_price,discount_percent,order_total,checkout_batch_id)
   values(p_company,v_product.id,v_item.quantity,'outbound',v_shop.address,auth.uid(),auth.uid(),
    v_shop.id,v_shop.name,v_shop.latitude,v_shop.longitude,v_product.unit,v_product.price,v_discount,
    round(v_product.price*v_item.quantity*(100-v_discount)/100,2),v_batch);
 end loop;
end
$$;
create function public.review_checkout_batch(p_company uuid,p_batch uuid,p_accept boolean,p_supplier uuid,p_expected date)
returns void language plpgsql security definer set search_path='' as $$
declare line record; found_line boolean := false;
begin
 if p_accept is null or coalesce(public.company_role(p_company),'') not in ('owner','manager') then
   raise exception 'Ruxsat yo‘q' using errcode='42501';
 end if;
 for line in select id,status from public.orders where company_id=p_company and checkout_batch_id=p_batch
   order by product_id,id for update
 loop
   found_line := true;
   if line.status <> 'pending' then raise exception 'Savatdagi buyurtma allaqachon ko‘rib chiqilgan. Sahifani yangilang.'; end if;
   if p_accept then
     perform public.approve_shop_delivery(p_company,line.id,p_supplier,p_expected);
   else
     perform public.advance_order(line.id,'rejected',null);
   end if;
 end loop;
 if not found_line then raise exception 'Buyurtma topilmadi'; end if;
end $$;
revoke execute on function public.review_checkout_batch(uuid,uuid,boolean,uuid,date) from public,anon,authenticated;
grant execute on function public.review_checkout_batch(uuid,uuid,boolean,uuid,date) to authenticated;
notify pgrst,'reload schema';
commit;
