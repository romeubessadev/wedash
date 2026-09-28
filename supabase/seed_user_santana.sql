-- Liga o usuário Auth já criado ao tenant mais antigo (rode no SQL Editor; troque o filtro se houver outro).
-- E-mail: santanaebessaltda@gmail.com
-- Requer coluna temporary_password (migrations de auth).

insert into public.identity (auth_user_id, email, name, status, temporary_password)
select u.id, u.email, 'Santana e Bessa', 'ACTIVE', true
from auth.users u
where lower(u.email) = lower('santanaebessaltda@gmail.com')
on conflict (auth_user_id) do update
  set email = excluded.email,
      name = excluded.name,
      status = 'ACTIVE',
      temporary_password = true;

insert into public.membership (
  identity_id, tenant_id, role, status, is_owner, onboarding_step, accepted_at
)
select
  i.id,
  t.id,
  'OWNER',
  'ACTIVE',
  true,
  1,
  now()
from public.identity i
cross join public.tenant t
where lower(i.email) = lower('santanaebessaltda@gmail.com')
  and t.id = (select id from public.tenant order by created_at limit 1)
on conflict (identity_id, tenant_id) do update
  set role = excluded.role,
      status = 'ACTIVE',
      is_owner = true,
      onboarding_step = excluded.onboarding_step;

-- Escopo demo: Shopping CG + Três Lagoas
insert into public.membership_store (membership_id, store_id)
select m.id, x.store_id
from public.membership m
join public.identity i on i.id = m.identity_id
join public.tenant t on t.id = m.tenant_id
cross join (values ('f1'), ('f2')) as x(store_id)
where lower(i.email) = lower('santanaebessaltda@gmail.com')
  and t.id = (select id from public.tenant order by created_at limit 1)
on conflict do nothing;

select i.email, i.name, i.status, i.temporary_password, m.role, m.is_owner, m.onboarding_step, t.name
from public.identity i
join public.membership m on m.identity_id = i.id
join public.tenant t on t.id = m.tenant_id
where lower(i.email) = lower('santanaebessaltda@gmail.com');
