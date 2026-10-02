# Desafios Design

**Spec**: `.specs/features/desafios/spec.md`
**Context**: `.specs/features/desafios/context.md`
**Status**: Approved (abordagem A aprovada pelo dono em 2026-10-02; rota `/management/challenges`; trabalho sem commit até revisão)

---

## Architecture Overview

Abordagem A: tabela `challenge` (molde da `goal`, sem trava de período) + novo agregado `sales_seller_product_day_agg`
gravado pelo sincronizador a partir do relatório de produtos por cupom que ele **já** busca. A conta do desafio (resultado,
ranking, pódio com empate, mínimo, gerência, fechamento) roda no navegador num módulo puro com testes
(`challengeView.ts`, igual a `goalView.ts`). Conforma AD-015 / AD-017: o Dashboard e a Gestão leem só o Postgres.

```mermaid
graph TD
  subgraph Worker (millennium-sync)
    CR[Relatório de cupom 52DE7BBC<br/>já buscado no Atualizar / madrugada / carga] --> SCP[saveCouponProducts<br/>syncCouponProductsForDays]
    SCP --> PDA[(sales_product_day_agg)]
    SCP --> SPDA[(sales_seller_product_day_agg NOVO)]
    LISTA[VENDAS.Lista] --> SDA[(sales_seller_day_agg)]
  end
  subgraph Banco
    CH[(challenge NOVO)]
    SS[(store_seller)]
    CAT[(product_catalog / product_type)]
    DAY[(sales_day_agg)]
  end
  subgraph Navegador
    REPO[challengesRepo.ts] --> CH
    REPO --> SPDA
    REPO --> SDA
    REPO --> SS
    REPO --> CAT
    REPO --> DAY
    VIEW[challengeView.ts<br/>conta pura + testes] --> PAGES
    REPO --> VIEW
    PAGES[ChallengesPage · ChallengeEditorPage · ChallengeDetailPage<br/>aba Desafios da Equipe]
  end
```

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --- | --- | --- |
| Tabela `goal` (colunas, RLS, grants) | `supabase/migrations/20260930120000_goal.sql` | Copiar para `challenge`, **sem** `goal_no_overlap` |
| Tabela `sales_product_day_agg` (RLS leitura por membership) | `supabase/migrations/20260923193000_sales_product_day_agg.sql` | Copiar para `sales_seller_product_day_agg` |
| `productDayAggsFromCouponLines` | `workers/millennium-sync/src/millenniumCouponReport.ts:200` | Molde de `sellerProductDayAggsFromCouponLines` (mesma chave de dia via `dayOf`) |
| `saveCouponProducts` / `syncCouponProductsForDays` | `workers/millennium-sync/src/runSyncJob.ts:972` / `:1040` | Únicos pontos de gravação do top produtos — chamar o novo replace aqui (cobre FORCE, SEED, CLOSE e carga em período) |
| `deps.replaceProductDayAggs` | `workers/millennium-sync/src/deps.ts:901` | Molde do `replaceSellerProductDayAggs` (delete range + upsert) |
| `syncLog("WARN", origem, …)` soft-fail | `runSyncJob.ts:516` (CMV por produto) | Mesmo padrão para "Itens por pessoa" (DESAF-05) |
| `SYNC_LOG_TEXT` | `src/data/wedash/syncLogs.ts` | Nova origem com problema curto + explicação |
| `goalsRepo.ts` (save/fetch/delete, demo sem Supabase, `fetchGoalTeam`) | `src/data/wedash/goalsRepo.ts` | Molde de `challengesRepo.ts`; `fetchGoalTeam` reusado como está (equipe + grupo) |
| `goalStatus`, `GOAL_STATUS_LABEL`, `prazoRestante`, `nextGoalPeriod` | `src/data/wedash/goalView.ts` | `goalStatus` e `prazoRestante` reusados direto; rótulos próprios no masculino (`CHALLENGE_STATUS_LABEL`: Em andamento · A começar · Encerrado). Duplicar usa `nextDayPeriod` própria (ver Tech Decisions) |
| Identidade da pessoa `e:{código}` / `n:{nome}` | `goalView.ts:320-332` | Mesma regra; pessoa do novo agregado liga por gerador → `store_seller` |
| `excludeNonSalesPeople` / `fetchNonSalesPeople` | `src/data/wedash/salesRepo.ts:466` / `:475` | Tirar gerência/freelancer do novo agregado (por gerador e nome) |
| `fetchSalesSellerDayAggs` | `salesRepo.ts:540` | Base de P.A. e ticket por pessoa |
| `fetchStockCatalog` (catálogo + `product_type`) | `src/data/wedash/stockRepo.ts:126` | Molde do catálogo do seletor (precisa também do `type_id`) |
| Listagem de Metas (card formato Categories, skeleton, modal excluir, vazio) | `src/pages/goals/GoalsPage.tsx` | Copiar estrutura para `ChallengesPage` |
| Editor de Metas (cards, validação após 1ª tentativa, `REQUIRED`, toast "Revise os campos destacados.", Loja só em "Todas", `?copy=`) | `src/pages/goals/GoalEditorPage.tsx` | Copiar estrutura para `ChallengeEditorPage` |
| Detalhe de Metas (`GoalHero`, `GoalPayoutCard`, `PayoutReportHeader`, `exportPdf`) | `src/pages/goals/GoalDetailPage.tsx` | Copiar estrutura (resumo · participantes · fechamento + PDF) |
| `StoreCardsPage` / `useScopedStores` / `SectionHeader` (abas da Gestão) | `src/pages/operation/shared.tsx` | Cabeçalho e abas da Gestão |
| `useMinSkeleton`, `usePagedRows`, `EmptyBlock`, `Alert`, `AvatarIniciais`, `ProductNameCell` | `src/lib`, `src/pages/dashboard`, `src/components/wedash` | Skeleton, paginação, vazios, aviso incompleto, linhas |
| Aba Desafios do Desempenho da equipe | `src/pages/team/TeamPage.tsx:527` | Trocar o vazio fixo pelos cards (P2) |
| `SALES_SYNCED_EVENT` | `src/data/wedash/syncUi.ts` | Recarga silenciosa por venda nova |

