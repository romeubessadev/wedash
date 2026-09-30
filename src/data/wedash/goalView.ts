import { brlCent, deIso, intervaloDias, num } from "@/lib/format";
import type { GoalRecord, GoalTeamMember } from "./goalsRepo";
import type { SalesDayAgg, SalesSellerDayAgg } from "./salesTypes";
import type { GoalCardView, NetworkGlobalGoal, SellerRow } from "./teamViews";

export type GoalStatus = "active" | "upcoming" | "ended";

export function goalStatus(g: Pick<GoalRecord, "startsOn" | "endsOn">, today: string): GoalStatus {
  if (today < g.startsOn) return "upcoming";
  if (today > g.endsOn) return "ended";
  return "active";
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Em andamento",
  upcoming: "A começar",
  ended: "Encerrada",
};

function diasEntre(inicio: string, fim: string): number {
  return Math.round((deIso(fim).getTime() - deIso(inicio).getTime()) / 86_400_000) + 1;
}

/** Fração do período já decorrida (hoje conta inteiro); 0 antes de começar, 1 depois de acabar. */
function fracaoDecorrida(g: GoalRecord, today: string): number {
  const status = goalStatus(g, today);
  if (status === "upcoming") return 0;
  if (status === "ended") return 1;
  return diasEntre(g.startsOn, today) / diasEntre(g.startsOn, g.endsOn);
}

/** Dias que faltam (incluindo hoje) na meta em andamento; 0 fora dela. */
function diasRestantes(g: GoalRecord, today: string): number {
  return goalStatus(g, today) === "active" ? diasEntre(today, g.endsOn) : 0;
}

/** Faturamento da loja (brand ALL) dentro do período da meta. */
export function goalRealized(g: GoalRecord, dayAggs: SalesDayAgg[]): number {
  let cents = 0;
  for (const a of dayAggs) {
    if (a.brand !== "ALL" || a.storeId !== g.storeId) continue;
    if (a.day < g.startsOn || a.day > g.endsOn) continue;
    cents += a.revenueCents;
  }
  return cents / 100;
}

/** Projeção linear pelo ritmo do período (só em andamento); encerrada = o realizado. */
function projetadoPct(pct: number, g: GoalRecord, today: string): number {
  const f = fracaoDecorrida(g, today);
  if (f <= 0) return 0;
  return pct / f;
}

export interface GoalSummary {
  goal: GoalRecord;
  status: GoalStatus;
  realizado: number;
  pct: number;
  /** Projeção de fechamento (% da meta) — só em andamento e depois de 50% do período (igual ao detalhe). */
  projetadoPct: number | null;
  diasRestantes: number;
  /** Nível da loja na escada pelo realizado (null = nenhum ainda). */
  nivelAtual: string | null;
}

export function buildGoalSummary(g: GoalRecord, dayAggs: SalesDayAgg[], today: string): GoalSummary {
  const status = goalStatus(g, today);
  const realizado = status === "upcoming" ? 0 : goalRealized(g, dayAggs);
  const pct = g.target > 0 ? (realizado / g.target) * 100 : 0;
  let nivel: string | null = null;
  for (const t of g.tiers) {
    if (pct >= t.atingimentoMinPct) nivel = t.nome;
    else break;
  }
  return {
    goal: g,
    status,
    realizado,
    pct,
    projetadoPct: status === "active" && fracaoDecorrida(g, today) >= 0.5 ? projetadoPct(pct, g, today) : null,
    diasRestantes: diasRestantes(g, today),
    nivelAtual: nivel,
  };
}

