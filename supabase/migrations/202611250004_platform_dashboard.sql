begin;

alter table public.companies add column registered_at timestamptz;
alter table public.companies alter column registered_at set default now();

create table public.platform_ai_events (
  id bigint generated always as identity primary key,
  happened_at timestamptz not null default now(),
  model text check (char_length(model) <= 100),
  outcome text not null check (outcome in ('success', 'error', 'unconfigured')),
  reason text check (char_length(reason) <= 240)
);
create index on public.platform_ai_events(happened_at desc);
alter table public.platform_ai_events enable row level security;
revoke all on public.platform_ai_events from public, anon, authenticated;
grant insert on public.platform_ai_events to service_role;

create table public.platform_activity (
  id bigint generated always as identity primary key,
  happened_at timestamptz not null default now(),
  description text not null
);
alter table public.platform_activity enable row level security;
revoke all on public.platform_activity from public, anon, authenticated;

create function public.record_platform_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'companies' then
    insert into public.platform_activity(description) values ('Korxona ro‘yxatdan o‘tdi: ' || new.name);
  else
    insert into public.platform_activity(description) values (
      case tg_op when 'DELETE' then 'Super admin huquqi olib tashlandi'
        when 'UPDATE' then 'Super admin huquqi yangilandi'
        else 'Super admin huquqi berildi' end
    );
  end if;
  return null;
end
$$;
revoke execute on function public.record_platform_activity() from public, anon, authenticated;

create trigger company_platform_activity after insert on public.companies
for each row execute function public.record_platform_activity();
create trigger admin_platform_activity after insert or update or delete on public.platform_admins
for each row execute function public.record_platform_activity();

create function public.platform_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Ruxsat yo‘q' using errcode = '42501'; end if;
  return jsonb_build_object(
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sector', sector, 'registered_at', registered_at) order by name)
      from public.companies
    ), '[]'::jsonb),
    'orders', (select count(*) from public.orders),
    'recent_companies', (select count(*) from public.companies where registered_at >= now() - interval '30 days'),
    'ai_counts', (
      select jsonb_build_object('success', count(*) filter (where outcome = 'success'),
        'error', count(*) filter (where outcome = 'error'), 'unconfigured', count(*) filter (where outcome = 'unconfigured'))
      from public.platform_ai_events where happened_at >= now() - interval '30 days'
    ),
    'ai_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.id desc)
      from (select * from public.platform_ai_events order by id desc limit 25) e
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.id desc)
      from (select * from public.platform_activity order by id desc limit 25) a
    ), '[]'::jsonb)
  );
end
$$;
revoke execute on function public.platform_dashboard() from public, anon, authenticated;
grant execute on function public.platform_dashboard() to authenticated;

notify pgrst, 'reload schema';
commit;
