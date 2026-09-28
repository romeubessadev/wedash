# ERP Sync + Visão Geral (dados reais) — Specification

## Problem Statement

A Visão Geral ainda usa mocks locais. O Millennium é a fonte real de vendas, mas não pode ser consultado a cada abertura do dashboard: sessão única (`busy`), risco de bloqueio por volume/IP e latência ruim. Precisamos de um cache canônico no WeDash — sync controlado no Brasil, dashboard só lendo Postgres — começando pela Visão Geral com faturamento e KPIs derivados de `VENDAS.Lista`.

## Goals

- [ ] Pós-onboarding (ou job equivalente), sync **backfill 3 meses** + **leve diário** grava agregados no Postgres sem burst no Millennium.
- [ ] Visão Geral exibe faturamento, nº de vendas, ticket e evolução a partir dos agregados (não de `sales.ts` mock) para o escopo loja/período atual.
- [ ] Nenhum page load do dashboard abre sessão Millennium.
- [ ] Watermark de “última atualização” reflete o último sync leve bem-sucedido do tenant.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| CMV / margem / `RELATORIOMARGEM` | Sync pesado — feature seguinte |
| Persistência venda-a-venda | Granularidade v1 = agregados |
| Backfill > 3 meses | Decidido 3 meses |
| Sync rodando só em Edge internacional | IP BR obrigatório |
| Equipe / Produtos / Financeiro completo em dados reais | Só VG nesta feature |
| UI completa de Configurações > ERP | Pode reusar credencial do onboarding; CRUD settings é fase 3 |
| ~~Roteamento por slug~~ | Descartado (AD-023: sem white label, endereço único) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Worker de sync | VPS/worker no Brasil | Millennium bloqueia IP fora do BR | y |
| Backfill | 3 meses, filial a filial | Suficiente p/ VG + vs mês anterior | y |
| Persistência | Agregado diário; horário só no dia corrente | Performance / custo | y |
| Fonte v1 | Só `VENDAS.Lista` | Fat/ticket/evolução sem CMV | y |
| Intervalo leve | 2 min dedicada / 30 min compartilhada | `ideia.md` | y (default) |
| Force refresh | OWNER/MANAGER, 1×/5 min | Evita derrubar sessão ERP | y (default) |
| Credencial | 1 por tenant; logout ao fim de cada job | Sessão única Millennium | y (default) |
| Mapeamento campos VENDAS | Validar no Design com curl real; até lá usar campos documentados em `ideia.md` | Payload ERP varia | y — Design confirma com amostra |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Sync leve + backfill grava agregados ⭐ MVP

**User Story**: As a system (tenant com ERP conectado), I want sales pulled from Millennium into WeDash aggregates so that the dashboard can read without locking the ERP.

**Why P1**: Sem sync não há dado real; é a base de tudo.

**Acceptance Criteria**:

1. WHEN onboarding completes with valid ERP credential and confirmed stores THEN the system SHALL enqueue a backfill job covering the last 90 days for each confirmed store, processed sequentially (one store at a time per credential).
2. WHEN a backfill or light-sync job runs THEN the system SHALL open at most one Millennium session for that credential, call `VENDAS.Lista` per store for the required window, upsert daily aggregates (and hourly aggregates only for the current calendar day in America/Sao_Paulo), and logout before the job ends.
3. WHILE a light or heavy sync job holds a credential session the system SHALL NOT start another sync job for the same credential.
4. IF Millennium returns session-busy or auth failure THEN the system SHALL mark the sync run as failed, persist the error timestamp/message for the tenant, and SHALL NOT leave an orphan session when logout is still possible.
5. The system SHALL NOT invoke Millennium from the Visão Geral (or other dashboard) page-load/read path.

**Independent Test**: Trigger backfill for one test store → rows appear in aggregate tables for ~90 days; Millennium session closed; dashboard code path does not call Millennium.

---

### P2: Visão Geral lê agregados reais

**User Story**: As a franchise owner, I want the Overview screen to show real revenue and sales KPIs for my selected store and period so that I can decide with live-ish data.

