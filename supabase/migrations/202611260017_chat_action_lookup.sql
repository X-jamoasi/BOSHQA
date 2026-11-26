begin;
create or replace function public.platform_business_directory(p_kind text,p_query text,p_status text,p_offset integer)
returns table(id uuid,name text,details text,account_status text)
language sql stable security definer set search_path='' as $$
 select b.id,b.name,b.details,b.account_status
 from (
   select c.id,c.name,c.sector details,c.account_status from public.companies c where p_kind='company'
   union all
   select s.id,s.name,concat_ws(' · ',a.region,a.locality),s.account_status from public.stores s
     left join public.store_areas a on a.id=s.area_id where p_kind='store'
 ) b
 where public.is_platform_admin() and (p_status is null or b.account_status=p_status)
   and (p_query is null or (b.id::text=p_query or strpos(lower(b.name),lower(p_query))>0))
 order by b.name,b.id limit 25 offset greatest(0,p_offset)
$$;

notify pgrst,'reload schema';
commit;
