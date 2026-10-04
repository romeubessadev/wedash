# Acesso do vendedor Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/acesso-vendedor/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `vitest.config.ts` (include `src/**/*.test.ts`, `workers/**/*.test.ts`), workspace rule (build antes de commit), samples `goalView.test.ts`, `challengeView.test.ts`, `salesRepo.test.ts`, `challengesRepo.test.ts`, `stockProducts.test.ts`. No coverage thresholds; no component tests; no Deno test runner (deno not installed) - strong defaults applied to the pure engine.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Motor da meta / regras puras (`src/data/wedash/engine/*`, `sellerNumbers.ts`) | unit | All branches; 1:1 to spec ACs; every listed edge case | `src/data/wedash/**/*.test.ts` (co-located) | `npm test` |
| Extração sem mudança de regra (move de código) | unit | Existing suites (`goalView`, `goalCurve`, `salesRepo`, `challengeView`) pass unchanged | same | `npm test` |
| Cópia `_shared/engine` | unit | Byte-equality of every engine file | `src/data/wedash/engine/engineCopy.test.ts` | `npm test` |
| Migrations (schema, RLS) | none | build gate; isolation verified by T13 script after an approved `db push` | `supabase/migrations/*.sql` | build gate only |
| Isolamento RLS (script) | integration | Every `public` table returns 0 rows for a SELLER session; `seller-home` payload has no colleague R$ | `scripts/check-seller-isolation.mjs` | `node scripts/check-seller-isolation.mjs` (needs approved `db push` + deploy) |
| Edge Functions (glue Deno) | none | build gate; decisions live in the unit-tested engine; behavior checked in UAT | `supabase/functions/**` | build gate only |
| Worker glue | none | worker typecheck | `workers/millennium-sync/src/*` | build gate only |
| Repos / UI (React) | none | build + lint (no component tests in repo); UAT | `src/data/wedash/*Repo.ts`, `src/pages/**` | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After the integration task (T13) | `npm test && node scripts/check-seller-isolation.mjs` |
| Build | After phase completion or schema/Edge/UI-only tasks | `npm run build && npm run lint && npm test && npx tsc -p workers/millennium-sync --noEmit` |

Baseline before this feature (do not count as gate failures, never add to them): `npm test` = 4 failing tests in `src/data/wedash/dashboard.test.ts` ("Overview from sales aggregates", fixtures in September with "esteMes"); worker `tsc` = 4 errors in `decrypt.ts` (1) and `runSyncJob.test.ts` (3).

---

## Execution Plan

Phases run in order; tasks within a phase run in order. Arrows show dependencies inside a phase; dependencies on earlier phases are listed in each task.

### Phase 1: Motor da meta — extração (sem mudar regra)

```
T1 → T4
T2 → T4
T3
T2 → T5
```

### Phase 2: Motor da meta — regras do vendedor

```
T6 → T8
T7 → T8
T8 → T10
T9 → T10
```

### Phase 3: Banco e sincronização

```
T11 → T12 → T13
T11 → T14
T11 → T15
```

### Phase 4: Servidor (Edge Functions)

```
T16 → T17
T18
```

### Phase 5: Gestão > Vendedores e convite

```
T19 → T20 → T21
T19 → T21
T22
T23
```

### Phase 6: Tela Início do vendedor

```
T24 → T27
T25 → T26
T25 → T27
T25 → T28
T26 → T29
T27 → T29
T28 → T29
T29 → T30
```

---

## Task Breakdown

### Phase 1 tasks

### T1: Engine format helpers

**What**: Move the date/money helpers used by the goal code (`deIso`, `paraIso`, `somarDias`, `intervaloDias`, `fimDoMes`, `inicioDoMes`, `num`, `brlCent`, `collaboratorName`, `shiftName`) into `engine/format.ts`; `src/lib/format.ts` re-exports them.
**Where**: `src/data/wedash/engine/format.ts`
**Depends on**: None
**Reuses**: `src/lib/format.ts`
**Requirement**: SACC-03

**Done when**:

