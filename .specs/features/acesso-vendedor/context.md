# Acesso do vendedor Context

**Gathered:** 2026-10-03
**Spec:** `.specs/features/acesso-vendedor/spec.md`
**Status:** Ready for design (após confirmação do dono)

---

## Feature Boundary

Convite de acesso para quem está na equipe de vendas (Gestão > Vendedores), aceite pela tela "Crie seu acesso" e uma tela inicial exclusiva do vendedor com a própria meta. Inclui fechar a leitura do banco para o papel `SELLER`. Outras telas do vendedor (meu dia, desafios, ranking, tarefas, documentos) ficam fora.

---

## Implementation Decisions

### Onde e quem convida

- Convite na coluna **Acesso** de Gestão > Vendedores (aba Ativos), não em Conta > Usuários.
- Gestor e Gerente podem convidar, reenviar, cancelar, suspender e reativar; o Gerente só nas lojas dele.

### Canal do convite

- E-mail (mesmo envio do convite do Gerente) + botão **Copiar link do convite** para mandar pelo WhatsApp.

### Várias lojas

- Uma conta por pessoa (por e-mail). Convidar o mesmo e-mail em outra loja liga o cadastro dessa loja à conta existente; o Início mostra uma meta por loja.

### Conteúdo da tela Início (revisto 2026-10-03: "app de uma tela só tem que ser legal")

- **Premiação** em destaque: até agora + nível + "faltam R$ X para o próximo nível" + "ao chegar: +R$ Y".
- **Projeção** "Se mantiver o ritmo: R$ Z até DD/MM" só depois da metade do período da meta, escrita como estimativa (mesma regra da Visão geral).
- **Seus números** com Hoje | Mês: Faturamento, Nº de vendas, Ticket médio, P.A.
- **Ranking da loja** com pódio: ordem pelo % da meta individual; colegas com nome, % e nível, sem R$; "falta" para subir de posição em p.p. da meta.
- Desafios, gráfico do mês e meses anteriores ficam para depois.

### Agent's Discretion

- Nome da rota e do item de menu ("Início"), layout mobile-first do bloco da meta, textos dos vazios dentro do padrão `EmptyBlock`.
- Técnica para fechar a leitura do `SELLER` (regras do banco × função no servidor), decidida no Design.

### Declined / Undiscussed Gray Areas → Assumptions

- Quem pode ser convidado, formato do e-mail, nome em branco no "Crie seu acesso", suspensão automática no desligamento, reativação manual, validade do link, link copiado × e-mail, sessão de suspenso, sino, frescor e rota — todos em Assumptions da spec com `Confirmed? = n`.

---

## Specific References

- Seção Meta do detalhe da pessoa (`TeamMemberDetail.tsx`, #42 do CLAUDE.md) = conteúdo do bloco.
- Convite do Gerente (Edge `team-members`, `/invite/:token`, "Crie seu acesso") = fluxo a reaproveitar.
- Saudação "Bem-vindo(a) de volta, NOME 👋" (#36b) já prevista para a tela do vendedor.
- Pódio da antiga tela Ao vivo (`BlocoRanking`, preservado para a visão da equipe de vendas, #43) = base do pódio do ranking.

---

## Deferred Ideas

- Desafios em andamento com a posição do vendedor.
- Gráfico do mês dia a dia e seletor de meses anteriores.
- Tarefas do dia, assinatura de documentos.
- Notificação "subiu de nível" (push, app instalado).
- Convidar vários vendedores de uma vez.
