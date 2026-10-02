-- Notificações (sino) lidas / limpas por pessoa × empresa, iguais em qualquer aparelho.
-- read_before: tudo que terminou até esse instante conta como lido.
-- cleared_before: tudo que terminou até esse instante some da lista ("Limpar").
-- read_ids: notificações lidas uma a uma depois de read_before (só as que ainda estão na lista).

alter table public.membership
  add column if not exists notif_read_before timestamptz,
  add column if not exists notif_cleared_before timestamptz,
  add column if not exists notif_read_ids text[] not null default '{}';

create or replace function public.notification_state_json(m public.membership)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'readBefore', m.notif_read_before,
    'clearedBefore', m.notif_cleared_before,
    'readIds', to_jsonb(m.notif_read_ids)
  );
$$;

-- Estado atual. 1º uso: começa com o que o aparelho já tinha (ou "tudo até agora lido").
create or replace function public.notification_state(
  p_tenant uuid,
  p_read_before timestamptz default null,
  p_cleared_before timestamptz default null,
  p_read_ids text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.membership;
begin
  update public.membership mb
  set notif_read_before = coalesce(p_read_before, now()),
      notif_cleared_before = coalesce(mb.notif_cleared_before, p_cleared_before),
      notif_read_ids = coalesce(p_read_ids, '{}')
  from public.identity i
  where mb.identity_id = i.id
    and i.auth_user_id = auth.uid()
    and mb.tenant_id = p_tenant
    and mb.notif_read_before is null;

  select mb.* into m
  from public.membership mb
  join public.identity i on i.id = mb.identity_id
  where i.auth_user_id = auth.uid() and mb.tenant_id = p_tenant;

  if not found then
    return null;
  end if;
  return public.notification_state_json(m);
end;
$$;

-- Marca uma como lida. p_keep = ids ainda na lista (a lista de lidas não cresce para sempre).
create or replace function public.notification_mark_read(p_tenant uuid, p_id text, p_keep text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.membership;
begin
  update public.membership mb
  set notif_read_ids = array(
    select distinct x
    from unnest(mb.notif_read_ids || p_id) as x
    where x = p_id or x = any (p_keep)
  )
  from public.identity i
  where mb.identity_id = i.id
    and i.auth_user_id = auth.uid()
    and mb.tenant_id = p_tenant
  returning mb.* into m;

  if not found then
    return null;
  end if;
  return public.notification_state_json(m);
end;
$$;

-- Marca como lidas (e, com p_clear, também limpa) tudo que terminou até p_until.
create or replace function public.notification_mark_all_read(p_tenant uuid, p_until timestamptz, p_clear boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.membership;
begin
  update public.membership mb
  set notif_read_before = greatest(coalesce(mb.notif_read_before, p_until), p_until),
      notif_read_ids = '{}',
      notif_cleared_before = case
        when p_clear then greatest(coalesce(mb.notif_cleared_before, p_until), p_until)
        else mb.notif_cleared_before
      end
  from public.identity i
  where mb.identity_id = i.id
    and i.auth_user_id = auth.uid()
    and mb.tenant_id = p_tenant
  returning mb.* into m;

  if not found then
    return null;
  end if;
  return public.notification_state_json(m);
end;
$$;

revoke all on function public.notification_state_json(public.membership) from public;
revoke all on function public.notification_state(uuid, timestamptz, timestamptz, text[]) from public;
revoke all on function public.notification_mark_read(uuid, text, text[]) from public;
revoke all on function public.notification_mark_all_read(uuid, timestamptz, boolean) from public;
grant execute on function public.notification_state(uuid, timestamptz, timestamptz, text[]) to authenticated;
grant execute on function public.notification_mark_read(uuid, text, text[]) to authenticated;
grant execute on function public.notification_mark_all_read(uuid, timestamptz, boolean) to authenticated;
