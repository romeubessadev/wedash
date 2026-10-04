-- Acesso do vendedor: conta WeDash (membership SELLER) ligada ao cadastro do Millennium (store_seller).
-- Uma conta por pessoa × empresa; cada loja em que ela vende aponta para a mesma membership
-- (store_seller.membership_id) e ganha uma linha em membership_store.

alter table public.store_seller
  add column if not exists membership_id uuid references public.membership (id) on delete set null;

create unique index if not exists store_seller_membership_store
  on public.store_seller (store_id, membership_id)
  where membership_id is not null;

comment on column public.store_seller.membership_id is
  'Conta de acesso do vendedor (membership SELLER). Mesma membership em todas as lojas da pessoa.';

-- Empresas em que o usuário logado tem acesso de Gestor/Gerente (exclui SELLER).
-- Usada nas policies por empresa: vendedor não lê nenhuma tabela da empresa.
create or replace function public.staff_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id
  from public.membership m
  join public.identity i on i.id = m.identity_id
  where i.auth_user_id = auth.uid()
    and m.status = 'ACTIVE'
    and m.role <> 'SELLER';
$$;

revoke all on function public.staff_tenant_ids() from public, anon;
grant execute on function public.staff_tenant_ids() to authenticated, service_role;

-- Token do convite já enviado por e-mail (mesmo TokenHash do link do e-mail). null = sem convite aberto.
create or replace function public.invite_link_token(p_auth_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(u.confirmation_token, '')
  from auth.users u
  where u.id = p_auth_user_id;
$$;

revoke all on function public.invite_link_token(uuid) from public, anon, authenticated;
grant execute on function public.invite_link_token(uuid) to service_role;

-- Cadastro inativo ou fora do Millennium (in_erp = false) com acesso:
--   ligado a outro cadastro ativo da mesma conta → só desliga esta loja;
--   senão ACTIVE → SUSPENDED (reativar no ERP não reabre: só Gestor/Gerente);
--   PENDING → cancela o convite e apaga o usuário do Auth se a pessoa ficou sem nenhum acesso.
create or replace function public.sync_seller_access(p_tenant_id uuid, p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_auth_user_id uuid;
begin
  for r in
    select s.id as seller_id, s.store_id, m.id as membership_id, m.status, m.identity_id
    from public.store_seller s
    join public.membership m on m.id = s.membership_id
    where s.tenant_id = p_tenant_id
      and s.store_id = p_store_id
      and (not s.active or not s.in_erp)
      and m.role = 'SELLER'
  loop
    if exists (
      select 1
      from public.store_seller o
      where o.membership_id = r.membership_id
        and o.id <> r.seller_id
        and o.active
        and o.in_erp
    ) then
      update public.store_seller set membership_id = null where id = r.seller_id;
      delete from public.membership_store
      where membership_id = r.membership_id
        and store_id = r.store_id::text;
    elsif r.status = 'ACTIVE' then
      update public.membership set status = 'SUSPENDED' where id = r.membership_id;
    elsif r.status = 'PENDING' then
      delete from public.membership where id = r.membership_id;

      select i.auth_user_id into v_auth_user_id
      from public.identity i
      where i.id = r.identity_id
        and i.status = 'PENDING'
        and not exists (select 1 from public.membership x where x.identity_id = i.id);

      if v_auth_user_id is not null then
        delete from auth.users where id = v_auth_user_id;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.sync_seller_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sync_seller_access(uuid, uuid) to service_role;
