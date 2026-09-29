import { describe, expect, it } from "vitest";
import { buildStockProductsView, composePrice, productBrand, stockTransfers, suggestSaleTable } from "./stockProducts";
import { EMPTY_STORE_COSTS, type Store } from "./stores";

const store = (over: Partial<Store> & Pick<Store, "id">): Store =>
  ({
    millenniumFilial: 1,
    codFilial: "00001",
    nome: "LOJA",
    fantasia: "LOJA",
    cnpj: "",
    cidade: "",
    uf: "",
    tipo: "F",
    pointType: "SHOPPING",
    temWpink: true,
    fuso: "America/Campo_Grande",
    horas: [],
    abertura: 10,
    fechamento: 22,
    diasFechados: [],
    dataInauguracao: "",
    costTableId: 104,
    custos: {
      ...EMPTY_STORE_COSTS,
      icmsPct: 10,
      icmsStPct: 20,
      royaltiesWepinkPct: 5,
      royaltiesWpinkPct: 3,
      marketingWepinkPct: 2,
      rentWepinkPct: 8,
      rentWpinkPct: 8,
    },
    ...over,
  }) as Store;

describe("composePrice", () => {
  it("custo + ICMS ST sobre o custo; ICMS, franquia e aluguel sobre o preço", () => {
    const c = composePrice(store({ id: "a" }), "BSP-001", 10000, 3000);
    expect(c.icmsSt).toBeCloseTo(6);
    expect(c.custoAquisicao).toBeCloseTo(36);
    expect(c.pctTotal).toBe(25);
    expect(c.impostos).toBeCloseTo(16);
    expect(c.franquiaAluguel).toBeCloseTo(15);
    expect(c.custoTotal).toBeCloseTo(61);
    expect(c.lucro).toBeCloseTo(39);
    expect(c.margemPct).toBeCloseTo(39);
    expect(c.precoMinimo).toBeCloseTo(48);
  });

  it("loja de rua ignora o aluguel percentual; WP* usa royalties WPINK", () => {
    const c = composePrice(store({ id: "a", pointType: "RUA" }), "WP014", 10000, 3000);
    expect(c.despesas.map((d) => d.label)).toEqual(["ICMS", "Royalties"]);
    expect(c.pctTotal).toBe(13);
    expect(productBrand("WP014")).toBe("WPINK");
    expect(productBrand("BSPPAR-ATH-001")).toBe("WEPINK");
  });

  it("sem custo = sem lucro; sem preço = sem custo total", () => {
    expect(composePrice(store({ id: "a" }), "X", 10000, null).lucro).toBeNull();
    const semPreco = composePrice(store({ id: "a" }), "X", null, 3000);
    expect(semPreco.custoTotal).toBeNull();
    expect(semPreco.precoMinimo).toBeCloseTo(48);
  });
});

describe("buildStockProductsView", () => {
  it("soma o estoque das lojas, lista negativos e usa a média quando o custo varia", () => {
    const a = store({ id: "a", fantasia: "A" });
    const b = store({ id: "b", fantasia: "B", costTableId: 105 });
    const view = buildStockProductsView({
      stores: [a, b],
      catalog: new Map([["P1", { code: "P1", name: "PRODUTO 1", category: "PERFUMARIA" }]]),
      stock: [
        { storeId: "a", code: "P1", qty: 5 },
        { storeId: "b", code: "P1", qty: 3 },
        { storeId: "b", code: "P2", qty: -2 },
      ],
      costPrices: new Map([
        [104, new Map([["P1", 3000]])],
        [105, new Map([["P1", 4000]])],
      ]),
      salePrices: new Map([[7, new Map([["P1", 10000]])]]),
      saleTableId: 7,
      charged: [{ storeId: "a", code: "P1", revenueCents: 18000, items: 2 }],
    });
    const p1 = view.rows.find((r) => r.codigo === "P1")!;
    expect(p1.estoque).toBe(8);
    expect(p1.variaPorLoja).toBe(true);
    expect(p1.custo).toBeCloseTo(35);
    expect(p1.precoPraticado).toBeCloseTo(90);
    expect(view.negativos).toEqual([{ codigo: "P2", nome: "P2", quantidade: -2, lojas: ["B"] }]);
  });

  it("local negativo com outro local positivo = transferência; total = soma dos locais", () => {
    const view = buildStockProductsView({
      stores: [store({ id: "a" })],
      catalog: new Map(),
      stock: [
        { storeId: "a", code: "OLEBOS", qty: 73, locations: { ESTOQUE: 144, QUIOSQUE: -71 } },
        { storeId: "a", code: "X", qty: -3, locations: { QUIOSQUE: -3 } },
      ],
      costPrices: new Map(),
      salePrices: new Map(),
      saleTableId: null,
      charged: [],
    });
    const p = view.rows.find((r) => r.codigo === "OLEBOS")!;
    expect(p.estoque).toBe(73);
    expect(p.transferir).toBe(71);
    expect(p.lojas[0].locais).toEqual([
      { nome: "ESTOQUE", qtd: 144 },
      { nome: "QUIOSQUE", qtd: -71 },
    ]);
    expect(p.lojas[0].transferencias).toEqual([{ para: "QUIOSQUE", de: ["ESTOQUE"], qtd: 71 }]);
    expect(view.rows.find((r) => r.codigo === "X")!.transferir).toBe(0);
  });
});

describe("stockTransfers", () => {
  it("transfere no máximo o que os locais positivos têm", () => {
    expect(
      stockTransfers([
        { nome: "ESTOQUE", qtd: 10 },
        { nome: "SHOP010", qtd: 5 },
        { nome: "QUIOSQUE", qtd: -20 },
      ]),
    ).toEqual([{ para: "QUIOSQUE", de: ["ESTOQUE", "SHOP010"], qtd: 15 }]);
  });
});

describe("suggestSaleTable", () => {
  it("sugere a mais usada no período; usadas = ordem de uso no período", () => {
    const r = suggestSaleTable([
      { day: "2026-09-27", tableId: 1, items: 50 },
      { day: "2026-09-28", tableId: 2, items: 10 },
      { day: "2026-09-28", tableId: 3, items: 12 },
    ]);
    expect(r.sugerida).toBe(1);
    expect(r.usadas).toEqual([1, 3, 2]);
  });
});
