begin;

create table public.shared_telegram_links (
  company_id uuid not null,
  user_id uuid not null,
  chat_id text unique,
  link_hash text unique,
  link_expires_at timestamptz,
  primary key(company_id,user_id),
  foreign key(company_id,user_id) references public.company_members(company_id,user_id) on delete cascade,
  check ((link_hash is null) = (link_expires_at is null))
);
alter table public.shared_telegram_links enable row level security;
revoke all on public.shared_telegram_links from public,anon,authenticated;
grant select,insert,update,delete on public.shared_telegram_links to service_role;

create function public.prepare_shared_telegram_link(p_company uuid,p_user uuid,p_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if public.telegram_active_role(p_company,p_user) is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into public.shared_telegram_links as links(company_id,user_id,link_hash,link_expires_at)
  values(p_company,p_user,p_hash,now()+interval '15 minutes')
  on conflict(company_id,user_id) do update set link_hash=excluded.link_hash,link_expires_at=excluded.link_expires_at
  where links.chat_id is null;
  return found;
end
$$;

create function public.link_shared_telegram_chat(p_chat text,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_chat is null or p_chat !~ '^[1-9][0-9]{0,15}$' then return false; end if;
  update public.shared_telegram_links set chat_id=p_chat,link_hash=null,link_expires_at=null
  where chat_id is null and link_hash=p_hash and link_expires_at>now()
    and public.telegram_active_role(company_id,user_id) is not null;
  return found;
exception when unique_violation then
  return false;
end
$$;

create function public.shared_telegram_bot_data(p_chat text,p_command text) returns jsonb
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
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
    from (
      select p.name as product,o.quantity,o.order_unit,o.status,o.direction,o.shop_name,o.delivery_address,
        o.delivery_latitude,o.delivery_longitude,
        case when v_role='supplier' then s.phone end as shop_phone
      from public.orders o join public.products p on p.company_id=o.company_id and p.id=o.product_id
      left join public.customer_shops s on s.id=o.shop_id and s.company_id=o.company_id
      where o.company_id=v_bot.company_id and (v_role='manager'
        or (v_role='supplier' and o.supplier_id=v_bot.user_id and o.status <> 'pending')
        or (v_role='customer' and o.customer_id=v_bot.user_id))
      order by case when o.status in ('approved','shipped','pending') then 0 else 1 end,o.created_at desc,o.id
      limit 5
    ) x;
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

revoke execute on function public.prepare_shared_telegram_link(uuid,uuid,text),public.link_shared_telegram_chat(text,text),
  public.shared_telegram_bot_data(text,text) from public,anon,authenticated;
grant execute on function public.prepare_shared_telegram_link(uuid,uuid,text),public.link_shared_telegram_chat(text,text),
  public.shared_telegram_bot_data(text,text) to service_role;
notify pgrst, 'reload schema';
commit;
