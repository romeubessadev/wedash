# Pedido de compra — Validation

**Date**: 2026-10-03 (iteration 2, re-verification after fix `4b7b52e`)
**Spec**: `.specs/features/pedido-compra/spec.md`
**Diff range**: `b8d4f40^..4b7b52e`, only the `(pedido-compra)` commits: `b8d4f40` (spec), `df55c92`, `a93d7d7`, `d34b4bd`, `d388463`, `b8dd4b3`, `4bc7b6a`, `1696399`, `6914679`, `eedb157`, `d68ae9f`, `4b7b52e` (fix iteration 1: tests only). Excluded: `536ee13 refactor(engine)` (another session).
**Verifier**: independent sub-agent (author ≠ verifier)

**Verdict**: PASS

Iteration 1 failed because 3 mutants survived (M6, M16, M17). Commit `4b7b52e` adds tests only (`src/data/wedash/purchaseOrder.test.ts`, +8 lines, no production code). All three mutants are now killed, and M8 still survives as an equivalent mutant. Every gate passes. **No behavior bug was found in the production code.** What remains is non-blocking: UAT after deploy, spec wording S1–S4, and the `Co-authored-by` process note.

> Line numbers: production-code citations are unchanged at `4b7b52e`. In `purchaseOrder.test.ts`, citations below 197 are unchanged. Citations from 197 to 278 are as of `d68ae9f` and sit **+4** lower now. The new lines are cited with their numbers at `4b7b52e` (198, 280-282).

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 Conta do pedido | ✅ Done | `src/data/wedash/purchaseOrder.ts:56-173` |
| T2 Linhas e nome do arquivo | ✅ Done | `purchaseOrder.ts:140-161` |
| T3 Escritor de XLSX | ✅ Done | `src/lib/xlsx.ts:171-175`; the generated file is structurally identical to the reference (see "Reference file check") |
| T4 Migration | ✅ Done (not applied) | `supabase/migrations/20261003120000_purchase_order.sql`; `db push` pending the owner's OK |
| T5 Parser do ERP | ✅ Done | `supabase/functions/_shared/purchaseStock.ts:59-97`, `millenniumProducts.ts:275-294` |
| T6 Edge | ✅ Done (not deployed) | `supabase/functions/erp-stock-sync/index.ts:136-203, 261-279, 329-370` |
| T7 Repositório | ✅ Done | `src/data/wedash/purchaseRepo.ts` |
| T8 Hook | ✅ Done | `src/pages/stock/usePurchaseOrder.ts` |
| T9 Tela | ✅ Code done · ⏳ UAT | Browser UAT with a real store and the Millennium import is pending deployment (non-blocking) |
| T10 CLAUDE.md | ✅ Done | `CLAUDE.md:803` (item 50) |

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ test asserts the exact spec outcome · 🔎 UI/Edge only, verified by reading the code (project convention: no React Testing Library; Edge runs on Deno) · ⏳ UAT pending (needs deploy) · ⚠️ spec-precision note.

