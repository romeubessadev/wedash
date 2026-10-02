# Desafios — Validação

## Validation

**Result**: PASS

- **Verificador:** independente (autor ≠ verificador), evidence-or-zero.
- **Diff range:** working tree vs HEAD, uncommitted (feature inteira não commitada; migration `20261002120000_challenge.sql` não aplicada e worker não publicado — esperado, não conta como falha).
- **Data:** 2026-10-02.

### Resumo

| Item | Resultado |
| --- | --- |
| ACs com evidência | 47 / 47 (24 com teste automatizado + implementação; 23 de UI só com implementação, por decisão — UI sem teste) |
| Sensor de discriminação | 10 mutações · 9 mortas · 1 sobrevivente (M9, morta depois do teste novo; + 1 mutação no aviso do worker, morta) |
| `npm run build` | exit 0 |
| `npm run lint` | exit 0 (só avisos `only-export-components` / `no-unsafe-optional-chaining` em arquivos fora da feature; nenhum em arquivo de desafio) |
| `npx vitest run src workers/millennium-sync/src` | exit 1 — 515/519; as 4 falhas são o baseline de datas em `src/data/wedash/dashboard.test.ts` (Overview from sales aggregates). Testes da feature: 45/45 (view + form), 11/11 (repo), worker verde |
| Árvore restaurada | `challengeView.ts` e `challengeForm.ts` byte-idênticos (SHA-256 `94472C0C…165A` e `A3B78B82…E62D` antes = depois); `git status --porcelain` idêntico antes/depois (130 linhas) |

### Evidência por AC

Legenda: **T** = teste automatizado (asserção), **I** = implementação (UI sem teste por decisão).

