-- Estoque > Pedido de compra: códigos que a loja já vendeu (histórico gravado na WeDash).
-- Produto sem venda nenhuma conta como "Novo" quando o histórico da loja cobre 12 meses ou chega à inauguração.
-- Devolve um array (1 valor) para não esbarrar no limite de linhas da API. RLS de sales_product_day_agg vale (security invoker).

create or replace function public.store_sold_product_codes(p_tenant_id uuid, p_store_id uuid)
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(distinct product_code order by product_code), '{}')
  from public.sales_product_day_agg
  where tenant_id = p_tenant_id
    and store_id = p_store_id
    and product_code <> ''
    and item_count > 0;
$$;

grant execute on function public.store_sold_product_codes(uuid, uuid) to authenticated, service_role;