### P1: Ver o pedido da loja (PC-01..PC-05)

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Result |
| --- | --- | --- | --- |
| 1 Elegíveis | sem `WP`, não bloqueado, múltipla > 0 | `src/data/wedash/purchaseOrder.test.ts:44` `expect(isEligible(stock())).toBe(true)`; `:47-48` WP014 / wp-ultra → `false`; `:51` blocked → `false`; `:54-55` multiple null/0 → `false`; `:117` `expect(v.rows).toHaveLength(1)` (WP and blocked dropped). Impl `purchaseOrder.ts:56-58, 95-96` | ✅ |
| 2 Colunas | nome + código, Mínimo, Saldo, Pedidos em aberto, Total, Vendidos 30 dias, Múltipla, A pedir | `purchaseOrder.test.ts:118-126` `toMatchObject({code, nome, saldo:1, pedidosAbertos:1, total:2, vendidos30:15, multipla:24, minimo:72})`; columns 🔎 `src/pages/stock/PurchaseOrderPage.tsx:30-36, 222-228, 239-263` | ✅ / 🔎 |
| 3 Selo Novo | cadastro entre hoje e 29 dias atrás | `purchaseOrder.test.ts:61-62` today / 29 days → `true`; `:65-67` 30 days / null / future → `false`; `:151-152` view `novo`; badge 🔎 `PurchaseOrderPage.tsx:247` | ✅ |
| 4 Destaque + A pedir | Total (neg = 0) < mín × mult e mín > 0 → highlight + PC-09 quantity | `purchaseOrder.test.ts:131-132` `noPedido` `true`, `aPedir` `72`; `:145-146` enough stock → `0` / `false`; highlight 🔎 `PurchaseOrderPage.tsx:236-237` (`bg-warn-soft` + left border) | ✅ (see S1) |
| 5 Sem mínimo | A pedir "—", sem destaque | `purchaseOrder.test.ts:137-140` `aPedir` `toBeNull()`, `noPedido` `false` (empty and 0); "—" 🔎 `PurchaseOrderPage.tsx:263` | ✅ |
| 6 Filtro Loja | só em "Todas" com > 1 loja; padrão = 1ª | 🔎 `PurchaseOrderPage.tsx:60` (`?? lojas[0]`), `:146-152` (`lojas.length > 1`); `lojas` = StorePicker scope `src/pages/operation/shared.tsx:41-44` | 🔎 |
| 7 Busca | nome ou código, sem maiúsculas/acentos | `purchaseOrder.test.ts:264-265` "colonia"/"GOLDEN" → `["A1"]`; `:268` "b2" → `["B2"]`. Impl `purchaseOrder.ts:163-173` | ✅ |
| 8 Filtros | Vai para o pedido = destacadas; Sem mínimo = **vazio ou 0**; Novos = selo | pedido → `["A1"]`; semMinimo with an empty minimum → `["B2"]` (`:279` at `4b7b52e`); **new:** `:280-281` fixture with Z0 (minimum `0`), N1 (no minimum), M5 (minimum `5`) → `filterPurchaseRows(..., {filtro:"semMinimo"})` `toEqual(["Z0","N1"])`; novos → `["B2"]` | ✅ (M16 killed) |
| 9 Variantes | aviso + A pedir "—" | `purchaseOrder.test.ts:160-164` `variasVariantes` `true`, `aPedir` `null`, `noPedido` `false`, `resumo` `{0,0}`; `:169-170` blocked variant doesn't count; warning text 🔎 `PurchaseOrderPage.tsx:249` (exact spec text) | ✅ |
| 10 Skeleton 1ª busca | skeleton while the 1st search runs | 🔎 `src/pages/stock/usePurchaseOrder.ts:119-122` (`if (d.syncedAt) setLoading(false)` → otherwise waits for `sync`), `PurchaseOrderPage.tsx:68, 180-181` | 🔎 ⏳ |

### P1: Definir o mínimo (PC-06)

