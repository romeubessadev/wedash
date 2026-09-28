-- Tipo de ponto da loja (Configurações > Aluguel): shopping paga aluguel + percentual do faturamento;
-- loja de rua paga só o aluguel. null = ainda não escolhido (tela trata como shopping).

alter table public.store
  add column if not exists point_type text check (point_type in ('MALL', 'STREET'));

comment on column public.store.point_type is
  'MALL = shopping (aluguel + percentual); STREET = loja de rua (só aluguel, sem percentual). null = não definido.';

grant update (point_type) on public.store to authenticated;
