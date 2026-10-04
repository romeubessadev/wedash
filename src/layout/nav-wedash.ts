import { paths } from "@/router/paths";
import type { Role } from "@/data/wedash/team";
import type { NavEntry, NavGroup } from "./nav-config";

const ICONE = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  loja: "M3 9.5 5 4h14l2 5.5M3 9.5h18M3 9.5v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-10M9 20.5v-6h6v6",
  equipe: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  analise: "M3 3v18h18M18 9l-5 5-4-4-4 4",
  config: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  meta: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  tarefas: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  ranking: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a2 2 0 0 0 0 4h3M17 6h3a2 2 0 0 1 0 4h-3",
  /** Ondas de transmissão — “ao vivo” / tempo real (não raio). */
  aoVivo: "M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19M9.5 12a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0",
  perfil: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  /** Pessoa com engrenagem — metas, desafios, grupos e equipe. */
  gestao:
    "M18 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M10 15H6a4 4 0 0 0-4 4v2M21.7 16.4l-.9-.3M15.2 13.9l-.9-.3M16.6 18.7l.3-.9M19.1 12.2l.3-.9M19.6 18.7l-.4-1M16.8 12.3l-.4-1M14.3 16.6l1-.4M20.7 13.8l1-.4",
  /** Caixa — estoque. */
  estoque: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12",
};

/** Estoque · Pedido de compra (Gestor e Gerente). */
const estoque: NavGroup = {
  label: "Estoque",
  description: "Acompanhe o estoque e prepare os pedidos de compra.",
  icon: ICONE.estoque,
  items: [
    { label: "Estoque", to: paths.stock.inventory },
    { label: "Pedido de compra", to: paths.stock.purchaseOrder },
  ],
};

/** Metas · Desafios · Grupos · Vendedores (Gestor e Gerente). */
const gestao: NavGroup = {
  label: "Gestão",
  description: "Gerencie metas, desafios, grupos e vendedores.",
  icon: ICONE.gestao,
  items: [
    { label: "Metas", to: paths.goals },
    { label: "Desafios", to: paths.management.challenges },
    { label: "Grupos", to: paths.management.shifts },
    { label: "Vendedores", to: paths.management.staff },
  ],
};

/** Loja · Franquia · Aluguel · Produtos e impostos (só Gestor). */
const operacao: NavGroup = {
  label: "Configurações",
  description: "Defina os parâmetros usados pela WeDash para calcular custos, margens e resultados.",
  icon: ICONE.config,
  items: [
    { label: "Loja", to: paths.operation.store },
    { label: "Franquia", to: paths.operation.franchise },
    { label: "Aluguel", to: paths.operation.rent },
    { label: "Produtos e impostos", to: paths.operation.productsTaxes },
  ],
};

/** Abas das telas de cada grupo = os mesmos itens do menu. */
export const managementTabs = gestao.items.map(({ label, to }) => ({ label, to }));
export const operationTabs = operacao.items.map(({ label, to }) => ({ label, to }));

const navGestor: NavEntry[] = [
  {
    label: "Dashboard",
    icon: ICONE.dashboard,
    items: [
      { label: "Visão geral", to: paths.overview, dot: "var(--acc)" },
      { label: "Financeiro", to: paths.financial, dot: "var(--ok)" },
      { label: "Produtos", to: paths.products, dot: "var(--warn)" },
      { label: "Equipe", to: paths.team, dot: "var(--info)" },
    ],
  },
  estoque,
  gestao,
  operacao,
];

/** Gerente: sem Financeiro nem Configurações. Lojas fica no menu do avatar. */
const navGerente: NavEntry[] = [
  {
    label: "Dashboard",
    icon: ICONE.dashboard,
    items: [
      { label: "Visão geral", to: paths.overview, dot: "var(--acc)" },
      { label: "Produtos", to: paths.products, dot: "var(--warn)" },
      { label: "Equipe", to: paths.team, dot: "var(--info)" },
    ],
  },
  estoque,
  gestao,
];

/** Telas só do Gestor (Financeiro, Configurações, Usuários, Integrações, Logs). */
export const GESTOR_ROLES: Role[] = ["OWNER", "ADMIN_GLOBAL"];

export function isGestor(role: Role): boolean {
  return GESTOR_ROLES.includes(role);
}

const navVendedora: NavEntry[] = [
  { label: "Início", icon: ICONE.dashboard, to: paths.seller.home },
  { label: "Meu perfil", icon: ICONE.perfil, to: paths.profile },
];

export function navDoPapel(role: Role): NavEntry[] {
  switch (role) {
    case "SELLER":
      return navVendedora;
    case "MANAGER":
      return navGerente;
    default:
      return navGestor;
  }
}
