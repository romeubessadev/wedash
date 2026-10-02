-- Desafios: tipo Índice de desempenho (INDEX).
-- Índice = 100 × (50% faturamento ÷ média da equipe + 25% ticket ÷ ticket da equipe + 25% P.A. ÷ P.A. da equipe).
-- Só no modo CONTEST, sem escopo de produtos (scope = ALL) e sem prêmio da gerência (a média da equipe é sempre 100).

alter table public.challenge drop constraint if exists challenge_metric_check;

alter table public.challenge
  add constraint challenge_metric_check check (metric in ('QUANTITY', 'VALUE', 'PA', 'TICKET', 'INDEX'));
