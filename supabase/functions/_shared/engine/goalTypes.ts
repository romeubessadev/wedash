/** Tipos da conta da meta (sem dependências fora do motor). Money nos agregados = centavos inteiros. */

export interface Tier {
  nome: string;
  atingimentoMinPct: number;
  /** % da premiação sobre o faturamento realizado neste degrau. */
  comissaoPct: number;
  /**
   * Bônus acumulado ao atingir este degrau.
   * Regra de produto: R$ 50 por nível (1→50, 2→100, 3→150, 4→200).
   */
  bonus: number;
  /** Premiação da gerência (% sobre o faturamento total da loja) ao a loja chegar neste nível; ausente = sem premiação da gerência. */
  gerenciaPct?: number;
  /** Bônus da gerência (R$) ao a loja chegar neste nível; soma com os níveis anteriores. */
  gerenciaBonus?: number;
}

export type GoalType = "individual" | "grupo";
export type GoalBrand = "WEPINK" | "WPINK";

/** Meta gravada (tabela `goal`): 1 por loja por período, valores em reais. */
export interface GoalRecord {
  id: string;
  storeId: string;
  name: string;
  /** ISO YYYY-MM-DD (inclusive). */
  startsOn: string;
  endsOn: string;
  /** Meta da loja no período (R$). */
  target: number;
  /** INDIVIDUAL = cada pessoa pela própria meta (meta ÷ pessoas); GROUP = a equipe sobe junta. */
  tierMode: "INDIVIDUAL" | "GROUP";
  tiers: Tier[];
  /** % da meta de cada grupo da loja (soma 100); vazio = sem grupos de distribuição. */
  groups: GoalGroup[];
}

export interface GoalGroup {
  shiftId: string;
  name: string;
  pct: number;
}

/** Pessoa da equipe da loja (store_seller) para a meta. */
export interface GoalTeamMember {
  storeId: string;
  employeeId: number;
  /** Código de gerador no Millennium (liga os itens por pessoa dos desafios). */
  geradorId?: number | null;
  name: string;
  /** Nomes normalizados já vistos (liga venda gravada só pelo nome). */
  nameKeys: string[];
  /** Ativo com cargo VENDEDOR = na equipe de vendas agora. */
  salesPerson: boolean;
  /** Grupo da pessoa (Gestão > Vendedores). */
  shiftId: string | null;
  shiftName: string | null;
}

export interface SellerRow {
  colaboradorId: string;
  nome: string;
  /** Filial da vendedora — necessária na visão rede (coluna Shopping). */
  filialId: string;
  filialNome: string;
  /** Nome do grupo (Grupo 1/Grupo 2) ou "Sem grupo". */
  grupo: string;
  faturamentoValor: number;
  faturamento: string;
  atendimentos: number;
  ticketValor: number;
  ticket: string;
  paValor: number;
  pa: string;
  diasTrabalhados: number;
  tendencia: "subindo" | "estavel" | "caindo";
  // Meta individual (só com meta ativa; sem meta ficam zerados e semMeta=true)
  metaIndividualValor: number;
  metaProporcional: boolean;
  diasElegiveis: number;
  atingimentoPct: number;
  barraPct: number;
  /** Participação no faturamento vs. meta da loja (valorLoja). */
  pctMetaGeral: number;
  /** Marcos da escada p/ barra segmentada: { nome, pct, bonus, pctPremiacao }. */
  marcosEscada: { nome: string; pct: number; pctPremiacao: number; bonus: number }[];
  degrauAtual: string | null;
  /** Índice 1-based do degrau atual (null = ainda sem nível). */
  nivelAtual: number | null;
  proximoDegrau: { nome: string; faltaValor: number; pctPremiacao: number; bonus: number; atingMinPct: number } | null;
  /** Premiação acumulada da escada de metas (realizado × pct do degrau). */
  premiacaoAcumulada: number;
  /** % de premiação do degrau atual (0 se ainda não entrou na escada). */
  comissaoPct: number;
  /** Premiação projetada pelo ritmo: realizado escalado × pct do degrau projetado. */
  premiacaoProjetadaIndividual: number | null;
  /** Atingimento projetado pelo ritmo da competência (100 = fecha a meta). */
  atingimentoProjetadoPct: number | null;
  bonusAlcancado: number;
  // Atenção — um ponto por vendedora, na ordem de prioridade do mockup.
  atencao: { tipo: "pa" | "ritmo" | "preco"; texto: string; detalhe: string } | null;
  semMeta: boolean;
}

export interface NetworkGlobalGoal {
  /** Nome da meta ou "Setembro 2026". */
  competTexto: string;
  /** Faturamento na competência (loja ou rede) — total da loja, igual à Visão Geral. */
  realizado: number;
  /** Parte do realizado fora da equipe (venda sem vendedora, gerência); 0 = tudo na equipe. */
  foraDaEquipe?: number;
  /** Meta da loja ou soma das metas da rede. */
  total: number;
  /** realizado / total × 100. */
  pct: number;
  /** Projeção pelo índice de desempenho acumulado (AD-021). */
  projetadoPct: number;
  /** Dias abertos da competência a partir de hoje (incluindo hoje). */
  diasRestantes: number;
  /** Início da competência (ISO). */
  inicio: string;
  /** Fim da competência (ISO). */
  fim: string;
}

/** Card de uma meta ativa (Ao vivo / Equipe) — progresso + badges + escada. */
export interface GoalCardView {
  id: string;
  nome: string;
  tipo: GoalType;
  lojaNome: string;
  marcas: GoalBrand[];
  qtdGrupos: number;
  qtdVendedoras: number;
  qtdNiveis: number;
  degraus: Tier[];
  faixa: NetworkGlobalGoal;
  vendedoras: SellerRow[];
}

export type SalesBrand = "WEPINK" | "WPINK" | "ALL";

/** Daily bucket — matches sales_day_agg natural key. */
export type SalesDayAgg = {
  tenantId: string;
  storeId: string;
  /** Local calendar day YYYY-MM-DD in store timezone. */
  day: string;
  brand: SalesBrand;
  revenueCents: number;
  /** Distinct COD_OPERACAO count. */
  salesCount: number;
  itemCount: number;
  /**
   * CMV em centavos (RELATORIOMARGEM Σ CUSTO_TOTAL). brand=ALL na v1.
   * TODO(Configurações>Custos): × (1 + imposto_sobre_custo_pct).
   */
  cmvCents?: number;
};

/** Daily revenue by seller (VENDEDOR_MILLENNIUM) — sales_seller_day_agg. */
export type SalesSellerDayAgg = {
  tenantId: string;
  storeId: string;
  day: string;
  /** Nome normalizado (chave estável sem acento). */
  sellerKey: string;
  /** Rótulo de UI (title-case). */
  sellerName: string;
  /** Código da funcionária no Millennium (FUNCIONARIO) — resolvido pelo nome na gravação; null = só nome. */
  sellerEmployeeId?: number | null;
  /** Gerador da vendedora no Millennium (relatório de cupom); null = só pelo nome. */
  sellerGeradorId?: number | null;
  brand: SalesBrand;
  revenueCents: number;
  /** Distinct COD_OPERACAO count. */
  salesCount: number;
  /** Σ QUANTIDADE (itens). 0 em linhas gravadas antes de 2026-09-26. */
  itemCount?: number;
};
