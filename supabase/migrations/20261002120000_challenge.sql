-- Desafios (Gestão > Desafios): objetivo curto da equipe de vendas de uma loja (geralmente 1 por semana).
-- Vários desafios da mesma loja podem cruzar o período (sem trava de sobreposição).
-- metric: PRODUCTS (itens dos produtos escolhidos) · CATEGORIES (itens das categorias escolhidas) · PA · TICKET.
-- mode: CONTEST (Disputa: pódio) · MINIMUM (Mínimo: todos que chegarem no alvo).
-- target: MINIMUM = alvo; CONTEST = piso opcional. Itens = inteiro; P.A. = 2 casas; ticket = R$.
-- min_sales: P.A./ticket = vendas mínimas para concorrer.
-- products: [{ "code": text, "name": text }] · categories: [{ "typeId": int, "name": text }].
-- prizes: CONTEST = 1..3 posições; MINIMUM = 1 (por pessoa que atingir).
--   Prêmio = { "kind": "MONEY", "cents": int } ou { "kind": "ITEM", "label": text }.
-- manager_prize: mesmo formato ou null (sem prêmio da gerência).

create table if not exists public.challenge (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  store_id uuid not null references public.store (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  metric text not null check (metric in ('PRODUCTS', 'CATEGORIES', 'PA', 'TICKET')),
  mode text not null check (mode in ('CONTEST', 'MINIMUM')),
  products jsonb not null default '[]'::jsonb check (jsonb_typeof(products) = 'array'),
  categories jsonb not null default '[]'::jsonb check (jsonb_typeof(categories) = 'array'),
  target numeric(14, 2) null check (target is null or target > 0),
  min_sales int null check (min_sales is null or min_sales >= 1),
  prizes jsonb not null default '[]'::jsonb check (jsonb_typeof(prizes) = 'array'),
  manager_prize jsonb null check (manager_prize is null or jsonb_typeof(manager_prize) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on <= ends_on)
);

create index if not exists challenge_store_period_idx on public.challenge (tenant_id, store_id, starts_on, ends_on);

comment on table public.challenge is
  'Desafios por loja e período (Gestão > Desafios). Pode haver mais de um desafio da loja no mesmo período.';

alter table public.challenge enable row level security;

grant select, insert, update, delete on public.challenge to authenticated;
grant select, insert, update, delete on public.challenge to service_role;

drop policy if exists challenge_select_own on public.challenge;
create policy challenge_select_own
  on public.challenge for select
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

drop policy if exists challenge_write_managers on public.challenge;
create policy challenge_write_managers
  on public.challenge for all
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

-- Itens vendidos por pessoa × produto × dia (relatório de produtos por cupom {52DE7BBC}, mesma resposta do
-- top produtos; nenhuma chamada nova ao ERP). Só cupons da Lista do dia com vendedor identificado (gerador).
-- Base dos desafios de produto e categoria (categoria resolvida na leitura pelo product_catalog).

create table if not exists public.sales_seller_product_day_agg (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  store_id uuid not null references public.store (id) on delete cascade,
  day date not null,
  seller_gerador_id bigint not null,
  seller_key text not null default '',
  seller_name text not null default '',
  product_code text not null,
  product_id int not null default 0,
  item_count int not null default 0,
  revenue_cents bigint not null default 0,
  primary key (tenant_id, store_id, day, seller_gerador_id, product_code)
);

create index if not exists sales_seller_product_day_agg_scope_idx
  on public.sales_seller_product_day_agg (tenant_id, day);

comment on table public.sales_seller_product_day_agg is
  'Itens e faturamento por pessoa (gerador) × produto (COD_PRODUTO) × dia, do relatório de produtos por cupom. Desafios.';

alter table public.sales_seller_product_day_agg enable row level security;

grant select on public.sales_seller_product_day_agg to authenticated;
grant select, insert, update, delete on public.sales_seller_product_day_agg to service_role;

drop policy if exists sales_seller_product_day_agg_select_own on public.sales_seller_product_day_agg;
create policy sales_seller_product_day_agg_select_own
  on public.sales_seller_product_day_agg for select
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