**Why P2**: Entrega visível do sync; vertical slice demoável.

**Acceptance Criteria**:

1. WHEN the user opens Visão Geral with a store scope and date range THEN the system SHALL compute KPIs (revenue, sales count, average ticket, time series) from WeDash sales aggregates for that scope — not from deterministic mock generators.
2. WHEN aggregates exist for the selected scope THEN the Overview SHALL render those values with the same filter semantics as today (`useScope`: store + period + brand when present in aggregates).
3. IF no aggregates exist yet for the tenant/store (sync pending or empty) THEN the system SHALL show an empty/pending state (not fabricated mock numbers).
4. WHEN a successful light sync completes THEN subsequent Overview reads within the synced window SHALL reflect the updated aggregates without a Millennium call.

**Independent Test**: Seed/sync one store with known totals → Overview matches those totals for “este mês” / “hoje”; with empty DB → empty state, no mock R$.

---

### P3: Watermark e force refresh (gestor)

**User Story**: As an owner/manager, I want to see when data was last synced and optionally force a light refresh so that I trust the numbers without hammering the ERP.

**Why P3**: Confiança operacional; rate limit protege a sessão.

**Acceptance Criteria**:

1. WHEN the Overview loads THEN the system SHALL display the timestamp of the tenant’s last successful light sync (or “never” / pending if none).
2. WHERE the user role is OWNER or MANAGER the system SHALL offer a force-refresh action that enqueues a light sync only.
3. IF a force refresh was requested less than 5 minutes ago for that tenant THEN the system SHALL reject the new request and keep the previous watermark.
4. WHEN force refresh is accepted THEN the system SHALL run the same light-sync rules as the scheduled job (one session, logout after).

**Independent Test**: Force refresh twice in <5 min → second rejected; after success watermark updates.

---

## Edge Cases

- IF a store has zero sales in a day THEN the system SHALL still allow Overview to show 0 (or omit the day according to existing chart empty rules) without falling back to mocks.
- IF backfill is interrupted mid-store THEN the system SHALL resume from the last incomplete store/day window without duplicating aggregates (upsert by natural key).
- IF the tenant has multiple stores THEN light sync SHALL process stores sequentially under one session (or one session with sequential Lista calls), never parallel sessions on the same credential.
- IF the ERP credential is missing or marked invalid THEN the system SHALL skip sync jobs and surface the invalid state for the owner (no silent infinite retries without backoff).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SYNC-01 | P1: Backfill enqueue 90d | Execute | Implemented |
| SYNC-02 | P1: Session + VENDAS + upsert + logout | Execute | Implemented |
| SYNC-03 | P1: No concurrent job per credential | Execute | Implemented |
| SYNC-04 | P1: Busy/auth failure handling | Execute | Implemented |
| SYNC-05 | P1: Dashboard never calls Millennium | Execute | Implemented |
| SYNC-06 | P2: Overview KPIs from aggregates | Execute | Implemented |
| SYNC-07 | P2: Scope filters preserved | Execute | Implemented |
| SYNC-08 | P2: Empty/pending vs mocks | Execute | Implemented |
| SYNC-09 | P2: Post-sync reads updated | Execute | Implemented |
| SYNC-10 | P3: Watermark | Execute | Implemented |
| SYNC-11 | P3: Force refresh role + 5 min | Execute | Implemented |
| SYNC-12 | P3: Force runs light sync rules | Execute | Implemented |

**Coverage:** 12 total, 0 mapped to tasks, 12 unmapped

---

## Success Criteria

- [ ] Visão Geral de um tenant de teste mostra faturamento coerente com uma amostragem manual de `VENDAS.Lista` do mesmo período (± tolerância de arredondamento documentada).
- [ ] Abrir/recarregar Overview **0** chamadas ao host Millennium (verificado em log/proxy).
- [ ] Backfill 3 meses × N lojas completa sem deixar sessão órfã; re-run é idempotente.
- [ ] Force refresh respeita janela de 5 minutos.
