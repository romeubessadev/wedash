# Pedido de compra — Specification

## Problem Statement

O franqueado monta o pedido de compra de cada loja numa planilha Google com Apps Script: busca o "Saldo Atual e Futuro" do Millennium, digita um mínimo por produto, vê em amarelo o que está abaixo do mínimo e gera um `.xlsx` que importa no Millennium. A planilha depende de túnel, senha na aba oculta e de uma pessoa que saiba mexer nela. A WeDash já tem a integração com o Millennium, o cadastro dos produtos (múltipla, bloqueado, data de cadastro) e a tela `Estoque > Pedido de compra` em branco: o pedido passa a ser feito dentro do app, com a mesma regra e o mesmo arquivo.

## Goals

- [ ] O gestor gera o arquivo do pedido de uma loja em menos de 1 minuto (abrir a tela → conferir os destacados → Gerar pedido), sem planilha.
- [ ] O arquivo gerado é aceito pela importação do Millennium sem ajuste (mesmas colunas e formatos do exemplo `docs/referencias/03102026073838.xlsx`).
- [ ] A quantidade de cada item bate com a regra da planilha (mesmo mínimo, mesmo multiplicador e mesmo saldo dão o mesmo número).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Arquivo TXT | Decisão do dono (2026-10-03): o Millennium importa o XLSX do exemplo |
| Histórico de pedidos gerados / reabrir pedido | Não pedido; a planilha também não guardava |
| Enviar o pedido direto ao Millennium (sem arquivo) | A importação é feita no ERP pelo usuário |
| Editar a quantidade de um item antes de gerar | Planilha não tinha; quantidade sai da regra (fase 2) |
| Mínimo sugerido pelas vendas / previsão de estoque | "Daria pra melhorar bastante" — fase 2, depois do pedido funcionando |
| Produtos WPINK (`WP*`) | A planilha exclui; são comprados por outro caminho |
| Várias lojas no mesmo arquivo | 1 arquivo = 1 filial, igual à planilha |
| Exportar PDF da tela | Não pedido |
| Transferência entre lojas | Outro problema |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Formato do arquivo | XLSX de 1 aba, colunas `COD_PRODUTO · Cod_Cor · Cod_Estampa · Tamanho · Quantidade · Total em Estoque · Descricao`, nome `ddMMyyyyHHmmss.xlsx` | Decisão do dono; igual ao exemplo | y |
| Quando buscar o saldo | Ao abrir a tela se a última busca da loja tiver mais de 30 min, e no Atualizar do topo com a tela aberta (igual ao Estoque) | Decisão do dono (2026-10-03); substitui o "só no botão" de 29/09 | y |
| Fonte do saldo | `ESTOQUEEMCOMPRA` (Saldo Atual e Futuro) **sem período**, 1 chamada por loja (~0,4s) | Sem período é rápido; com período levou 5–30s na sondagem de 2026-10-03 | y |
| Estoque considerado na conta | `TOTAL` do relatório = saldo + pedidos em aberto (confirmado em 610/610 linhas × 4 lojas); negativo conta como 0 | Mesma regra da planilha (`normalizarEstoque`) | y |
| Vendidos em 30 dias (coluna informativa) | Itens vendidos pela loja de D-30 a D-1, das vendas já gravadas na WeDash | Sem chamada extra ao ERP; mesmo intervalo da planilha | n |
| Mínimo | Por loja × código do produto, guardado na WeDash; inteiro ≥ 0; vazio = sem mínimo; não precisa ser múltiplo da múltipla | Planilha aceitava qualquer valor (aviso só como ajuda); a quantidade é arredondada depois | n |
| Gravar o mínimo | Grava sozinho ao sair do campo / Enter, sem botão Salvar | Tabela com ~400 linhas; mesmo padrão do Grupo em Gestão > Vendedores | n |
| Multiplicador | Seletor 1x · 2x · 3x · 4x · 5x na tela, padrão 1x; não é gravado (volta a 1x ao abrir) | Planilha tinha 1–5x; voltar a 1x evita pedido dobrado sem perceber | n |
| Destaque da linha | Linha destacada = produto que vai entrar no pedido com o multiplicador atual (Total < mínimo × multiplicador) | Tela e arquivo sempre concordam | n |
| Produtos listados | Só os elegíveis: código sem `WP`, não bloqueado para compra, múltipla > 0 | Mesmo filtro da planilha (`linhaElegivel`) | n |
| Produto com mais de uma variante elegível (cor/estampa/tamanho) | Aparece na lista, mas fica fora do arquivo, com aviso para pedir direto no Millennium | Hoje só 2 produtos têm variantes e os dois estão bloqueados; a planilha repetia a quantidade inteira em cada variante | n |
| Novo | Coluna "Novo" (Sim/Não) — Sim quando a data de cadastro do Millennium está entre hoje e 29 dias atrás **ou** a loja nunca vendeu o produto no histórico da WeDash (só quando esse histórico cobre 12 meses ou começa na inauguração da loja); não muda a quantidade | Planilha usava só a data (`NOVO_DIAS = 30`); decisão do dono (2026-10-04): produto antigo que a loja nunca vendeu também é novo para ela. O relatório não serve para "nunca vendeu" (sem período = 0; período longo estoura o tempo). Bloqueado para compra já fica fora da lista | n |
| Ordem das linhas no arquivo | Ordem em que o relatório devolve os produtos | Igual à planilha | n |
| Código numérico no arquivo | `COD_PRODUTO` só com dígitos e sem zero à esquerda vai como número; o resto como texto; `Cod_Cor`/`Cod_Estampa`/`Tamanho` sempre texto | Igual ao exemplo (linha 192: `526` numérico; cor `000` em texto) | n |
| Data/hora do nome do arquivo | Horário do aparelho de quem gera | Planilha usava o horário de Brasília; diferença só no nome | n |
| Loja | 1 loja por pedido. Com uma loja no seletor do topo, é ela; com "Todas as lojas", a tela mostra o filtro Loja (padrão = 1ª loja da lista) | Pedido é por filial | n |
| Quem acessa | Gestor e Gerente; gerente só nas lojas dele | Mesmo acesso do Estoque | n |
| Mínimo concorrente | Último a gravar vale | Edição rara e por loja | n |
| Produto que some do relatório ou fica bloqueado | Sai da lista; o mínimo fica guardado e volta se o produto voltar | Não perder o que o usuário digitou | n |

