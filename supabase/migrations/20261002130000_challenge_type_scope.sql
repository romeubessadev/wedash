-- Desafios: tipo do desafio + o que conta.
-- metric: QUANTITY (itens) · VALUE (R$ vendido) · PA · TICKET.
-- scope (Quantidade/Valor): PRODUCTS (produtos escolhidos) · CATEGORIES (categorias escolhidas) · ALL (tudo o que a pessoa vender).
--   P.A./ticket usam ALL.
-- Desafios antigos: PRODUCTS/CATEGORIES viram QUANTITY com o mesmo escopo.

alter table public.challenge drop constraint if exists challenge_metric_check;

alter table public.challenge
  add column if not exists scope text not null default 'ALL'
  check (scope in ('PRODUCTS', 'CATEGORIES', 'ALL'));

update public.challenge
set scope = metric, metric = 'QUANTITY'
where metric in ('PRODUCTS', 'CATEGORIES');

alter table public.challenge
  add constraint challenge_metric_check check (metric in ('QUANTITY', 'VALUE', 'PA', 'TICKET'));

comment on column public.challenge.scope is
  'Quantidade/Valor: PRODUCTS (produtos escolhidos) · CATEGORIES (categorias escolhidas) · ALL (tudo o que a pessoa vender).';