| AC | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| 1 Grava ao sair / Enter | grava loja × código | 🔎 `PurchaseOrderPage.tsx:332-340` (commit on blur), `:342-347` (Enter focuses the next row → blur), `usePurchaseOrder.ts:183`; `purchaseRepo.ts:103-118` upsert `onConflict: "store_id,product_code"` | 🔎 ⏳ |
| 2 Recalcula na hora | destaque/A pedir imediatos | 🔎 optimistic update `usePurchaseOrder.ts:174-182` → `view` memo `:148-160` | 🔎 |
| 3 Inválido | volta + toast "Use um número inteiro entre 0 e 99999." | `purchaseOrder.test.ts:104` `["1,5","1.5","-1","abc","100000"]` → `{ok:false}`; `:99-101` 0 / " 72 " / 99999 accepted; toast 🔎 `usePurchaseOrder.ts:168-170` (exact text); field reverts `PurchaseOrderPage.tsx:339` | ✅ / 🔎 |
| 4 Apagar = sem mínimo | grava como sem mínimo | `purchaseOrder.test.ts:96` `parseMinInput("  ")` → `{ok:true, value:null}`; null → delete 🔎 `purchaseRepo.ts:106-107` | ✅ / 🔎 |
| 5 Falha ao gravar | volta + toast "Não foi possível salvar as alterações. Tente novamente." | 🔎 `usePurchaseOrder.ts:184-187` (`apply(before)` + `SAVE_ERROR_MSG`), constant text `src/pages/operation/shared.tsx:167` matches the spec | 🔎 |
| 6 Por loja | não afeta outras lojas | 🔎 PK `(store_id, product_code)` `migration:40`; reads filtered by store `purchaseRepo.ts:95` | 🔎 |
| 7 Sobrevive à busca | mínimos continuam | 🔎 the Edge only replaces `store_purchase_stock` (`erp-stock-sync/index.ts:152-172`); minimums live in a separate table; a minimum for a code missing from the report creates no row: `purchaseOrder.test.ts:174` | ✅ / 🔎 |
| 8 Gerente | só lojas vinculadas | 🔎 RLS `migration:84-137` (OWNER/ADMIN_GLOBAL, or MANAGER with no links / with that store; `membership_store.store_id` is text → `::text` cast is correct per `20260919120000_auth_core.sql:46`) | 🔎 ⏳ |

### P1: Buscar o saldo (PC-07, PC-08)

| AC | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| 7.1 > 30 min ou nunca → busca 1 chamada sem período | | 🔎 `usePurchaseOrder.ts:13, 38, 115-121`; call `millenniumProducts.ts:275-294` (body `{FILIAL, DESC:null, TIPO:null, DATAI:null, DATAF:null}`, 1 per store) | 🔎 ⏳ |
| 7.2 Atualizar do topo força | | 🔎 `usePurchaseOrder.ts:133-139` (`FORCE_REFRESH_CLICK_EVENT` → `sync` with no age check) | 🔎 ⏳ |
| 7.3 Textos | "Saldo buscado às HH:MM" / "em DD/MM às HH:MM" / "Buscando saldo…" | 🔎 `usePurchaseOrder.ts:24-29, 193-194`; shown below the filters `PurchaseOrderPage.tsx:137-143` | 🔎 |
| 7.4 Substitui e grava horário | | 🔎 `erp-stock-sync/index.ts:152-172` (`replaceRows` = upsert + delete older rows of the store), `:174` `purchase_synced_at` | 🔎 ⏳ |
| 8.5 Falha → mantém + alerta "Não foi possível buscar o saldo no Millennium. Tente novamente." | | `src/data/wedash/purchaseRepo.test.ts:79-80` `toBe(PURCHASE_SYNC_ERROR)` / exact text; keeps stored balance: Edge `index.ts:151` (empty = failure), `:179-181`; hook `usePurchaseOrder.ts:84-87`; alert `PurchaseOrderPage.tsx:170-174` | ✅ / 🔎 (see S3) |
| 8.6 Desconectado → não busca + aviso padrão | | 🔎 `usePurchaseOrder.ts:79-80` (returns before `syncPurchaseStockNow`); notice `PurchaseOrderPage.tsx:169` | 🔎 |
| 8.7 Saldo velho → alerta amarelo com texto exato | | 🔎 `usePurchaseOrder.ts:204-205` (exact text), 1-min re-evaluation `:141-144`; `PurchaseOrderPage.tsx:175` | 🔎 (see S2) |
| 8.8 Gerente só busca as lojas dele | | 🔎 `erp-stock-sync/index.ts:272-279` | 🔎 ⏳ |

### P1: Gerar o arquivo (PC-09..PC-11)

