begin;

create or replace function public.shared_telegram_bot_data(p_chat text,p_command text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_bot public.shared_telegram_links;
  v_role text;
  v_items jsonb;
begin
  select * into v_bot from public.shared_telegram_links where chat_id=p_chat;
  if not found then return null; end if;
  v_role := public.telegram_active_role(v_bot.company_id,v_bot.user_id);
  if v_role is null then return null; end if;
  if p_command = 'orders' then
    with visible as (
      select o.id, o.created_at, o.order_number, p.name as product,o.quantity,o.order_unit,o.status,o.direction,
        o.shop_name,o.delivery_address,o.delivery_latitude,o.delivery_longitude,
        case when v_role='supplier' then s.phone end as shop_phone
      from public.orders o join public.products p on p.company_id=o.company_id and p.id=o.product_id
      left join public.customer_shops s on s.id=o.shop_id and s.company_id=o.company_id
      where o.company_id=v_bot.company_id and (v_role='manager'
        or (v_role='supplier' and o.supplier_id=v_bot.user_id and o.status <> 'pending')
        or (v_role='customer' and o.customer_id=v_bot.user_id))
    ), latest as (
      select order_number from visible group by order_number
      order by bool_or(status in ('approved','shipped','pending')) desc,max(created_at) desc,order_number desc limit 5
    )
    select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc,v.order_number desc,v.id),'[]'::jsonb)
    into v_items from visible v join latest using(order_number);
  elsif p_command='debts' and v_role in ('manager','customer') then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
    from (
      select o.shop_name,r.total-r.received as balance,r.due_on,
        r.due_on < timezone('Asia/Tashkent',now())::date as overdue
      from public.orders o join public.order_receivables r on r.order_id=o.id
      where o.company_id=v_bot.company_id and r.received<r.total
        and (v_role='manager' or o.customer_id=v_bot.user_id)
      order by r.due_on,o.id limit 10
    ) x;
  end if;
  return jsonb_build_object('role',v_role,'items',v_items);
end
$$;

create or replace function public.store_telegram_bot_data(p_chat text,p_command text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('role','store','items',case
    when p_command='orders' then coalesce((
      with visible as (
        select o.id,o.created_at,o.order_number,p.name as product,o.quantity,o.order_unit,o.status,c.name as shop_name
        from public.customer_shops sh join public.orders o on o.shop_id=sh.id and o.company_id=sh.company_id
        join public.products p on p.id=o.product_id and p.company_id=o.company_id join public.companies c on c.id=o.company_id
        where sh.store_id=s.id and o.direction='outbound'
      ), latest as (
        select order_number from visible group by order_number order by max(created_at) desc,order_number desc limit 5
      )
      select jsonb_agg(to_jsonb(v) order by v.created_at desc,v.order_number desc,v.id) from visible v join latest using(order_number)
    ),'[]'::jsonb)
    when p_command='debts' then coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select c.name as shop_name,sum(r.total-r.received) as balance,min(r.due_on) as due_on,
          bool_or(r.due_on<timezone('Asia/Tashkent',now())::date) as overdue
        from public.customer_shops sh join public.orders o on o.shop_id=sh.id and o.company_id=sh.company_id
        join public.companies c on c.id=o.company_id join public.order_receivables r on r.order_id=o.id
        where sh.store_id=s.id and o.direction='outbound' and r.received<r.total
        group by c.id,c.name order by due_on limit 10
      ) x),'[]'::jsonb)
    else null end)
  from public.store_telegram_links l join public.stores s on s.owner_id=l.user_id
  where l.chat_id=p_chat and not exists(select 1 from public.platform_admins where user_id=l.user_id)
$$;

notify pgrst,'reload schema';
commit;