### Integration Points

| System | Integration Method |
| --- | --- |
| Sincronizador | Novo replace dentro de `saveCouponProducts`/`syncCouponProductsForDays`, depois do top produtos, em `try/catch` (soft-fail) |
| Banco | Migration nova com 2 tabelas; leitura via supabase-js com RLS por membership; escrita de `challenge` por OWNER/MANAGER/ADMIN_GLOBAL |
| Rotas | `paths.management.challenges` (já existe) + `challengeNew`, `challengeDetail(id)`, `challengeEdit(id)`, `challengeCopy(id)` em `src/router/paths.ts`; rotas em `src/pages/management/routes.tsx` |
| Dashboard > Equipe | `TeamPage` busca desafios em andamento das lojas do seletor e renderiza `ChallengeMiniCard` |

---

## Components

### Migration `20261002120000_challenge.sql`

- **Purpose**: criar `challenge` e `sales_seller_product_day_agg` com RLS.
- **Location**: `supabase/migrations/`
- **Conteúdo**:
  - `challenge` — colunas do Data Model abaixo; checks de enum (`metric`, `mode`), `ends_on >= starts_on`, `jsonb_typeof` = array em `prizes`/`products`/`categories`; índice `(tenant_id, store_id, starts_on)`; RLS `challenge_select_own` (membership ACTIVE) e `challenge_write_managers` (OWNER/MANAGER/ADMIN_GLOBAL), grants authenticated + service_role. **Sem** constraint de sobreposição (DESAF-16).
  - `sales_seller_product_day_agg` — PK `(tenant_id, store_id, day, seller_gerador_id, product_code)`; índice `(tenant_id, day)`; RLS só leitura por membership (DESAF-06); escrita só service_role.
- **Deploy**: `db push` só com autorização explícita do dono.

### `sellerProductDayAggsFromCouponLines` (worker)

