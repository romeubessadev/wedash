import { describe, expect, it } from "vitest";
import { buildGoalCardView, buildGoalSummary, goalStatus } from "./goalView";
import type { GoalRecord, GoalTeamMember } from "./goalsRepo";
import type { SalesDayAgg, SalesSellerDayAgg } from "./salesTypes";

const goal: GoalRecord = {
  id: "g1",
  storeId: "s1",
  name: "Meta Setembro",
  startsOn: "2026-09-01",
  endsOn: "2026-09-30",
  target: 10_000,
  tierMode: "INDIVIDUAL",
  tiers: [
    { nome: "Meta", atingimentoMinPct: 50, comissaoPct: 1, bonus: 0 },
    { nome: "Hiper", atingimentoMinPct: 100, comissaoPct: 2, bonus: 50 },
  ],
  groups: [],
};

const day = (storeId: string, d: string, reais: number, brand: SalesDayAgg["brand"] = "ALL"): SalesDayAgg => ({
  tenantId: "t",
  storeId,
  day: d,
  brand,
  revenueCents: reais * 100,
  salesCount: 1,
  itemCount: 1,
});

const seller = (d: string, key: string, reais: number, employeeId: number | null): SalesSellerDayAgg => ({
  tenantId: "t",
  storeId: "s1",
  day: d,
  sellerKey: key,
  sellerName: key,
  sellerEmployeeId: employeeId,
  brand: "ALL",
  revenueCents: reais * 100,
  salesCount: 2,
  itemCount: 3,
});

describe("goalView", () => {
  it("status pelo período", () => {
    expect(goalStatus(goal, "2026-08-31")).toBe("upcoming");
    expect(goalStatus(goal, "2026-09-15")).toBe("active");
    expect(goalStatus(goal, "2026-10-01")).toBe("ended");
  });

  it("resumo soma só o ALL da loja dentro do período", () => {
    const aggs = [
      day("s1", "2026-08-31", 999),
      day("s1", "2026-09-01", 3000),
      day("s1", "2026-09-01", 1000, "WPINK"),
      day("s2", "2026-09-02", 500),
      day("s1", "2026-09-15", 3000),
    ];
    const s = buildGoalSummary(goal, aggs, "2026-09-15");
    expect(s.realizado).toBe(6000);
    expect(s.pct).toBeCloseTo(60);
    expect(s.nivelAtual).toBe("Meta");
    expect(s.projetadoPct).toBeCloseTo(120);
    expect(s.diasRestantes).toBe(16);
    expect(buildGoalSummary(goal, aggs, "2026-09-10").projetadoPct).toBeNull();
  });

  it("escada individual: meta ÷ pessoas (equipe ativa ∪ quem vendeu)", () => {
    const team: GoalTeamMember[] = [
      { storeId: "s1", employeeId: 1, name: "ANA", nameKeys: ["ANA"], salesPerson: true, shiftName: "MANHA" },
      { storeId: "s1", employeeId: 2, name: "BIA", nameKeys: ["BIA"], salesPerson: true, shiftName: null },
    ];
    const card = buildGoalCardView({
      goal,
      lojaNome: "LOJA",
      dayAggs: [day("s1", "2026-09-05", 6000)],
      sellerDayAggs: [seller("2026-09-05", "ANA", 3000, null), seller("2026-09-05", "EX", 1000, 9)],
      team,
      today: "2026-09-30",
    });
    expect(card.qtdVendedoras).toBe(3);
    const [ana, ex, bia] = card.vendedoras;
    expect(ana.nome).toBe("ANA");
    expect(ana.grupo).toBe("MANHA");
    expect(ana.metaIndividualValor).toBeCloseTo(10_000 / 3);
    expect(ana.degrauAtual).toBe("Meta");
    expect(ana.premiacaoAcumulada).toBeCloseTo(30);
    expect(ex.colaboradorId).toBe("e:9");
    expect(bia.faturamentoValor).toBe(0);
    expect(card.faixa.foraDaEquipe).toBe(2000);
  });
});
