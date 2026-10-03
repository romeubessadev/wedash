# Pedido de compra — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/pedido-compra/design.md`
**Status**: In Progress

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `vitest.config.ts` (include `src/**/*.test.ts`, `workers/**/*.test.ts`, sem limite de cobertura), `CLAUDE.md` / `.cursor/rules/wedash.mdc` (rodar `npm run build` antes de commit; AD-024: regra de Gestão em módulo puro com teste). Sem React Testing Library no projeto: telas e hooks não têm teste automatizado (padrão do repo).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Regra de negócio pura (`purchaseOrder.ts`) | unit | Todos os ramos; 1:1 com os ACs PC-01..05, PC-09..12; todos os edge cases da spec | `src/data/wedash/*.test.ts` | `npx vitest run src/data/wedash/purchaseOrder.test.ts` |
| Utilitário de arquivo (`src/lib/xlsx.ts`) | unit | Arquivo lido de volta: entradas do ZIP, CRC, células texto × número, strings compartilhadas, escape de XML | `src/lib/*.test.ts` | `npx vitest run src/lib/xlsx.test.ts` |
| Parser do ERP (`_shared/purchaseStock.ts`) | unit | Nulos = 0, bloqueado, múltipla inválida, data −3h, ordem, variantes duplicadas somadas | `supabase/functions/_shared/*.test.ts` | `npx vitest run supabase/functions/_shared/purchaseStock.test.ts` |
| Repositório (`purchaseRepo.ts`) | unit | Mapeamento linha ↔ domínio, soma dos vendidos por código, leitura do erro da Edge | `src/data/wedash/*.test.ts` | `npx vitest run src/data/wedash/purchaseRepo.test.ts` |
| Handler da Edge (`erp-stock-sync/index.ts`) | none | Build gate + chamada real após o deploy (UAT) | - | build gate only |
| Hook / página React | none | Build gate + UAT manual | - | build gate only |
| Migration SQL / docs | none | Build gate | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Após tarefas com testes unitários | `npx vitest run <arquivo de teste da tarefa>` |
| Full | Fim de cada fase | `npm test` |
| Build | Tarefas sem teste / antes de cada commit de UI | `npm run build && npm run lint && npm test` |

---

## Execution Plan

### Phase 1: Regra e arquivo (sem banco nem ERP)

```
T1 → T2 → T3
```

### Phase 2: Dados e Millennium

```
T4 → T5 → T6 → T7
```

### Phase 3: Tela

```
T8 → T9 → T10
```

---

## Task Breakdown

### T1: Conta do pedido (view da lista)

**What**: Funções puras `isEligible`, `isNewProduct`, `purchaseQuantity`, `parseMinInput` e `buildPurchaseOrderView` (linhas agrupadas por código, destaque, A pedir, variantes, contagens dos filtros, resumo).
**Where**: `src/data/wedash/purchaseOrder.ts`
**Depends on**: None
**Reuses**: estilo de `src/data/wedash/stockProducts.ts` (módulo puro + teste)
**Requirement**: PC-01, PC-02, PC-03, PC-04, PC-05, PC-06, PC-09, PC-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `filterPurchaseRows`: busca por nome ou código sem diferenciar maiúsculas e acentos; filtros "Vai para o pedido", "Sem mínimo", "Novos"
- [x] Elegível = código sem `WP` (qualquer caixa), não bloqueado, múltipla > 0
- [x] Novo = 0 ≤ dias desde o cadastro < 30 (data nula = não novo)
- [x] `purchaseQuantity`: alvo = mín × fator; Total negativo = 0; Total ≥ alvo ou mín 0/nulo = 0; senão (alvo − Total) arredondado para cima ao múltiplo (múltipla 1 = diferença exata)
- [x] `parseMinInput`: vazio = null; inteiro 0..99999 = número; resto = inválido
- [x] Produto com > 1 variante elegível: `variasVariantes`, A pedir null, não entra no resumo nem em `noPedido`
- [x] Mínimo de código que não está no relatório não gera linha
- [x] Resumo = nº de produtos e Σ itens que vão para o arquivo; contagens de "Vai para o pedido", "Sem mínimo", "Novos"
- [x] Gate: `npx vitest run src/data/wedash/purchaseOrder.test.ts` passa (29 testes)