- **Purpose**: agregar itens por loja × dia × pessoa × produto a partir dos cupons já agrupados.
- **Location**: `workers/millennium-sync/src/millenniumCouponReport.ts`
- **Interfaces**:
  - `sellerProductDayAggsFromCouponLines(byCoupon: Map<string, CouponReportLine[]>, opts: { tenantId; storeId; dayOf }): SalesSellerProductDayAgg[]` — ignora linha sem `sellerGeradorId` (DESAF-04) e cupom sem dia (fora da Lista); chave por `productCode` (fallback `#productId` quando o código vier vazio); nome da pessoa = o mais recente do relatório.
- **Reuses**: `productDayAggsFromCouponLines` (mesma forma).
- **Nota**: itens do DetMov (cupom fora do relatório = sem vendedor) não têm gerador → ficam de fora naturalmente. Cancelados já não chegam (filtro do parse do relatório).

### `replaceSellerProductDayAggs` (worker deps)

- **Purpose**: substituir as linhas da loja nos dias da janela (DESAF-03).
- **Location**: tipo em `runSyncJob.ts` (`SyncJobDeps`, **opcional** para não quebrar mocks de teste e permitir desligar), implementação em `deps.ts`.
- **Interfaces**: `replaceSellerProductDayAggs?(args: { tenantId; storeId; from; to; rows }): Promise<void>` — delete `.eq tenant/store .gte/.lte day` + upsert em lotes (`onConflict` = PK).
- **Chamada**: em `saveCouponProducts` (por `coupon.okWindows`) e `syncCouponProductsForDays` (por dia), logo após `replaceProductDayAggs`, dentro de `try/catch`: falha → `console.warn` + `syncLog("WARN", "itens_pessoa", "Itens por pessoa não gravados: …", { store })` e segue (DESAF-05). Nenhuma chamada nova ao ERP (DESAF-02).

### `challengesRepo.ts`

- **Purpose**: ler/gravar desafios e ler os dados que a conta precisa.
- **Location**: `src/data/wedash/challengesRepo.ts`
- **Interfaces**:
  - `fetchChallenges(q: { tenantId; storeIds; from; to }): Promise<ChallengeRecord[]>`
  - `fetchChallenge(tenantId, id): Promise<ChallengeRecord | null>`
  - `saveChallenge(tenantId, id | null, input: ChallengeInput): Promise<{ ok: true; id } | { ok: false }>`
  - `deleteChallenge(tenantId, id): Promise<{ ok: boolean }>`
  - `fetchChallengeInput(q: { tenantId; challenges: ChallengeRecord[]; today }): Promise<ChallengeAggInput>` — busca de uma vez, para a união dos períodos/lojas (até hoje): `sales_seller_product_day_agg` (só se houver desafio de Produtos/Categorias; sem gerência via `fetchNonSalesPeople`), `fetchSalesSellerDayAggs`, `sales_day_agg` ALL (dias com venda → alerta incompleto), `fetchGoalTeam` (equipe + gerador), catálogo (código → `type_id`).
  - `fetchChallengeCatalog(): Promise<{ products: CatalogProduct[]; categories: CatalogCategory[] }>` — 1× por sessão, caixa alta, sem INDEFINIDO.
- **Dependencies**: `getSupabase`, `fetchAllPages`, helpers de `salesRepo`.
- **Reuses**: padrão de `goalsRepo.ts` (demo sem Supabase = lista vazia / save ok "demo").
- **Nota**: `fetchGoalTeam` não traz o gerador; estender o select com `millennium_gerador_id` (campo opcional `geradorId` em `GoalTeamMember`, sem efeito nas Metas).

### `challengeView.ts` (conta pura)

- **Purpose**: transformar desafio + agregados em resultado por pessoa, posições, vencedores, gerência, incompleto e fechamento.
- **Location**: `src/data/wedash/challengeView.ts` (+ `challengeView.test.ts`)
- **Interfaces**:
  - `buildChallengeView(input: { challenge; aggs: ChallengeAggInput; lojaNome; today }): ChallengeView`
  - `challengeCardSummary(view): { lider: string | null; atingiram: number | null }` — card da listagem/Equipe.
  - `challengePayout(view): ChallengePayout` — fechamento (vencedores, prêmios, total R$).
  - `copyChallenge(c): ChallengeInput` — duplicar (período seguinte, mesma duração, "{nome} (cópia)").
  - `metricValueLabel(metric, value)` — "12 itens" · "1,85" · "R$ 92,30".
