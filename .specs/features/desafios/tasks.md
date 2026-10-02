# Desafios Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Owner override (2026-10-02):** nenhum commit — todo o trabalho fica sem commit até o dono revisar. O campo `Commit` de cada tarefa é só a mensagem planejada. Migration e worker só vão para produção com autorização explícita.

---

**Design**: `.specs/features/desafios/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` / `.cursor/rules/wedash.mdc` (build antes de commit; sem metas de cobertura), `package.json` (`vitest run`, `oxlint`, `tsc -b`). Sem testes de componente no repo (0 arquivos `*.test.tsx`) — telas = build gate. Strong defaults applied for domain logic.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain / regra pura (`src/data/wedash/*View.ts`, `challengeForm.ts`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `src/data/wedash/*.test.ts` | `npx vitest run src/data/wedash/<arquivo>.test.ts` |
| Repositório — mapeamento puro de linhas (parse/serialize) | unit | Todos os campos e casos inválidos do JSON | `src/data/wedash/*.test.ts` | `npx vitest run src/data/wedash/<arquivo>.test.ts` |
| Repositório — consultas Supabase sem lógica | none | - (build gate only; padrão do repo: `goalsRepo.ts` sem teste) | - | build gate only |
| Worker — agregação pura (`millennium*.ts`) | unit | All branches; ACs DESAF-01/04 | `workers/millennium-sync/src/*.test.ts` | `npx vitest run workers/millennium-sync/src/<arquivo>.test.ts` |
| Worker — orquestração (`runSyncJob.ts`) | unit (deps mockadas) | Caminho feliz nos 2 pontos de gravação + falha soft (DESAF-03/05) | `workers/millennium-sync/src/runSyncJob.test.ts` | `npx vitest run workers/millennium-sync/src/runSyncJob.test.ts` |
| Worker — adaptador Supabase (`deps.ts`) | none | - (build gate only; sem teste no repo) | - | build gate only |
| Telas / componentes React / rotas | none | - (build gate only; sem testes de componente no repo) | - | build gate only |
| Migration SQL | none | - (revisão + `db push` com autorização) | - | - |
| Textos / mapas de copy (`syncLogs.ts`, `CLAUDE.md`) | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <testes da tarefa>` + `npx tsc -b --noEmit` (app) ou `npx tsc -p workers/millennium-sync --noEmit` (worker) |
| Full | After tasks with e2e/integration tests | N/A (sem e2e/integration no repo) — usar Build |
| Build | After phase completion or config/entity-only tasks | `npm run build` + `npm run lint` + `npx vitest run src workers/millennium-sync/src` (4 falhas de data pré-existentes em `dashboard.test.ts` são conhecidas e não contam) |

---

## Execution Plan

> A 1ª tarefa de cada fase declara `Depends on: None` porque a ordem das fases já garante a dependência (cada fase só começa depois da anterior).

### Phase 1: Dado por pessoa × produto (banco + sincronizador)

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Repositório e conta do desafio

```
T6 → T7 → T8 → T9 → T10 → T11 → T12
```

### Phase 3: Listagem

```
T13 → T14 → T15
```

### Phase 4: Editor

```
T16 → T17
```

### Phase 5: Detalhe, rotas, Equipe e registro

```
T18 → T19 → T20 → T21 → T22
```

---

## Task Breakdown

### T1: Migration das tabelas `challenge` e `sales_seller_product_day_agg`

**What**: Criar a migration com as duas tabelas, índices, RLS e grants do design.
**Where**: `supabase/migrations/20261002120000_challenge.sql`
**Depends on**: None
**Reuses**: `supabase/migrations/20260930120000_goal.sql`, `supabase/migrations/20260923193000_sales_product_day_agg.sql`
**Requirement**: DESAF-01, DESAF-03, DESAF-06, DESAF-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `challenge` com colunas/checks do design, sem constraint de sobreposição, RLS leitura (membership ACTIVE) e escrita (OWNER/MANAGER/ADMIN_GLOBAL)
- [x] `sales_seller_product_day_agg` com PK `(tenant_id, store_id, day, seller_gerador_id, product_code)`, índice `(tenant_id, day)`, RLS só leitura por membership, escrita só service_role
- [x] Não aplicada no remoto (aguarda autorização)

**Tests**: none
**Gate**: build

**Commit**: `feat(db): add challenge and seller product day aggregate tables`

---

### T2: Agregação pessoa × produto × dia a partir dos cupons

**What**: Função `sellerProductDayAggsFromCouponLines` e tipo `SalesSellerProductDayAgg`.
**Where**: `workers/millennium-sync/src/millenniumCouponReport.ts`
**Depends on**: T1
**Reuses**: `productDayAggsFromCouponLines` (mesmo arquivo)
**Requirement**: DESAF-01, DESAF-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Soma itens e faturamento por dia × gerador × código do produto (fallback `#id` sem código)
- [x] Ignora linhas sem gerador e cupons sem dia
- [x] Testes em `millenniumCouponReport.test.ts`: soma, sem gerador, cupom fora da Lista, fallback de código, nome mais recente
- [x] Gate check passes: `npx vitest run workers/millennium-sync/src/millenniumCouponReport.test.ts` + `npx tsc -p workers/millennium-sync --noEmit` (sem erro novo; 4 erros anteriores em `decrypt.ts` e `runSyncJob.test.ts`)
- [x] Test count: 5 anteriores + 6 novos = 11 passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worker): aggregate coupon items by seller and product`

---

### T3: Gravar o agregado nos dois pontos do relatório de cupom

**What**: Dep opcional `replaceSellerProductDayAggs` em `SyncJobDeps`, helper `saveSellerProductDayAggs` e chamadas em `saveCouponProducts` e `syncCouponProductsForDays`, com soft-fail (WARN `itens_pessoa`).
**Where**: `workers/millennium-sync/src/runSyncJob.ts`
**Depends on**: T2
**Reuses**: padrão do "CMV por produto" (`runSyncJob.ts:497-518`)
**Requirement**: DESAF-01, DESAF-02, DESAF-03, DESAF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Grava por `coupon.okWindows` (Atualizar/carga) e por dia (dias com buraco)
- [x] Falha do replace → `console.warn` + `syncLog("WARN", "itens_pessoa", …)` e o job segue
- [x] Dep ausente = não grava (testes antigos intactos)
- [x] Testes em `runSyncJob.test.ts`: linhas gravadas no FORCE, falha soft não derruba o job (+ carga em período, + sem dep)
- [x] Gate check passes: `npx vitest run workers/millennium-sync/src/runSyncJob.test.ts` + `npx tsc -p workers/millennium-sync --noEmit` (sem erro novo)
- [x] Test count: 63 anteriores + 4 novos = 67 passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worker): persist seller product day aggregates`

