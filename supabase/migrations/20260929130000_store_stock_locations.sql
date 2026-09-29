-- Estoque > Produtos: saldo por local de estoque da loja (ESTOQUE, QUIOSQUE, SHOP010…) = ESTOQUEPORLOCAL.
-- quantity continua = soma dos locais (estoque real da loja).
alter table public.store_stock
  add column if not exists locations jsonb not null default '{}'::jsonb;

comment on column public.store_stock.locations is
  'Saldo por local de estoque no Millennium ({"ESTOQUE": 144, "QUIOSQUE": -71}). quantity = soma.';

-- O estoque gravado até aqui era só do QUIOSQUE: força a busca de novo ao abrir a tela.
update public.store set stock_synced_at = null where stock_synced_at is not null;
