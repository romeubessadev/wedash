# Desafios Context

**Gathered:** 2026-10-02
**Spec:** `.specs/features/desafios/spec.md`
**Status:** Spec aprovada pelo dono em 2026-10-02 ("Pode seguir"); todas as Assumptions confirmadas

---

## Feature Boundary

Gestão > Desafios (listagem, criar/editar/duplicar, detalhe, fechamento) aproveitando a estrutura de Metas, mais a aba Desafios do Dashboard > Equipe. Métricas: itens de produtos, itens de categorias, P.A. e ticket médio. Inclui o novo dado de itens por pessoa × produto × dia gravado pelo sincronizador.

---

## Implementation Decisions

### Tipos de desafio

- Desafio = Métrica × Modo. Métricas: Produtos · Categorias · P.A. · Ticket médio. Modos: **Disputa** (quem fizer mais) e **Mínimo** (todos que chegarem no alvo).
- "Índice de desempenho" fica para depois.

### Vencedores

- Disputa = pódio configurável: 1º obrigatório, 2º e 3º opcionais, cada posição com prêmio próprio.
- Empate: as empatadas levam o prêmio da posição; a próxima pula (1, 1, 3).

### Participantes

- Toda a equipe de vendas ativa da loja (sem escolher grupos ou pessoas).

### Gerência

- Prêmio opcional. Gerente ganha quando o resultado da equipe toda bate o alvo, com a conta dos KPIs da Equipe (P.A. = Σ itens ÷ Σ vendas; ticket = Σ faturamento ÷ Σ vendas; itens = Σ itens ÷ nº de participantes).
- Na Disputa, o alvo da gerência é o piso mínimo; sem piso, não há prêmio de gerência.

### Entrega

- Produto, categoria, P.A. e ticket juntos na 1ª entrega (inclui a mudança no sincronizador).

### Agent's Discretion

- Formato visual: reaproveitar os componentes de Metas (card da listagem no formato Categories, editor em cards, detalhe com resumo + tabela + fechamento, PDF do fechamento).

### Declined / Undiscussed Gray Areas → Assumptions

- Prêmio R$ ou descrição; piso opcional na Disputa; mínimo de vendas (padrão 10) em P.A./ticket; resultado zero não vence; desafios simultâneos permitidos; duplicar = semana seguinte; participantes = equipe ativa ∪ quem vendeu. Todos registrados na spec e confirmados pelo dono.

---

## Specific References

- "Vai ser do mesmo jeito da de Metas" — listagem, editor, detalhe e fechamento de `src/pages/goals/`.
- Exemplo de prêmio em espécie: "Combo KFC".
- Ritmo típico: 4 desafios por mês, 1 por semana.

---

## Deferred Ideas

- Desafio de índice de desempenho (regra a definir).