---

### T4: Implementar `replaceSellerProductDayAggs` no adaptador Supabase

**What**: Delete do range da loja + upsert em lotes na `sales_seller_product_day_agg`.
**Where**: `workers/millennium-sync/src/deps.ts`
**Depends on**: T3
**Reuses**: `replaceProductDayAggs` (`deps.ts:901`)
**Requirement**: DESAF-01, DESAF-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mesma forma do `replaceProductDayAggs` (onConflict = PK; upsert em lotes de 500)
- [x] Gate check passes: `npx tsc -p workers/millennium-sync --noEmit`

**Tests**: none
**Gate**: build

**Commit**: `feat(worker): supabase adapter for seller product day aggregates`

---

### T5: Texto da origem "Itens por pessoa" em Logs

**What**: Entrada `itens_pessoa` em `SYNC_LOG_TEXT` (problema curto + explicação) e símbolo da origem.
**Where**: `src/data/wedash/syncLogs.ts`
**Depends on**: T4
**Reuses**: entradas existentes de `SYNC_LOG_TEXT`
**Requirement**: DESAF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Lista mostra "Itens por pessoa não gravados"; detalhe explica que desafios de produto/categoria ficam incompletos no dia
- [x] Gate check passes: `npx tsc -b --noEmit`

**Tests**: none
**Gate**: build