- [x] Engine file has no imports outside `engine/` and uses relative `.ts` imports only
- [x] All existing imports of `@/lib/format` keep compiling
- [x] Gate passes: `npm test` (existing count, no deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(engine): move goal format helpers into engine`

---

### T2: Engine goal types

**What**: Create `engine/goalTypes.ts` with `Tier`, `GoalRecord`, `GoalGroup`, `GoalTeamMember`, `GoalCardView`, `SellerRow`, `NetworkGlobalGoal`, `SalesDayAgg`, `SalesSellerDayAgg`; old modules re-export.
**Where**: `src/data/wedash/engine/goalTypes.ts`
**Depends on**: None
**Reuses**: `goals.ts`, `goalsRepo.ts`, `teamViews.ts`, `salesTypes.ts`
**Requirement**: SACC-03

**Done when**:

- [x] No imports in `goalTypes.ts`
- [x] `goalsRepo`, `teamViews`, `salesTypes`, `goals` re-export the moved types
- [x] Gate passes: `npm test` (existing count)

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(engine): move goal types into engine`

---

### T3: Engine weekday weights

**What**: Move `weekdayWeights` (and the pure helpers it needs) from `goalCurve.ts` into `engine/goalWeights.ts`; `goalCurve.ts` re-exports.
**Where**: `src/data/wedash/engine/goalWeights.ts`
**Depends on**: None
**Reuses**: `src/data/wedash/goalCurve.ts:31`
**Requirement**: SACC-03

**Done when**:

- [x] `goalCurve.test.ts` passes unchanged
- [x] Engine file imports only from `engine/`
- [x] Gate passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(engine): move weekday weights into engine`

---

### T4: Engine goal view

**What**: Move `goalView.ts` into `engine/goalView.ts` importing only `engine/format.ts` and `engine/goalTypes.ts`; `src/data/wedash/goalView.ts` becomes a re-export.
**Where**: `src/data/wedash/engine/goalView.ts`
**Depends on**: T1, T2
**Reuses**: `src/data/wedash/goalView.ts`
**Requirement**: SACC-03

**Done when**:

- [x] `goalView.test.ts` passes unchanged
- [x] No `@/` import in the engine
- [x] Gate passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(engine): move goal view into engine`

---

### T5: Engine row parsers

**What**: Create `engine/goalRows.ts` with `goalFromRow`, `teamMemberFromRow`, `sellerDayFromRow`, `NonSalesPeople` and `excludeNonSalesPeople`; `goalsRepo.ts` and `salesRepo.ts` use them.
**Where**: `src/data/wedash/engine/goalRows.ts`
**Depends on**: T2
**Reuses**: `goalsRepo.ts` parsers, `salesRepo.ts:458-473`
**Requirement**: SACC-06

**Done when**:

- [x] Unit tests: goal row with tiers/groups/manager prize, team member row, seller-day row, exclusion by código, gerador and loja+nome
- [x] Existing `salesRepo.test.ts` passes
- [x] Gate passes: `npm test` (+N new tests)

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(engine): share goal and seller row parsers`

---

### Phase 2 tasks

### T6: Seller ranking

**What**: `buildSellerRanking(view: GoalCardView, meKey)` → `{position, name, pct, level, me}[]` ordered by individual %, ties share position, no R$ field.
**Where**: `src/data/wedash/engine/sellerRanking.ts`
**Depends on**: T4
**Reuses**: `buildGoalCardView` output
**Requirement**: SACC-05

**Done when**:

- [x] Tests 1:1 to Ranking AC 1, 2, 4, 5, 6 and edge "só ele na meta" (1º de 1, sem linha de falta)
- [x] Grupo mode uses individual % (meta do grupo ÷ pessoas do grupo)
- [x] Test asserts no numeric field besides `position` and `pct` (AC 3)
- [x] Gap to the person above in p.p. exposed as `gapPp` for the seller
- [x] Gate passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(engine): seller ranking by goal percent`

---

### T7: Seller prize helpers

**What**: `nextLevelGain(level, goal)` and `projectedPrize(goal, level, input)` (projection after half the goal period using weekday weights; Grupo mode on the group sum).
**Where**: `src/data/wedash/engine/sellerPrize.ts`
**Depends on**: T3, T4
**Reuses**: `SellerGoalLevel`, `weekdayWeights`
**Requirement**: SACC-03

**Done when**:

- [x] Tests for Premiação AC 3 (gain = premiação no próximo nível − agora + bônus do nível), AC 4 (null before half; value after), AC 5 (último nível → null gain)
- [x] Edge: no sales → gain from first level; Grupo mode share
- [x] Gate passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(engine): seller prize gain and projection`

---

### T8: Seller home builder

**What**: `buildSellerHome(input)` → `SellerHomeStore[]` (per store: goal summary, `me`, `nextLevelGain`, `projectedPrize`, ranking) + `myDays` filtered to the seller only.
**Where**: `src/data/wedash/engine/sellerHome.ts`
**Depends on**: T6, T7
**Reuses**: `buildGoalCardView`, `sellerGoalLevels`, `excludeNonSalesPeople` (T5)
**Requirement**: SACC-03

**Done when**:

- [x] Tests: active goal with seller in group; seller outside groups (`me = null`, ranking still shown); no active goal (`goal = null`); two stores → two entries; goal ended yesterday → `goal = null`
- [x] `me` values equal `sellerGoalLevels` for the same person (Premiação AC 6)
- [x] `myDays` contains only the seller's rows (Leitura AC 2)
- [x] Gate passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(engine): seller home builder`

---

### T9: Seller access rules

**What**: Pure rules: `normalizeEmail`, `validEmail` (≤ 254), `canManageStore(role, memberStoreIds, storeId)`, `accessState(membership)`, `canTransition(from, to)`, `invitable(seller)` (active + cargo VENDEDOR).
**Where**: `src/data/wedash/engine/sellerAccess.ts`
**Depends on**: None
**Reuses**: `emailOk` logic from `team-members`
**Requirement**: SACC-01

**Done when**:

- [x] Tests for Convite AC 8, 12; Leitura AC 5 (gerente fora da loja); Ciclo de vida AC 5 (all allowed/denied transitions); edge e-mail com maiúsculas/espaços
- [x] Gate passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(engine): seller access rules`

---

### T10: Engine copy for Edge Functions

**What**: `npm run sync:engine` copies `src/data/wedash/engine/*.ts` (no tests) to `supabase/functions/_shared/engine/`; test fails when copies differ.
**Where**: `scripts/sync-engine.mjs`
**Depends on**: T8, T9
**Reuses**: none
**Requirement**: SACC-06

**Done when**:

- [x] `package.json` script `sync:engine`
- [x] `src/data/wedash/engine/engineCopy.test.ts` compares every file byte by byte
- [x] Copies committed
- [x] Gate passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `build(engine): copy goal engine to edge shared folder`

---

### Phase 3 tasks

### T11: Migration seller access

**What**: Add `store_seller.membership_id` (+ unique index), `staff_tenant_ids()`, `invite_link_token(auth_user_id)` and `sync_seller_access(tenant, store)` (service role only).
**Where**: `supabase/migrations/20261004130000_seller_access.sql` (20261003120000 and 20261004120000 were taken)
**Depends on**: None
**Reuses**: `link_seller_day_aggs` style
**Requirement**: SACC-07

**Done when**:

- [x] `sync_seller_access` follows Ciclo de vida AC 1-3 and the multi-store rule from the design
- [x] Execute revoked for `anon`/`authenticated` on the service-only functions
- [x] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(db): seller access link and lifecycle functions`

---

### T12: Migration staff-only policies

**What**: Recreate every tenant-wide policy of `public` tables to use `staff_tenant_ids()`; keep self-read policies (identity, membership, membership_store, tenant, announcement).
**Where**: `supabase/migrations/20261004130100_staff_only_policies.sql`
**Depends on**: T11
**Reuses**: current policy list (`select tablename, policyname, qual from pg_policies`)
**Requirement**: SACC-06

**Done when**:

- [ ] Every policy that used the membership subselect is recreated (list in a header comment)
- [ ] Gestor/Gerente behavior unchanged (same predicate minus SELLER)
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(db): exclude seller role from tenant policies`

---

### T13: Seller isolation check script

**What**: Script logs in as a test seller, queries every `public` table (expect 0 rows) and calls `seller-home` (expect no colleague R$).
**Where**: `scripts/check-seller-isolation.mjs`
**Depends on**: T12
**Reuses**: `scripts/reset-first-access.mjs` client setup
**Requirement**: SACC-06

**Done when**:

- [ ] Fails listing every table that returns rows
- [ ] Runs green after an approved `db push` + Edge deploy (blocked until then; ask before pushing)
- [ ] Gate passes: full

**Tests**: integration
**Gate**: full
**Commit**: `test(db): seller isolation check script`

---

### T14: Worker calls seller access sync

**What**: Call `sync_seller_access` right after `link_seller_day_aggs` in the worker team sync.
**Where**: `workers/millennium-sync/src/deps.ts`
**Depends on**: T11
**Reuses**: `deps.ts:735`
**Requirement**: SACC-07

**Done when**:

- [ ] Failure only logs a warning (team sync continues)
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(worker): suspend access of inactive sellers`

---

### T15: Sellers sync Edge calls seller access sync

**What**: Same call in the "Atualizar vendedores" Edge.
**Where**: `supabase/functions/erp-sellers-sync/index.ts`
**Depends on**: T11
**Reuses**: `erp-sellers-sync/index.ts:83`
**Requirement**: SACC-07

**Done when**:

- [ ] Failure only logs a warning
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(edge): suspend access of inactive sellers on manual sync`

---

### Phase 4 tasks

### T16: team-members seller list and invite

**What**: Actions `seller_list` and `seller_invite` (new account or link to existing SELLER account of the company; Gestor/Gerente authorization via engine rules).
**Where**: `supabase/functions/team-members/index.ts`
**Depends on**: T10, T11
**Reuses**: `invite` action, `sellerAccess.ts` copy
**Requirement**: SACC-01

**Done when**:

- [ ] Convite AC 3, 9, 10, 11 and P2 AC 1 handled (`linked: true`)
- [ ] Orphan PENDING identity treated as free
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(edge): invite sellers from the team list`

---

### T17: team-members seller lifecycle actions

**What**: Actions `seller_link`, `seller_resend`, `seller_revoke`, `seller_suspend`, `seller_reactivate`; `invite_info` returns `storeName` for SELLER.
**Where**: `supabase/functions/team-members/index.ts`
**Depends on**: T16
**Reuses**: `resend`/`revoke`/`suspend` actions, `invite_link_token`
**Requirement**: SACC-01

**Done when**:

- [ ] Convite AC 5, 6, 7; Aceitar AC 1
- [ ] `seller_link` returns the same link as the e-mail; fallback `generateLink` documented if the token read fails
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(edge): seller invite link and access lifecycle`

---

### T18: Edge seller-home

**What**: Edge that returns `SellerHomePayload` for the logged-in seller (service role queries + `buildSellerHome`).
**Where**: `supabase/functions/seller-home/index.ts`
**Depends on**: T10, T12
**Reuses**: auth pattern of `team-members`, engine copy
**Requirement**: SACC-06

**Done when**:

- [ ] Only ACTIVE SELLER memberships; `not_linked` without `store_seller`
- [ ] Queries paginate past 1000 rows and filter brand ALL like `salesRepo`
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(edge): seller home payload`

---

### Phase 5 tasks

### T19: Seller access repo

**What**: `fetchSellerAccess(storeId)`, `inviteSeller`, `copySellerInviteLink`, `resendSellerInvite`, `revokeSellerInvite`, `suspendSeller`, `reactivateSeller` with the spec's error messages.
**Where**: `src/data/wedash/sellerAccess.ts`
**Depends on**: T17
**Reuses**: Conta > Usuários repo pattern
**Requirement**: SACC-01

**Done when**:

- [ ] Error codes mapped to the spec texts (AC 8, 9, 10)
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(staff): seller access data layer`

---

### T20: Invite seller modal

**What**: Modal with e-mail (prefilled from `store_seller.email`), Enviar convite, then Copiar link do convite.
**Where**: `src/pages/management/InviteSellerModal.tsx`
**Depends on**: T19
**Reuses**: invite modal of Conta > Usuários, `FormField`, `useToast`
**Requirement**: SACC-01

**Done when**:

- [ ] Convite AC 2, 3, 4, 8 texts; "Enviando…" while sending; P2 toast "Acesso liberado também nesta loja."
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(staff): invite seller modal`

---

### T21: Vendedores access column

**What**: Column **Acesso** (badge) + row menu on the Ativos tab; no invite on Desligados.
**Where**: `src/pages/management/StaffPage.tsx`
**Depends on**: T19, T20
**Reuses**: `DataTable`, `Badge`, `Dropdown`
**Requirement**: SACC-01

**Done when**:

- [ ] Convite AC 1, 5, 6, 7, 12; P2 AC 2
- [ ] Skeleton while access loads
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(staff): access column for sellers`

---

### T22: Invite screen text for sellers

**What**: "Crie seu acesso" shows "…para acessar a WeDash como parte da equipe de vendas da loja FANTASIA." when the invite is SELLER; after accept opens the seller home.
**Where**: `src/pages/access/Invite.tsx`
**Depends on**: T17
**Reuses**: current invite text
**Requirement**: SACC-02

**Done when**:

- [ ] Aceitar AC 1, 2, 3
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(access): seller invite text`

---

### T23: Suspended seller login message

**What**: Login with a SUSPENDED SELLER membership signs out and shows "Seu acesso está suspenso. Fale com a gerência da loja.".
**Where**: `src/session/authApi.ts`
**Depends on**: None
**Reuses**: `hydrateSessionFromAuth`
**Requirement**: SACC-07

**Done when**:

- [ ] Ciclo de vida AC 4; Gestor/Gerente behavior unchanged
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(auth): suspended seller login message`

---

### Phase 6 tasks

### T24: Seller numbers

**What**: `sellerNumbers(myDays, period, today, mode)` → Faturamento, Nº de vendas, Ticket médio, P.A. with deltas (Mês vs previous slice through yesterday; Hoje without delta).
**Where**: `src/data/wedash/sellerNumbers.ts`
**Depends on**: None
**Reuses**: `kpiDelta`, `previousPeriod`
**Requirement**: SACC-04

**Done when**:

- [ ] Tests 1:1 to Seus números AC 1-6 (P.A. "—" when a day lacks items; zero sales without badge; sum across stores)
- [ ] Gate passes: `npm test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(seller): seller numbers`

---

### T25: Seller home repo

**What**: `fetchSellerHome()` calling the `seller-home` Edge (null on failure).
**Where**: `src/data/wedash/sellerHomeRepo.ts`
**Depends on**: T18
**Reuses**: Edge call helpers
**Requirement**: SACC-03

**Done when**:

- [ ] Returns typed payload from the engine types
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(seller): seller home data layer`

---

### T26: Prize card

**What**: Premiação block (até agora, nível, barra, falta, ao chegar, projeção, último nível, vazios).
**Where**: `src/pages/seller/PrizeCard.tsx`
**Depends on**: T25
**Reuses**: `GoalLevelsBar`, `EmptyBlock`
**Requirement**: SACC-03

**Done when**:

- [ ] Premiação AC 2-5, 8, 9 texts
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(seller): prize card`

---

### T27: Numbers card

**What**: Seus números with Hoje | Mês and four StatCards.
**Where**: `src/pages/seller/NumbersCard.tsx`
**Depends on**: T24, T25
**Reuses**: `Segmented`, `StatCard`
**Requirement**: SACC-04

**Done when**:

- [ ] Seus números AC 1-5 rendered
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(seller): numbers card`

---

### T28: Ranking card

**What**: Pódio + lista por % (sem R$), "Você: Nº de M", "Faltam X p.p. para o Nº lugar".
**Where**: `src/pages/seller/RankingCard.tsx`
**Depends on**: T25
**Reuses**: `BlocoRanking` (`src/pages/live/blocos.tsx:40`) with % formatting
**Requirement**: SACC-05

**Done when**:

- [ ] Ranking AC 2-5, 7 rendered
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(seller): store ranking card`

---

### T29: Seller home page and route

**What**: `SellerHomePage` (saudação, "Vendas atualizadas às HH:MM", cards por loja, skeleton, erro com Tentar novamente), rota `/home`, `homeForRole` SELLER, `navVendedora` = Início + Meu perfil, redirects `/my-goal` e `/minha-meta`.
**Where**: `src/pages/seller/SellerHomePage.tsx`
**Depends on**: T26, T27, T28
**Reuses**: `useMinSkeleton`, `SALES_SYNCED_EVENT`
**Requirement**: SACC-03

**Done when**:

- [ ] Premiação AC 1, 7, 10; Leitura AC 3 (gestor routes redirect)
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(seller): seller home page`

---

### T30: Seller shell guards

**What**: For SELLER skip ERP status reads, Millennium problem notifications, store picker, Atualizar and Exportar in the shell.
**Where**: `src/layout/AppShell.tsx`
**Depends on**: T29
**Reuses**: role checks in `Topbar`/`useNotifications`
**Requirement**: SACC-03

**Done when**:

- [ ] Premiação AC 11; no failed requests for SELLER in the console
- [ ] Gate passes: build

**Tests**: none
**Gate**: build
**Commit**: `feat(seller): seller shell without manager controls`

---

## Phase Execution Map

| Phase | Tasks | Count |
| --- | --- | --- |
| 1 Motor — extração | T1–T5 | 5 |
| 2 Motor — regras do vendedor | T6–T10 | 5 |
| 3 Banco e sincronização | T11–T15 | 5 |
| 4 Servidor | T16–T18 | 3 |
| 5 Gestão > Vendedores e convite | T19–T23 | 5 |
| 6 Tela Início do vendedor | T24–T30 | 7 |

Strictly sequential execution, one task at a time.

## Blast radius

`db push` (T11–T13), Edge deploy (T15–T18) and `git push` need an explicit go-ahead each time. Until then T13's gate stays pending and UAT runs after deploy.
