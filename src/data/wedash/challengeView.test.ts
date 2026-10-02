import { describe, expect, it } from "vitest";
import {
  buildChallengeView,
  challengeCardSummary,
  challengePayout,
  copyChallenge,
  metricValueLabel,
  prizeLabel,
} from "./challengeView";
import { emptyChallengeAggInput, type ChallengeAggInput, type ChallengeRecord } from "./challengesRepo";
import type { GoalTeamMember } from "./goalsRepo";
import type { SalesSellerDayAgg, SalesSellerProductDayAgg } from "./salesTypes";

const challenge = (over: Partial<ChallengeRecord> = {}): ChallengeRecord => ({
  id: "c1",
  storeId: "s1",
  name: "Body Splash — quem vender mais",
  startsOn: "2026-10-05",
  endsOn: "2026-10-11",
  metric: "PRODUCTS",
  mode: "CONTEST",
  products: [{ code: "BS1", name: "BODY SPLASH 1" }],
  categories: [],
  target: null,
  minSales: null,
  prizes: [{ kind: "MONEY", amount: 100 }],
  managerPrize: null,
  ...over,
});

const member = (employeeId: number, name: string, over: Partial<GoalTeamMember> = {}): GoalTeamMember => ({
  storeId: "s1",
  employeeId,
  geradorId: employeeId + 1000,
  name,
  nameKeys: [name],
  salesPerson: true,
  shiftId: null,
  shiftName: null,
  ...over,
});

const item = (
  geradorId: number,
  productCode: string,
  itemCount: number,
  over: Partial<SalesSellerProductDayAgg> = {},
): SalesSellerProductDayAgg => ({
  tenantId: "t1",
  storeId: "s1",
  day: "2026-10-06",
  sellerGeradorId: geradorId,
  sellerKey: "",
  sellerName: "",
  productCode,
  productId: 1,
  itemCount,
  revenueCents: itemCount * 5_000,
  ...over,
});

const sellerDay = (
  employeeId: number | null,
  salesCount: number,
  itemCount: number | undefined,
  revenueCents: number,
  over: Partial<SalesSellerDayAgg> = {},
): SalesSellerDayAgg => ({
  tenantId: "t1",
  storeId: "s1",
  day: "2026-10-06",
  sellerKey: over.sellerKey ?? "",
  sellerName: over.sellerName ?? "",
  sellerEmployeeId: employeeId,
  brand: "ALL",
  revenueCents,
  salesCount,
  itemCount,
  ...over,
});

const team = [member(1, "ANA"), member(2, "BIA"), member(3, "CAROL")];

const input = (over: Partial<ChallengeAggInput> = {}): ChallengeAggInput => ({
  ...emptyChallengeAggInput(),
  team,
  ...over,
});

const build = (c: ChallengeRecord, aggs: ChallengeAggInput, today = "2026-10-08") =>
  buildChallengeView({ challenge: c, aggs, today });

const byName = (v: ReturnType<typeof build>) => Object.fromEntries(v.participantes.map((p) => [p.nome, p]));

