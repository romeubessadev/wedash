-- Visão geral > Primeiros passos: quando a empresa chega a 100%, o card some de vez
-- (não volta no mês seguinte por falta de meta nem quando entra uma loja nova).

alter table public.tenant
  add column if not exists first_steps_done_at timestamptz;

-- Só Gestor (OWNER / ADMIN_GLOBAL) ativo da empresa marca como concluído.
create or replace function public.complete_first_steps(p_tenant uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenant t
  set first_steps_done_at = coalesce(t.first_steps_done_at, now())
  where t.id = p_tenant
    and exists (
      select 1
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.tenant_id = p_tenant
        and m.status = 'ACTIVE'
        and m.role in ('OWNER', 'ADMIN_GLOBAL')
    );
  return found;
end;
$$;

revoke all on function public.complete_first_steps(uuid) from public;
grant execute on function public.complete_first_steps(uuid) to authenticated;