**Status**: ✅ Complete

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pedido-compra): conta do pedido de compra`

---

### T2: Linhas e nome do arquivo

**What**: `purchaseOrderFileRows(view)` (ordem do relatório, só quantidade > 0, sem produtos com variantes, Total ≥ 0, COD numérico × texto) e `purchaseOrderFileName(date)`.
**Where**: `src/data/wedash/purchaseOrder.ts` (modify)
**Depends on**: T1
**Reuses**: tipos do T1
**Requirement**: PC-10, PC-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cabeçalho `COD_PRODUTO, Cod_Cor, Cod_Estampa, Tamanho, Quantidade, Total em Estoque, Descricao`
- [ ] `526` vira número; `0526`, `BSPPAR-ATH-001` ficam texto; cor/estampa/tamanho sempre texto
- [ ] Ordem pela posição do relatório; lista vazia quando nada a pedir
- [ ] Nome `ddMMyyyyHHmmss.xlsx` com zero à esquerda (ex.: 03/10/2026 07:38:38 → `03102026073838.xlsx`)
- [ ] Gate: `npx vitest run src/data/wedash/purchaseOrder.test.ts` passa (≥ 24 testes no total)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pedido-compra): linhas e nome do arquivo do pedido`

---

### T3: Escritor de XLSX

**What**: `buildXlsx(rows, { textColumns })` gerando OOXML mínimo (workbook, styles com numFmt 49, sharedStrings, sheet1) num ZIP sem compressão com CRC-32.
**Where**: `src/lib/xlsx.ts`
**Depends on**: T2
**Reuses**: esqueleto do exemplo `docs/referencias/03102026073838.xlsx`
**Requirement**: PC-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste lê o ZIP gerado (diretório central) e encontra as 7 entradas com CRC correto
- [ ] Célula string = `t="s"` apontando para `sharedStrings`; número = `<v>`; colunas de texto com estilo numFmt 49 (inclusive `000`)
- [ ] `&`, `<`, `>`, `"` escapados; acentos em UTF-8
- [ ] Gate: `npx vitest run src/lib/xlsx.test.ts` passa (≥ 5 testes)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pedido-compra): gerar arquivo xlsx sem dependencia`

---

### T4: Migration do pedido de compra

**What**: Tabelas `store_purchase_stock` e `store_purchase_min`, coluna `store.purchase_synced_at` e RLS (leitura por tenant; mínimo gravado por Gestor ou Gerente da loja; saldo só service_role).
**Where**: `supabase/migrations/20261003120000_purchase_order.sql`
**Depends on**: None (Fase 2 começa depois da Fase 1)
**Reuses**: RLS de `20260929120000_stock_products.sql` e `20261002120000_challenge.sql`
**Requirement**: PC-06, PC-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Esquema igual ao Data Models do design (PK com cor/estampa/tamanho; `min_qty` 0..99999)
- [ ] Política de escrita do mínimo: OWNER/ADMIN_GLOBAL do tenant, ou MANAGER sem `membership_store` ou com a loja vinculada
- [ ] Não aplicar no banco remoto (`supabase db push` só com OK do dono)
- [ ] Gate: `npm run build && npm run lint && npm test` passa

**Tests**: none
**Gate**: build

**Commit**: `feat(pedido-compra): tabelas de saldo e minimo por loja`

---

### T5: Parser do Saldo Atual e Futuro

**What**: `parsePurchaseStock(payload)` (puro) e `fetchPurchaseStock(session, millenniumStoreId)` chamando `ESTOQUEEMCOMPRA` sem período; `vitest.config.ts` passa a incluir `supabase/functions/**/*.test.ts`.
**Where**: `supabase/functions/_shared/purchaseStock.ts`
**Depends on**: T4
**Reuses**: `call`/`rowsOf` de `_shared/millenniumProducts.ts`; `parseProductRegistry`/`brDate` de `workers/millennium-sync/src/millenniumCatalog.ts`
**Requirement**: PC-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `SALDO`/`QUANTIDADE_PEDIDO`/`TOTAL` nulos = 0; múltipla ≤ 0 ou nula = null; `BLOQUEADO_COMPRA` booleano
- [ ] `DATA_CADASTRO` `2024-06-05T03:00:00.000Z` → `2024-06-05`; nula/inválida = null
- [ ] `position` = ordem do retorno; linhas com mesmo código+cor+estampa+tamanho somadas (mantém a 1ª posição)
- [ ] Gate: `npx vitest run supabase/functions/_shared/purchaseStock.test.ts` passa (≥ 6 testes)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pedido-compra): ler saldo atual e futuro do millennium`