- **Regras** (do spec):
  - Participantes = equipe de vendas ativa da loja ∪ quem vendeu (Produtos/Categorias: no agregado novo; P.A./ticket: no `sales_seller_day_agg`). Pessoa: gerador → `store_seller` (código) → `e:{código}`; sem cadastro → `n:{nome normalizado}`.
  - Resultado: Produtos = Σ itens dos códigos escolhidos; Categorias = Σ itens cujo `type_id` do catálogo está entre as escolhidas; P.A. = Σ itens ÷ Σ vendas ("—" se algum dia com venda sem itens); Ticket = Σ faturamento ÷ Σ vendas.
  - Elegível = resultado > 0 · ≥ piso (Disputa, se houver) · ≥ alvo (Mínimo) · vendas ≥ mínimo de vendas (P.A./ticket) · P.A. não "—".
  - Disputa: ordena do maior; posição com empate competitivo (1, 1, 3); vencedor = elegível com posição ≤ nº de prêmios.
  - Mínimo: "Atingiu" = elegível.
  - Falta (em andamento): Mínimo/piso → falta para o alvo/piso; Disputa → falta para a posição de cima (diferença para o resultado logo acima; 0 se empatado). P.A./ticket abaixo do mínimo de vendas → "Faltam N vendas".
  - Gerência: itens = Σ itens ÷ nº de participantes; P.A. = Σ itens ÷ Σ vendas; ticket = Σ faturamento ÷ Σ vendas — contra o alvo (Mínimo) ou o piso (Disputa); sem piso na Disputa = sem gerência.
  - Incompleto (só Produtos/Categorias): dias do período até hoje com venda da loja em `sales_day_agg` e nenhuma linha no agregado novo → lista de dias para o alerta.
  - Status/prazo: `goalStatus` + `prazoRestante`; "Fechamento em andamento" enquanto `today <= endsOn + 1`.

### Telas (`src/pages/challenges/`)