**Open questions:** none — as linhas "n" são padrões propostos, pendentes de confirmação do dono junto com esta spec.

---

## User Stories

### P1: Ver o pedido da loja ⭐ MVP

**User Story**: Como gestor ou gerente, quero ver os produtos que a loja compra com saldo, pedidos em aberto, mínimo e quanto vai ser pedido, para conferir antes de gerar.

**Why P1**: É a planilha LAYOUT dentro do app; sem isso não há pedido.

**Acceptance Criteria**:

1. WHEN o usuário abre Estoque > Pedido de compra com uma loja escolhida THEN a tela SHALL listar os produtos elegíveis da loja (código sem `WP`, não bloqueado para compra, múltipla > 0) do último saldo buscado.
2. The tela SHALL mostrar em cada linha: produto (nome + código), Mínimo, Saldo, Pedidos em aberto, Total em estoque, Vendidos em 30 dias, Múltiplo de compra e A pedir.
3. WHEN a data de cadastro do produto está entre hoje e 29 dias atrás, OR o histórico de vendas da loja na WeDash cobre 12 meses (ou começa na inauguração) e a loja nunca vendeu o produto, THEN a coluna "Novo" da linha SHALL mostrar "Sim"; senão SHALL mostrar "Não". Com histórico mais curto (ou leitura falhou) SHALL valer só a data de cadastro. O filtro "Novos (N)" SHALL aparecer sempre, mesmo com N = 0.
4. WHEN Total em estoque (negativo conta como 0) é menor que mínimo × multiplicador e o mínimo é maior que 0 THEN a linha SHALL ficar destacada e a coluna A pedir SHALL mostrar a quantidade da regra PC-09.
5. IF o mínimo está vazio ou é 0 THEN a coluna A pedir SHALL mostrar "—" e a linha SHALL não ficar destacada.
6. WHILE o seletor do topo está em "Todas as lojas" e o usuário tem mais de 1 loja, a tela SHALL mostrar o filtro Loja, com a 1ª loja da lista escolhida por padrão.
7. WHEN o usuário digita na busca THEN a lista SHALL mostrar só os produtos cujo nome ou código contém o texto (sem diferenciar maiúsculas e acentos).
8. WHEN o usuário escolhe o filtro "Vai para o pedido" THEN a lista SHALL mostrar só as linhas destacadas; "Sem mínimo" SHALL mostrar só as de mínimo vazio ou 0; "Novos" SHALL mostrar só as com selo Novo.
9. IF um produto tem mais de uma variante (cor/estampa/tamanho) elegível THEN a linha SHALL mostrar o aviso "Este produto tem mais de uma cor ou tamanho. Faça o pedido diretamente no Millennium." e A pedir SHALL mostrar "—".
10. IF a loja ainda não tem nenhum saldo buscado THEN a tela SHALL mostrar o carregamento (skeleton) enquanto a 1ª busca roda.

