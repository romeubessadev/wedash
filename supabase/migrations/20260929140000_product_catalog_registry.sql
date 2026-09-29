-- Cadastro do produto vindo do relatório "Saldo Atual e Futuro" (FRANQUIAS.RELATORIOS.ESTOQUEEMCOMPRA):
-- data de cadastro (produto cadastrado no mês do pedido = novo), quantidade múltipla e bloqueado para compra.
-- Iguais em todas as lojas → ficam no catálogo compartilhado. Usados no futuro Pedido de compra.
alter table public.product_catalog
  add column if not exists registered_at date,
  add column if not exists purchase_multiple integer,
  add column if not exists purchase_blocked boolean;

-- Grava os campos só nos produtos que já estão no catálogo (o relatório não traz id/tipo para criar linha).
create or replace function public.set_product_catalog_registry(items jsonb)
returns integer
language sql
set search_path = public
as $$
  with src as (
    select *
    from jsonb_to_recordset(items) as x(product_code text, registered_at date, purchase_multiple integer, purchase_blocked boolean)
  ),
  upd as (
    update public.product_catalog c
       set registered_at = src.registered_at,
           purchase_multiple = src.purchase_multiple,
           purchase_blocked = src.purchase_blocked
      from src
     where c.product_code = src.product_code
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke all on function public.set_product_catalog_registry(jsonb) from public, anon, authenticated;
grant execute on function public.set_product_catalog_registry(jsonb) to service_role;