**Commit**: `feat(logs): describe seller items log source`

---

### T6: Tipos e mapeamento de linhas do desafio

**What**: Tipos `ChallengeRecord`/`ChallengeInput`/`ChallengePrize` e funções puras `challengeFromRow` / `challengeToRow`.
**Where**: `src/data/wedash/challengesRepo.ts`
**Depends on**: None
**Reuses**: `parseTiers`/`fromRow` de `goalsRepo.ts`
**Requirement**: DESAF-07..DESAF-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Prêmio `{kind:"MONEY",cents}` ↔ `{kind:"MONEY",amount}`; `{kind:"ITEM",label}` com label 1–60
- [x] JSON inválido/vazio vira lista vazia; enums desconhecidos caem no padrão seguro
- [x] Testes em `challengesRepo.test.ts` cobrindo ida e volta e casos inválidos
- [x] Gate check passes: `npx vitest run src/data/wedash/challengesRepo.test.ts` + `npx tsc -b --noEmit`
- [x] Test count: 11 testes passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(challenges): challenge record types and row mapping`

---

### T7: Consultas do desafio (CRUD, agregados e catálogo)

**What**: `fetchChallenges`, `fetchChallenge`, `saveChallenge`, `deleteChallenge`, `fetchChallengeInput`, `fetchChallengeCatalog`.
**Where**: `src/data/wedash/challengesRepo.ts`
**Depends on**: T6
**Reuses**: `goalsRepo.ts` (CRUD + demo), `salesRepo.ts` (`fetchAllPages`, `fetchSalesSellerDayAggs`, `fetchNonSalesPeople` → exportar), `stockRepo.ts` (catálogo)
**Requirement**: DESAF-02, DESAF-06, DESAF-19, DESAF-22, DESAF-28..DESAF-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Agregado novo lido só quando há desafio de Produtos/Categorias; gerência/freelancer excluídos
- [x] Erros → `console.warn` e retorno vazio / `ok:false`
- [x] Gate check passes: `npx tsc -b --noEmit`

**Tests**: none
**Gate**: build

**Commit**: `feat(challenges): supabase queries for challenges`

---

### T8: Gerador na equipe da meta

**What**: `fetchGoalTeam` passa a trazer `millennium_gerador_id` (campo opcional `geradorId`).
**Where**: `src/data/wedash/goalsRepo.ts`
**Depends on**: T7
**Reuses**: `fetchGoalTeam`
**Requirement**: DESAF-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Metas sem mudança de comportamento
- [x] Gate check passes: `npx tsc -b --noEmit` + `npx vitest run src/data/wedash/goalView.test.ts`

**Tests**: none
**Gate**: build

**Commit**: `feat(goals): expose seller gerador in goal team`

---

### T9: Resultado por pessoa (participantes e métricas)

**What**: `buildChallengeView` — participantes (equipe ativa ∪ quem vendeu, ligação gerador → cadastro) e resultado de Produtos, Categorias, P.A. e Ticket.
**Where**: `src/data/wedash/challengeView.ts`
**Depends on**: T8
**Reuses**: identidade `e:`/`n:` de `goalView.ts`, `goalStatus`, `prazoRestante`
**Requirement**: DESAF-28, DESAF-29, DESAF-30, DESAF-31, DESAF-38, DESAF-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes em `challengeView.test.ts`: soma de produtos escolhidos, categoria pelo catálogo, P.A./ticket, P.A. "—" sem itens, pessoa desligada que vendeu, só a loja do desafio, sem participantes, A começar sem resultado (+ pessoa sem cadastro pelo nome)
- [x] Gate check passes: `npx vitest run src/data/wedash/challengeView.test.ts` + `npx tsc -b --noEmit`
- [x] Test count: ≥ 8 testes passam (9)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(challenges): per-person challenge results`

