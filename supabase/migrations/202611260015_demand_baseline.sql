begin;
create function public.demand_baseline(p_company uuid,p_days integer)
returns table(product_id uuid,name text,unit text,stock integer,minimum integer,observed bigint,observed_days integer,
 expected_units numeric,forecast_quality text,replenishment numeric)
language sql stable security definer set search_path='' as $$
 with clock as (select timezone('Asia/Tashkent',now())::date as today),
 sales as (
  select o.product_id,sum(o.quantity) as quantity,count(distinct timezone('Asia/Tashkent',o.delivered_at)::date)::integer as days
  from public.orders o cross join clock
  where o.company_id=p_company and o.direction='outbound' and o.status='delivered'
    and o.delivered_at>=((today-28)::timestamp at time zone 'Asia/Tashkent')
    and o.delivered_at<(today::timestamp at time zone 'Asia/Tashkent')
  group by o.product_id
 ), model as (
  select p.id,p.name,p.unit,p.stock,p.minimum,coalesce(s.quantity,0) as quantity,coalesce(s.days,0) as days,
   case when s.days>=4 then round(s.quantity::numeric*p_days/28,1) end as estimate
  from public.products p left join sales s on s.product_id=p.id
  where p.company_id=p_company and public.company_role(p_company) in ('owner','manager') and p_days in (7,14,30,90)
 )
 select id,name,unit,stock,minimum,quantity,days,estimate,
   case when estimate is null then 'insufficient' when days<10 or p_days=90 then 'low' else 'moderate' end,
   case when estimate is not null then greatest(0,ceil(estimate)+minimum-stock)
     when stock<minimum then minimum-stock end
 from model
$$;
revoke execute on function public.demand_baseline(uuid,integer) from public,anon,authenticated;
grant execute on function public.demand_baseline(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
