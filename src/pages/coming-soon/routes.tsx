import { Navigate, type RouteObject } from "react-router-dom";
import { paths } from "@/router/paths";
import { lazyPage } from "@/lib/lazyPage";
import { ComingSoon } from "./ComingSoon";

const Profile = lazyPage(() => import("./Profile"), "Profile");
const FASE2 = "Fase 2 · em construção";
const FASE3 = "Fase 3 · em construção";

export const emBreveRoutes: RouteObject[] = [
  { path: paths.analytics, element: <Navigate to={paths.overview} replace /> },
  { path: paths.legacy.analytics, element: <Navigate to={paths.overview} replace /> },
  { path: paths.legacy.settings.root, element: <Navigate to={paths.settings.stores} replace /> },
  { path: paths.legacy.settings.challenges, element: <Navigate to={paths.settings.challenges} replace /> },
  { path: paths.legacy.settings.staff, element: <Navigate to={paths.settings.staff} replace /> },
  { path: paths.legacy.settings.groups, element: <Navigate to={paths.settings.groups} replace /> },
  { path: paths.legacy.settings.messages, element: <Navigate to={paths.settings.messages} replace /> },
  { path: paths.legacy.settings.documents, element: <Navigate to={paths.settings.documents} replace /> },
  { path: paths.legacy.settings.costs, element: <Navigate to={paths.settings.costs} replace /> },
  { path: "/configuracoes/marca", element: <Navigate to={paths.settings.stores} replace /> },
  { path: "/settings/brand", element: <Navigate to={paths.settings.stores} replace /> },
  { path: paths.legacy.settings.erp, element: <Navigate to={paths.settings.erp} replace /> },
  { path: paths.legacy.settings.stores, element: <Navigate to={paths.settings.stores} replace /> },
  { path: paths.legacy.settings.users, element: <Navigate to={paths.settings.users} replace /> },
  { path: paths.legacy.seller.myGoal, element: <Navigate to={paths.seller.myGoal} replace /> },
  { path: paths.legacy.seller.tasks, element: <Navigate to={paths.seller.tasks} replace /> },
  { path: paths.legacy.profile, element: <Navigate to={paths.profile} replace /> },
  // Equipe virou aba do Dashboard, com filtro compartilhado: ver src/pages/team/routes.tsx.
  // Metas saiu de Configurações: ver src/pages/goals/routes.tsx (redirect legado).
  { path: paths.settings.challenges, element: <ComingSoon titulo="Desafios" fase={FASE2} descricao="Objetivos pontuais em quantidade, produto, faturamento, P.A. ou ticket médio. Prêmio em reais; meta nunca em reais (exceto ticket/faturamento)." itens={["Nome, tipo, critério, meta por pessoa, prêmio, período e participantes", "Produtos por categoria, não SKU a SKU", "Aviso de quantos já estão ativos ao criar", "Candidatos: compra bloqueada com estoque, cobertura alta com ticket acima da média"]} /> },
  { path: paths.settings.staff, element: <ComingSoon titulo="Colaboradores" fase={FASE2} descricao="Quem vem do ERP e o que é só nosso: e-mail, celular, aniversário, grupo, tipo e inatividade." itens={["Lista por filial com status no ERP e no app", "Convidar e reenviar convite", "Marcar como inativo com motivo e data, aceitando retroativo", "Marcar como caixa central e configurar rateio"]} /> },
  { path: paths.settings.groups, element: <ComingSoon titulo="Grupos e tarefas" fase={FASE3} descricao="Grupo tem nome e horário. Tarefa é da loja, por grupo, e reseta na virada." itens={["Grupos por filial cobrindo as pontas do dia", "Tarefas por grupo com ordem", "Painel de conclusão por grupo, nunca nominal"]} /> },
  { path: paths.legacy.settings.shifts, element: <Navigate to={paths.settings.groups} replace /> },
  { path: paths.settings.messages, element: <ComingSoon titulo="Mensagens" fase={FASE2} descricao="Aviso vai por push, gesto vai por WhatsApp com envio humano." itens={["Fila de rascunhos: aniversário, férias, retorno, desligamento", "Botão que abre o WhatsApp com o texto pronto", "Modelos por grupo e por filial, com herança", "Degrau por push automático, uma vez por competência"]} /> },
  { path: paths.settings.documents, element: <ComingSoon titulo="Documentos" fase={FASE3} descricao="Termos e regras versionados. Nova versão exige novo aceite de todos." itens={["Por filial ou grupo", "Registro de quem aceitou, versão, data e IP", "Versão anterior nunca é sobrescrita"]} /> },
  { path: paths.settings.costs, element: <ComingSoon titulo="Custos" fase={FASE3} descricao="Parâmetros por filial que alimentam lucro bruto e, na v2, margem de contribuição." itens={["Imposto sobre custo de mercadoria", "Margem mínima aceitável", "Royalties e marketing por divisão (v2)", "Aluguel: percentual com mínimo em shopping, fixo em rua (v2)", "Custo fixo mensal (v2)"]} /> },
  { path: paths.seller.myGoal, element: <ComingSoon titulo="Minha meta" fase={FASE2} descricao="A tela que quem vende abre todo dia. Do que mais importa saber para o que menos importa." itens={["Realizado contra a meta, com os degraus marcados na barra", "Próximo degrau: quanto ganha a mais, quanto falta em reais e por dia, veredito honesto", "Comissão até agora, com percentual, bônus e a parcela do caixa central separada", "Meu dia: faturamento, atendimentos, ticket e PA contra o mesmo dia da semana anterior", "Ponto de atenção como orientação", "Grupo atual e tarefas, desafios que participo, ranking da loja", "Seletor de mês para conferir meses anteriores"]} /> },
  { path: paths.seller.tasks, element: <ComingSoon titulo="Tarefas" fase={FASE3} descricao="Checklist do grupo atual. Qualquer colaboradora marca, o sistema registra quem." itens={["Grupo atual com horário e progresso", "Checkbox grande por tarefa, na ordem configurada", "Grupos anteriores do dia recolhidos, somente leitura", "Reseta na virada do grupo"]} /> },
  { path: paths.seller.ranking, element: <ComingSoon titulo="Ranking" fase={FASE2} descricao="Ranking completo da loja, ordenado por atingimento." itens={["Posição e percentual de atingimento de cada colega", "O próprio valor em reais; das colegas só o percentual", "Rótulo de período parcial"]} /> },
  { path: paths.profile, element: <Profile /> },
];