| AC | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| 9.1 Multiplicador 1x–5x, padrão 1x | | `PURCHASE_FACTORS = [1,2,3,4,5]` `purchaseOrder.ts:52`; default 🔎 `usePurchaseOrder.ts:51`; selector `PurchaseOrderPage.tsx:156-161` | 🔎 |
| 9.2 Regra | alvo = mín × mult; Total (neg = 0) ≥ alvo ou mín 0 → nada; senão arredonda para cima ao múltiplo | `purchaseOrder.test.ts:73` `(2,72,24,1)` → `72`; `:76` 2x → `144`; `:79` `(-10,12,12,1)` → `12`; `:82-83` → `0`; `:86-87` min 0/null → `0`; `:90` multiple 1 → `7`; file uses the factor → `144` | ✅ |
| 10.3 Cabeçalho + 1 linha por produto > 0 | | header `toEqual([...7 columns])`; one row with full payload `["BSPPAR-ATH-001","000","000","U",72,2,"BODY SPLASH PARIS 200ML"]` (the row with quantity 0 is excluded); `xlsx.test.ts:46-57` 1 sheet / 7 parts with CRC | ✅ |
| 10.4 Nome `ddMMyyyyHHmmss.xlsx` | horário do aparelho | → `"03102026073838.xlsx"`; zero padding → `"05012026090401.xlsx"`; uses `new Date()` 🔎 `PurchaseOrderPage.tsx:118` | ✅ |
| 10.5 Tipos das colunas | Cor/Estampa/Tamanho texto; Qtd/Total número; COD número só com dígitos sem zero à esquerda | COD → `[526, "0526", "BS-1"]`; `["000","000","U"]` + `typeof row[4]` `"number"`; `xlsx.test.ts:66-72` `t="s"` vs numeric `<v>`; `:80` B/C/D use `numFmtId="49"`; **new:** `purchaseOrder.test.ts:198` (at `4b7b52e`) `PURCHASE_FILE_TEXT_COLUMNS.map(i => PURCHASE_FILE_HEADER[i])` `toEqual(["Cod_Cor","Cod_Estampa","Tamanho"])`, the constant the page passes to `buildXlsx` (`PurchaseOrderPage.tsx:118`) | ✅ (M6 killed) |
| 10.6 Total ≥ 0 + Descricao | | `[5]` → `0`; description in the full-row assertion | ✅ |
| 10.7 Ordem do relatório | | → `["Z","A","M"]`; position from the parser `purchaseStock.test.ts:77-80` | ✅ |
| 10.10 Exclui variantes | | → `[]` | ✅ |
| 11.8 Nada → toast "Nenhum produto abaixo do mínimo." | | file rows → `[]`; toast 🔎 `PurchaseOrderPage.tsx:114-117` (exact text) | ✅ / 🔎 |
| 11.9 Toast "Pedido gerado com N produtos." | | 🔎 `PurchaseOrderPage.tsx:118-119` (N = `rows.length`; singular for 1) | 🔎 |
| 11.11 Desabilitado durante a busca | | 🔎 `PurchaseOrderPage.tsx:162` `disabled={!view \|\| po.syncing}` | 🔎 |

### P2: Resumo (PC-12)

| AC | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| 1 "N produtos · N itens no pedido" + filter counts | segue o multiplicador | `purchaseOrder.test.ts:184` 1x → `{produtos:1, itens:72}`; `:186` 2x → `{produtos:2, itens:168}`; **new:** `:282` (at `4b7b52e`) `comZero.contagens.semMinimo` `toBe(2)` (minimum 0 + no minimum counted, minimum 5 not); text 🔎 `PurchaseOrderPage.tsx:190-194` | ✅ (M17 killed) |
| 2 Total do filtro | Σ Saldo, Pedidos, Total, Vendidos, A pedir das linhas filtradas | 🔎 `PurchaseOrderPage.tsx:92-101, 267-296` (sums `linhas` = filtered rows, not just the current page) | 🔎 |

### Edge cases

