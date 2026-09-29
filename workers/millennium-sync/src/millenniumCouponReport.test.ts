import { describe, expect, it } from "vitest";
import {
  couponBrandFromReportLines,
  couponSellers,
  groupCouponLines,
  parseCouponReportRawData,
  priceTableDayAggsFromCouponLines,
  productDayAggsFromCouponLines,
} from "./millenniumCouponReport.ts";

const raw = (o: Record<string, unknown>) => ({
  VENDA_MOVIMENTO_NFS: "53845",
  VENDA_MOVIMENTO_COD_OPERACAO: 13233844,
  VENDA_MOVIMENTO_TIPO_OPERACAO: "S",
  VENDA_MOVIMENTO_CANCELADA: false,
  PRODUTO_PRODUTO_PRODUTO: 304,
  PRODUTO_PRODUTO_COD_PRODUTO: "BSPPAR-ATH-001",
  PRODUTO_PRODUTO_DESCRICAO1: "BODY SPLASH PERFECT PEAR 200 ML - WEPINK",
  F_3887607047: 1,
  F_366619977: 54.9,
  FUNCIONARIO_GERADOR_GERADOR: 66161,
  FUNCIONARIO_GERADOR_NOME: "GABRIELA DE LIMA",
  DATA_DATA_DATA: "2026-09-24T00:00:00",
  VENDA_TABELA_PRECO_TABELA: 114,
  VENDA_TABELA_PRECO_DESCRICAO: "TABELA + 10",
  ...o,
});

describe("parseCouponReportRawData", () => {
  it("chave do cupom igual à da Lista; ignora cancelado e linha sem produto", () => {
    const lines = parseCouponReportRawData({
      RAW_DATA: [
        raw({}),
        raw({ VENDA_MOVIMENTO_CANCELADA: true }),
        raw({ PRODUTO_PRODUTO_PRODUTO: null }),
      ],
    });
    expect(lines).toEqual([
      {
        couponKey: "13233844|53845|S",
        day: "2026-09-24",
        productId: 304,
        productCode: "BSPPAR-ATH-001",
        productName: "BODY SPLASH PERFECT PEAR 200 ML - WEPINK",
        qty: 1,
        revenueCents: 5490,
        sellerGeradorId: 66161,
        sellerName: "GABRIELA DE LIMA",
        priceTableId: 114,
        priceTableName: "TABELA + 10",
      },
    ]);
  });
});

describe("priceTableDayAggsFromCouponLines", () => {
  it("soma itens e R$ por dia × tabela; linha sem tabela fica de fora", () => {
    const lines = parseCouponReportRawData({
      RAW_DATA: [
        raw({}),
        raw({ VENDA_MOVIMENTO_NFS: "53846", F_3887607047: 2, F_366619977: 100 }),
        raw({ VENDA_MOVIMENTO_NFS: "53847", VENDA_TABELA_PRECO_TABELA: 120, VENDA_TABELA_PRECO_DESCRICAO: "TABELA + 20" }),
        raw({ VENDA_MOVIMENTO_NFS: "53848", VENDA_TABELA_PRECO_TABELA: -2000000000 }),
      ],
    });
    const aggs = priceTableDayAggsFromCouponLines(groupCouponLines(lines), (_k, ls) => ls[0]?.day ?? null);
    expect(aggs).toEqual([
      { day: "2026-09-24", tableId: 114, tableName: "TABELA + 10", itemCount: 3, revenueCents: 15490 },
      { day: "2026-09-24", tableId: 120, tableName: "TABELA + 20", itemCount: 1, revenueCents: 5490 },
    ]);
  });
});

describe("cupom → marca / vendedora / produtos", () => {
  const lines = parseCouponReportRawData({
    RAW_DATA: [
      raw({}),
      raw({ PRODUTO_PRODUTO_PRODUTO: 9, PRODUTO_PRODUTO_COD_PRODUTO: "WP002", F_3887607047: 2, F_366619977: 80 }),
      raw({ VENDA_MOVIMENTO_NFS: "53846", PRODUTO_PRODUTO_COD_PRODUTO: "SKIN-01", FUNCIONARIO_GERADOR_GERADOR: null }),
    ],
  });
  const byCoupon = groupCouponLines(lines);

  it("WP* = WPINK; resto (inclusive Skincare) = WEPINK", () => {
    const header = {
      operationCode: "13233844",
      millenniumOpCode: 13233844,
      nf: "53845",
      tipoOperacao: "S",
      occurredAt: new Date("2026-09-24T14:00:00Z"),
      storeId: "s1",
    };
    expect(couponBrandFromReportLines(header, byCoupon.get("13233844|53845|S")!, "2026-09-24")).toMatchObject({
      wepinkCents: 5490,
      wepinkItems: 1,
      wpinkCents: 8000,
      wpinkItems: 2,
    });
  });

  it("vendedora pelo gerador; cupom sem gerador fica de fora", () => {
    const sellers = couponSellers(byCoupon);
    expect([...sellers.entries()]).toEqual([["13233844|53845|S", { geradorId: 66161, name: "GABRIELA DE LIMA" }]]);
  });

  it("top produtos somam itens do dia dos cupons da Lista", () => {
    const rows = productDayAggsFromCouponLines(byCoupon, {
      tenantId: "t1",
      storeId: "s1",
      dayOf: (key) => (key === "13233844|53845|S" ? "2026-09-24" : null),
    });
    expect(rows.map((r) => [r.productId, r.revenueCents, r.itemCount])).toEqual([
      [9, 8000, 2],
      [304, 5490, 1],
    ]);
  });
});