describe("buildChallengeView — participantes e resultado", () => {
  it("Produtos: soma só os produtos escolhidos, por pessoa (gerador → cadastro)", () => {
    const v = build(
      challenge({ products: [{ code: "BS1", name: "A" }, { code: "BS2", name: "B" }] }),
      input({ sellerProducts: [item(1001, "BS1", 3), item(1001, "BS2", 2), item(1001, "OUTRO", 9), item(1002, "BS1", 1)] }),
    );
    const p = byName(v);
    expect(p.ANA.resultado).toBe(5);
    expect(p.BIA.resultado).toBe(1);
    expect(p.CAROL.resultado).toBe(0);
    expect(v.participantes).toHaveLength(3);
  });

  it("Categorias: soma os itens cujo tipo no catálogo está entre os escolhidos", () => {
    const v = build(
      challenge({ metric: "CATEGORIES", products: [], categories: [{ typeId: 14, name: "BODY SPLASH" }] }),
      input({
        sellerProducts: [item(1001, "BS1", 3), item(1001, "PERF", 4), item(1002, "BS2", 2)],
        typeByCode: new Map([
          ["BS1", 14],
          ["BS2", 14],
          ["PERF", 13],
        ]),
      }),
    );
    expect(byName(v).ANA.resultado).toBe(3);
    expect(byName(v).BIA.resultado).toBe(2);
  });

  it("P.A. = itens ÷ vendas e Ticket = faturamento ÷ vendas (2 casas)", () => {
    const aggs = input({
      sellerDays: [sellerDay(1, 10, 19, 92_300), sellerDay(1, 5, 8, 40_000, { day: "2026-10-07" }), sellerDay(2, 3, 6, 30_000)],
    });
    const pa = byName(build(challenge({ metric: "PA", products: [], minSales: 1 }), aggs));
    expect(pa.ANA.resultado).toBe(1.8);
    expect(pa.ANA.vendas).toBe(15);
    expect(pa.BIA.resultado).toBe(2);
    const ticket = byName(build(challenge({ metric: "TICKET", products: [], minSales: 1 }), aggs));
    expect(ticket.ANA.resultado).toBe(88.2);
  });

  it("P.A. sem itens gravados em algum dia com venda = \"—\" e não concorre", () => {
    const v = build(
      challenge({ metric: "PA", products: [], minSales: 1 }),
      input({ sellerDays: [sellerDay(1, 10, 20, 100_000), sellerDay(1, 4, 0, 30_000, { day: "2026-10-07" }), sellerDay(2, 5, 7, 40_000)] }),
    );
    const p = byName(v);
    expect(p.ANA.resultado).toBeNull();
    expect(p.ANA.vencedor).toBe(false);
    expect(p.ANA.posicao).toBeNull();
    expect(p.BIA.vencedor).toBe(true);
  });

  it("pessoa desligada que vendeu continua na tabela; quem não é da equipe e não vendeu fica de fora", () => {
    const v = build(
      challenge(),
      input({
        team: [...team, member(4, "DORA", { salesPerson: false }), member(5, "EVA", { salesPerson: false })],
        sellerProducts: [item(1004, "BS1", 2)],
      }),
    );
    expect(v.participantes.map((p) => p.nome).sort()).toEqual(["ANA", "BIA", "CAROL", "DORA"]);
    expect(byName(v).DORA.resultado).toBe(2);
  });

  it("pessoa sem cadastro entra pelo nome do relatório", () => {
    const v = build(challenge(), input({ sellerProducts: [item(9999, "BS1", 4, { sellerKey: "JULIA SOUZA", sellerName: "Julia Souza" })] }));
    expect(byName(v)["JULIA SOUZA"]?.resultado).toBe(4);
  });

  it("só conta a loja e o período do desafio", () => {
    const v = build(
      challenge(),
      input({
        sellerProducts: [
          item(1001, "BS1", 3),
          item(1001, "BS1", 5, { storeId: "s2" }),
          item(1001, "BS1", 7, { day: "2026-10-04" }),
        ],
      }),
    );
    expect(byName(v).ANA.resultado).toBe(3);
  });

  it("loja sem equipe e sem vendas = nenhum participante", () => {
    expect(build(challenge(), input({ team: [] })).participantes).toEqual([]);
  });

  it("A começar: participantes sem resultado e prazo \"Começa em DD/MM\"", () => {
    const v = build(challenge(), input({ sellerProducts: [item(1001, "BS1", 3)] }), "2026-10-01");
    expect(v.status).toBe("upcoming");
    expect(v.prazo).toBe("Começa em 05/10");
    expect(v.participantes.every((p) => p.resultado == null && !p.vencedor && p.falta == null)).toBe(true);
    expect(v.participantes.map((p) => p.nome)).toEqual(["ANA", "BIA", "CAROL"]);
  });
});