---

### T6: Busca do saldo na Edge erp-stock-sync

**What**: Parte `purchaseStoreIds` na Edge: por loja (2 por vez) busca, substitui `store_purchase_stock`, grava `store.purchase_synced_at`; atualiza o cadastro do catálogo (best-effort).
**Where**: `supabase/functions/erp-stock-sync/index.ts` (modify)
**Depends on**: T5
**Reuses**: auth, filtro do gerente, sessão salva, relogin 401 e `replaceRows` da própria função
**Requirement**: PC-07, PC-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Gerente só busca as lojas dele (mesmo filtro de `storeIds`)
- [ ] Loja que falhou vai em `failed` sem apagar o saldo guardado
- [ ] Resposta `{ ok, purchase, failed }`; chamadas sem `purchaseStoreIds` seguem iguais
- [ ] Não fazer deploy (só com OK do dono)
- [ ] Gate: `npm run build && npm run lint && npm test` passa

**Tests**: none
**Gate**: build

**Commit**: `feat(pedido-compra): buscar saldo do pedido na edge de estoque`

---

### T7: Repositório do pedido

**What**: `fetchPurchaseStock`, `fetchPurchaseMins`, `savePurchaseMin`, `fetchSold30` e `syncPurchaseStockNow` (+ mapeadores puros testados).
**Where**: `src/data/wedash/purchaseRepo.ts`
**Depends on**: T6
**Reuses**: `fetchAllPages`/`from`/`syncStockNow` de `stockRepo.ts`; `fetchSalesProductDayAggs` de `salesRepo.ts`
**Requirement**: PC-06, PC-07, PC-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Linha do banco → `PurchaseStockRow` (numéricos de texto viram número)
- [ ] Vendidos 30 dias = Σ `item_count` por `product_code`
- [ ] `savePurchaseMin(null)` apaga; número faz upsert
- [ ] Erros da Edge → "Não foi possível buscar o saldo no Millennium. Tente novamente." (sessão em outro local com o texto do Estoque)
- [ ] Gate: `npx vitest run src/data/wedash/purchaseRepo.test.ts` passa (≥ 5 testes)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pedido-compra): repositorio do pedido de compra`

---

### T8: Hook usePurchaseOrder

**What**: Carrega saldo + mínimos + vendidos da loja, busca no ERP se > 30 min / Atualizar do topo (pula com integração desligada), mínimo otimista, multiplicador local.
**Where**: `src/pages/stock/usePurchaseOrder.ts`
**Depends on**: None (Fase 3 começa depois da Fase 2, que entrega o repositório)
**Reuses**: `src/pages/stock/useStockData.ts`
**Requirement**: PC-06, PC-07, PC-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Troca de loja recarrega e aplica a regra de 30 min à nova loja
- [ ] Texto "Saldo buscado às HH:MM" / "em DD/MM às HH:MM" / "Buscando saldo…"; `stale` quando > 30 min
- [ ] Mínimo inválido / falha ao gravar volta ao valor anterior com o toast da spec
- [ ] Gate: `npm run build && npm run lint && npm test` passa

**Tests**: none
**Gate**: build

**Commit**: `feat(pedido-compra): dados da tela de pedido de compra`

---

### T9: Tela Pedido de compra

**What**: `PurchaseOrderPage` com filtros (Loja, Busca, Filtro, Multiplicador), botão Gerar pedido, avisos, resumo, tabela com mínimo editável (Enter desce), selo Novo, destaque, Total do filtro e 50 por página.
**Where**: `src/pages/stock/PurchaseOrderPage.tsx` (modify)
**Depends on**: T8
**Reuses**: `src/pages/stock/InventoryPage.tsx`, `src/pages/stock/shared.tsx`, `ProductNameCell`, `ErpStatusNotice`, `EmptyBlock`, `StockProductsSkeleton`
**Requirement**: PC-01, PC-02, PC-03, PC-04, PC-05, PC-09, PC-10, PC-11, PC-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Busca sem diferenciar maiúsculas e acentos; vazios da spec ("Nenhum produto para pedido", busca com "Limpar busca")
- [ ] Gerar pedido: toast "Nenhum produto abaixo do mínimo." ou baixa o arquivo + "Pedido gerado com N produtos."; desabilitado durante a busca
- [ ] Alerta amarelo de saldo com mais de 30 min; alerta de falha da busca
- [ ] Testado no navegador com uma loja real (lista, mínimo gravado após recarregar, arquivo aberto no Excel)
- [ ] Gate: `npm run build && npm run lint && npm test` passa

**Tests**: none
**Gate**: build

**Commit**: `feat(pedido-compra): tela de pedido de compra`

---

### T10: Registrar a decisão no CLAUDE.md

**What**: Item novo "Pedido de compra" (fonte, regra, arquivo, mínimos, busca) e atualização do #47.
**Where**: `CLAUDE.md` (modify)
**Depends on**: T9
**Reuses**: formato dos itens #46–#49
**Requirement**: PC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Item descreve tabelas, Edge, regra da quantidade, formato do arquivo e 50 por página
- [ ] Gate: `npm run build && npm run lint && npm test` passa

**Tests**: none
**Gate**: build

**Commit**: `docs(pedido-compra): registrar decisoes do pedido de compra`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5 ------→ T6 ------→ T7
Phase 3:  T8 ------→ T9 ------→ T10
```

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Conta do pedido | 1 módulo puro (funções coesas da lista) | ✅ Granular |
| T2: Linhas e nome do arquivo | 2 funções no mesmo módulo | ✅ OK (coeso) |
| T3: Escritor de XLSX | 1 utilitário | ✅ Granular |
| T4: Migration | 1 arquivo SQL | ✅ Granular |
| T5: Parser do ERP | 1 arquivo (+ 1 linha no vitest.config) | ✅ OK (coeso) |
| T6: Parte da Edge | 1 função | ✅ Granular |
| T7: Repositório | 1 arquivo | ✅ Granular |
| T8: Hook | 1 hook | ✅ Granular |
| T9: Tela | 1 página | ✅ Granular |
| T10: Docs | 1 arquivo | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | início da Fase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | início da Fase 2 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | None | início da Fase 3 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Regra de negócio pura | unit | unit | ✅ OK |
| T2 | Regra de negócio pura | unit | unit | ✅ OK |
| T3 | Utilitário de arquivo | unit | unit | ✅ OK |
| T4 | Migration SQL | none | none | ✅ OK |
| T5 | Parser do ERP | unit | unit | ✅ OK |
| T6 | Handler da Edge | none | none | ✅ OK |
| T7 | Repositório | unit | unit | ✅ OK |
| T8 | Hook React | none | none | ✅ OK |
| T9 | Página React | none | none | ✅ OK |
| T10 | Docs | none | none | ✅ OK |