| AC | Evidência | Tipo |
| --- | --- | --- |
| DESAF-01 | `workers/millennium-sync/src/millenniumCouponReport.ts:238` (soma itens/R$ por loja × dia × gerador × código, só cupons da Lista); asserções `workers/millennium-sync/src/millenniumCouponReport.test.ts:131`, `:191`, `:202`; gravação `workers/millennium-sync/src/runSyncJob.ts:1020`, `:1106`; `workers/millennium-sync/src/runSyncJob.test.ts:623` (carga em período), `:949`–`:954` (FORCE) | T |
| DESAF-02 | Mesmo `byCoupon` do relatório de cupom já buscado: `workers/millennium-sync/src/runSyncJob.ts:1020`, `:1106` (nenhum fetch novo); `workers/millennium-sync/src/runSyncJob.test.ts:949` | T |
| DESAF-03 | Delete do range + upsert com onConflict = PK: `workers/millennium-sync/src/deps.ts:934`; PK em `supabase/migrations/20261002120000_challenge.sql:96` | I |
| DESAF-04 | Cancelado filtrado no parse `workers/millennium-sync/src/millenniumCouponReport.ts:90` (teste `workers/millennium-sync/src/millenniumCouponReport.test.ts:35`); sem gerador / sem dia → fora `workers/millennium-sync/src/millenniumCouponReport.test.ts:162`, `:167` | T |
| DESAF-05 | `workers/millennium-sync/src/runSyncJob.ts:1145` (`syncLog("WARN","itens_pessoa",…)`, segue); `workers/millennium-sync/src/runSyncJob.test.ts:962`–`:971` (job ok e top produtos gravado); rótulo `src/data/wedash/syncLogs.ts:38`, `:113`–`:117` | T (parcial — ver gap 2) |
| DESAF-06 | RLS só leitura por membership: `supabase/migrations/20261002120000_challenge.sql:105`–`:122`; escrita só service_role `:107`–`:108` | I |
| DESAF-07 | `src/data/wedash/challengeForm.ts:129`–`:162`; `src/data/wedash/challengeForm.test.ts:28`, `:32`; Loja condicional `src/pages/challenges/ChallengeEditorPage.tsx:93`, `:263`–`:277` | T + I |
| DESAF-08 | `src/data/wedash/challengeForm.ts:129`–`:162`; `src/data/wedash/challengeForm.test.ts:37` | T |
| DESAF-09 | `src/data/wedash/challengeForm.ts:129`–`:162`; `src/data/wedash/challengeForm.test.ts:41` | T |
| DESAF-10 | Validação inteiro ≥ 1 `src/data/wedash/challengeForm.ts:141`–`:144`, teste `src/data/wedash/challengeForm.test.ts:46`; padrão 10 `src/data/wedash/challengeForm.ts:14`, `:71`, `src/pages/challenges/ChallengeEditorPage.tsx:154`–`:159` (sem teste — mutação sobreviveu) | T + I |
| DESAF-11 | `targetError` `src/data/wedash/challengeForm.ts:92`–`:97`; `src/data/wedash/challengeForm.test.ts:53`, `:64` | T |
| DESAF-12 | `src/data/wedash/challengeForm.ts:129`–`:162`; `src/data/wedash/challengeForm.test.ts:77`; 3º só após 2º `src/pages/challenges/ChallengeEditorPage.tsx:364`–`:397` | T + I |
| DESAF-13 | `src/data/wedash/challengeForm.test.ts:82`; `src/pages/challenges/ChallengeEditorPage.tsx:399`–`:423` | T + I |
| DESAF-14 | `prizeError` `src/data/wedash/challengeForm.ts:105`–`:114`; `src/data/wedash/challengeForm.test.ts:94` | T |
| DESAF-15 | `managerAvailable` `src/data/wedash/challengeForm.ts:123`–`:126`; `src/data/wedash/challengeForm.test.ts:107`; texto/trava `src/pages/challenges/ChallengeEditorPage.tsx:399`–`:423` | T + I |
| DESAF-16 | `src/data/wedash/challengeForm.test.ts:120`; campos `src/pages/challenges/ChallengeEditorPage.tsx:244`–`:261` | T + I |
| DESAF-17 | Toast "Revise os campos destacados." `src/pages/challenges/ChallengeEditorPage.tsx:137`–`:141` | I |
| DESAF-18 | "Salvando…" + disabled `src/pages/challenges/ChallengeEditorPage.tsx:432`–`:433` | I |
| DESAF-19 | `SAVE_ERROR_MSG` `src/pages/challenges/ChallengeEditorPage.tsx:147` (texto em `src/pages/operation/shared.tsx:167`) | I |
| DESAF-20 | `copyChallenge` `src/data/wedash/challengeView.ts:346`–`:360`; `src/data/wedash/challengeView.test.ts:394`; abertura com `?copy` `src/pages/challenges/ChallengeEditorPage.tsx:107`–`:109` | T + I |
| DESAF-21 | Sem constraint de sobreposição em `supabase/migrations/20261002120000_challenge.sql`; cálculo por desafio isolado (`buildChallengeView` recebe 1 desafio, `src/data/wedash/challengeView.ts:110`) | I |
| DESAF-22 | `src/pages/management/ChallengesPage.tsx:83` (loja + período), ordem `:101`–`:115` | I |
| DESAF-23 | `src/pages/management/ChallengesPage.tsx:218`–`:316` (badges `:311`–`:312`); destaque `src/pages/challenges/shared.tsx:25`–`:44`; prêmio `src/pages/challenges/shared.tsx:47`–`:51`; `challengeCardSummary` testado `src/data/wedash/challengeView.test.ts:383` | T + I |
| DESAF-24 | Card clicável `src/pages/management/ChallengesPage.tsx:249` | I |
| DESAF-25 | Modal "Excluir desafio?" `src/pages/management/ChallengesPage.tsx:192`–`:213` | I |
| DESAF-26 | 🔥 "Nenhum desafio no período" + Criar desafio `src/pages/management/ChallengesPage.tsx:162`–`:173` | I |
| DESAF-27 | `src/pages/management/ChallengesPage.tsx:74`–`:96` (recarga silenciosa `:81`), skeleton `:159`–`:160`; `src/components/wedash/LoadingSkeletons.tsx:618` | I |
| DESAF-28 | Resumo `src/pages/challenges/ChallengeDetailPage.tsx:172`–`:221`; participantes `:223`–`:311` | I |
| DESAF-29 | `src/data/wedash/challengeView.ts:176`–`:182`; `src/data/wedash/challengeView.test.ts:96`, `:166` | T |
| DESAF-30 | `src/data/wedash/challengeView.test.ts:109`; leitura do catálogo `src/data/wedash/challengesRepo.ts:271` | T |
| DESAF-31 | `src/data/wedash/challengeView.ts:180`–`:181`; `src/data/wedash/challengeView.test.ts:124` | T |
| DESAF-32 | `src/data/wedash/challengeView.ts:190`–`:197`; `src/data/wedash/challengeView.test.ts:193` (`[1,1,3]`) | T |
| DESAF-33 | `src/data/wedash/challengeView.ts:186`–`:188`, `:209`; `src/data/wedash/challengeView.test.ts:206`, `:226`, `:231`, `:237` | T |
| DESAF-34 | `src/data/wedash/challengeView.ts:212`; `src/data/wedash/challengeView.test.ts:214`, `:250` | T |
| DESAF-35 | `src/data/wedash/challengeView.ts:249`–`:268`; `src/data/wedash/challengeView.test.ts:298`, `:306`, `:314`, `:323`, `:328`; UI `src/pages/challenges/ChallengeDetailPage.tsx:245`–`:264` | T + I |
| DESAF-36 | `src/data/wedash/challengeView.ts:217`–`:230`; `src/data/wedash/challengeView.test.ts:237`, `:264`, `:291` | T |
| DESAF-37 | `src/data/wedash/challengeView.ts:270`–`:276`; `src/data/wedash/challengeView.test.ts:333`; alerta `src/pages/challenges/ChallengeDetailPage.tsx:130`–`:137` | T + I |
| DESAF-38 | `src/data/wedash/challengeView.ts:172`, `:180`; `src/data/wedash/challengeView.test.ts:136` | T |
| DESAF-39 | `src/data/wedash/challengeView.ts:177`; `src/data/wedash/challengeView.test.ts:183` ("Começa em 05/10") | T |
| DESAF-40 | `challengePayout` `src/data/wedash/challengeView.ts:314`–`:331`; `src/data/wedash/challengeView.test.ts:353` (empate, total 230); UI `src/pages/challenges/ChallengeDetailPage.tsx:351`–`:446` | T + I |
| DESAF-41 | `src/data/wedash/challengeView.ts:289`; `src/data/wedash/challengeView.test.ts:342`; selo `src/pages/challenges/ChallengeDetailPage.tsx:369`–`:376` | T + I |
| DESAF-42 | `src/data/wedash/challengeView.ts:328`–`:329`; `src/data/wedash/challengeView.test.ts:370` (total 0, espécie `["Pizza","Pizza"]`) | T |
| DESAF-43 | `src/data/wedash/challengeView.test.ts:379`; texto `src/pages/challenges/ChallengeDetailPage.tsx:386` | T + I |
| DESAF-44 | Exportar `src/pages/challenges/ChallengeDetailPage.tsx:381`; cabeçalho do PDF `:319`–`:348`; demais blocos `print:hidden` `:131`, `:230` | I |
| DESAF-45 | `fetchActiveChallenges` `src/pages/team/TeamPage.tsx:89`–`:95`; cards `src/pages/challenges/ChallengeMiniCard.tsx:8`–`:55` (sem botões) | I |
| DESAF-46 | `onOpen` → detalhe `src/pages/team/TeamPage.tsx:579` | I |
| DESAF-47 | 🔥 "Desafio não configurado" + Criar desafio `src/pages/team/TeamPage.tsx:584`–`:593` | I |

