-- Metas (Gestão > Metas): 1 meta por loja por período (sem datas sobrepostas na mesma loja).
-- target_cents = meta da loja no período (faturamento total da loja, igual à Visão geral).
-- tier_mode: INDIVIDUAL = cada pessoa sobe na escada pela própria meta (meta ÷ pessoas);
--            GROUP = a equipe sobe junta pelo total da loja.
-- tiers: [{ "name": text, "minPct": number, "commissionPct": number, "bonusCents": int }] em ordem crescente
--        (vazio = sem comissão progressiva).
-- groups: [{ "shiftId": uuid, "name": text, "pct": number }] = % da meta de cada grupo da loja (store_shift);
--         soma 100 (vazio = sem grupos de distribuição).

create extension if not exists btree_gist with schema extensions;

create table if not exists public.goal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  store_id uuid not null references public.store (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  starts_on date not null,
  ends_on date not null,
  target_cents bigint not null check (target_cents > 0),
  tier_mode text not null default 'INDIVIDUAL' check (tier_mode in ('INDIVIDUAL', 'GROUP')),
  tiers jsonb not null default '[]'::jsonb check (jsonb_typeof(tiers) = 'array'),
  groups jsonb not null default '[]'::jsonb check (jsonb_typeof(groups) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on <= ends_on),
  constraint goal_no_overlap exclude using gist (
    store_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);

create index if not exists goal_store_period_idx on public.goal (tenant_id, store_id, starts_on, ends_on);

comment on table public.goal is
  'Metas por loja e período (Gestão > Metas). Sem sobreposição de datas na mesma loja.';

alter table public.goal enable row level security;

grant select, insert, update, delete on public.goal to authenticated;
grant select, insert, update, delete on public.goal to service_role;

drop policy if exists goal_select_own on public.goal;
create policy goal_select_own
  on public.goal for select
  to authenticated
  using (
    tenant_id in (
      select m.tenant_id
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.status = 'ACTIVE'
    )
  );

drop policy if exists goal_write_managers on public.goal;
create policy goal_write_managers
  on public.goal for all
  to authenticated
  using (
    tenant_id in (
      select m.tenant_id
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.status = 'ACTIVE'
        and m.role in ('OWNER', 'MANAGER', 'ADMIN_GLOBAL')
    )
  )
  with check (
    tenant_id in (
      select m.tenant_id
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.status = 'ACTIVE'
        and m.role in ('OWNER', 'MANAGER', 'ADMIN_GLOBAL')
    )
  );