**Independent Test**: Com saldo gravado de uma loja, abrir a tela e ver os produtos elegíveis; um produto com Total 2, mínimo 72 e múltipla 24 aparece destacado com A pedir 72.

---

### P1: Definir o mínimo de cada produto ⭐ MVP

**User Story**: Como gestor ou gerente, quero digitar o mínimo de cada produto na própria lista e que ele fique guardado para a loja.

**Why P1**: Sem mínimo, nada entra no pedido.

**Acceptance Criteria**:

1. WHEN o usuário altera o Mínimo de uma linha e sai do campo (ou aperta Enter) THEN o sistema SHALL gravar o valor para aquela loja × código do produto.
2. WHEN o mínimo é gravado THEN o destaque e o A pedir da linha SHALL ser recalculados na hora.
3. IF o valor digitado não é um inteiro entre 0 e 99999 THEN o campo SHALL voltar ao último valor gravado e mostrar o toast "Use um número inteiro entre 0 e 99999.".
4. WHEN o campo é apagado e o usuário sai dele THEN o sistema SHALL gravar o produto como sem mínimo.
5. IF a gravação falha THEN o campo SHALL voltar ao último valor gravado e mostrar o toast "Não foi possível salvar as alterações. Tente novamente.".
6. The mínimo SHALL valer só para a loja em que foi digitado (outras lojas mantêm os próprios mínimos).
7. WHEN o saldo é buscado de novo THEN os mínimos já gravados SHALL continuar nos mesmos produtos.
8. IF o usuário é Gerente THEN o sistema SHALL aceitar a gravação só nas lojas vinculadas a ele.

**Independent Test**: Digitar 72 no mínimo de um produto, recarregar a página e ver 72; trocar de loja e ver o mínimo daquela loja.

---

### P1: Buscar o saldo no Millennium ⭐ MVP

**User Story**: Como gestor ou gerente, quero que o saldo esteja atualizado quando vou montar o pedido.

**Why P1**: Pedido com saldo velho compra errado.

**Acceptance Criteria**:

