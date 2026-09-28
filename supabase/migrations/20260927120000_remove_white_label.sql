-- Sem white label: a plataforma aparece sempre como WeDash e o acesso é sempre pelo endereço padrão.
-- Sai do tenant tudo o que era marca por empresa (slug, nome de exibição, logo, cor).
-- O nome da empresa (tenant.name) continua: identifica a conta (perfil, convites).

-- Leitura pública da "marca por slug" (anon) → só a própria empresa, logado.
drop policy if exists tenant_public_brand on public.tenant;
revoke select on public.tenant from anon;

drop policy if exists tenant_select_own on public.tenant;
create policy tenant_select_own
  on public.tenant for select
  to authenticated
  using (
    id in (
      select m.tenant_id
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
    )
  );

-- Onboarding (etapa Empresa) grava só o nome.
revoke update on public.tenant from authenticated;
grant update (name) on public.tenant to authenticated;

drop policy if exists tenant_update_own_brand on public.tenant;
drop policy if exists tenant_update_own_name on public.tenant;
create policy tenant_update_own_name
  on public.tenant for update
  to authenticated
  using (
    id in (
      select m.tenant_id
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.is_owner = true
        and m.status = 'ACTIVE'
    )
  )
  with check (
    id in (
      select m.tenant_id
      from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.is_owner = true
        and m.status = 'ACTIVE'
    )
  );

alter table public.tenant
  drop column if exists slug,
  drop column if exists previous_slug,
  drop column if exists display_name,
  drop column if exists logo_url,
  drop column if exists brand_color;
