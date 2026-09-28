# Auth — Specification

## Problem Statement

O app ainda autentica com mock (CPF, senha ignorada, localStorage). Precisamos de autenticação real e-mail+senha, segura e sticky para PWA, multi-tenant pelo vínculo da pessoa (sem slug — AD-023) — sem ainda plugar o onboarding Millennium.

## Goals

- [ ] Usuário entra com e-mail e senha pelo endereço padrão da WeDash e permanece logado após F5
- [ ] Recuperação de senha por e-mail sem vazar se a conta existe
- [ ] Sessão hidrata vínculo (papel, tenant, filiais do escopo mock/DB)
- [ ] Front deixa de usar CPF como campo de login

## Out of Scope

| Feature | Reason |
| --- | --- |
| Onboarding 4 etapas / Millennium | Fatia seguinte |
| Sync contínuo / push | Features posteriores |
| Cadastro público | Só convite / bootstrap |
| Admin Global UI completa | Seed mínimo basta nesta fatia |
| Troca de e-mail | Depois |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Login | E-mail + senha | Pedido do gestor; padrão de apps | y |
| CPF | Não é login | ERP depois; opcional na identidade | y |
| Stack | Supabase Auth + Postgres | E-mail encaixa no GoTrue | y |
| Sessão | Sticky PWA; multi-device | App instalável + push depois | y |
| Sem env Supabase | Mock e-mail + qualquer senha | Dev sem projeto cloud | y |
| Onboarding | Fora desta feature | Escopo pedido | y |
| Erro de login | Sempre "E-mail ou senha inválidos" | Privacidade cross-tenant | y |
| Min senha | 8 caracteres + 1 especial | Pedido do gestor (2026-09-19); sobrescreve ideia.md (10 sem símbolo) | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Login e-mail + senha ⭐ MVP

**User Story**: As a user, I want to sign in with email and password so that I can access my franchise tenant.

**Why P1**: Core do acesso.

**Acceptance Criteria**:

1. WHEN the user submits a valid email and password for an active vínculo in the tenant THEN the system SHALL create a session and navigate to the role home (or onboarding if `onboarding_etapa` is set).
2. IF email or password is wrong OR the identity has no active vínculo in this tenant THEN the system SHALL show exactly "E-mail ou senha inválidos" without revealing which failed.
3. The system SHALL NOT offer public self-registration on the login screen.
4. The login form SHALL use email (not CPF) as the username field.
5. WHILE the user has a valid session the system SHALL keep them authenticated across page reloads without asking for the password again.

**Independent Test**: Entrar com e-mail fixture → dashboard; e-mail errado → mesma mensagem genérica; F5 mantém sessão.

---

### P1: Logout e multi-sessão ⭐ MVP

**User Story**: As a user, I want to sign out on one device without killing other devices so that I can use phone and desktop together.

**Why P1**: PWA multi-device.

**Acceptance Criteria**:

1. WHEN the user logs out THEN the system SHALL end only the current device session and redirect to login.
2. The system SHALL allow multiple concurrent sessions for the same identity.
3. WHEN the user changes password THEN the system SHALL invalidate all sessions for that identity.

**Independent Test**: Logout limpa sessão local; doc/teste de change-password revoga (Auth).

---

### P1: Recuperar e redefinir senha ⭐ MVP

**User Story**: As a user, I want to reset my password via email OTP so that I can regain access without support or broken redirect links.

**Why P1**: Fluxo padrão e-mail; OTP evita ngrok/localhost quebrando o link.

**Acceptance Criteria**:

1. WHEN the user requests recovery with any email THEN the system SHALL proceed to the OTP/new-password screen with the same messaging whether or not the account exists.
2. WHEN a valid 6-digit recovery OTP is entered with a new password (≥ 8 chars + 1 special) THEN the system SHALL update the password.
3. WHEN the password is saved THEN the system SHALL redirect to login with a success notice and SHALL NOT auto-login.
4. IF the OTP is expired or invalid THEN the system SHALL show a single invalid-code message with a path to request a new code.

**Independent Test**: Pedir código → digitar OTP + senha → login com aviso; OTP inválido → mensagem única.

---

### P2: Hydrate vínculo no tenant

**User Story**: As the system, I want the session to carry vínculo, papel and tenant so that route guards keep working.

**Why P2**: Bridges Auth user → app `Sessao`.

**Acceptance Criteria**:

1. WHEN a session is established THEN the system SHALL load the user's active vínculo (its tenant) into `Sessao` (vinculoId, papel, proprietario, filiais, onboardingEtapa).
2. IF no active vínculo exists for that tenant THEN the system SHALL treat login as failed with the generic error.

**Independent Test**: Login gestor → `RequirePapel` e home corretos.

---

## Edge Cases

- IF rate limit exceeded THEN the system SHALL still show the generic login or recovery message (no distinct “too many attempts” that confirms the email) OR 429 with same body as failed login — chosen default: same generic message for MVP mock; Auth project configures throttling.
- IF email format is invalid THEN the system SHALL block submit with a field error before calling the server.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| AUTH-01 | P1: Login | Implement | Pending |
| AUTH-02 | P1: Login generic error | Implement | Pending |
| AUTH-03 | P1: No public signup | Implement | Pending |
| AUTH-04 | P1: Email field | Implement | Pending |
| AUTH-05 | P1: Sticky session | Implement | Pending |
| AUTH-06 | P1: Logout device | Implement | Pending |
| AUTH-07 | P1: Multi-session | Implement | Pending |
| AUTH-08 | P1: Password change revokes | Implement | Pending |
| AUTH-09 | P1: Recovery uniform | Implement | Pending |
| AUTH-10 | P1: Reset password | Implement | Pending |
| AUTH-11 | P1: No auto-login after reset | Implement | Pending |
| AUTH-12 | P1: Invalid recovery link | Implement | Pending |
| AUTH-13 | P2: Hydrate vínculo | Implement | Pending |
| AUTH-14 | P2: No vínculo = fail | Implement | Pending |

**Coverage:** 14 total, 0 mapped to tasks yet, 14 unmapped

---

## Success Criteria

- [ ] Login UI is email-based; CPF login copy gone
- [ ] F5 after login keeps the user in the app
- [ ] Recovery UX never reveals whether the email exists
- [ ] With Supabase env, real Auth; without env, demo mock by email still works