describe("buildChallengeView — Disputa e Mínimo", () => {
  it("Disputa: posições com empate compartilhado (1, 1, 3) e empatadas levam o prêmio", () => {
    const v = build(
      challenge({ prizes: [{ kind: "MONEY", amount: 100 }, { kind: "ITEM", label: "Combo KFC" }] }),
      input({ sellerProducts: [item(1001, "BS1", 5), item(1002, "BS1", 5), item(1003, "BS1", 2)] }),
    );
    const p = byName(v);
    expect([p.ANA.posicao, p.BIA.posicao, p.CAROL.posicao]).toEqual([1, 1, 3]);
    expect(p.ANA.premio).toEqual({ kind: "MONEY", amount: 100 });
    expect(p.BIA.premio).toEqual({ kind: "MONEY", amount: 100 });
    expect(p.CAROL.vencedor).toBe(false);
    expect(v.participantes.map((x) => x.nome)).toEqual(["ANA", "BIA", "CAROL"]);
  });

  it("Disputa só com prêmio do 1º: o 2º lugar não leva nada", () => {
    const p = byName(build(challenge(), input({ sellerProducts: [item(1001, "BS1", 5), item(1002, "BS1", 3)] })));
    expect(p.ANA.vencedor).toBe(true);
    expect(p.BIA.posicao).toBe(2);
    expect(p.BIA.vencedor).toBe(false);
    expect(p.BIA.premio).toBeNull();
  });

  it("Mínimo: todas que atingem levam o mesmo prêmio; abaixo do alvo não", () => {
    const v = build(
      challenge({ mode: "MINIMUM", target: 4, prizes: [{ kind: "ITEM", label: "Combo KFC" }] }),
      input({ sellerProducts: [item(1001, "BS1", 4), item(1002, "BS1", 6), item(1003, "BS1", 3)] }),
    );
    const p = byName(v);
    expect([p.ANA.vencedor, p.BIA.vencedor, p.CAROL.vencedor]).toEqual([true, true, false]);
    expect(p.ANA.premio).toEqual({ kind: "ITEM", label: "Combo KFC" });
    expect(v.participantes.map((x) => x.nome)).toEqual(["BIA", "ANA", "CAROL"]);
    expect(v.participantes.every((x) => x.posicao == null)).toBe(true);
  });

  it("Disputa: resultado zero nunca vence", () => {
    const v = build(challenge(), input({ sellerProducts: [] }));
    expect(v.participantes.every((p) => !p.vencedor && p.posicao == null)).toBe(true);
  });

  it("Disputa: abaixo do piso não leva prêmio mesmo em 1º", () => {
    const v = build(challenge({ target: 10 }), input({ sellerProducts: [item(1001, "BS1", 8)] }));
    expect(byName(v).ANA.posicao).toBe(1);
    expect(byName(v).ANA.vencedor).toBe(false);
  });

  it("Disputa de ticket: quem não tem o mínimo de vendas não concorre e não tira o prêmio de quem tem", () => {
    const v = build(
      challenge({ metric: "TICKET", products: [], minSales: 10 }),
      input({ sellerDays: [sellerDay(1, 2, 2, 100_000), sellerDay(2, 12, 15, 120_000)] }),
    );
    const p = byName(v);
    expect(p.ANA.posicao).toBeNull();
    expect(p.ANA.vencedor).toBe(false);
    expect(p.ANA.falta).toBe("Faltam 8 vendas");
    expect(p.BIA.posicao).toBe(1);
    expect(p.BIA.vencedor).toBe(true);
  });

  it("Mínimo de P.A.: P.A. 2,0 com 8 vendas (mínimo 10) não atinge; 1,90 com 10 vendas atinge", () => {
    const v = build(
      challenge({ metric: "PA", mode: "MINIMUM", products: [], target: 1.9, minSales: 10, prizes: [{ kind: "MONEY", amount: 50 }] }),
      input({ sellerDays: [sellerDay(1, 8, 16, 50_000), sellerDay(2, 10, 19, 60_000)] }),
    );
    const p = byName(v);
    expect(p.ANA.vencedor).toBe(false);
    expect(p.ANA.falta).toBe("Faltam 2 vendas");
    expect(p.BIA.vencedor).toBe(true);
    expect(p.BIA.premio).toEqual({ kind: "MONEY", amount: 50 });
    expect(v.atingiram).toBe(1);
    expect(v.participantes[0].nome).toBe("BIA");
  });

  it("falta em andamento: Mínimo → para o alvo; Disputa → para a posição de cima ou para o piso", () => {
    const minimo = byName(
      build(
        challenge({ mode: "MINIMUM", target: 15, prizes: [{ kind: "ITEM", label: "Pizza" }] }),
        input({ sellerProducts: [item(1001, "BS1", 12), item(1002, "BS1", 14)] }),
      ),
    );
    expect(minimo.ANA.falta).toBe("Faltam 3 itens");
    expect(minimo.BIA.falta).toBe("Falta 1 item");

    const disputa = byName(build(challenge(), input({ sellerProducts: [item(1001, "BS1", 10), item(1002, "BS1", 7)] })));
    expect(disputa.ANA.falta).toBeNull();
    expect(disputa.BIA.falta).toBe("Faltam 3 itens para o 1º lugar");
    expect(disputa.CAROL.falta).toBe("Faltam 7 itens para o 2º lugar");

    const piso = byName(build(challenge({ target: 12 }), input({ sellerProducts: [item(1001, "BS1", 10)] })));
    expect(piso.ANA.falta).toBe("Faltam 2 itens para o piso");

    const ticket = byName(
      build(
        challenge({ metric: "TICKET", mode: "MINIMUM", products: [], target: 100, minSales: 1 }),
        input({ sellerDays: [sellerDay(1, 4, 4, 35_000)] }),
      ),
    );
    expect(ticket.ANA.falta).toBe(`Faltam R$\u00a012,50`);
  });

  it("encerrado não mostra o que falta", () => {
    const v = build(challenge(), input({ sellerProducts: [item(1001, "BS1", 10), item(1002, "BS1", 7)] }), "2026-10-15");
    expect(v.participantes.every((p) => p.falta == null)).toBe(true);
  });
});

