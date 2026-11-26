begin;

create function public.advance_checkout_delivery(p_company uuid,p_batch uuid,p_next text)
returns void language plpgsql security definer set search_path='' as $$
declare line record; changed boolean := false;
begin
 if public.company_role(p_company) is distinct from 'supplier'
   or p_next is null or p_next not in ('shipped','delivered') then
   raise exception 'Ruxsat yo‘q' using errcode='42501';
 end if;
 for line in select id,status,supplier_id,direction from public.orders
  where company_id=p_company and checkout_batch_id=p_batch order by product_id,id for update
 loop
   if line.supplier_id is distinct from auth.uid() or line.direction <> 'outbound' then
     raise exception 'Ruxsat yo‘q' using errcode='42501';
   end if;
   if line.status=p_next or (p_next='shipped' and line.status='delivered') then continue; end if;
   perform public.advance_order(line.id,p_next,null);
   changed := true;
 end loop;
 if not changed then raise exception 'Buyurtma topilmadi yoki holati o‘zgargan'; end if;
end $$;

create function public.decide_order_group(p_number bigint,p_accept boolean,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare line record; changed boolean := false;
begin
 if p_accept is null or public.is_platform_admin() then raise exception 'Ruxsat yo‘q' using errcode='42501'; end if;
 for line in select o.id,o.status
 from public.orders o join public.customer_shops sh on sh.company_id=o.company_id and sh.id=o.shop_id
 join public.stores s on s.id=sh.store_id
 where o.order_number=p_number and o.direction='outbound' and s.owner_id=auth.uid()
 order by o.product_id,o.id for update of o
 loop
   if line.status <> 'delivered' then raise exception 'Buyurtma hali to‘liq yetkazilmagan'; end if;
   if exists(select 1 from public.store_delivery_decisions d where d.order_id=line.id) then continue; end if;
   perform public.decide_store_delivery(line.id,p_accept,p_note);
   changed := true;
 end loop;
 if not changed then raise exception 'Buyurtma topilmadi yoki qabul qayd etilgan'; end if;
end $$;
revoke execute on function public.advance_checkout_delivery(uuid,uuid,text),public.decide_order_group(bigint,boolean,text) from public,anon;
grant execute on function public.advance_checkout_delivery(uuid,uuid,text),public.decide_order_group(bigint,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
