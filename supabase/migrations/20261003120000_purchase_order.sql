-- Estoque > Pedido de compra: Saldo Atual e Futuro por loja (ESTOQUEEMCOMPRA, gravado pela Edge erp-stock-sync)
-- e o mínimo de cada produto digitado pela loja.

create table if not exists public.store_purchase_stock (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  store_id uuid not null references public.store (id) on delete cascade,
  product_code text not null,
  color text not null default '',
  print text not null default '',
  size text not null default '',
  description text not null default '',
  balance numeric(14, 3) not null default 0,
  open_order numeric(14, 3) not null default 0,
  total numeric(14, 3) not null default 0,
  purchase_multiple integer,
  purchase_blocked boolean not null default false,
  registered_at date,
  -- Ordem do relatório (o arquivo do pedido sai nessa ordem).
  position integer not null,
  updated_at timestamptz not null default now(),
  primary key (store_id, product_code, color, print, size)
);

create index if not exists store_purchase_stock_tenant_idx on public.store_purchase_stock (tenant_id, store_id);

comment on table public.store_purchase_stock is
  'Saldo Atual e Futuro por loja × produto × cor × estampa × tamanho (FRANQUIAS.RELATORIOS.ESTOQUEEMCOMPRA). TOTAL = SALDO + QUANTIDADE_PEDIDO.';

alter table public.store
  add column if not exists purchase_synced_at timestamptz;

comment on column public.store.purchase_synced_at is 'Última busca do Saldo Atual e Futuro da loja (Pedido de compra).';

create table if not exists public.store_purchase_min (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  store_id uuid not null references public.store (id) on delete cascade,
  product_code text not null,
  min_qty integer not null check (min_qty between 0 and 99999),
  updated_at timestamptz not null default now(),
  primary key (store_id, product_code)
);

create index if not exists store_purchase_min_tenant_idx on public.store_purchase_min (tenant_id, store_id);

comment on table public.store_purchase_min is
  'Mínimo de estoque por loja × COD_PRODUTO (Pedido de compra). Campo vazio na tela = sem linha.';

alter table public.store_purchase_stock enable row level security;
alter table public.store_purchase_min enable row level security;
grant select on public.store_purchase_stock to authenticated;
grant select, insert, update, delete on public.store_purchase_min to authenticated;
grant select, insert, update, delete on public.store_purchase_stock to service_role;
grant select, insert, update, delete on public.store_purchase_min to service_role;

drop policy if exists store_purchase_stock_select_own on public.store_purchase_stock;
create policy store_purchase_stock_select_own
  on public.store_purchase_stock for select
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

drop policy if exists store_purchase_min_select_own on public.store_purchase_min;
create policy store_purchase_min_select_own
  on public.store_purchase_min for select
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

-- Gestor: qualquer loja do tenant. Gerente: sem lojas vinculadas = todas; senão só as vinculadas.
drop policy if exists store_purchase_min_write on public.store_purchase_min;
create policy store_purchase_min_write
  on public.store_purchase_min for all
  to authenticated
  using (
    exists (
      select 1
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.status = 'ACTIVE'
        and m.tenant_id = store_purchase_min.tenant_id
        and (
          m.role in ('OWNER', 'ADMIN_GLOBAL')
          or (
            m.role = 'MANAGER'
            and (
              not exists (select 1 from public.membership_store ms where ms.membership_id = m.id)
              or exists (
                select 1 from public.membership_store ms
                where ms.membership_id = m.id and ms.store_id = store_purchase_min.store_id::text
              )
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.status = 'ACTIVE'
        and m.tenant_id = store_purchase_min.tenant_id
        and (
          m.role in ('OWNER', 'ADMIN_GLOBAL')
          or (
            m.role = 'MANAGER'
            and (
              not exists (select 1 from public.membership_store ms where ms.membership_id = m.id)
              or exists (
                select 1 from public.membership_store ms
                where ms.membership_id = m.id and ms.store_id = store_purchase_min.store_id::text
              )
            )
          )
        )
    )
    and exists (
      select 1 from public.store s
      where s.id = store_purchase_min.store_id and s.tenant_id = store_purchase_min.tenant_id
    )
  );
