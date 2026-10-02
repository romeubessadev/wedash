-- Aparência escolhida em Meu perfil, igual em qualquer aparelho. null = nunca escolheu (Automático).
alter table public.identity
  add column if not exists theme_preference text
    check (theme_preference in ('light', 'dark', 'system'));