| Edge case | Evidence | Result |
| --- | --- | --- |
| `SALDO` null → 0 | `supabase/functions/_shared/purchaseStock.test.ts:43` `[balance, openOrder, total]` → `[0,0,0]` | ✅ (M8b killed) |
| `QUANTIDADE_PEDIDO` null → 0 | same assertion `:43` | ✅ (M8c killed) |
| Múltipla 1 → exatamente alvo − Total | `purchaseOrder.test.ts:90` → `7` | ✅ |
| Loja sem elegível → "Nenhum produto para pedido" / "O Millennium não retornou produtos liberados para compra nesta loja." | 🔎 `PurchaseOrderPage.tsx:202` (exact text) | 🔎 |
| Busca sem resultado → "Limpar busca" | 🔎 `PurchaseOrderPage.tsx:205-214` | 🔎 |
| Troca de loja → saldo/mínimos da nova loja + regra de 30 min | 🔎 `usePurchaseOrder.ts:104-131` (effect on `storeId`), `:146` (stale data of another store discarded), `:83, 90` (late answer from the old store ignored) | 🔎 ⏳ |

**Status**: ✅ every AC and edge case has evidence. 24 items are asserted by tests; the rest are UI/Edge items verified by reading the code, and their UAT is pending. ⚠️ 4 spec-precision notes (S1–S4, non-blocking).

---

## Reference file check (PC-10, done in scratch, iteration 1; writer unchanged since)

I parsed all 192 rows of `docs/referencias/03102026073838.xlsx` into values, wrote them again with the feature's `buildXlsx` + `PURCHASE_FILE_HEADER` + `PURCHASE_FILE_TEXT_COLUMNS`, and compared every cell by type (shared string or number), value and text format (numFmt 49):

- Python `zipfile.testzip()`: no errors in either file.
- Rows: 192 vs 192. Cells that differ in type, value or text format: **0**. The header row also uses the text format on B–D, same as the reference.
- The COD rule matches the reference: 127 numeric CODs, 0 rows where "numeric" disagrees with `/^[1-9]\d*$/`. Cor/Estampa/Tamanho are always strings; Quantidade/Total are always numbers.
- The reference also contains extra parts (theme, drawing, persons) that the generated file leaves out. That only matters if the Millennium import needs them → confirm in the UAT.

`4b7b52e` changed no production file, so this result still holds.

---

## Discrimination Sensor

### Iteration 2 (against `4b7b52e`)

Isolated scratch: `git worktree add --detach %TEMP%\pc-verify2 HEAD` + a junction to the main `node_modules`. Each mutation was applied, tested against the 4 feature test files, and then the original bytes were restored (worktree `git status --porcelain` empty afterwards). Baseline in the scratch: 4 files, **61 passed**.

Scratch pitfall found and fixed: a junction target written with a lowercase drive letter (`c:\...`) loaded two copies of vitest, and every suite failed even without a mutation ("Cannot read properties of undefined (reading 'config')"). I discarded those results and redid the junction as `C:\...`. All results below come from the runs after the baseline went green.

| # | File:line | Mutation | Result |
| --- | --- | --- | --- |
| M6 | `purchaseOrder.ts:143` | `PURCHASE_FILE_TEXT_COLUMNS` `[1,2,3]` → `[1,2]` | ✅ Killed (1: "colunas gravadas como texto no XLSX…") |
| M6b | `purchaseOrder.ts:143` | `[1,2,3]` → `[0,1,2,3]` (COD would be forced to text) | ✅ Killed (1: same test) |
| M16 | `purchaseOrder.ts:169` | "Sem mínimo" filter drops minimum 0 (`r.minimo` → `r.minimo != null`) | ✅ Killed (1: "Sem mínimo = mínimo vazio ou 0") |
| M17 | `purchaseOrder.ts:133` | "Sem mínimo (N)" count drops minimum 0 (`!r.minimo` → `r.minimo == null`) | ✅ Killed (1: same test, count assertion `:282`; the filter is untouched in this mutant) |
| M8 | `purchaseStock.ts:69` | `asNum(SALDO) ?? 0` → `Number(SALDO)` | ⚪ Survived: **equivalent** for the spec's null input (`Number(null) === 0`). The non-equivalent variant M8b was killed in iteration 1. |