describe("buildChallengeView — gerência, incompleto e status", () => {
  it("gerência em itens = Σ itens ÷ participantes, contra o alvo (Mínimo)", () => {
    const v = build(
      challenge({ mode: "MINIMUM", target: 3, prizes: [{ kind: "MONEY", amount: 20 }], managerPrize: { kind: "ITEM", label: "Spa" } }),
      input({ sellerProducts: [item(1001, "BS1", 5), item(1002, "BS1", 4)] }),
    );
    expect(v.gerencia).toEqual({ resultado: 3, alvo: 3, atingiu: true, premio: { kind: "ITEM", label: "Spa" } });
  });

  it("gerência em P.A. = Σ itens ÷ Σ vendas da equipe; na Disputa usa o piso", () => {
    const v = build(
      challenge({ metric: "PA", products: [], target: 2, minSales: 1, managerPrize: { kind: "MONEY", amount: 80 } }),
      input({ sellerDays: [sellerDay(1, 10, 25, 100_000), sellerDay(2, 10, 15, 100_000)] }),
    );
    expect(v.gerencia).toMatchObject({ resultado: 2, alvo: 2, atingiu: true });
  });

  it("gerência em ticket abaixo do alvo não atinge", () => {
    const v = build(
      challenge({ metric: "TICKET", mode: "MINIMUM", products: [], target: 100, minSales: 1, managerPrize: { kind: "MONEY", amount: 50 } }),
      input({ sellerDays: [sellerDay(1, 10, 10, 120_000), sellerDay(2, 10, 10, 60_000)] }),
    );
    expect(v.gerencia).toMatchObject({ resultado: 90, alvo: 100, atingiu: false });
    expect(challengePayout(v).gerencia).toBeNull();
  });

  it("gerência em desafio a começar fica sem resultado", () => {
    const v = build(challenge({ target: 2, managerPrize: { kind: "MONEY", amount: 50 } }), input(), "2026-10-01");
    expect(v.gerencia).toMatchObject({ resultado: null, atingiu: false });
  });

  it("gerência na Disputa sem piso não existe", () => {
    const v = build(challenge({ managerPrize: { kind: "MONEY", amount: 80 } }), input());
    expect(v.gerencia).toBeNull();
  });

  it("incompleto: dia com venda da loja e sem itens por pessoa (só Produtos/Categorias, até hoje)", () => {
    const aggs = input({
      sellerProducts: [item(1001, "BS1", 1, { day: "2026-10-06" })],
      storeSaleDays: new Set(["s1|2026-10-05", "s1|2026-10-06", "s1|2026-10-08", "s1|2026-10-09", "s2|2026-10-07"]),
    });
    expect(build(challenge(), aggs).diasIncompletos).toEqual(["2026-10-05", "2026-10-08"]);
    expect(build(challenge({ metric: "PA", products: [], minSales: 1 }), aggs).diasIncompletos).toEqual([]);
  });

  it("prazo e fechamento: em andamento, último dia, encerrado e fechamento em andamento até o dia seguinte", () => {
    const c = challenge();
    expect(build(c, input(), "2026-10-08").prazo).toBe("4 dias restantes");
    expect(build(c, input(), "2026-10-11").prazo).toBe("Último dia");
    const fim = build(c, input(), "2026-10-12");
    expect([fim.status, fim.prazo, fim.emFechamento]).toEqual(["ended", "Encerrado", true]);
    expect(build(c, input(), "2026-10-13").emFechamento).toBe(false);
  });
});