1. WHEN a tela abre e a última busca da loja tem mais de 30 minutos (ou não existe) THEN o sistema SHALL buscar o Saldo Atual e Futuro da loja no Millennium (1 chamada, sem período) e atualizar a lista.
2. WHEN o usuário clica em Atualizar no topo com a tela aberta THEN o sistema SHALL buscar o saldo da loja escolhida, qualquer que seja a idade da última busca.
3. The tela SHALL mostrar abaixo dos filtros "Saldo atualizado às HH:MM" (hoje) ou "Saldo atualizado em DD/MM às HH:MM" (outro dia); durante a busca, "Buscando saldo…"; sem busca anterior, "Saldo ainda não atualizado".
4. WHEN a busca termina THEN o sistema SHALL substituir o saldo guardado da loja pelo retornado e gravar o horário da busca.
5. IF a busca falha THEN a tela SHALL manter o último saldo guardado e mostrar o alerta "Não foi possível atualizar o saldo" com o texto "O pedido usará o último saldo disponível.". Usuário do Millennium em outro local usa o texto próprio e o mesmo apoio. Sem conexão com a WeDash, o alerta é "Não foi possível conectar à WeDash. Verifique sua conexão e tente novamente.".
6. IF a integração está desconectada ou com senha inválida THEN o sistema SHALL não iniciar a busca e a tela SHALL mostrar o aviso padrão de Millennium desconectado.
7. WHILE o saldo mostrado tem mais de 30 minutos, a tela SHALL mostrar o alerta amarelo "O saldo é de DD/MM às HH:MM. O pedido pode sair com quantidades desatualizadas.".
8. IF o usuário é Gerente THEN o sistema SHALL buscar o saldo só das lojas vinculadas a ele.

**Independent Test**: Abrir a tela de uma loja com busca de mais de 30 min, ver "Buscando saldo…" e depois "Saldo atualizado às HH:MM" com os números novos.

---

### P1: Gerar o arquivo do pedido ⭐ MVP

**User Story**: Como gestor ou gerente, quero gerar o arquivo do pedido para importar no Millennium.

**Why P1**: É a entrega da planilha.

**Acceptance Criteria**:

1. The tela SHALL ter o seletor Multiplicador com 1x · 2x · 3x · 4x · 5x, padrão 1x a cada abertura.
2. The quantidade de cada produto SHALL ser: alvo = mínimo × multiplicador; se Total em estoque (negativo = 0) ≥ alvo ou mínimo = 0, nada; senão (alvo − Total) arredondado para cima até o próximo múltiplo da múltipla.
3. WHEN o usuário clica em "Gerar pedido" THEN o sistema SHALL baixar um arquivo `.xlsx` de 1 aba com a linha de cabeçalho `COD_PRODUTO · Cod_Cor · Cod_Estampa · Tamanho · Quantidade · Total em Estoque · Descricao` e 1 linha por produto com quantidade > 0.
4. The arquivo SHALL ter o nome `ddMMyyyyHHmmss.xlsx` com a data e hora do aparelho no momento da geração.
5. The colunas `Cod_Cor`, `Cod_Estampa` e `Tamanho` SHALL ser gravadas como texto (ex.: `000`, `U`); `Quantidade` e `Total em Estoque` como número; `COD_PRODUTO` como número quando só tem dígitos e não começa com 0, senão como texto.
6. The coluna `Total em Estoque` SHALL trazer o Total em estoque do produto com negativo como 0, e `Descricao` a descrição do relatório.
7. The linhas do arquivo SHALL seguir a ordem em que o relatório devolveu os produtos.
8. IF nenhum produto tem quantidade > 0 THEN o sistema SHALL não baixar arquivo e SHALL mostrar o toast "Nenhum produto precisa ser incluído no pedido.".
9. WHEN o arquivo é baixado THEN o sistema SHALL mostrar o toast "Pedido gerado com N produtos." (N = linhas de produto do arquivo).
10. The arquivo SHALL excluir produtos com mais de uma variante elegível (ver "Ver o pedido da loja", AC 9).
11. WHILE a busca de saldo está em andamento, o botão "Gerar pedido" SHALL ficar desabilitado.

