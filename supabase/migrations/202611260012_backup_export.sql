begin;

create function public.export_workspace_backup(p_company uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  viewer text;
  exported jsonb;
begin
  if auth.uid() is null then raise exception 'Hisobga kiring' using errcode='42501'; end if;

  if p_company is null then
    if public.is_platform_admin() then
      viewer := 'admin';
      exported := jsonb_build_object('platform',public.platform_dashboard());
    else
      exported := public.store_workspace();
      if exported is null then raise exception 'Ruxsat yo‘q' using errcode='42501'; end if;
      viewer := 'store';
      exported := exported || jsonb_build_object(
        'offers', (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.list_store_offers(null) q),
        'documents', (select coalesce(jsonb_agg(q),'[]') from public.order_documents_for_user(null) q));
    end if;
  else
    viewer := public.company_role(p_company);
    if viewer is null then raise exception 'Ruxsat yo‘q' using errcode='42501'; end if;
    with visible_orders as (
      select o.* from public.orders o where o.company_id=p_company and
      (viewer in ('owner','manager') or (viewer='supplier' and o.supplier_id=auth.uid())
        or (viewer='customer' and o.customer_id=auth.uid()))
    )
    select jsonb_build_object(
      'company', case when viewer in ('owner','manager') then to_jsonb(c)
        else jsonb_build_object('id',c.id,'name',c.name,'sector',c.sector) end,
      'orders', (select coalesce(jsonb_agg(case when viewer='supplier'
        then to_jsonb(o)-'unit_price'-'discount_percent'-'order_total' else to_jsonb(o) end order by o.created_at,o.id),'[]') from visible_orders o),
      'delivery_decisions', (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.company_store_delivery_decisions(p_company) q),
      'documents', (select coalesce(jsonb_agg(q),'[]') from public.order_documents_for_user(p_company) q),
      'receivables', (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.company_receivables(p_company) q),
      'shops', (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.market_shop_list(p_company) q),
      'products', case when viewer in ('owner','manager') then
        (select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.products p where p.company_id=p_company)
        else (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.sales_catalog(p_company) q) end
    ) || case when viewer in ('owner','manager') then jsonb_build_object(
      'members', (select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.company_members m where m.company_id=p_company),
      'stock_movements', (select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.stock_movements m join visible_orders o on o.id=m.order_id),
      'receipt_submissions', (select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.receipt_submissions r join visible_orders o on o.id=r.order_id),
      'discounts', (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.product_discounts d where d.company_id=p_company),
      'store_links', (select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.company_store_links l where l.company_id=p_company),
      'offers', (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.list_store_offers(p_company) q)
    ) else '{}'::jsonb end
    into exported from public.companies c where c.id=p_company;
    if viewer='owner' then
      exported := exported || jsonb_build_object(
        'sales_summary', public.company_sales_summary(p_company),
        'payment_summary', public.company_payment_summary(p_company),
        'staff', (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.company_staff_directory(p_company) q));
    end if;
  end if;
  return jsonb_build_object('format_version',1,'exported_at',now(),'role',viewer,'data',exported);
end $$;
revoke execute on function public.export_workspace_backup(uuid) from public,anon,authenticated;
grant execute on function public.export_workspace_backup(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
