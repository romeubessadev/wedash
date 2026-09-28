-- kind REGISTRY = Atualizar cadastros (Configurações > Integrações): lojas, gerador, colaboradores,
-- produtos e tabelas de custo do Millennium — nada de venda.

alter table public.sync_job drop constraint if exists sync_job_kind_check;
alter table public.sync_job
  add constraint sync_job_kind_check
  check (kind in ('BACKFILL', 'SEED', 'LIGHT', 'FORCE_LIGHT', 'FORCE', 'RANGE', 'HISTORY', 'CLOSE', 'REGISTRY'));

alter table public.sync_run drop constraint if exists sync_run_kind_check;
alter table public.sync_run
  add constraint sync_run_kind_check
  check (kind in ('BACKFILL', 'SEED', 'LIGHT', 'FORCE_LIGHT', 'FORCE', 'RANGE', 'HISTORY', 'CLOSE', 'REGISTRY'));