---

### T10: Disputa, Mínimo e "falta"

**What**: Posições com empate (1,1,3), elegibilidade (zero, piso, mínimo de vendas, "—"), vencedores, "Atingiu" e texto do que falta.
**Where**: `src/data/wedash/challengeView.ts`
**Depends on**: T9
**Reuses**: —
**Requirement**: DESAF-32, DESAF-33, DESAF-34, DESAF-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: empate no 1º, 2º ausente, piso, resultado zero, mínimo de vendas (P.A. 2,0 com 8 vendas não atinge), Mínimo atingiu/não, falta para posição de cima e para o alvo (+ encerrado sem "falta")
- [x] Gate check passes: `npx vitest run src/data/wedash/challengeView.test.ts` + `npx tsc -b --noEmit`
- [x] Test count: anteriores + ≥ 8 novos passam (9). Discriminação: quebrar empate e mínimo de vendas derrubou 4 testes
- Decisão de implementação: na Disputa as posições contam só quem concorre (resultado > 0, sem "—" e com o mínimo de vendas) — quem não tem o mínimo não tira o prêmio de quem tem; o piso não reordena, só impede o prêmio

**Tests**: unit
**Gate**: quick

**Commit**: `feat(challenges): contest podium and minimum rules`

---

### T11: Gerência e resultado incompleto

**What**: Resultado da equipe (Σ itens ÷ participantes, P.A., ticket) contra alvo/piso; dias com venda sem dado de itens por pessoa.
**Where**: `src/data/wedash/challengeView.ts`
**Depends on**: T10
**Reuses**: —
**Requirement**: DESAF-35, DESAF-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: gerência atinge/não atinge em cada métrica (itens e P.A. atingem, ticket não atinge, a começar sem resultado), Disputa sem piso = sem gerência, dias incompletos só para Produtos/Categorias e só até hoje
- [x] Gate check passes: `npx vitest run src/data/wedash/challengeView.test.ts` + `npx tsc -b --noEmit`
- [x] Test count: anteriores + ≥ 6 novos passam (7, contando prazo/fechamento)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(challenges): manager prize and incomplete data detection`

---

### T12: Fechamento, resumo do card e duplicar

**What**: `challengePayout`, `challengeCardSummary`, `nextDayPeriod`, `copyChallenge`, `emFechamento`, rótulos de status e de valor.
**Where**: `src/data/wedash/challengeView.ts`
**Depends on**: T11
**Reuses**: `goalStatus`
**Requirement**: DESAF-15, DESAF-23, DESAF-40, DESAF-41, DESAF-42, DESAF-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: total soma só R$ (empate soma os dois), prêmio em espécie listado, sem vencedor, "Fechamento em andamento" até o dia seguinte ao fim, líder / "N atingiram", cópia com período seguinte e "(cópia)"
- [x] Gate check passes: `npx vitest run src/data/wedash/challengeView.test.ts` + `npx tsc -b --noEmit`
- [x] Test count: anteriores + ≥ 6 novos passam (6; arquivo com 31). `nextDayPeriod` ficou dentro de `copyChallenge`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(challenges): payout summary and duplicate helpers`

---

### T13: Rotas nomeadas dos desafios

