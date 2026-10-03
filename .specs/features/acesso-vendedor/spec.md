# Acesso do vendedor - Specification

## Problem Statement

Hoje só Gestor e Gerente entram na WeDash. O vendedor não sabe, durante o mês, em que nível da meta está, quanto falta para o próximo e quanto já garantiu de premiação; essa conversa depende da gerência. O papel `SELLER` já existe no banco e na sessão, mas não há convite, a tela inicial do vendedor é "em breve" e as regras de leitura do banco liberam todos os dados da empresa para qualquer pessoa ativa, o que impede abrir o acesso com segurança.

## Goals

- [ ] Gestor ou Gerente convida um vendedor em menos de 30 segundos, por e-mail ou mandando o link pelo WhatsApp.
- [ ] O vendedor abre a WeDash no celular e, numa tela só, vê quanto já ganhou de premiação, quanto falta e quanto ganha a mais no próximo nível, os próprios números e a posição no ranking da loja — com os mesmos números que o gestor vê no detalhe da pessoa.
- [ ] Um vendedor logado não consegue ler, nem pela API, nenhum valor em R$ de outra pessoa nem dado da loja fora da meta.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Desafios na tela do vendedor | Decisão do dono: fica para depois |
| Gráfico do mês dia a dia e seletor de meses anteriores | Não escolhidos para a 1ª versão |
| Valor em R$ dos colegas no ranking | Decisão do dono: R$ só o próprio |
| Tarefas do dia, assinatura de documentos | Features futuras citadas pelo dono |
| Notificações / push (ex.: "subiu de nível") | Feature futura; depende do app instalado |
| Convidar vários vendedores de uma vez | Não pedido; convite é por pessoa |
| Editar WhatsApp do vendedor | Não pedido; o link é copiado e enviado pelo próprio gestor |
| Permissões configuráveis do que o vendedor vê | Conteúdo fixo na 1ª versão |
| Gestor "ver como vendedor" | Não pedido; o detalhe da pessoa já mostra a mesma premiação e números |
| Botão Atualizar para o vendedor | Vendas chegam pela atualização automática de 30 min |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde convida | Gestão > Vendedores, coluna **Acesso** na lista que vem do Millennium | Decisão do dono | y |
| Quem convida / suspende / cancela | Gestor (todas as lojas dele) e Gerente (só as lojas dele) | Decisão do dono | y |
| Canal do convite | E-mail + botão **Copiar link do convite** (para mandar pelo WhatsApp) | Decisão do dono | y |
| Mesma pessoa em várias lojas | Uma conta por e-mail; convidar o mesmo e-mail em outra loja liga os cadastros; Início mostra uma meta por loja | Decisão do dono | y |
| Conteúdo do Início | 3 blocos: **Premiação** (destaque) · **Seus números** (Hoje / Mês) · **Ranking da loja** com pódio | Decisão do dono (2026-10-03): tela única tem que motivar | y |
| Ranking | Ordenado pelo % da meta individual; colegas com nome, % e nível, sem R$; "falta" para subir de posição em p.p. da meta | Decisão do dono: justo entre grupos com metas diferentes e sem expor R$ | y |
| % da meta no modo Grupo | Ranking usa o % individual = vendido ÷ (meta do grupo ÷ pessoas do grupo); o nível mostrado é o do grupo | No modo Grupo todos do grupo têm o mesmo % de grupo; o individual diferencia | n |
| Consequência conhecida do % no ranking | Colega do mesmo grupo tem a mesma meta individual; com o % dele dá para estimar quanto vendeu | Inerente a mostrar % da meta; aceito ao escolher o formato | n |
| Projeção da premiação | "Se mantiver o ritmo: R$ X até DD/MM" só depois da metade do período da meta, escrita como estimativa | Decisão do dono; mesma regra da Visão geral | y |
| Período de "Mês" nos números | Período da meta ativa; sem meta = mês calendário | O vendedor pensa no período em que é premiado | n |
| Comparativo dos números | Mês = vs mesmo recorte do período anterior até ontem nos dois lados; Hoje = sem comparativo | Mesma regra da Dashboard > Equipe (não existe venda por pessoa e hora) | n |
| Quem pode ser convidado | Só quem está na aba Ativos (ativo no Millennium com cargo VENDEDOR) | Desligado e gerência não fazem parte da equipe de vendas (#29/#36); confirmado pelo dono | y |
| E-mail | Informado no convite, gravado em `store_seller.email`; formato de e-mail válido, até 254 caracteres; guardado em minúsculas | Coluna já reservada para isso | n |
| Nome no "Crie seu acesso" | Nome e Sobrenome em branco, igual ao convite do Gerente | Consistência com o fluxo existente; o nome do ERP continua nas análises | n |
| Desligado no Millennium | Acesso suspenso automaticamente na próxima sincronização da equipe; convite pendente é cancelado | Pessoa que saiu não pode continuar vendo dados da loja; confirmado pelo dono | y |
| Reativado no Millennium | Acesso continua suspenso até o Gestor/Gerente reativar | Evita reabrir acesso sem decisão de alguém; confirmado pelo dono | y |
| Validade do link | A mesma do convite do Gerente (configuração "Email OTP expiration" do Supabase); vencido = Reenviar | Reaproveita o fluxo existente | n |
| Copiar link × e-mail | O link copiado é o mesmo do e-mail enviado; Reenviar gera um link novo e o anterior deixa de valer | A confirmar no design (comportamento do Supabase ao gerar link) | n |
| Sessão de quem foi suspenso | Continua aberta até o próximo carregamento do app, como já acontece com Gestor/Gerente (#40) | Mesmo comportamento já aceito | n |
| Sino de notificações | Vendedor vê os avisos de novidade filtrados por papel (`announcement.roles`); não vê problemas do Millennium | Tabela já filtra por papel; problemas do ERP são do Gestor | n |
| Frescor | Linha "Vendas atualizadas às HH:MM" na tela Início | Vendedor precisa saber até quando o número vale | n |
| Rota | Tela inicial do vendedor em rota própria; `/my-goal` e `/minha-meta` redirecionam para ela | Itens Tarefas/Ranking "em breve" saem do menu | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Convidar vendedor em Gestão > Vendedores ⭐ MVP

**User Story**: As a Gestor or Gerente, I want to send an access invite to a seller from the Vendedores list so that the seller can follow their own goal.

**Why P1**: Sem convite ninguém da equipe de vendas entra.

**Acceptance Criteria**:

1. WHILE the Ativos tab of Gestão > Vendedores is shown, the system SHALL show an **Acesso** column with one of: "Sem acesso" · "Convite pendente" · "Ativo" · "Suspenso".
2. WHEN the user chooses **Convidar** on a person with "Sem acesso" THEN the system SHALL open a modal with the e-mail field prefilled with `store_seller.email` when it exists.
3. WHEN the user confirms a valid e-mail THEN the system SHALL send the invite e-mail, save the e-mail on the seller record, set Acesso to "Convite pendente" and show the toast "Convite enviado.".
4. WHEN the invite is sent THEN the system SHALL offer **Copiar link do convite** in the modal, and copying SHALL show the toast "Link copiado.".
5. WHILE a person is "Convite pendente", the row menu SHALL offer **Copiar link do convite**, **Reenviar convite** and **Cancelar convite**.
6. WHEN the user cancels a pending invite THEN the system SHALL set Acesso back to "Sem acesso" and the old link SHALL stop working.
7. WHILE a person is "Ativo", the row menu SHALL offer **Suspender acesso**; WHILE "Suspenso", it SHALL offer **Reativar acesso**.
8. IF the e-mail is empty or not a valid e-mail THEN the system SHALL show "Informe um e-mail válido." under the field and SHALL NOT send.
9. IF the e-mail already belongs to a Gestor or Gerente, or to another company THEN the system SHALL refuse with "Este e-mail já tem acesso à WeDash com outro tipo de acesso." and SHALL NOT send.
10. IF the invite e-mail fails to send THEN the system SHALL show the toast "Não foi possível enviar o convite. Tente novamente." and Acesso SHALL stay "Sem acesso".
11. WHEN the user clicks Convidar twice or two users invite the same person at the same time THEN the system SHALL keep a single account and a single pending invite for that person.
12. The system SHALL NOT offer Convidar on the Desligados tab.

**Independent Test**: Como Gestor, convidar uma pessoa da aba Ativos com um e-mail novo; ver "Convite pendente", copiar o link e abrir numa janela anônima.

---

### P1: Aceitar o convite ⭐ MVP

**User Story**: As a seller, I want to open the invite link and create my password so that I can enter the WeDash.

**Why P1**: Fecha o ciclo do convite.

**Acceptance Criteria**:

1. WHEN the seller opens a valid invite link THEN the system SHALL show the "Crie seu acesso" screen with the text "…para acessar a WeDash como parte da equipe de vendas da loja FANTASIA.".
2. WHEN the seller saves name, surname and password THEN the system SHALL activate the account, set Acesso to "Ativo" and open the seller home screen.
3. IF the link is expired or was cancelled THEN the system SHALL show the existing expired-invite screen asking to request a new invite from the store management.

**Independent Test**: Abrir o link copiado, criar a senha e cair na tela Início do vendedor.

---

### P1: Tela Início do vendedor - Premiação ⭐ MVP

**User Story**: As a seller, I want to see what I already earned and what I gain at the next level so that I push to get there.

**Why P1**: É o motivo do vendedor entrar na WeDash.

**Acceptance Criteria**:

1. WHEN a seller logs in THEN the system SHALL open the seller home screen titled "Bem-vindo(a) de volta, NOME 👋" with the line "Vendas atualizadas às HH:MM" (time of the last sales update of the store).
2. WHILE a goal of the seller's store is active today and the seller takes part in it, the system SHALL show, as the first and largest block, **Sua premiação até agora** (premiação + bônus already reached) with the current level badge ("N2 · Super") and the level bar.
3. WHILE the seller is below the last level, the block SHALL show "Faltam R$ X para N3 · Hiper" and "Ao chegar: +R$ Y de premiação", where Y = premiação at the next level on the current sales − premiação now, plus the next level bonus.
4. WHILE more than half of the goal period has passed, the block SHALL show "Se mantiver o ritmo: R$ Z até DD/MM", using the same projection rule as the Visão geral, labeled as an estimate; before that it SHALL NOT show a projection.
5. WHEN the seller reaches the last level THEN the block SHALL show "Você chegou ao último nível da meta." instead of the next-level lines.
6. The premiação, level and "falta" values SHALL equal the Meta section of the same person in Dashboard > Equipe for the same day.
7. WHERE the seller is linked to more than one store with an active goal, the system SHALL show one Premiação block per store, each titled with the store name.
8. IF no goal of the seller's store is active today THEN the system SHALL show the empty state 🎯 "Meta não configurada" · "Quando a meta da loja for cadastrada, ela aparece aqui." without any action button.
9. IF the store has an active goal but the seller is outside its groups THEN the system SHALL show "Você ainda não está em nenhum grupo desta meta. Fale com a gerência da loja.".
10. The seller side menu SHALL contain only **Início** and **Meu perfil**.
11. The seller screens SHALL NOT show the store picker, the Atualizar button, the Exportar button or Millennium problem notices.

**Independent Test**: Logar como vendedor de loja com meta ativa e comparar premiação, nível e "falta" com o detalhe da mesma pessoa em Dashboard > Equipe.

---

### P1: Tela Início do vendedor - Seus números ⭐ MVP

**User Story**: As a seller, I want to see my revenue, sales, ticket and P.A. so that I know how my day and my period are going.

**Why P1**: Pedido do dono para a tela única.

**Acceptance Criteria**:

1. The system SHALL show a **Hoje | Mês** switch, default **Mês**, where Mês = the period of the active goal (calendar month when there is no active goal).
2. The block SHALL show Faturamento, Nº de vendas, Ticket médio and P.A. of the seller only, for the chosen period.
3. WHILE Mês is chosen and the period ends today, the system SHALL compare each value with the same slice of the previous period, both sides through yesterday; WHILE Hoje is chosen, it SHALL NOT show a comparison.
4. IF any day with sales of the seller in the period has no item count THEN P.A. SHALL show "—" (nothing estimated).
5. IF the seller has no sales in the period THEN the values SHALL show R$ 0,00 / 0 and no comparison badge.
6. WHERE the seller is linked to more than one store, the numbers SHALL be the sum of the seller's sales in those stores.

**Independent Test**: Comparar os números de Mês com a linha da mesma pessoa no Desempenho da equipe, com o mesmo período.

---

### P1: Tela Início do vendedor - Ranking da loja ⭐ MVP

**User Story**: As a seller, I want to see my position in the store ranking with a podium so that I compete with my colleagues.

**Why P1**: Pedido do dono para motivar ("estigar") o vendedor.

**Acceptance Criteria**:

1. WHILE a goal of the store is active today, the system SHALL rank the people taking part in it by individual % of the goal (vendido ÷ meta individual; in Grupo mode, meta do grupo ÷ pessoas do grupo), highest first.
2. The system SHALL show the top 3 as a podium and the other positions as a list, each with position, name, % of the goal and level; the seller's own entry SHALL be highlighted as "VOCÊ".
3. The ranking SHALL NOT show any R$ value of another person.
4. The header SHALL show "Você: Nº de M".
5. WHILE the seller is not in 1st place, the system SHALL show "Faltam X p.p. para o Nº lugar" (gap in percentage points of the goal to the person right above).
6. WHEN two people have the same % THEN the system SHALL give them the same position.
7. IF no goal of the store is active today THEN the system SHALL NOT show the ranking block.
8. WHERE the seller is linked to more than one store with an active goal, the system SHALL show one ranking per store.

**Independent Test**: Comparar a ordem e os % com a coluna Nível da meta do Desempenho da equipe na mesma loja e dia.

---

### P1: Vendedor só lê o que é dele ⭐ MVP

**User Story**: As the owner of the network, I want a logged-in seller to read only their own goal and sales so that revenue, costs and colleagues' sales stay private.

**Why P1**: Sem isso abrir o acesso expõe Financeiro, CMV e as vendas de todos.

**Acceptance Criteria**:

1. IF a seller session queries any tenant table directly through the API (sales aggregates, costs, stores settings, goals, challenges, team, logs, ERP credentials) THEN the system SHALL return no rows.
2. WHEN the seller home screen loads THEN the system SHALL provide only: the seller's own sales aggregates (current and comparison period), the active goals of the seller's stores, the group totals the goal needs, and for each colleague in the goal only name, % of the goal and level — never a colleague's R$ value.
3. WHEN a seller opens any Gestor or Gerente route THEN the system SHALL redirect to the seller home screen.
4. IF a seller calls any Gestão, Conta or ERP action (invite, sync, settings) THEN the system SHALL refuse with HTTP 403.
5. WHEN a Gerente invites, suspends or cancels a seller of a store outside their stores THEN the system SHALL refuse with HTTP 403.

**Independent Test**: Com a sessão de um vendedor, chamar o PostgREST de `sales_day_agg`, `sales_seller_day_agg` e `goal` e receber lista vazia; a tela Início continua mostrando a meta.

---

### P1: Ciclo de vida do acesso ⭐ MVP

**User Story**: As a Gestor, I want a seller who left the store to lose access automatically so that I don't depend on remembering it.

**Why P1**: Rotatividade da equipe de vendas é alta.

**Acceptance Criteria**:

1. WHEN the team sync marks a seller as inactive in the Millennium THEN the system SHALL set that seller's access to "Suspenso" if it was "Ativo".
2. WHEN the team sync marks a seller as inactive THEN the system SHALL cancel that seller's pending invite.
3. WHEN a suspended seller is reactivated in the Millennium THEN the system SHALL keep the access "Suspenso" until a Gestor or Gerente reactivates it.
4. IF a suspended seller tries to log in THEN the system SHALL show "Seu acesso está suspenso. Fale com a gerência da loja." and SHALL NOT open the app.
5. The access states SHALL only change along: Sem acesso → Convite pendente → Ativo ⇄ Suspenso; Convite pendente → Sem acesso.

**Independent Test**: Suspender (ou desativar no ERP e rodar o Atualizar vendedores) e tentar logar com o vendedor.

---

### P2: Mesma pessoa em várias lojas

**User Story**: As a Gestor, I want to invite with the same e-mail a person who also has a record in another store so that they keep a single login.

**Why P2**: Acontece (cobertura de folga), mas é exceção.

**Acceptance Criteria**:

1. WHEN the user invites, in another store, an e-mail that already belongs to an active seller account of the same company THEN the system SHALL link the new store record to the existing account without sending a new password e-mail and SHALL show the toast "Acesso liberado também nesta loja.".
2. WHEN a seller is linked to two stores THEN the Acesso column SHALL show the same state in both stores.

**Independent Test**: Convidar o mesmo e-mail em duas lojas e ver duas metas no Início.

---

## Edge Cases

- IF the seller has no sales in the goal period THEN the system SHALL show premiação R$ 0,00, "Faltam R$ X para N1 · …" and the seller at the last ranking position.
- IF the goal of the store ended yesterday and no other goal is active THEN the system SHALL show the empty state from P1 Premiação AC 8 and hide the ranking.
- IF the seller is the only person in the goal THEN the ranking SHALL show "Você: 1º de 1" with no gap line.
- WHEN the e-mail is typed with uppercase letters or spaces THEN the system SHALL save it trimmed and in lowercase.
- IF the seller record disappears from the Millennium list (`in_erp = false`) THEN the system SHALL treat it as inactive for access (P1 Ciclo de vida AC 1).

---

## Implicit-requirement sweep

| Dimension | Covered by |
| --- | --- |
| Input validation & bounds | Convite AC 8; e-mail até 254 caracteres, minúsculas (Assumptions, Edge Cases) |
| Failure / partial-failure | Convite AC 10 (e-mail não enviado não muda o estado) |
| Idempotency / duplicates | Convite AC 11; P2 AC 1 (mesmo e-mail liga, não duplica) |
| Auth boundaries | Leitura AC 1–5; Ranking AC 3 (sem R$ de colegas) |
| Concurrency / ordering | Convite AC 11 |
| Data lifecycle / expiry | Validade do link (Assumptions); Ciclo de vida AC 1–3 |
| Observability | N/A because o estado aparece na coluna Acesso e as falhas de convite já viram toast; nenhum processo em segundo plano novo além da sincronização da equipe, que já registra em Logs |
| External-dependency failure | Convite AC 10 (envio de e-mail); Copiar link como alternativa ao e-mail |
| State-transition integrity | Ciclo de vida AC 5 |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SACC-01 | P1: Convidar (AC 1–12) | Design | Pending |
| SACC-02 | P1: Aceitar o convite (AC 1–3) | Design | Pending |
| SACC-03 | P1: Início - Premiação (AC 1–11) | Design | Pending |
| SACC-04 | P1: Início - Seus números (AC 1–6) | Design | Pending |
| SACC-05 | P1: Início - Ranking da loja (AC 1–8) | Design | Pending |
| SACC-06 | P1: Vendedor só lê o que é dele (AC 1–5) | Design | Pending |
| SACC-07 | P1: Ciclo de vida (AC 1–5) | Design | Pending |
| SACC-08 | P2: Várias lojas (AC 1–2) | Design | Pending |

**Coverage:** 8 total, 0 mapped to tasks, 8 unmapped ⚠️ (tasks ainda não criadas)

---

## Success Criteria

- [ ] Um vendedor convidado pelo WhatsApp cria a senha e vê a meta no celular sem ajuda.
- [ ] Premiação, nível e números do Início batem 100% com o detalhe da pessoa e o Desempenho da equipe no mesmo dia.
- [ ] Teste com a sessão de um vendedor contra as tabelas de vendas, custos e metas retorna zero linhas, e a resposta da tela Início não contém R$ de nenhum colega.
