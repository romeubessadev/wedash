-- Avisos do sino de Notificações (novidades da WeDash). Global: vale para todas as empresas.
-- Publicação pela equipe WeDash (SQL / script com service_role); sem tela de cadastro.
-- roles: papéis que veem o aviso (OWNER, MANAGER, SELLER, ADMIN_GLOBAL); null = todos.
-- link: rota do app aberta ao clicar (ex.: /stock/inventory); null = só marca como lido.

create table if not exists public.announcement (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  link text,
  roles text[],
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists announcement_published_at_idx on public.announcement (published_at desc);

alter table public.announcement enable row level security;

drop policy if exists announcement_select_published on public.announcement;
create policy announcement_select_published
  on public.announcement for select
  to authenticated
  using (published_at <= now());
