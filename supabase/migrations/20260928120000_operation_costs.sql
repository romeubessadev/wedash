-- Configurações da operação (menu próprio): aluguel mínimo + custos fixos / variáveis / outras despesas por loja.
-- Aluguel do mês = o maior entre o mínimo (R$/mês) e o % do faturamento (padrão de shopping).
-- rent_fixed_cents nunca foi preenchido pela UI → vira o aluguel mínimo (grants e check seguem a coluna).

alter table public.store rename column rent_fixed_cents to rent_min_cents;

comment on column public.store.rent_min_cents is
  'Aluguel mínimo mensal (centavos). Aluguel do mês = maior entre o mínimo e o % do faturamento.';

create table if not exists public.store_cost_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  store_id uuid not null references public.store (id) on delete cascade,
  kind text not null check (kind in ('FIXED', 'VARIABLE', 'OTHER')),
  name text not null check (length(trim(name)) > 0),
  amount_cents bigint,
  pct numeric(5, 2),
  position int not null default 0,
  created_at timestamptz not null default now(),
  check (
    (kind = 'VARIABLE' and pct is not null and pct between 0 and 100 and amount_cents is null)
    or (kind in ('FIXED', 'OTHER') and amount_cents is not null and amount_cents >= 0 and pct is null)
  )
);

create index if not exists store_cost_item_store_idx on public.store_cost_item (tenant_id, store_id);

comment on table public.store_cost_item is
  'Custos da loja: FIXED e OTHER em centavos/mês (rateados por dia); VARIABLE em % do faturamento.';

alter table public.store_cost_item enable row level security;

grant select, insert, update, delete on public.store_cost_item to authenticated;
grant select, insert, update, delete on public.store_cost_item to service_role;

drop policy if exists store_cost_item_select_own on public.store_cost_item;
create policy store_cost_item_select_own
  on public.store_cost_item for select
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

drop policy if exists store_cost_item_write_gestor on public.store_cost_item;
create policy store_cost_item_write_gestor
  on public.store_cost_item for all
  to authenticated
  using (
    tenant_id in (
      select m.tenant_id
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.status = 'ACTIVE'
        and m.role in ('OWNER', 'ADMIN_GLOBAL')
    )
  )
  with check (
    tenant_id in (
      select m.tenant_id
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.status = 'ACTIVE'
        and m.role in ('OWNER', 'ADMIN_GLOBAL')
    )
  );