**Independent Test**: Com 3 produtos abaixo do mínimo, clicar em Gerar pedido e abrir o `.xlsx`: 3 linhas, cor `000` em texto, quantidades múltiplas da múltipla; importar no Millennium sem erro.

---

### P2: Resumo do pedido

**User Story**: Como gestor, quero ver o tamanho do pedido antes de gerar.

**Why P2**: Ajuda a conferir, mas o pedido funciona sem.

**Acceptance Criteria**:

1. The tela SHALL mostrar "N produtos · N itens no pedido" com os totais das linhas que vão para o arquivo no multiplicador atual.
2. The tabela SHALL ter a linha "Total do filtro" com a soma de Saldo, Pedidos em aberto, Total em estoque, Vendidos em 30 dias e A pedir das linhas filtradas.

**Independent Test**: Trocar o multiplicador de 1x para 2x e ver o resumo e o Total do filtro crescerem.

---

## Edge Cases

- IF o relatório devolve `SALDO` nulo THEN o sistema SHALL tratar o saldo como 0.
- IF o relatório devolve `QUANTIDADE_PEDIDO` nulo THEN o sistema SHALL tratar como 0.
- WHEN a múltipla é 1 THEN a quantidade SHALL ser exatamente alvo − Total.
- IF a loja não tem nenhum produto elegível no relatório THEN a tela SHALL mostrar o vazio "Nenhum produto para pedido" / "O Millennium não retornou produtos liberados para compra nesta loja.".
- IF a busca não encontra produto THEN a tabela SHALL mostrar o vazio de busca com "Limpar busca".
- WHEN o usuário troca de loja THEN a tela SHALL mostrar o saldo e os mínimos da nova loja e aplicar a regra de busca de 30 minutos a ela.

---

## Requirement Traceability

| Requirement ID | Story | Tasks | Status |
| --- | --- | --- | --- |
| PC-01 | P1: Ver o pedido — lista de elegíveis (AC 1, 2) | T1, T9, T10 | Verified |
| PC-02 | P1: Ver o pedido — selo Novo (AC 3) | T1, T9 | Verified |
| PC-03 | P1: Ver o pedido — destaque e A pedir (AC 4, 5) | T1, T9 | Verified |
| PC-04 | P1: Ver o pedido — loja, busca e filtros (AC 6, 7, 8) | T1, T9 | Verified |
| PC-05 | P1: Ver o pedido — variantes e carregamento (AC 9, 10) | T1, T9 | Verified |
| PC-06 | P1: Mínimo — gravar, validar, por loja, permissões (AC 1–8) | T1, T4, T7, T8 | Verified (UAT pendente do deploy) |
| PC-07 | P1: Saldo — quando buscar e horário (AC 1–4) | T4, T5, T6, T7, T8 | Verified (UAT pendente do deploy) |
| PC-08 | P1: Saldo — falha, desconectado, saldo velho, gerente (AC 5–8) | T6, T7, T8 | Verified (UAT pendente do deploy) |
| PC-09 | P1: Gerar — multiplicador e regra da quantidade (AC 1, 2) | T1, T9 | Verified |
| PC-10 | P1: Gerar — arquivo, nome, formatos, ordem (AC 3–7, 10) | T2, T3, T9 | Verified (UAT pendente do deploy) |
| PC-11 | P1: Gerar — vazio, toast, desabilitado (AC 8, 9, 11) | T2, T9 | Verified |
| PC-12 | P2: Resumo do pedido (AC 1, 2) | T1, T9 | Verified |

**Coverage:** 12 total, 12 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Primeiro pedido real de uma loja gerado pela WeDash e importado no Millennium sem editar o arquivo.
- [ ] Para a mesma loja, mínimos e saldo, a WeDash e a planilha geram as mesmas linhas e quantidades.
- [ ] A planilha deixa de ser usada para o pedido.