Edge cases: pessoa desligada `src/data/wedash/challengeView.test.ts:148`; sem cadastro `:160`; "Nenhuma pessoa no desafio" `:179` + `src/pages/challenges/ChallengeDetailPage.tsx:267`; produto fora do catálogo mantém nome salvo (`products` com nome em `src/data/wedash/challengesRepo.ts:120`, `:145`; mapeamento testado em `src/data/wedash/challengesRepo.test.ts`); relatório de cupom falhou → dia sem dado → alerta (DESAF-37).

### Sensor de discriminação

Cópia em `%TEMP%\wedash-mut\*.bak`, mutação com a ferramenta de edição, rodando `npx vitest run src/data/wedash/challengeView.test.ts src/data/wedash/challengeForm.test.ts`, depois restauração e hash.

| # | Mutação | Local | Resultado |
| --- | --- | --- | --- |
| M1 | Empate 1,1,3 → 1,2,3 (sempre `i + 1`) | `src/data/wedash/challengeView.ts:195` | MORTA (3 testes) |
| M2 | Alvo `>=` → `>` | `src/data/wedash/challengeView.ts:188` | MORTA (4) |
| M3 | Sem filtro de mínimo de vendas (pool + Mínimo) | `src/data/wedash/challengeView.ts:187`, `:212` | MORTA (2) |
| M4 | P.A. sem "—" quando um dia tem 0 itens | `src/data/wedash/challengeView.ts:180` | MORTA (1) |
| M5 | Prêmio ITEM somado no total | `src/data/wedash/challengeView.ts:328` | MORTA (1) |
| M6 | Disputa ignora o piso no vencedor | `src/data/wedash/challengeView.ts:209` | MORTA (1) |
| M7 | Gerência de itens sem ÷ participantes | `src/data/wedash/challengeView.ts:256` | MORTA (1) |
| M8 | "Fechamento em andamento" `<=` → `<` fim+1 | `src/data/wedash/challengeView.ts:289` | MORTA (1) |
| M9 | Padrão do mínimo de vendas "10" → "5" | `src/data/wedash/challengeForm.ts:14` | **SOBREVIVEU** |
| M10 | Validação mínimo de vendas `< 1` → `< 0` | `src/data/wedash/challengeForm.ts:144` | MORTA (1) |
### Gaps (ranqueados)

