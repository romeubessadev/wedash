# ERP Sync → Visão Geral — Context

**Gathered:** 2026-09-21  
**Spec:** `.specs/features/erp-sync-overview/spec.md`  
**Status:** Ready for design

---

## Feature Boundary

Entregar um **pipeline de sync Millennium → Postgres WeDash** e fazer a **Visão Geral** ler KPIs reais derivados de `VENDAS.Lista` (não mocks), sem chamar o Millennium no page load do dashboard.

---

## Implementation Decisions

### Onde roda o sync

- Worker / VPS **no Brasil** (não só Supabase Edge) — Millennium bloqueia IP fora do BR.
- Edge Supabase pode orquestrar fila/API, mas a chamada HTTP ao Millennium sai do worker BR.

### Histórico (backfill) — DECIDIDO 2026-09-21

- **SEED** (bloqueia `/sincronizando`): início do **mês anterior → hoje** (MTD + vs mês ant.).
- **HISTORY** (async, após SEED): volta **mês a mês** até `max(opened_at, hoje−24 meses)`.
- **Teto:** 24 meses. **Chão:** `store.opened_at` (`DATA_INAUGURACAO`).
- **Picker:** só libera períodos já cobertos no Postgres (expande conforme HISTORY).
- Comparativo de mês: 1º mesmo mês/ano anterior; se loja não existia → mês anterior.

### Granularidade persistida

- **Agregados diários** por filial (e marca quando o ERP permitir no payload).
- **Agregados horários** só para o **dia corrente** (eixo “hoje” da VG / Ao vivo depois).
- Sem persistir venda a venda na v1.

### Escopo de dados v1 (Visão Geral)

- Fonte: **`VENDAS.Lista` apenas** → faturamento, nº de vendas/atendimentos, ticket médio, evolução temporal.
- CMV / margem / estoque / `RELATORIOMARGEM` → sync **pesado**, feature seguinte.

### Cadência (assumida do `ideia.md`, confirmável depois na UI de ERP)

- Sync **leve** (hoje): a cada **2 min** se credencial dedicada; **30 min** se compartilhada.
- Sync **pesado**: 1×/dia (fora desta feature).
- Leve e pesado **nunca** simultâneos na mesma credencial.
- “Atualizar agora”: só OWNER/MANAGER, **1× / 5 min**, dispara só o leve.

### Leitura do dashboard

- Visão Geral **sempre** lê Postgres WeDash.
- UI mostra watermark “Atualizado às HH:MM” a partir do último sync bem-sucedido.
- Polling/refetch do app (~60s na visão “hoje”) só reconsulta **nosso** backend.

### Agent's Discretion

- Schema exato das tabelas de agregados (nomes EN alinhados ao schema auth).
- Formato de fila/retry no worker BR.
- Mapeamento preciso dos campos `VENDAS.Lista` → KPIs (validar com curl real no Design).

### Declined / Undiscussed → Assumptions

- Intervalos 2/30 min e force-refresh 5 min → default do `ideia.md` (não re-discutidos ponto a ponto; usuário não contestou).
- Uma credencial ERP por tenant → default produto.
- Logout Millennium ao fim de cada job de sync → obrigatório (sessão única / `busy`).

---

## Specific References

- `ideia.md` §7 (sync leve/pesado, `VENDAS.Lista`, intervalos, force refresh).
- Edge atual: só onboarding login + `FILIAIS.Lista` + logout (`millennium-onboarding`).
- VG hoje: mocks em `src/data/wedash/dashboard.ts` + `sales.ts`.

---

## Deferred Ideas

- Sync pesado (CMV, estoque, cadastros).
- Linha a linha de venda para drill Produtos/Equipe.
- Backfill sob demanda além de 24 meses.
- Botão “Atualizar agora” na UI (pode ser P2 desta feature ou follow-up).
- ~~Subdomínio/`/:slug` routing~~ — descartado (AD-023: sem white label, endereço único da WeDash).
