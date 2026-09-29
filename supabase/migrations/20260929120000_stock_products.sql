-- Estoque > Produtos: tabelas de preço de venda (globais, como as de custo), estoque por loja e
-- tabela de preço usada nas vendas (loja × dia × tabela, do relatório de cupom {52DE7BBC}).

create table if not exists public.product_sale_table (
  table_id bigint primary key,
  code text not null default '',
  description text not null default '',
  updated_at timestamptz not null default now(),
  -- Última busca dos preços desta tabela (null = nunca buscou).
  prices_at timestamptz
);

comment on table public.product_sale_table is
  'Tabelas de preço de venda do Millennium (lookup tabela_venda.TABELA). Global: mesmo Millennium para toda a rede.';

create table if not exists public.product_sale_price (
  table_id bigint not null references public.product_sale_table (table_id) on delete cascade,
  product_code text not null,
  price_cents int not null check (price_cents > 0),
  updated_at timestamptz not null default now(),
  primary key (table_id, product_code)
);

comment on table public.product_sale_price is
  'Preço de venda por tabela × COD_PRODUTO (wtsreports {24B9BF6D}, F_3554079995). Só > 0.';

alter table public.product_sale_table enable row level security;
alter table public.product_sale_price enable row level security;
grant select on public.product_sale_table to authenticated;
grant select on public.product_sale_price to authenticated;
grant select, insert, update, delete on public.product_sale_table to service_role;
grant select, insert, update, delete on public.product_sale_price to service_role;

drop policy if exists product_sale_table_select_all on public.product_sale_table;
create policy product_sale_table_select_all
  on public.product_sale_table for select
  to authenticated
  using (true);

drop policy if exists product_sale_price_select_all on public.product_sale_price;
create policy product_sale_price_select_all
  on public.product_sale_price for select
  to authenticated
  using (true);

-- Estoque atual da loja (report {9701602B} filtrado pelo gerador da loja). Pode ser negativo (como vem do ERP).
create table if not exists public.store_stock (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  store_id uuid not null references public.store (id) on delete cascade,
  product_code text not null,
  quantity numeric(14, 3) not null,
  updated_at timestamptz not null default now(),
  primary key (store_id, product_code)
);

create index if not exists store_stock_tenant_idx on public.store_stock (tenant_id, store_id);

comment on table public.store_stock is
  'Estoque atual por loja × COD_PRODUTO (SUM_ESTOQUE_QUANTIDADE_, cores somadas). Número do ERP como está.';

alter table public.store
  add column if not exists stock_synced_at timestamptz;

comment on column public.store.stock_synced_at is 'Última busca do estoque da loja no Millennium.';

-- Tabela de preço usada nas vendas (VENDA_TABELA_PRECO_TABELA do relatório de cupom).
create table if not exists public.sales_price_table_day_agg (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  store_id uuid not null references public.store (id) on delete cascade,
  day date not null,
  table_id bigint not null,
  table_name text not null default '',
  item_count int not null default 0,
  revenue_cents bigint not null default 0,
  primary key (store_id, day, table_id)
);

create index if not exists sales_price_table_day_agg_tenant_idx
  on public.sales_price_table_day_agg (tenant_id, store_id, day);

comment on table public.sales_price_table_day_agg is
  'Itens e R$ vendidos por tabela de preço de venda (loja × dia × tabela). Sugere a tabela padrão da tela Estoque > Produtos.';

do $$
declare t text;
begin
  foreach t in array array['store_stock', 'sales_price_table_day_agg'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
         tenant_id in (
           select m.tenant_id
           from public.membership m
           join public.identity i on i.id = m.identity_id
           where i.auth_user_id = auth.uid()
             and m.status = ''ACTIVE''
         )
       )',
      t || '_select_own',
      t
    );
  end loop;
end $$;