describe("fechamento, card e duplicar", () => {
  it("fechamento: empate no 1º soma os dois prêmios; prêmio em espécie fica fora do total", () => {
    const c = challenge({
      prizes: [{ kind: "MONEY", amount: 100 }, { kind: "ITEM", label: "Combo KFC" }],
      target: 1,
      managerPrize: { kind: "MONEY", amount: 30 },
    });
    const v = build(c, input({ sellerProducts: [item(1001, "BS1", 5), item(1002, "BS1", 5), item(1003, "BS1", 2)] }), "2026-10-15");
    const pay = challengePayout(v);
    expect(pay.vencedores.map((w) => [w.nome, w.colocacao, prizeLabel(w.premio)])).toEqual([
      ["ANA", "1º lugar", "R$\u00a0100,00"],
      ["BIA", "1º lugar", "R$\u00a0100,00"],
    ]);
    expect(pay.gerencia).toEqual({ kind: "MONEY", amount: 30 });
    expect(pay.totalReais).toBe(230);
    expect(pay.especie).toEqual([]);
  });

  it("fechamento: Mínimo lista \"Atingiu\" e conta espécie pelo nome", () => {
    const c = challenge({ mode: "MINIMUM", target: 3, prizes: [{ kind: "ITEM", label: "Pizza" }] });
    const v = build(c, input({ sellerProducts: [item(1001, "BS1", 5), item(1002, "BS1", 4)] }), "2026-10-15");
    const pay = challengePayout(v);
    expect(pay.vencedores.map((w) => w.colocacao)).toEqual(["Atingiu", "Atingiu"]);
    expect(pay.totalReais).toBe(0);
    expect(pay.especie).toEqual(["Pizza", "Pizza"]);
  });

  it("fechamento sem vencedor", () => {
    expect(challengePayout(build(challenge(), input(), "2026-10-15")).vencedores).toEqual([]);
  });

  it("card: líder(es) na Disputa e \"N atingiram\" no Mínimo", () => {
    const disputa = build(challenge(), input({ sellerProducts: [item(1001, "BS1", 5), item(1002, "BS1", 5)] }));
    expect(challengeCardSummary(disputa)).toEqual({ lider: "ANA e BIA", atingiram: null });
    expect(challengeCardSummary(build(challenge(), input()))).toEqual({ lider: null, atingiram: null });
    const minimo = build(
      challenge({ mode: "MINIMUM", target: 3, prizes: [{ kind: "ITEM", label: "Pizza" }] }),
      input({ sellerProducts: [item(1001, "BS1", 5)] }),
    );
    expect(challengeCardSummary(minimo)).toEqual({ lider: null, atingiram: 1 });
  });

  it("duplicar: período seguinte com a mesma duração e nome \"(cópia)\"", () => {
    const c = challenge({ target: 10, managerPrize: { kind: "ITEM", label: "Spa" } });
    const { id: _id, ...rest } = c;
    expect(copyChallenge(c)).toEqual({ ...rest, name: "Body Splash — quem vender mais (cópia)", startsOn: "2026-10-12", endsOn: "2026-10-18" });
  });

  it("rótulos de valor por métrica", () => {
    expect(metricValueLabel("PRODUCTS", 12)).toBe("12 itens");
    expect(metricValueLabel("CATEGORIES", 1)).toBe("1 item");
    expect(metricValueLabel("PRODUCTS", 7.5)).toBe("7,5 itens");
    expect(metricValueLabel("PA", 1.85)).toBe("1,85");
    expect(metricValueLabel("TICKET", 92.3)).toBe("R$\u00a092,30");
    expect(prizeLabel({ kind: "ITEM", label: "Combo KFC" })).toBe("Combo KFC");
  });
});
