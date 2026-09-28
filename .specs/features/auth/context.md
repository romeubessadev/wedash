# Auth — Context

**Gathered:** 2026-09-19  
**Spec:** `.specs/features/auth/spec.md`  
**Status:** Ready for design / implement (fatia 1 — só autenticação)

---

## Feature Boundary

Autenticação e-mail+senha com Supabase Auth, sessão PWA grudenta, recuperar/redefinir senha, resolve o vínculo ativo da pessoa (sem slug — AD-023), convite ATIVACAO/ACEITE. **Sem** onboarding Millennium nesta fatia.

---

## Implementation Decisions

### Login identifier

- E-mail + senha (padrão de app). E-mail único global.
- CPF não é login; fica para vínculo ERP (vendedora) depois.
- 1 e-mail → N filiais do tenant (filiais vêm do ERP numa feature seguinte).

### Stack

- Supabase Auth (e-mail/senha) + Postgres + Edge Functions.
- `identity` 1:1 with `auth.users`; `membership` carries tenant/role/scope.

### Sessão PWA

- Multi-device ok; F5/ociosidade não desloga enquanto refresh válido.
- Logout revoga só o dispositivo; troca de senha invalida todas as sessões.
- Push deferido.

### Demo local

- Sem `VITE_SUPABASE_URL`: front usa mock (e-mail das fixtures, qualquer senha) até o projeto Supabase existir.

### Agent's Discretion

- Detalhe de cookie vs localStorage do refresh Supabase no client oficial.
- Seed mínimo de tenant demo na migration.

### Declined / Undiscussed → Assumptions

- Onboarding 4 etapas / Millennium → feature seguinte.
- Subdomínio real em prod; local usa tenant fixture + header depois.

---

## Deferred Ideas

- Onboarding marca/ERP/filiais/equipe
- Sync Millennium, push, Admin Global UI completa
- Atualizar `ideia.md` §4 (já CPF) para e-mail

---

## Specific References

- Decisão do gestor: e-mail único, 1 conta para N filiais do ERP.
- Plano: `.cursor/plans/auth_onboarding_backend_c2d50d6d.plan.md`