### Iteration 1 (against `d68ae9f`), for the record

| # | File:line | Mutation | Result |
| --- | --- | --- | --- |
| M1 | `purchaseOrder.ts:57` | eligibility drops the `WP` exclusion | ✅ Killed (2) |
| M2 | `purchaseOrder.ts:76` | `Math.ceil` → `Math.floor` (round down to the multiple) | ✅ Killed (11) |
| M3 | `purchaseOrder.ts:74` | negative Total no longer counted as 0 | ✅ Killed (1) |
| M4 | `purchaseOrder.ts:68` | new-product window `< 30` → `<= 30` | ✅ Killed (1) |
| M5 | `purchaseOrder.ts:154` | COD regex `/^[1-9]\d*$/` → `/^\d+$/` (leading zero becomes a number) | ✅ Killed (1) |
| M6 | `purchaseOrder.ts:143` | `PURCHASE_FILE_TEXT_COLUMNS` `[1,2,3]` → `[1,2]` | ❌ Survived → **killed in iteration 2** |
| M7 | `purchaseOrder.ts:160` | file name month off by one | ✅ Killed (2) |
| M8 | `purchaseStock.ts:69` | `asNum(SALDO) ?? 0` → `Number(SALDO)` | ⚪ Equivalent |
| M8b | `purchaseStock.ts:69` | null `SALDO` → `-1` | ✅ Killed (1) |
| M8c | `purchaseStock.ts:70` | null `QUANTIDADE_PEDIDO` → `1` | ✅ Killed (1) |
| M9 | `purchaseStock.ts:71` | missing `TOTAL` → `0` instead of saldo + pedido | ✅ Killed (1) |
| M10 | `xlsx.ts:31` | text columns lose the `s="1"` (numFmt 49) style | ✅ Killed (1) |
| M11 | `purchaseOrder.ts:154` | file "Total em Estoque" written negative | ✅ Killed (1) |
| M12 | `purchaseOrder.ts:108` | variants flagged only above 2 | ✅ Killed (2) |
| M13 | `purchaseOrder.ts:150` | file includes rows with quantity 0 | ✅ Killed (3) |
| M14 | `purchaseOrder.ts:73` | multiplier ignored | ✅ Killed (3) |
| M15 | `purchaseOrder.ts:84` | 99999 rejected (`<=` → `<`) | ✅ Killed (1) |
| M16 | `purchaseOrder.ts:169` | "Sem mínimo" filter drops minimum 0 | ❌ Survived → **killed in iteration 2** |
| M17 | `purchaseOrder.ts:133` | "Sem mínimo (N)" count drops minimum 0 | ❌ Survived → **killed in iteration 2** |
| M18 | `purchaseOrder.ts:151` | file in alphabetical order instead of report order | ✅ Killed (2) |
| M19 | `purchaseRepo.ts:46` | null `purchase_blocked` treated as blocked | ✅ Killed (1) |
| M20 | `purchaseRepo.ts:58` | sold in 30 days overwrites instead of summing | ✅ Killed (1) |
| M21 | `purchaseOrder.ts:109` | no minimum → A pedir `0` instead of "—" | ✅ Killed (1) |

**Sensor depth**: expanded (23 injections in iteration 1 + 5 in iteration 2, including the new M6b).
**Result**: every non-equivalent mutant is killed. The only survivor is M8, equivalent with justification. → ✅ PASS

Note (not counted): if **both** position sorts (`purchaseOrder.ts:95` and `:151`) were removed, the ordering test would still pass, because its fixture feeds rows already in position order. In production this is harmless: the repository and the parser both deliver rows in report order (`purchaseRepo.ts:75`, `purchaseStock.ts:93`).

---

## Payload / conjunction rule

