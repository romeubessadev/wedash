-- Cadastro pessoal no primeiro acesso ("Crie seu acesso"): nome, sobrenome e celular da pessoa.
-- `name` continua sendo o nome completo (lido pelo app todo); first_name/last_name guardam a separação.
alter table public.identity
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text;

comment on column public.identity.phone is 'Celular com DDD, só dígitos (ex.: 67999998888).';

-- A própria pessoa grava os dados junto com a senha (policy identity_update_own_temporary_password = só a própria linha).
grant update (name, first_name, last_name, phone) on public.identity to authenticated;
