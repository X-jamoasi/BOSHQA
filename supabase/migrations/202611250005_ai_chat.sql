begin;

create table public.ai_chat_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null
);

alter table public.ai_chat_requests enable row level security;
revoke all on public.ai_chat_requests from public, anon, authenticated;

create function public.allow_ai_chat(p_company uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'Ruxsat yo‘q' using errcode = '42501'; end if;
  if p_company is null and public.is_platform_admin() then
    v_role := 'admin';
  else
    v_role := public.company_role(p_company);
  end if;
  if v_role is null then raise exception 'Ruxsat yo‘q' using errcode = '42501'; end if;

  insert into public.ai_chat_requests as limits(user_id, requested_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set requested_at = excluded.requested_at
  where limits.requested_at <= now() - interval '10 seconds';
  if not found then return null; end if;
  return v_role;
end
$$;

revoke execute on function public.allow_ai_chat(uuid) from public, anon, authenticated;
grant execute on function public.allow_ai_chat(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
