# Desafios — Specification

## Problem Statement

O gestor cria desafios curtos para a equipe de vendas (em geral 4 por mês, 1 por semana), com prêmio em R$ ou em espécie ("Combo KFC"). Hoje Gestão > Desafios está em branco e a aba Desafios do Dashboard > Equipe só mostra o vazio. O gestor precisa criar o desafio em segundos, acompanhar quem está ganhando e, no fim, saber exatamente quem ganhou o quê — reaproveitando o padrão já validado de Metas (listagem em cards, editor, detalhe, fechamento).

## Goals

- [ ] Gestor cria um desafio semanal em menos de 1 minuto (ou duplica o da semana anterior e só ajusta o prêmio).
- [ ] Desafios de produto, categoria, P.A. e ticket médio calculados com dados reais do Millennium, sem nenhuma chamada nova ao ERP.
- [ ] Ao encerrar, o fechamento lista cada vencedor (posição ou "atingiu") com o prêmio e o total em R$, e a gerência quando configurada.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Desafio de "índice de desempenho" | Dono vai definir a regra depois (2026-10-02) |
| Escolher grupos ou pessoas participantes | Decisão: participa toda a equipe de vendas ativa da loja |
| Desafio de rede (várias lojas no mesmo desafio) | Mesmo modelo de Metas: 1 loja por desafio |
| Desafio por faturamento (R$) da pessoa | Não pedido; o ranking da Equipe já responde |
| Compartilhar com a equipe / notificação / app da vendedora | Depende do acesso da equipe de vendas (TODO #29) |
| Registrar prêmio como pago | Fechamento é leitura; pagamento fica fora da WeDash |
| Desafios na Visão geral | Não pedido; drill fica na Equipe |
| Recarregar o passado para produto por pessoa além da carga do histórico | Desafios são daqui para frente; o que a carga recarregar entra sozinho |
| Hora dentro do dia | Dados por pessoa são diários: desafio começa e termina em dias inteiros |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Estrutura do desafio | Métrica (Produtos · Categorias · P.A. · Ticket médio) × Modo (Disputa: quem fizer mais · Mínimo: todos que chegarem no alvo) | Cobre os tipos pedidos com 2 escolhas | y |
| Vencedores na Disputa | Pódio: 1º obrigatório, 2º e 3º opcionais, cada posição com prêmio próprio | Decisão do dono | y |
| Empate na Disputa | Empatadas levam o prêmio da posição; a seguinte pula (1, 1, 3) | Decisão do dono: sem critério escondido | y |
| Participantes | Equipe de vendas ativa da loja (cargo VENDEDOR) ∪ quem vendeu na loja no período | Decisão do dono (equipe toda); "quem vendeu" = mesma regra do detalhe da Meta | y |
| Prêmio da gerência | Opcional; gerência ganha quando o resultado da equipe toda bate o alvo, com a conta dos KPIs (P.A. = Σ itens ÷ Σ vendas; ticket = Σ faturamento ÷ Σ vendas; itens = Σ itens ÷ nº de participantes) | Decisão do dono | y |
| Gerência na Disputa | Usa o piso mínimo como alvo; sem piso, não há prêmio de gerência | Decisão do dono | y |
| Entrega | Produto, categoria, P.A. e ticket juntos na 1ª entrega | Decisão do dono: produto é o mais comum | y |
| Prêmio | Valor em R$ (> 0) ou descrição livre (1–60 caracteres); fechamento soma só os R$ | Prêmios em espécie são comuns ("Combo KFC") | y |
| Piso na Disputa | Opcional; abaixo do piso a pessoa não leva prêmio mesmo em 1º | Evita premiar resultado irrisório | y |
| Mínimo de vendas (P.A. e ticket) | Obrigatório, inteiro ≥ 1, sugestão 10 | Sem piso de vendas, 1 venda grande ganha ticket | y |
| Resultado zero | Nunca vence na Disputa | 0 itens não é desempenho | y |
| Vendas consideradas | Só da loja do desafio; sem vendas sem vendedor identificado ou da gerência; cupom cancelado fora | Mesma regra do ranking da Equipe | y |
| Produto do desafio | Escolhido no catálogo, agrupado por código do produto (todas as cores/tamanhos) | Mesmo agrupamento da tela Produtos | y |
| Unidade de produto/categoria | Itens vendidos (unidades) | "Vender X produtos" = unidades | y |
| Desafios simultâneos | Permitidos na mesma loja (sem trava de período) | Semana pode ter mais de 1 desafio | y |
| Status | A começar / Em andamento / Encerrado pelas datas (fuso da loja); "Fechamento em andamento" até o dia seguinte ao fim | Mesmo padrão de Metas | y |
| Editar depois de começar | Permitido; resultado recalculado na leitura | Mesmo padrão de Metas | y |
| Duplicar | Abre Novo desafio preenchido: mesmo modo/métrica/produtos/prêmios, período seguinte com a mesma duração, nome "{nome} (cópia)" | Caso comum: 4 desafios iguais no mês | y |
| Quem acessa | Gestor e Gerente (Gestão); gerente só nas lojas dele | Mesmo acesso de Gestão > Metas | y |
| P.A. sem itens em algum dia | Resultado "—" e a pessoa não concorre até o dado chegar | Regra "nada estimado" | y |

**Open questions:** none — all resolved or logged above (confirmado pelo dono em 2026-10-02).

---

## User Stories

### P1: Itens vendidos por pessoa e produto ⭐ MVP

**User Story**: As a gestor, I want a WeDash a saber quantos itens de cada produto cada pessoa vendeu por dia so that desafios de produto e categoria tenham resultado real.

**Why P1**: Sem esse dado, os desafios mais comuns (produto/categoria) não existem.

**Acceptance Criteria**:

1. WHEN o sincronizador grava o relatório de produtos por cupom de uma loja num dia THEN the system SHALL gravar, por loja × dia × pessoa (código do gerador) × código do produto, a soma de itens e de faturamento dos cupons que estão na lista de vendas do dia.
2. The system SHALL obter esse dado sem nenhuma chamada nova ao Millennium (mesma resposta do relatório de produtos por cupom já usada no Atualizar, no fechamento da madrugada e na carga do histórico).
3. WHEN o mesmo dia de uma loja é gravado de novo THEN the system SHALL substituir as linhas daquele dia e loja (sem duplicar).
4. The system SHALL deixar de fora itens de cupom cancelado e itens sem vendedor identificado.
5. IF a gravação desse dado falhar THEN the system SHALL registrar um aviso em Conta › Logs e seguir com o restante da sincronização.
6. The system SHALL permitir leitura do dado só por usuários da própria empresa.

**Independent Test**: Rodar o Atualizar de uma loja com vendas hoje e conferir que a soma de itens por pessoa bate com o relatório de produtos por cupom do Millennium.

---

### P1: Criar, editar e duplicar desafio ⭐ MVP

**User Story**: As a gestor, I want criar um desafio com métrica, modo e prêmio so that a equipe tenha um objetivo curto e claro.

**Why P1**: Sem cadastro não há desafio.

**Acceptance Criteria**:

1. WHEN o gestor abre Novo desafio THEN the system SHALL mostrar os campos obrigatórios Nome, Data de início, Data de fim, Métrica e Modo, e Loja só quando o seletor de lojas está em "Todas as lojas" (igual a Metas).
2. WHERE a métrica é Produtos the system SHALL exigir ao menos 1 produto do catálogo.
3. WHERE a métrica é Categorias the system SHALL exigir ao menos 1 categoria.
4. WHERE a métrica é P.A. ou Ticket médio the system SHALL exigir o Mínimo de vendas (inteiro ≥ 1), preenchido com 10 ao criar.
5. WHERE o modo é Mínimo the system SHALL exigir o alvo (itens: inteiro > 0; P.A.: > 0 com 2 casas; ticket: R$ > 0) e um prêmio por pessoa que atingir.
6. WHERE o modo é Disputa the system SHALL exigir o prêmio do 1º lugar e permitir 2º e 3º lugar opcionais, com o 3º só disponível depois do 2º.
7. WHERE o modo é Disputa the system SHALL permitir um piso mínimo opcional na unidade da métrica.
8. The system SHALL aceitar como prêmio um valor em R$ maior que 0 ou uma descrição de 1 a 60 caracteres.
9. WHERE o prêmio da gerência está ligado the system SHALL exigir o prêmio da gerência (R$ ou descrição).
10. WHILE o modo é Disputa sem piso the system SHALL manter o prêmio da gerência desligado e explicar que ele depende do piso mínimo.
11. IF a data de fim for anterior à data de início THEN the system SHALL marcar o campo e não gravar.
12. IF algum campo obrigatório estiver vazio ou inválido ao salvar THEN the system SHALL destacar os campos e mostrar o toast "Revise os campos destacados." sem gravar nada.
13. WHILE a gravação está em andamento the system SHALL desabilitar o botão e mostrar "Salvando…".
14. IF a gravação falhar THEN the system SHALL mostrar o toast "Não foi possível salvar as alterações. Tente novamente." e manter o formulário preenchido.
15. WHEN o gestor clica em Duplicar desafio THEN the system SHALL abrir Novo desafio com métrica, modo, produtos/categorias, piso, alvo, mínimo de vendas e prêmios copiados, período seguinte com a mesma duração (começando no dia seguinte ao fim) e nome "{nome} (cópia)", sem gravar até "Criar desafio".
16. The system SHALL permitir mais de um desafio da mesma loja no mesmo período.

**Independent Test**: Criar "Body Splash — quem vender mais" (Produtos, Disputa, 1º R$ 100, 2º Combo KFC), recarregar e ver o desafio salvo; duplicar e ver a semana seguinte preenchida.

---

### P1: Listagem de desafios ⭐ MVP

**User Story**: As a gestor, I want ver os desafios das minhas lojas em cards so that eu saiba o que está valendo e o que vem a seguir.

**Why P1**: Porta de entrada da tela.

**Acceptance Criteria**:

1. WHEN o gestor abre Gestão > Desafios THEN the system SHALL listar em cards (mesmo formato da listagem de Metas) os desafios das lojas do seletor cujo período cruza o filtro de período, na ordem Em andamento → A começar → Encerrados.
2. The system SHALL mostrar em cada card nome, período, loja (com mais de uma loja no escopo), status, métrica, modo, prêmio principal e o líder atual ou "N atingiram" (Mínimo).
3. WHEN o gestor clica no card THEN the system SHALL abrir o detalhe do desafio.
4. WHEN o gestor clica em Excluir no card THEN the system SHALL pedir confirmação em modal antes de apagar.
5. IF não houver desafios no período THEN the system SHALL mostrar o vazio 🔥 "Nenhum desafio no período" com o botão "Criar desafio".
6. WHILE a lista carrega pela primeira vez ou após trocar loja/período the system SHALL mostrar o skeleton no formato dos cards; recarga por venda nova SHALL ser silenciosa.

**Independent Test**: Com 3 desafios (um de cada status) na loja, abrir a tela e conferir ordem, status e líder.

---

### P1: Detalhe com ranking e vencedores ⭐ MVP

**User Story**: As a gestor, I want ver o resultado de cada pessoa no desafio so that eu saiba quem está ganhando e quem está perto.

**Why P1**: É a pergunta de decisão do desafio.

**Acceptance Criteria**:

1. WHEN o gestor abre o detalhe THEN the system SHALL mostrar o resumo (nome, status, período, loja, métrica, modo, prêmios) e a tabela de participantes com o resultado de cada um no período.
2. The system SHALL calcular o resultado de Produtos como a soma de itens dos produtos escolhidos vendidos pela pessoa na loja do desafio no período.
3. The system SHALL calcular o resultado de Categorias como a soma de itens dos produtos cuja categoria no catálogo está entre as escolhidas.
4. The system SHALL calcular P.A. como itens ÷ vendas e Ticket médio como faturamento ÷ vendas da pessoa na loja do desafio no período.
5. WHERE o modo é Disputa the system SHALL ordenar do maior para o menor resultado e atribuir posições com empate compartilhado (1, 1, 3).
6. WHERE o modo é Disputa the system SHALL marcar como vencedora da posição N (N ≤ posições configuradas) só a pessoa com resultado maior que 0, maior ou igual ao piso (quando houver) e, em P.A./ticket, com vendas ≥ mínimo de vendas.
7. WHERE o modo é Mínimo the system SHALL marcar como "Atingiu" toda pessoa com resultado ≥ alvo e, em P.A./ticket, com vendas ≥ mínimo de vendas.
8. WHERE o prêmio da gerência está configurado the system SHALL mostrar o resultado da equipe toda (P.A. = Σ itens ÷ Σ vendas; ticket = Σ faturamento ÷ Σ vendas; itens = Σ itens ÷ nº de participantes) e se ele atinge o alvo (alvo no Mínimo, piso na Disputa).
9. WHILE o desafio está Em andamento the system SHALL mostrar o que falta para cada pessoa chegar ao piso/alvo ou à posição de cima.
10. IF algum dia do período até hoje tiver vendas da loja sem o dado de itens por pessoa THEN the system SHALL mostrar um alerta amarelo dizendo que o resultado está incompleto para esses dias.
11. IF uma pessoa tiver P.A. sem itens gravados em algum dia com venda THEN the system SHALL mostrar "—" e não considerá-la vencedora.
12. WHILE o desafio está A começar the system SHALL mostrar os participantes sem resultado e "Começa em DD/MM".

**Independent Test**: Desafio de P.A. mínimo 1,90 com mínimo de 10 vendas; conferir que quem tem P.A. 2,0 com 8 vendas não aparece como "Atingiu".

---

### P1: Fechamento do desafio ⭐ MVP

**User Story**: As a gestor, I want ver no fim quem ganhou o quê so that eu entregue os prêmios sem fazer conta.

**Why P1**: Fecha o ciclo do desafio.

**Acceptance Criteria**:

1. WHILE o desafio está Encerrado the system SHALL mostrar o card Fechamento com cada vencedor (posição ou "Atingiu"), o prêmio, a gerência quando ganhou e o total em R$ dos prêmios em dinheiro.
2. WHILE hoje é o dia seguinte ao fim ou anterior the system SHALL mostrar o selo "Fechamento em andamento" no card Fechamento.
3. The system SHALL listar prêmios em espécie pelo nome sem somá-los ao total em R$.
4. IF ninguém venceu THEN the system SHALL mostrar "Nenhum vencedor neste desafio." no card Fechamento.
5. WHEN o gestor clica em Exportar no detalhe encerrado THEN the system SHALL gerar o PDF só com o resumo e o fechamento (padrão do fechamento de Metas).

**Independent Test**: Desafio encerrado com empate no 1º; conferir que as duas pessoas aparecem com o prêmio do 1º e que o total soma os dois.

---

### P2: Desafios no Dashboard > Equipe

**User Story**: As a gestor, I want ver os desafios em andamento na aba Desafios da Equipe so that eu acompanhe junto do ranking.

**Why P2**: A gestão do desafio já funciona sem isso; aqui é conveniência de leitura.

**Acceptance Criteria**:

1. WHEN o gestor abre a aba Desafios do Desempenho da equipe THEN the system SHALL mostrar um card compacto por desafio Em andamento das lojas do seletor (líderes ou "N atingiram", prazo, prêmio), sem botões de edição.
2. WHEN o gestor clica num desafio da aba THEN the system SHALL abrir o detalhe do desafio.
3. IF não houver desafio em andamento THEN the system SHALL manter o vazio atual 🔥 "Desafio não configurado" com "Criar desafio".

**Independent Test**: Com 1 desafio em andamento, abrir Dashboard > Equipe > aba Desafios e ver o card com o líder.

---

## Edge Cases

- IF a pessoa foi desligada durante o desafio e vendeu no período THEN the system SHALL mantê-la na tabela com o resultado (o gestor decide o prêmio).
- IF um produto escolhido sair do catálogo THEN the system SHALL manter o código no desafio e mostrar o nome salvo.
- WHEN dois desafios da mesma loja cruzam o período THEN the system SHALL calcular cada um de forma independente.
- IF o relatório de produtos por cupom de um dia falhar THEN the system SHALL tratar o dia como sem dado de itens por pessoa (alerta de resultado incompleto).
- WHEN a loja não tem ninguém na equipe de vendas e ninguém vendeu THEN the system SHALL mostrar "Nenhuma pessoa no desafio" no detalhe.

---

## Implicit-Requirement Dimensions (sweep)

| Dimension | Coverage |
| --- | --- |
| Input validation & bounds | DESAF-07..DESAF-17 |
| Failure / partial-failure states | DESAF-05 (gravação no sincronizador), DESAF-19 (gravação do desafio), DESAF-37 (resultado incompleto) |
| Idempotency / retry / duplicate handling | DESAF-03 (regravar dia substitui); DESAF-18 (botão desabilitado ao salvar) |
| Auth boundaries & rate limits | DESAF-06; escrita Gestor/Gerente (RLS como `goal`); rate limit N/A because só leitura/gravação no banco, sem ERP |
| Concurrency / ordering | N/A because edição concorrente = última gravação vale (igual a Metas) |
| Data lifecycle / expiry | Desafio fica até ser excluído; dado por pessoa × produto segue a mesma vida dos demais agregados de vendas |
| Observability | DESAF-05 (aviso em Logs) |
| External-dependency failure | DESAF-02 (sem chamada nova); edge case do relatório de cupom |
| State-transition integrity | Status só pelas datas (A começar → Em andamento → Encerrado); sem transição manual |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DESAF-01 | P1: Itens por pessoa — gravar loja × dia × pessoa × produto | - | Pending |
| DESAF-02 | P1: Itens por pessoa — sem chamada nova ao ERP | - | Pending |
| DESAF-03 | P1: Itens por pessoa — regravação substitui | - | Pending |
| DESAF-04 | P1: Itens por pessoa — sem cancelado / sem vendedor | - | Pending |
| DESAF-05 | P1: Itens por pessoa — falha vira aviso em Logs | - | Pending |
| DESAF-06 | P1: Itens por pessoa — leitura só da empresa | - | Pending |
| DESAF-07 | P1: Editor — campos obrigatórios e Loja condicional | - | Pending |
| DESAF-08 | P1: Editor — produtos (≥ 1) | - | Pending |
| DESAF-09 | P1: Editor — categorias (≥ 1) | - | Pending |
| DESAF-10 | P1: Editor — mínimo de vendas (P.A./ticket) | - | Pending |
| DESAF-11 | P1: Editor — modo Mínimo (alvo + prêmio) | - | Pending |
| DESAF-12 | P1: Editor — pódio 1º/2º/3º | - | Pending |
| DESAF-13 | P1: Editor — piso opcional na Disputa | - | Pending |
| DESAF-14 | P1: Editor — prêmio R$ ou descrição | - | Pending |
| DESAF-15 | P1: Editor — prêmio da gerência (e bloqueio sem piso) | - | Pending |
| DESAF-16 | P1: Editor — datas | - | Pending |
| DESAF-17 | P1: Editor — validação e toast | - | Pending |
| DESAF-18 | P1: Editor — "Salvando…" | - | Pending |
| DESAF-19 | P1: Editor — falha ao gravar | - | Pending |
| DESAF-20 | P1: Editor — duplicar | - | Pending |
| DESAF-21 | P1: Editor — desafios simultâneos | - | Pending |
| DESAF-22 | P1: Listagem — cards, filtro e ordem | - | Pending |
| DESAF-23 | P1: Listagem — conteúdo do card | - | Pending |
| DESAF-24 | P1: Listagem — abrir detalhe | - | Pending |
| DESAF-25 | P1: Listagem — excluir com confirmação | - | Pending |
| DESAF-26 | P1: Listagem — vazio | - | Pending |
| DESAF-27 | P1: Listagem — skeleton / recarga silenciosa | - | Pending |
| DESAF-28 | P1: Detalhe — resumo e tabela | - | Pending |
| DESAF-29 | P1: Detalhe — cálculo Produtos | - | Pending |
| DESAF-30 | P1: Detalhe — cálculo Categorias | - | Pending |
| DESAF-31 | P1: Detalhe — cálculo P.A. / ticket | - | Pending |
| DESAF-32 | P1: Detalhe — posições com empate | - | Pending |
| DESAF-33 | P1: Detalhe — regra de vencedor na Disputa | - | Pending |
| DESAF-34 | P1: Detalhe — regra "Atingiu" no Mínimo | - | Pending |
| DESAF-35 | P1: Detalhe — gerência (resultado da equipe) | - | Pending |
| DESAF-36 | P1: Detalhe — "falta" em andamento | - | Pending |
| DESAF-37 | P1: Detalhe — alerta de resultado incompleto | - | Pending |
| DESAF-38 | P1: Detalhe — P.A. "—" | - | Pending |
| DESAF-39 | P1: Detalhe — A começar | - | Pending |
| DESAF-40 | P1: Fechamento — vencedores e total | - | Pending |
| DESAF-41 | P1: Fechamento — "Fechamento em andamento" | - | Pending |
| DESAF-42 | P1: Fechamento — prêmio em espécie | - | Pending |
| DESAF-43 | P1: Fechamento — sem vencedor | - | Pending |
| DESAF-44 | P1: Fechamento — exportar PDF | - | Pending |
| DESAF-45 | P2: Equipe — cards dos desafios em andamento | - | Pending |
| DESAF-46 | P2: Equipe — abrir detalhe | - | Pending |
| DESAF-47 | P2: Equipe — vazio | - | Pending |

**Coverage:** 47 total, 0 mapped to tasks, 47 unmapped (Design/Tasks ainda não feitos).

---

## Success Criteria

- [ ] Gestor cria um desafio semanal (ou duplica o anterior) em menos de 1 minuto.
- [ ] Resultado de produto por pessoa bate 100% com o relatório de produtos por cupom do Millennium num dia conferido.
- [ ] Fechamento de um desafio encerrado mostra vencedores e total em R$ sem nenhuma conta manual.