**What**: `challengeNew`, `challengeDetail(id)`, `challengeEdit(id)`, `challengeCopy(id)` em `paths.management`.
**Where**: `src/router/paths.ts`
**Depends on**: None
**Reuses**: `goalNew`/`goalDetail`/`goalEdit`/`goalCopy`
**Requirement**: DESAF-24, DESAF-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npx tsc -b --noEmit` (via `npm run build`)

**Tests**: none
**Gate**: build

**Commit**: `feat(router): challenge paths`

---

### T14: Skeletons dos desafios

**What**: `ChallengeCardsSkeleton`, `ChallengeDetailSkeleton`, `ChallengeEditorSkeleton`.
**Where**: `src/components/wedash/LoadingSkeletons.tsx`
**Depends on**: T13
**Reuses**: `GoalCardsSkeleton`, `GoalDetailSkeleton`
**Requirement**: DESAF-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mesmo formato das telas
- [x] Gate check passes: `npx tsc -b --noEmit` (via `npm run build`)

**Tests**: none
**Gate**: build

**Commit**: `feat(ui): challenge skeletons`

---

### T15: Listagem de desafios

**What**: `ChallengesPage` com cards (formato Categories), filtro de período, duplicar, excluir com modal, vazio 🔥 e recarga silenciosa.
**Where**: `src/pages/management/ChallengesPage.tsx`
**Depends on**: T14
**Reuses**: `src/pages/goals/GoalsPage.tsx`
**Requirement**: DESAF-22, DESAF-23, DESAF-24, DESAF-25, DESAF-26, DESAF-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Ordem Em andamento → A começar → Encerrados; líder ou "N atingiram" no card (textos do card em `src/pages/challenges/shared.tsx`)
- [x] Gate check passes: `npm run build`

**Tests**: none
**Gate**: build

**Commit**: `feat(challenges): challenge listing`

---

### T16: Validação do formulário do desafio

**What**: `validateChallengeForm` (erros por campo) e `challengeFormToInput`.
**Where**: `src/data/wedash/challengeForm.ts`
**Depends on**: None
**Reuses**: regras de validação do `GoalEditorPage`
**Requirement**: DESAF-07..DESAF-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes em `challengeForm.test.ts`: obrigatórios, produto/categoria mínimo 1, mínimo de vendas ≥ 1, alvo por métrica, 3º só com 2º, prêmio R$ > 0 ou 1–60 caracteres, gerência obrigatória quando ligada, Disputa sem piso desliga gerência, fim antes do início (+ nome até 80, ida e volta registro → formulário → input)
- [x] Gate check passes: `npx vitest run src/data/wedash/challengeForm.test.ts` + `npx tsc -b --noEmit`
- [x] Test count: ≥ 10 testes passam (14). Discriminação: Mínimo gravando mais de 1 prêmio derrubou 1 teste. "3º só com 2º" é garantido pela tela (linhas na ordem); o validador exige prêmio em toda linha adicionada

**Tests**: unit
**Gate**: quick

**Commit**: `feat(challenges): challenge form validation`

---

### T17: Editor do desafio

**What**: `ChallengeEditorPage` (novo, editar, duplicar via `?copy=`) com campos de prêmio e seletores de produto/categoria.
**Where**: `src/pages/challenges/ChallengeEditorPage.tsx`
**Depends on**: T16
**Reuses**: `src/pages/goals/GoalEditorPage.tsx` (casca, Loja só em "Todas", toasts, "Salvando…")
**Requirement**: DESAF-07..DESAF-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Salvou → toast e abre o detalhe; falha → toast padrão e formulário mantido
- [x] Gate check passes: `npm run build`

> Feito: casca do editor de Metas (Voltar + breadcrumb, Loja só em "Todas", "Cópia de NOME", Cancelar / "Salvando…"). Trocar a métrica limpa o alvo/piso; gerência só liga quando há alvo/piso (`managerAvailable`).

**Tests**: none
**Gate**: build

**Commit**: `feat(challenges): challenge editor`

---

### T18: Detalhe do desafio

**What**: `ChallengeDetailPage` com resumo, alerta de incompleto, participantes, fechamento e PDF.
**Where**: `src/pages/challenges/ChallengeDetailPage.tsx`
**Depends on**: None
**Reuses**: `src/pages/goals/GoalDetailPage.tsx` (`GoalHero`, `GoalPayoutCard`, `PayoutReportHeader`, `exportPdf`)
**Requirement**: DESAF-28..DESAF-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Encerrado mostra Fechamento + Exportar; "Desafio não encontrado" com Voltar
- [x] Gate check passes: `npm run build`

> Feito: resumo (métrica + itens, critério + mínimo de vendas, prêmios + gerência, líder/vencedor, prazo), alerta amarelo "Resultado incompleto" com os dias, participantes (posição, resultado, vendas em P.A./ticket, situação = "1º lugar"/"Atingiu" ou o que falta, prêmio) com a faixa da gerência; encerrado = card Fechamento (vencedores, prêmios em R$, em espécie contados, "Nenhum vencedor neste desafio.", selo "Fechamento em andamento") + PDF só com cabeçalho, resumo e fechamento (participantes e alerta ficam fora do papel).

**Tests**: none
**Gate**: build

**Commit**: `feat(challenges): challenge detail and payout`

---

### T19: Registrar rotas de editor e detalhe

**What**: Rotas `/management/challenges/new`, `/:id`, `/:id/edit` (Gestor + Gerente).
**Where**: `src/pages/management/routes.tsx`
**Depends on**: T18
**Reuses**: `src/pages/goals/routes.tsx`
**Requirement**: DESAF-07, DESAF-24, DESAF-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run build`