/** Pessoas da equipe de vendas da loja agora (para o card da listagem). */
export function goalTeamNames(storeId: string, team: GoalTeamMember[]): string[] {
  return team
    .filter((m) => m.storeId === storeId && m.salesPerson)
    .map((m) => m.name)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

type Acc = {
  key: string;
  nome: string;
  employeeId: number | null;
  faturamento: number;
  vendas: number;
  itens: number;
  dias: Set<string>;
};

/**
 * Detalhe da meta no formato do card de meta da Equipe (faixa + escada por pessoa).
 * Pessoas = equipe de vendas ativa da loja ∪ quem vendeu no período (ex-vendedoras incluídas).
 * Meta individual (modo INDIVIDUAL) = meta da loja ÷ pessoas; modo GROUP = todos pela meta da loja.
 */
export function buildGoalCardView(input: {
  goal: GoalRecord;
  lojaNome: string;
  dayAggs: SalesDayAgg[];
  sellerDayAggs: SalesSellerDayAgg[];
  team: GoalTeamMember[];
  today: string;
}): GoalCardView {
  const { goal: g, lojaNome, today } = input;
  const status = goalStatus(g, today);
  const realizado = status === "upcoming" ? 0 : goalRealized(g, input.dayAggs);
  const pct = g.target > 0 ? (realizado / g.target) * 100 : 0;
  const frac = fracaoDecorrida(g, today);

  const team = input.team.filter((m) => m.storeId === g.storeId);
  const porNome = new Map<string, GoalTeamMember>();
  for (const m of team) for (const k of m.nameKeys) if (!porNome.has(k)) porNome.set(k, m);
  const porCodigo = new Map(team.map((m) => [m.employeeId, m]));

  const accs = new Map<string, Acc>();
  const acc = (key: string, nome: string, employeeId: number | null): Acc => {
    let a = accs.get(key);
    if (!a) {
      a = { key, nome, employeeId, faturamento: 0, vendas: 0, itens: 0, dias: new Set() };
      accs.set(key, a);
    }
    return a;
  };

  if (status !== "upcoming") {
    for (const r of input.sellerDayAggs) {
      if (r.storeId !== g.storeId || r.day < g.startsOn || r.day > g.endsOn) continue;
      const membro = r.sellerEmployeeId != null ? porCodigo.get(r.sellerEmployeeId) : porNome.get(r.sellerKey);
      const employeeId = membro?.employeeId ?? r.sellerEmployeeId ?? null;
      const key = employeeId != null ? `e:${employeeId}` : `n:${r.sellerKey}`;
      const a = acc(key, membro?.name ?? r.sellerName, employeeId);
      a.faturamento += r.revenueCents / 100;
      a.vendas += r.salesCount;
      a.itens += r.itemCount ?? 0;
      if (r.revenueCents > 0) a.dias.add(r.day);
    }
  }
  for (const m of team) if (m.salesPerson) acc(`e:${m.employeeId}`, m.name, m.employeeId);

  const pessoas = [...accs.values()];
  const n = pessoas.length;
  const individual = g.tierMode === "INDIVIDUAL";
  const metaInd = individual ? (n > 0 ? g.target / n : 0) : g.target;
  const escala = Math.max(100, ...g.tiers.map((t) => t.atingimentoMinPct));
  const marcos = g.tiers.map((t) => ({ nome: t.nome, pct: t.atingimentoMinPct, pctPremiacao: t.comissaoPct, bonus: t.bonus }));
  const diasPeriodo = intervaloDias(g.startsOn, g.endsOn).length;
  const equipeTotal = pessoas.reduce((s, p) => s + p.faturamento, 0);

  const vendedoras: SellerRow[] = pessoas.map((p) => {
    const base = individual ? p.faturamento : equipeTotal;
    const ating = metaInd > 0 ? (base / metaInd) * 100 : 0;
    let idx = -1;
    g.tiers.forEach((t, i) => {
      if (ating >= t.atingimentoMinPct && i === idx + 1) idx = i;
    });
    const degrau = idx >= 0 ? g.tiers[idx] : null;
    const seguinte = idx + 1 < g.tiers.length ? g.tiers[idx + 1] : null;
    const membro = p.employeeId != null ? porCodigo.get(p.employeeId) : undefined;
    const ticket = p.vendas > 0 ? p.faturamento / p.vendas : 0;
    const pa = p.vendas > 0 && p.itens > 0 ? p.itens / p.vendas : 0;
    return {
      colaboradorId: p.key,
      nome: p.nome,
      filialId: g.storeId,
      filialNome: lojaNome,
      grupo: membro?.shiftName ?? "Sem grupo definido",
      faturamentoValor: p.faturamento,
      faturamento: brlCent(p.faturamento),
      atendimentos: p.vendas,
      ticketValor: ticket,
      ticket: brlCent(ticket),
      paValor: pa,
      pa: pa > 0 ? num(pa, 2) : "—",
      diasTrabalhados: p.dias.size,
      tendencia: "estavel",
      metaIndividualValor: metaInd,
      metaProporcional: false,
      diasElegiveis: diasPeriodo,
      atingimentoPct: ating,
      barraPct: Math.min(100, (ating / escala) * 100),
      pctMetaGeral: g.target > 0 ? (p.faturamento / g.target) * 100 : 0,
      marcosEscada: marcos,
      degrauAtual: degrau?.nome ?? null,
      nivelAtual: degrau ? idx + 1 : null,
      proximoDegrau: seguinte
        ? {
            nome: seguinte.nome,
            faltaValor: Math.max(0, (metaInd * seguinte.atingimentoMinPct) / 100 - base),
            pctPremiacao: seguinte.comissaoPct,
            bonus: seguinte.bonus,
            atingMinPct: seguinte.atingimentoMinPct,
          }
        : null,
      premiacaoAcumulada: degrau ? (p.faturamento * degrau.comissaoPct) / 100 : 0,
      comissaoPct: degrau?.comissaoPct ?? 0,
      premiacaoProjetadaIndividual: null,
      atingimentoProjetadoPct: status === "active" && frac > 0 ? ating / frac : null,
      bonusAlcancado: degrau?.bonus ?? 0,
      atencao: null,
      semMeta: metaInd <= 0,
    };
  });
  vendedoras.sort((a, b) => b.faturamentoValor - a.faturamentoValor || a.nome.localeCompare(b.nome, "pt-BR"));

  const faixa: NetworkGlobalGoal = {
    competTexto: g.name,
    realizado,
    foraDaEquipe: Math.max(0, realizado - equipeTotal),
    total: g.target,
    pct,
    projetadoPct: status === "upcoming" ? 0 : projetadoPct(pct, g, today),
    diasRestantes: status === "upcoming" ? diasEntre(g.startsOn, g.endsOn) : diasRestantes(g, today),
    inicio: g.startsOn,
    fim: g.endsOn,
  };

  return {
    id: g.id,
    nome: g.name,
    tipo: individual ? "individual" : "grupo",
    lojaNome,
    marcas: [],
    qtdGrupos: 0,
    qtdVendedoras: n,
    qtdNiveis: g.tiers.length,
    degraus: g.tiers,
    faixa,
    vendedoras,
  };
}