Assertions check values, not just calls: whole rows use `toEqual`/`toMatchObject` (`purchaseOrder.test.ts:118-126` and the full file-row assertion; `purchaseStock.test.ts:22-35`; `purchaseRepo.test.ts:28-41`). XLSX cells are checked by type, decoded value and style (`xlsx.test.ts:66-81`), and CRC is recomputed with `node:zlib` (`xlsx.test.ts:57`).

The new tests also assert values:
- the exact filtered code list `["Z0","N1"]`, which proves minimum 0 is included and minimum 5 excluded
- the exact count `2`
- the exact column names the constant maps to.

The side effects that write data (upsert / delete in `savePurchaseMin`, `replaceRows` + `purchase_synced_at` in the Edge, the registry RPC) have no automated test. This is by design per the test matrix (`tasks.md:26-28`) and is covered only by reading the code + UAT.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code / no scope creep | ✅ (TXT file, history and quantity editing are left out, as the spec says); the fix commit touches only the test file |
| Surgical changes | ✅ the commits touch only feature files + `vitest.config.ts` include + tasks/CLAUDE.md |
| Matches patterns | ✅ reuses `useScopedStores`, `HeaderFilter`, `ProductNameCell`, `EmptyBlock`, `Alert`, the Edge relogin flow, and RLS cloned from the challenge/stock migrations |
| Spec-anchored outcome check | ✅ every AC outcome is asserted or verified by reading the code |
| Per-layer coverage | ✅ pure domain covers the ACs 1:1, including the exported constant the page passes to the writer |
| Every test maps to a requirement | ✅ |
| Guidelines (`.cursor/rules/wedash.mdc`, `CLAUDE.md`) | ⚠️ all 12 feature commits (including `4b7b52e`) contain `Co-authored-by: Cursor`, but the workspace rule says "não incluir Co-authored-by na mensagem". This is a process issue, not code (likely inserted by the harness). Non-blocking |

---

## Gate Check (iteration 2, run against `4b7b52e` in the isolated worktree)

- `npx vitest run src/data/wedash/purchaseOrder.test.ts src/lib/xlsx.test.ts supabase/functions/_shared/purchaseStock.test.ts src/data/wedash/purchaseRepo.test.ts` → **4 files, 61 passed, 0 failed** (purchaseOrder 41 · xlsx 5 · purchaseStock 9 · purchaseRepo 6; +1 test vs iteration 1, and the minimum-0 assertions were added to an existing test).
- `npm run build` (tsc -b + vite) → **exit 0** (only the old `INEFFECTIVE_DYNAMIC_IMPORT` warning).
- Full suite `npx vitest run` → **593 passed, 4 failed** (45 files). The 4 failures are the known old ones in `src/data/wedash/dashboard.test.ts` (Overview from sales aggregates), the same as the stated baseline. Iteration 1 had 592 + 4, so there is +1 new test and none were removed or skipped.
- `npm run lint` was not run (the orchestrator did not ask for it).
- Gates ran in the worktree, not the real tree, so they check the committed state. The real tree has unrelated uncommitted work from other sessions.

**Isolation**: real-tree `git status --porcelain` was **identical before and after** (34 lines, same hash; the 34th line is this report, untracked). Worktree removed: junction link first with `rmdir`, then `git worktree remove --force` and `git worktree prune`. The main `node_modules` is intact (`vitest/package.json` present). The temporary mutation script in `%TEMP%` was deleted.

---

## Spec-precision gaps / deviations (non-blocking)