**Tests**: none
**Gate**: build

**Commit**: `feat(router): register challenge editor and detail routes`

---

### T20: Card compacto do desafio para a Equipe

**What**: `ChallengeMiniCard` (líderes ou "N atingiram", prazo, prêmio; clique abre detalhe).
**Where**: `src/pages/challenges/ChallengeMiniCard.tsx`
**Depends on**: T19
**Reuses**: card da listagem (T15)
**Requirement**: DESAF-45, DESAF-46

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npx tsc -b --noEmit`

**Tests**: none
**Gate**: build

**Commit**: `feat(team): compact challenge card`

---

### T21: Aba Desafios do Desempenho da equipe

**What**: Buscar desafios em andamento das lojas do seletor e mostrar `ChallengeMiniCard`; vazio atual quando não houver.
**Where**: `src/pages/team/TeamPage.tsx`
**Depends on**: T20
**Reuses**: aba Metas da mesma tela
**Requirement**: DESAF-45, DESAF-46, DESAF-47

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run build` + `npm run lint`

> Feito: desafios em andamento **hoje** nas lojas do StorePicker (não seguem o período da tela, como o card de Metas segue o início da meta), ordenados pelo fim mais próximo; loja no card só com "Todas" e mais de 1 loja. Falha na busca dos desafios não derruba a tela (vira vazio + log).

**Tests**: none
**Gate**: build

**Commit**: `feat(team): show active challenges in team dashboard`

---

### T22: Registrar decisões no CLAUDE.md

**What**: Item #49 "Gestão > Desafios" com modelo, regras, dado novo e pendência de deploy.
**Where**: `CLAUDE.md`
**Depends on**: T21
**Reuses**: formato do item #48 (Metas)
**Requirement**: DESAF-01..DESAF-47 (documentação)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Decisões e pendências registradas; sem commit
- [x] Gate check passes: `npm run build` + `npm run lint` + `npx vitest run src workers/millennium-sync/src`

> Gate: build 0 · lint 0 · vitest 515/519 — as 4 falhas são as de data já conhecidas em `dashboard.test.ts` (fora desta feature).

**Tests**: none
**Gate**: build

**Commit**: `docs: register challenges decisions`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T6 → T7 → T8 → T9 → T10 → T11 → T12
Phase 3:  T13 → T14 → T15
Phase 4:  T16 → T17
Phase 5:  T18 → T19 → T20 → T21 → T22
```

Execution is strictly sequential.
