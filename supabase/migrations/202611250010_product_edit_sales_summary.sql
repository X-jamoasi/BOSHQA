begin;

create function public.update_catalog_product(
  p_company uuid, p_product uuid, p_name text, p_stock integer, p_expected_stock integer, p_minimum integer,
  p_unit text, p_barcode text, p_price numeric, p_image text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_product public.products;
begin
  if coalesce(public.company_role(p_company),'') not in ('owner','manager') then
    raise exception 'Mahsulotni tahrirlash uchun ruxsat yo‘q' using errcode = '42501';
  end if;
  select * into v_product from public.products where company_id=p_company and id=p_product for update;
  if not found then raise exception 'Mahsulot topilmadi'; end if;
  if p_expected_stock is null or p_stock is null or p_price is null then raise exception 'Miqdor va narxni kiriting'; end if;
  if v_product.stock <> p_expected_stock and p_stock <> p_expected_stock then
    raise exception 'Ombor qoldig‘i o‘zgargan. Sahifani yangilab qayta urinib ko‘ring.';
  end if;
  if p_unit is distinct from v_product.unit and exists (
    select 1 from public.orders o where o.company_id=p_company and o.product_id=p_product and o.status in ('pending','approved','shipped')
  ) then raise exception 'Faol buyurtmalar yakunlangach, o‘lchov birligini o‘zgartiring.'; end if;
  if p_image is not null and p_image is distinct from v_product.image_path and
    (split_part(p_image,'/',1) <> p_company::text or not exists (
      select 1 from storage.objects where bucket_id='product-images' and name=p_image
    )) then raise exception 'Mahsulot rasmini topib bo‘lmadi'; end if;

  update public.products set name=trim(p_name),
    stock=case when p_stock=p_expected_stock then v_product.stock else p_stock end,
    minimum=p_minimum,unit=p_unit,barcode=nullif(trim(p_barcode),''),price=p_price,image_path=p_image
  where company_id=p_company and id=p_product;
end
$$;
revoke execute on function public.update_catalog_product(uuid,uuid,text,integer,integer,integer,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.update_catalog_product(uuid,uuid,text,integer,integer,integer,text,text,numeric,text) to authenticated;

-- Lock the product while fixing an order's unit so it cannot race a unit edit.
create function public.check_order_product_unit() returns trigger
language plpgsql set search_path = '' as $$
declare v_unit text;
begin
  select unit into v_unit from public.products where company_id=new.company_id and id=new.product_id for share;
  if not found then raise exception 'Mahsulot topilmadi'; end if;
  if new.order_unit is not null and new.order_unit <> v_unit then
    raise exception 'Mahsulot birligi o‘zgargan. Buyurtmani qayta yuboring.';
  end if;
  new.order_unit := v_unit;
  return new;
end
$$;
revoke execute on function public.check_order_product_unit() from public,anon,authenticated;
create trigger check_order_product_unit before insert on public.orders
for each row execute function public.check_order_product_unit();

alter table public.orders add column delivered_at timestamptz;
create index orders_delivery_sales on public.orders(company_id,delivered_at)
where direction='outbound' and status='delivered' and delivered_at is not null;

create function public.record_delivery_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.delivered_at := now();
  end if;
  return new;
end
$$;
revoke execute on function public.record_delivery_time() from public,anon,authenticated;
create trigger record_delivery_time before update of status on public.orders
for each row execute function public.record_delivery_time();

create function public.company_sales_summary(p_company uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with clock as (
    select timezone('Asia/Tashkent',now())::date as today
  ), periods as (
    select * from clock cross join lateral (values
      ('bugun', today, today+1), ('kecha', today-1, today),
      ('oxirgi_7_kun', today-6, today+1), ('oxirgi_30_kun',today-29,today+1),
      ('shu_oy',date_trunc('month',today::timestamp)::date,today+1)
    ) as p(label,start_day,end_day)
  ), windows as (
    select label, start_day, end_day,
      start_day::timestamp at time zone 'Asia/Tashkent' as begins,
      end_day::timestamp at time zone 'Asia/Tashkent' as ends
    from periods
  )
  select case when public.company_role(p_company) = 'owner' then jsonb_build_object(
    'vaqt_mintaqasi','Asia/Tashkent',
    'izoh','Summalar UZSda, chegirma hisobga olingan. To‘lovlar qayd etilmaydi. Yaratilgan buyurtmalarga bekor qilinganlar kirmaydi. Eski buyurtmalarning yetkazilgan vaqti noma’lum bo‘lishi mumkin.',
    'davrlar',(select jsonb_object_agg(w.label,jsonb_build_object(
      'boshlanish',w.start_day,'yakun',w.end_day-1,
      'yangi_buyurtmalar',a.total,'yangi_narxli_buyurtmalar',a.priced,'yangi_buyurtmalar_summasi',a.amount,
      'yetkazilgan_buyurtmalar',b.total,'yetkazilgan_narxli_buyurtmalar',b.priced,'yetkazilgan_buyurtmalar_summasi',b.amount,
      'yetkazilgan_eng_yuqori_summali_mahsulotlar',coalesce(c.products,'[]'::jsonb)
    )) from windows w
      cross join lateral (
        select count(*) as total,count(order_total) as priced,coalesce(sum(order_total),0) as amount from public.orders
        where company_id=p_company and direction='outbound' and status <> 'rejected' and created_at>=w.begins and created_at<w.ends
      ) a
      cross join lateral (
        select count(*) as total,count(order_total) as priced,coalesce(sum(order_total),0) as amount from public.orders
        where company_id=p_company and direction='outbound' and status='delivered' and delivered_at>=w.begins and delivered_at<w.ends
      ) b
      cross join lateral (
        select jsonb_agg(to_jsonb(top_products) order by top_products.summa desc,top_products.nom) as products
        from (
          select p.name as nom,coalesce(o.order_unit,p.unit) as birlik,
            sum(o.quantity) as miqdor,sum(o.order_total) as summa
          from public.orders o join public.products p on p.company_id=o.company_id and p.id=o.product_id
          where o.company_id=p_company and o.direction='outbound' and o.status='delivered'
            and o.order_total is not null and o.delivered_at>=w.begins and o.delivered_at<w.ends
          group by p.id,p.name,coalesce(o.order_unit,p.unit)
          order by summa desc,nom,p.id limit 5
        ) top_products
      ) c
    ),
    'yetkazilgan_sanasi_saqlanmagan_buyurtmalar',(select count(*) from public.orders
      where company_id=p_company and direction='outbound' and status='delivered' and delivered_at is null)
  ) end
$$;
revoke execute on function public.company_sales_summary(uuid) from public,anon,authenticated;
grant execute on function public.company_sales_summary(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
