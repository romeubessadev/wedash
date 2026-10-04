/** Pacote da tela Início do vendedor: a meta de cada loja dele e as vendas só dele (sem R$ de colegas). */
import { somarDias } from "./format.ts";
import type { GoalRecord, GoalTeamMember, SalesDayAgg, SalesSellerDayAgg } from "./goalTypes.ts";
import { buildGoalCardView, goalStatus, sellerGoalLevels, type SellerGoalLevel } from "./goalView.ts";
import { weekdayWeights, type StoreWeekHours } from "./goalWeights.ts";
import { buildSellerRanking, groupSize, type SellerRankingEntry } from "./sellerRanking.ts";
import { nextLevelGain, projectedPrize } from "./sellerPrize.ts";

/** Semanas de histórico da loja antes da meta para o peso por dia da semana (as mesmas da curva da meta). */
const HISTORY_WEEKS = 6;

export interface SellerHomeStore {
  storeId: string;
  storeName: string;
  lastSyncAt: string | null;
  goal: null | {
    name: string;
    startsOn: string;
    endsOn: string;
    mode: "individual" | "grupo";
    /** null = fora dos grupos da meta. */
    me: SellerGoalLevel | null;
    nextLevelGain: number | null;
    projectedPrize: number | null;
    ranking: SellerRankingEntry[];
    gapPp: number | null;
    abovePosition: number | null;
  };
}

/** Um dia de vendas do vendedor numa loja (R$). items null = dia com venda sem itens gravados. */
export interface SellerDay {
  storeId: string;
  day: string;
  revenue: number;
  sales: number;
  items: number | null;
}

export interface SellerHomePayload {
  today: string;
  name: string;
  stores: SellerHomeStore[];
  myDays: SellerDay[];
  numbersPeriod: { from: string; to: string };
}

export interface SellerHomeInput {
  today: string;
  /** Lojas do vendedor com o código dele no Millennium; `week` = horário efetivo (sem horário = todos os dias abertos). */
  stores: { storeId: string; storeName: string; lastSyncAt: string | null; employeeId: number; week: StoreWeekHours }[];
  goals: GoalRecord[];
  /** Faturamento das lojas, das 6 semanas antes da meta até hoje. */
  dayAggs: SalesDayAgg[];
  /** Vendas por pessoa já sem gerência (`excludeNonSalesPeople`). */
  sellerDayAggs: SalesSellerDayAgg[];
  team: GoalTeamMember[];
}

function storeWeights(input: SellerHomeInput, goal: GoalRecord, week: StoreWeekHours): number[] {
  const from = somarDias(goal.startsOn, -HISTORY_WEEKS * 7);
  const hist = new Map<string, number>();
  for (const a of input.dayAggs) {
    if (a.storeId !== goal.storeId || a.brand !== "ALL" || a.day < from || a.day >= goal.startsOn) continue;
    hist.set(a.day, (hist.get(a.day) ?? 0) + a.revenueCents / 100);
  }
  return weekdayWeights(hist, week);
}

function buildStore(input: SellerHomeInput, s: SellerHomeInput["stores"][number]): SellerHomeStore {
  const base = { storeId: s.storeId, storeName: s.storeName, lastSyncAt: s.lastSyncAt };
  const goal = input.goals.find((g) => g.storeId === s.storeId && goalStatus(g, input.today) === "active");
  if (!goal) return { ...base, goal: null };
  const meKey = `e:${s.employeeId}`;
  const viewInput = { goal, lojaNome: s.storeName, dayAggs: input.dayAggs, sellerDayAggs: input.sellerDayAggs, team: input.team, today: input.today };
  const view = buildGoalCardView(viewInput);
  const me = sellerGoalLevels({ goals: [goal], dayAggs: input.dayAggs, sellerDayAggs: input.sellerDayAggs, team: input.team, today: input.today }).get(meKey) ?? null;
  const row = view.vendedoras.find((r) => r.colaboradorId === meKey);
  const size = row ? groupSize(view, row) : 1;
  let projected: number | null = null;
  if (me) {
    const ontem = buildGoalCardView({ ...viewInput, sellerDayAggs: input.sellerDayAggs.filter((r) => r.day < input.today) });
    const r = ontem.vendedoras.find((x) => x.colaboradorId === meKey);
    const sold = !r ? 0 : me.modo === "individual" ? r.faturamentoValor : (r.atingimentoPct * r.metaIndividualValor) / 100;
    projected = projectedPrize(goal, me, { today: input.today, weights: storeWeights(input, goal, s.week), soldUntilYesterday: sold, groupSize: size });
  }
  const ranking = buildSellerRanking(view, meKey);
  return {
    ...base,
    goal: {
      name: goal.name,
      startsOn: goal.startsOn,
      endsOn: goal.endsOn,
      mode: goal.tierMode === "INDIVIDUAL" ? "individual" : "grupo",
      me,
      nextLevelGain: me ? nextLevelGain(me, size) : null,
      projectedPrize: projected,
      ranking: ranking.entries,
      gapPp: ranking.gapPp,
      abovePosition: ranking.abovePosition,
    },
  };
}

/** Linhas do próprio vendedor (mesma ligação da meta: código, senão nome do cadastro), somadas por loja e dia. */
function sellerDays(input: SellerHomeInput): SellerDay[] {
  const days = new Map<string, SellerDay>();
  for (const s of input.stores) {
    const porNome = new Map<string, GoalTeamMember>();
    for (const m of input.team) if (m.storeId === s.storeId) for (const k of m.nameKeys) if (!porNome.has(k)) porNome.set(k, m);
    for (const r of input.sellerDayAggs) {
      if (r.storeId !== s.storeId) continue;
      const mine = r.sellerEmployeeId != null ? r.sellerEmployeeId === s.employeeId : porNome.get(r.sellerKey)?.employeeId === s.employeeId;
      if (!mine) continue;
      const key = `${s.storeId}|${r.day}`;
      const d = days.get(key) ?? { storeId: s.storeId, day: r.day, revenue: 0, sales: 0, items: 0 };
      d.revenue += r.revenueCents / 100;
      d.sales += r.salesCount;
      d.items = d.items == null || (!r.itemCount && r.salesCount > 0) ? null : d.items + (r.itemCount ?? 0);
      days.set(key, d);
    }
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day) || a.storeId.localeCompare(b.storeId));
}

export function buildSellerHome(input: SellerHomeInput): { stores: SellerHomeStore[]; myDays: SellerDay[] } {
  return { stores: input.stores.map((s) => buildStore(input, s)), myDays: sellerDays(input) };
}