| Componente | Purpose | Reuses |
| --- | --- | --- |
| `ChallengesPage` (rota `/management/challenges`; fica em `src/pages/management/ChallengesPage.tsx`, onde já está a tela em branco e o pré-carregamento das abas) | Listagem em cards, filtro de período, excluir com modal, vazio 🔥 | `GoalsPage` (estrutura), `SectionHeader` com abas da Gestão, `useMinSkeleton` |
| `ChallengeCard` | Card formato Categories: ícone 🔥/troféu, nome, período · loja, duplicar/excluir, líder ou "N atingiram", prazo, badges Status · Métrica · Modo, prêmio principal | `GoalCard` |
| `ChallengeEditorPage` (`/new`, `/:id/edit`, `?copy=`) | Cards: Dados (nome, datas, loja) · Métrica (Segmented + seletor de produtos/categorias ou mínimo de vendas) · Modo (Segmented Disputa/Mínimo + piso/alvo) · Prêmios (1º/2º/3º ou por pessoa; R$ ou descrição) · Gerência (chave) | `GoalEditorPage` (validação, `REQUIRED`, toasts, Loja só em "Todas") |
| `PrizeField` | Campo de prêmio: `Segmented` "Valor em R$ · Prêmio" + input | `Segmented`, `Input` |
| `ProductPicker` / `CategoryPicker` | Busca no catálogo e chips dos escolhidos | `HeaderSearch`/`Input`, `Badge`, `ProductNameCell` |
| `ChallengeDetailPage` (`/:id`) | Resumo (+ Editar · Duplicar · Exportar quando encerrado) · alerta incompleto · Participantes (tabela: # · Nome · Grupo · Resultado · Vendas · Situação/Falta) · Fechamento | `GoalHero`, `GoalPayoutCard`, `PayoutReportHeader`, `exportPdf` |
| `ChallengeMiniCard` (P2) | Card compacto na aba Desafios da Equipe; clique abre detalhe | `ChallengeCard` simplificado |
| Skeletons | `ChallengeCardsSkeleton`, `ChallengeDetailSkeleton`, `ChallengeEditorSkeleton` | `LoadingSkeletons.tsx` (mesmo formato dos de Metas) |

---

## Data Models

### `challenge` (banco) → `ChallengeRecord` (app)

```typescript
type ChallengeMetric = "PRODUCTS" | "CATEGORIES" | "PA" | "TICKET";
type ChallengeMode = "CONTEST" | "MINIMUM"; // Disputa · Mínimo

/** Prêmio: dinheiro (> 0) ou descrição (1–60). */
type ChallengePrize = { kind: "MONEY"; amount: number } | { kind: "ITEM"; label: string };

interface ChallengeRecord {
  id: string;
  storeId: string;
  name: string;
  startsOn: string; // ISO, inclusive
  endsOn: string;
  metric: ChallengeMetric;
  mode: ChallengeMode;
  products: { code: string; name: string }[];      // PRODUCTS (nome salvo para produto que sair do catálogo)
  categories: { typeId: number; name: string }[];  // CATEGORIES
  /** Mínimo: alvo; Disputa: piso (null = sem piso). Itens = inteiro; P.A. = 2 casas; ticket = R$. */
  target: number | null;
  /** P.A./ticket: mínimo de vendas (≥ 1). */
  minSales: number | null;
  /** Disputa: 1..3 (1º, 2º, 3º); Mínimo: exatamente 1 (por pessoa que atingir). */
  prizes: ChallengePrize[];
  managerPrize: ChallengePrize | null;
}
```

Banco: `id uuid pk`, `tenant_id`, `store_id` (FK cascade), `name text check (length(trim(name)) between 1 and 80)`,
`starts_on`, `ends_on`, `metric text`, `mode text`, `products jsonb default '[]'`, `categories jsonb default '[]'`,
`target numeric(14,2) null` (ticket em R$, itens inteiros, P.A. 2 casas), `min_sales int null`, `prizes jsonb`,
`manager_prize jsonb null`, `created_at`, `updated_at`. Prêmio no JSON: `{ "kind": "MONEY", "cents": 10000 }` ou
`{ "kind": "ITEM", "label": "Combo KFC" }`.

### `sales_seller_product_day_agg` (banco) → `SalesSellerProductDayAgg`

```typescript
interface SalesSellerProductDayAgg {
  tenantId: string;
  storeId: string;
  day: string;
  sellerGeradorId: number;
  sellerKey: string;   // nome normalizado (liga pessoa sem cadastro)
  sellerName: string;
  productCode: string;
  productId: number;
  itemCount: number;
  revenueCents: number;
}
```

Volume estimado: ~3.200 cupons/mês na maior loja × ~1,5 linha → ≤ ~5 mil linhas/loja/mês (pessoa × produto × dia
agrupa bastante). Leitura de um desafio semanal ≈ centenas de linhas.

### `ChallengeView` (saída da conta)

```typescript
interface ChallengeParticipant {
  key: string; nome: string; grupo: string | null;
  resultado: number | null;    // null = "—"
  vendas: number;
  posicao: number | null;      // Disputa
  vencedor: boolean; premio: ChallengePrize | null;
  falta: string | null;        // texto "Faltam 3 itens" / "Faltam 2 vendas"
}
interface ChallengeView {
  status: GoalStatus; prazo: string; emFechamento: boolean;
  participantes: ChallengeParticipant[];
  gerencia: { resultado: number | null; atingiu: boolean; premio: ChallengePrize } | null;
  diasIncompletos: string[];
}
```

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --- | --- | --- |
| Gravação do agregado novo falha no worker | `try/catch`, WARN "Itens por pessoa" em Logs, job segue | Desafio de produto/categoria mostra alerta de resultado incompleto para o dia |
| Relatório de cupom do dia falhou | Nada gravado no agregado novo para o dia | Mesmo alerta (dias com venda sem dado) |
| Dias antes da publicação do sincronizador novo | Sem linhas no agregado | Alerta amarelo listando os dias (carga dos dias antigos fora do escopo) |
| `saveChallenge` falha | `console.warn`, retorno `ok: false` | Toast "Não foi possível salvar as alterações. Tente novamente."; formulário mantido |
| Validação do editor | Erros após 1ª tentativa, sem gravar | Campos em vermelho + toast "Revise os campos destacados." |
| `deleteChallenge` falha | retorno `ok: false` | Toast de erro padrão; card continua |
| Leitura dos agregados falha | `fetchAllPages` registra e devolve vazio | Resultado zerado + alerta incompleto quando houver venda no `sales_day_agg` |
| Desafio não encontrado / de outra empresa | RLS devolve null | Vazio "Desafio não encontrado" com Voltar |
| Produto escolhido saiu do catálogo | Nome salvo no JSON | Mostra o nome salvo |

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| --- | --- | --- | --- |
| `runSyncJob.ts` com ~3.600 linhas; dois caminhos de gravação do cupom | `workers/millennium-sync/src/runSyncJob.ts:972`, `:1040` | Esquecer um caminho deixa dias sem o dado | Helper único `saveSellerProductDayAggs(deps, …)` chamado nos dois; teste cobrindo os dois caminhos |
| Mocks de `SyncJobDeps` nos testes do worker exigem todas as deps | `runSyncJob.test.ts:105` | Dep obrigatória quebraria dezenas de testes | Dep **opcional**; teste novo injeta mock e confere linhas |
| Worker e migration precisam ir para produção | — | Sem deploy, desafio de produto/categoria nunca tem dado | Deploy só com autorização; até lá o alerta de incompleto explica; P.A./ticket funcionam com o dado atual |
| Sem dado para dias antigos | — | Desafio que começou antes do deploy fica incompleto | Alerta com os dias; recarga de dias antigos fora do escopo (spec) |
| `GoalTeamMember` sem gerador | `src/data/wedash/goalsRepo.ts:218` | Pessoa do agregado novo não liga ao cadastro → aparece duplicada (`n:` e `e:`) | Estender select com `millennium_gerador_id` (campo opcional) |
| Gerência no agregado novo | `salesRepo.ts:466` | Vendas da gerente contariam no desafio | Filtrar por `NonSalesPeople.geradorIds` e `storeNameKeys` |
| Editor de Metas grande (1.405 linhas) | `src/pages/goals/GoalEditorPage.tsx` | Copiar demais traz regras de níveis irrelevantes | Copiar só a casca (cards, validação, loja, toasts); campos novos próprios |
| 4 falhas de data pré-existentes em `dashboard.test.ts` | `src/data/wedash/dashboard.test.ts` | Ruído no `vitest` | Rodar só os testes novos/afetados como evidência; registrar as 4 como pré-existentes |

---

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Alvo e piso | Uma coluna `target` (numeric) com significado pelo modo | Mínimo e Disputa nunca usam os dois ao mesmo tempo |
| Chave de produto no agregado novo | `product_code` (fallback `#id`) | Spec: produto agrupado por código (cores/tamanhos juntos), igual à tela Produtos |
| Categoria | Resolvida na leitura pelo catálogo (`type_id`) | Igual à `sales_category_day_view`; mudança de tipo corrige o passado |
| Duplicar | Sempre "dia seguinte ao fim, mesma duração" (`nextDayPeriod` em `challengeView.ts`) — não usa a regra de mês fechado de `nextGoalPeriod` | Spec (desafio semanal); um desafio de mês inteiro duplica para o mês seguinte só se tiver a mesma quantidade de dias — aceitável, o gestor ajusta |
| Prêmio da gerência na Disputa | Alvo = piso; sem piso, chave desabilitada | Decisão do dono |
| Dep opcional no worker | `replaceSellerProductDayAggs?` | Testes existentes e soft-fail |
| Conta no navegador | `challengeView.ts` puro com testes | Mesmo padrão de Metas; regra muda sem migration (AD-024) |

> AD-024 registrado em `.specs/STATE.md`.