- **S1 (PC-03 AC 4 × AC 9)**: AC 4 says the row is highlighted whenever Total < mínimo × multiplicador. A product with several variants that is below the minimum is **not** highlighted (`noPedido` false, `purchaseOrder.ts:109, 124`). The assumptions table ("Linha destacada = produto que vai entrar no pedido") supports the implementation, but the ACs disagree with each other. → Fix the wording of AC 4.
- **S2 (PC-08 AC 5 × AC 7)**: while the error alert is showing, the yellow "saldo velho" alert is hidden (`PurchaseOrderPage.tsx:175` `!po.syncError && ...`), but AC 7 says WHILE the balance is > 30 min it SHALL show. This is a reasonable UX choice (the error alert already says the order uses the last balance). → Confirm with the owner and adjust the spec, or show both alerts.
- **S3 (PC-08 AC 5)**: if the ERP user is logged in somewhere else (`erp_busy`), the alert shows "Este usuário do Millennium está conectado em outro local…" (`purchaseRepo.ts:128`) instead of the single spec text. This matches the Estoque screen. → Add it to the spec.
- **S4 (Edge)**: if the requested store is filtered out before the call (no `millennium_store_id`, or a manager without access), the Edge answers `{ ok: true, stores: 0 }` with no `purchaseFailedStores` (`erp-stock-sync/index.ts:333`). The hook treats that as success and shows no alert. The spec does not define this case. → Low risk: the UI only lists the user's own stores.

---

## Ranked gaps

**Blocking**: none.

Resolved in iteration 2:
- ~~G1 — PC-04 AC 8 / PC-12 counts: minimum 0 untested~~ → `purchaseOrder.test.ts:280-282` (at `4b7b52e`); M16 and M17 killed.
- ~~G2 — PC-10 AC 5: the page's text-column constant untested~~ → `purchaseOrder.test.ts:198` (at `4b7b52e`); M6 and M6b killed.

Non-blocking follow-ups:
1. **G3 — UAT pending (not a code gap)**. Still needed:
   - `supabase db push` of `20261003120000_purchase_order`
   - deploy of `erp-stock-sync`
   - browser test with a real store: list, minimum saved after reload, manager limited to their stores, stale alert, and the file imported into the Millennium (this also confirms that leaving out the theme/drawing parts is OK)
2. **G4 — spec wording S1–S4** (confirm with the owner and update spec.md).
3. **G5 — process**: drop `Co-authored-by` from future commit messages (workspace rule); all 12 feature commits have it.

---

## Requirement Traceability Update (proposed — spec.md not edited by the Verifier)

| Requirement | New status |
| --- | --- |
| PC-01, PC-02, PC-03, PC-04, PC-05, PC-09 | ✅ Verified (tests + code); PC-05 AC 10 UAT pending |
| PC-06, PC-07, PC-08 | 🔎 Verified by reading the code; UAT pending |
| PC-10 | ✅ Verified (tests + reference parity, 0 diffs); Millennium import UAT pending |
| PC-11 | ✅ Verified (file rows) / 🔎 toasts |
| PC-12 | ✅ Verified (summary + counts) / 🔎 Total do filtro |

---

## Summary

**Overall**: ✅ Ready for the owner's UAT after deploy. No blocking gap remains.

**Spec-anchored check**: 45/45 items have evidence (39 ACs + 6 edge cases). 24 are asserted by tests that check the exact spec outcome; the rest are UI/Edge items verified by reading the code, with UAT pending. There are 4 non-blocking spec-precision notes.
**Sensor**: iteration 2 = 5 injected · 4 killed · 1 equivalent survivor (M8). Across both iterations, every non-equivalent mutant is killed.
**Gate**: 61/61 feature tests pass; build passes; full suite matches the baseline (593 + 4 old failures).

**What works**: the quantity rule, eligibility, the "Novo" window, variants, the "Sem mínimo" filter and count (empty or 0), the parser's null handling, and the file rows, name, order and text columns. The XLSX writer is cell-for-cell identical to the reference file in type and format.

**Lessons**: iteration 1 had signal (surviving mutants, an AC gap), but no lesson was recorded in `.specs/lessons.json`, because this run may edit only this file. Proposed lessons for the orchestrator to record:
- (surviving_mutant) "Exported constants that the UI passes into file writers must be asserted directly, not re-typed in the writer's test."
- (ac_gap) "When an AC treats 'empty or 0' as one case, put a zero-valued fixture in the tests."
- Scratch tip (process, optional): "On Windows, create the scratch `node_modules` junction with the same drive-letter case as the repo path (`C:\`), or vitest loads two copies and every suite fails."