1. ~~**Padrão 10 do mínimo de vendas sem teste**~~ **Fechado** — DESAF-10 — teste `src/data/wedash/challengeForm.test.ts:29` (formulário novo = Produtos · Disputa · mínimo "10" · 1 prêmio em R$ vazio). M9 refeita ("10" → "5" em `src/data/wedash/challengeForm.ts:14`): MORTA.
2. ~~**Aviso em Logs da falha de itens por pessoa não é assertado**~~ **Fechado** — DESAF-05 — `workers/millennium-sync/src/runSyncJob.test.ts:975` confere o WARN `itens_pessoa` gravado em Logs. Mutação (remover o `syncLog` de `workers/millennium-sync/src/runSyncJob.ts:1145`): MORTA.
3. **Status/prazo pelo relógio de calendário fixo, não pelo fuso da loja** — premissa "Status pelas datas (fuso da loja)" (sem AC numerado; afeta DESAF-22/39/41) — `src/pages/management/ChallengesPage.tsx:57`, `src/pages/challenges/ChallengeDetailPage.tsx:53` usam `calendarTodayIso` (`src/data/wedash/clock.ts:25`). Igual ao padrão de Metas; só diverge para loja fora do fuso padrão.
4. **Precisão do spec: mínimo de vendas e piso na posição da Disputa** — DESAF-32/33 — `src/data/wedash/challengeView.ts:186`–`:197`. Quem está abaixo do mínimo de vendas sai do pool de posições (não ocupa posição); o piso não tira da posição, só do prêmio (o 1º abaixo do piso faz o 2º ficar sem prêmio também). Coerente com CLAUDE.md #49, mas o AC não diz se o abaixo-do-mínimo ocupa posição.
5. **Texto do card no Mínimo** — DESAF-23/45 — `src/pages/challenges/shared.tsx:32` mostra "Atingiram: N pessoas", não o literal "N atingiram" do AC (mesmo significado).
6. **Regravação (DESAF-03) e RLS (DESAF-06) sem teste** — `workers/millennium-sync/src/deps.ts:934`, `supabase/migrations/20261002120000_challenge.sql:105`. Esperado (banco); validar após `db push`.
7. **Arredondamento do alvo de P.A. com mais de 2 casas** — DESAF-11 — `src/data/wedash/challengeForm.ts:165`–`:180` arredonda sem teste dedicado.
8. **Cupom cancelado testado só no parse** — DESAF-04 — `workers/millennium-sync/src/millenniumCouponReport.ts:90`; não há teste de ponta a ponta até `sellerProductDayAggsFromCouponLines`.
