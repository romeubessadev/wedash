import { describe, expect, it } from "vitest";
import {
  buildPurchaseOrderView,
  filterPurchaseRows,
  isEligible,
  isNewProduct,
  parseMinInput,
  purchaseQuantity,
  type PurchaseStockRow,
} from "./purchaseOrder";

const TODAY = "2026-10-03";

const stock = (over: Partial<PurchaseStockRow> = {}): PurchaseStockRow => ({
  code: "BSPPAR-ATH-001",
  color: "000",
  print: "000",
  size: "U",
  description: "BODY SPLASH PARIS 200ML",
  balance: 2,
  openOrder: 0,
  total: 2,
  multiple: 24,
  blocked: false,
  registeredAt: "2024-06-05",
  position: 0,
  ...over,
});

const view = (rows: PurchaseStockRow[], mins: Record<string, number> = {}, factor = 1, sold: Record<string, number> = {}) =>
  buildPurchaseOrderView({
    stock: rows,
    mins: new Map(Object.entries(mins)),
    sold30: new Map(Object.entries(sold)),
    factor,
    todayIso: TODAY,
  });

describe("isEligible (PC-01: código sem WP, não bloqueado, múltipla > 0)", () => {
  it("aceita produto liberado com múltipla", () => {
    expect(isEligible(stock())).toBe(true);
  });
  it("recusa código com WP em qualquer caixa", () => {
    expect(isEligible(stock({ code: "WP014" }))).toBe(false);
    expect(isEligible(stock({ code: "wp-ultra" }))).toBe(false);
  });
  it("recusa bloqueado para compra", () => {
    expect(isEligible(stock({ blocked: true }))).toBe(false);
  });
  it("recusa múltipla nula ou 0", () => {
    expect(isEligible(stock({ multiple: null }))).toBe(false);
    expect(isEligible(stock({ multiple: 0 }))).toBe(false);
  });
});

describe("isNewProduct (PC-02: cadastro entre hoje e 29 dias atrás)", () => {
  it("é novo cadastrado hoje e há 29 dias", () => {
    expect(isNewProduct("2026-10-03", TODAY)).toBe(true);
    expect(isNewProduct("2026-09-04", TODAY)).toBe(true);
  });
  it("não é novo há 30 dias, sem data ou com data futura", () => {
    expect(isNewProduct("2026-09-03", TODAY)).toBe(false);
    expect(isNewProduct(null, TODAY)).toBe(false);
    expect(isNewProduct("2026-10-04", TODAY)).toBe(false);
  });
});

describe("purchaseQuantity (PC-09 AC 2)", () => {
  it("Total 2, mínimo 72, múltipla 24 → 72 (70 arredondado para cima)", () => {
    expect(purchaseQuantity(2, 72, 24, 1)).toBe(72);
  });
  it("multiplicador 2x dobra o alvo: Total 2, mínimo 72 → 144", () => {
    expect(purchaseQuantity(2, 72, 24, 2)).toBe(144);
  });
  it("Total negativo conta como 0", () => {
    expect(purchaseQuantity(-10, 12, 12, 1)).toBe(12);
  });
  it("nada a pedir quando Total ≥ alvo", () => {
    expect(purchaseQuantity(72, 72, 24, 1)).toBe(0);
    expect(purchaseQuantity(100, 72, 24, 1)).toBe(0);
  });
  it("nada a pedir com mínimo 0 ou vazio", () => {
    expect(purchaseQuantity(0, 0, 24, 1)).toBe(0);
    expect(purchaseQuantity(0, null, 24, 1)).toBe(0);
  });
  it("múltipla 1 → exatamente alvo − Total", () => {
    expect(purchaseQuantity(3, 10, 1, 1)).toBe(7);
  });
});

describe("parseMinInput (PC-06 AC 3, 4)", () => {
  it("vazio = sem mínimo", () => {
    expect(parseMinInput("  ")).toEqual({ ok: true, value: null });
  });
  it("inteiro de 0 a 99999", () => {
    expect(parseMinInput("0")).toEqual({ ok: true, value: 0 });
    expect(parseMinInput(" 72 ")).toEqual({ ok: true, value: 72 });
    expect(parseMinInput("99999")).toEqual({ ok: true, value: 99999 });
  });
  it("recusa decimal, negativo, texto e acima de 99999", () => {
    for (const raw of ["1,5", "1.5", "-1", "abc", "100000"]) expect(parseMinInput(raw)).toEqual({ ok: false });
  });
});

describe("buildPurchaseOrderView", () => {
  it("lista só os elegíveis com saldo, pedidos em aberto, total, vendidos, múltipla e mínimo (PC-01)", () => {
    const v = view(
      [stock({ balance: 1, openOrder: 1, total: 2 }), stock({ code: "WP014", position: 1 }), stock({ code: "X1", blocked: true, position: 2 })],
      { "BSPPAR-ATH-001": 72 },
      1,
      { "BSPPAR-ATH-001": 15 },
    );
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]).toMatchObject({
      code: "BSPPAR-ATH-001",
      nome: "BODY SPLASH PARIS 200ML",
      saldo: 1,
      pedidosAbertos: 1,
      total: 2,
      vendidos30: 15,
      multipla: 24,
      minimo: 72,
    });
  });

  it("abaixo do mínimo: destaca e mostra A pedir da regra (PC-03 AC 4)", () => {
    const r = view([stock()], { "BSPPAR-ATH-001": 72 }).rows[0];
    expect(r.noPedido).toBe(true);
    expect(r.aPedir).toBe(72);
  });

  it("mínimo vazio ou 0: A pedir '—' (null) e sem destaque (PC-03 AC 5)", () => {
    const [semMin, zero] = view([stock(), stock({ code: "B2", position: 1 })], { B2: 0 }).rows;
    expect(semMin.aPedir).toBeNull();
    expect(semMin.noPedido).toBe(false);
    expect(zero.aPedir).toBeNull();
    expect(zero.noPedido).toBe(false);
  });

  it("com estoque suficiente: A pedir 0 e sem destaque", () => {
    const r = view([stock({ total: 80 })], { "BSPPAR-ATH-001": 72 }).rows[0];
    expect(r.aPedir).toBe(0);
    expect(r.noPedido).toBe(false);
  });

  it("selo Novo pela data de cadastro (PC-02)", () => {
    const [velho, novo] = view([stock(), stock({ code: "N1", registeredAt: "2026-09-20", position: 1 })]).rows;
    expect(velho.novo).toBe(false);
    expect(novo.novo).toBe(true);
  });

  it("produto com mais de uma variante elegível: aviso, A pedir '—' e fora do pedido (PC-05 AC 9)", () => {
    const v = view(
      [stock({ code: "41228", size: "P", total: 0 }), stock({ code: "41228", size: "M", total: 0, position: 1 })],
      { "41228": 12 },
    );
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0].variasVariantes).toBe(true);
    expect(v.rows[0].aPedir).toBeNull();
    expect(v.rows[0].noPedido).toBe(false);
    expect(v.resumo).toEqual({ produtos: 0, itens: 0 });
  });

  it("uma variante bloqueada não conta como variante elegível", () => {
    const v = view([stock({ code: "41228", size: "P" }), stock({ code: "41228", size: "M", blocked: true, position: 1 })], { "41228": 72 });
    expect(v.rows[0].variasVariantes).toBe(false);
    expect(v.rows[0].aPedir).toBe(72);
  });

  it("mínimo de produto que não veio no relatório não gera linha", () => {
    expect(view([stock()], { SUMIU: 10 }).rows.map((r) => r.code)).toEqual(["BSPPAR-ATH-001"]);
  });

  it("resumo e contagens seguem o multiplicador (PC-12 AC 1)", () => {
    const rows = [
      stock({ code: "A", total: 2, position: 0 }),
      stock({ code: "B", total: 30, multiple: 12, position: 1 }),
      stock({ code: "C", total: 0, position: 2, registeredAt: "2026-10-01" }),
    ];
    const mins = { A: 72, B: 24 };
    expect(view(rows, mins, 1).resumo).toEqual({ produtos: 1, itens: 72 });
    const dobrado = view(rows, mins, 2);
    expect(dobrado.resumo).toEqual({ produtos: 2, itens: 144 + 24 });
    expect(dobrado.contagens).toEqual({ noPedido: 2, semMinimo: 1, novos: 1 });
  });
});

describe("filterPurchaseRows (PC-04 AC 7, 8)", () => {
  const v = view(
    [
      stock({ code: "A1", description: "DESOD COLÔNIA GOLDEN", total: 0 }),
      stock({ code: "B2", description: "BODY CREAM", position: 1, registeredAt: "2026-10-01" }),
      stock({ code: "C3", description: "SHAMPOO", total: 100, position: 2 }),
    ],
    { A1: 12, C3: 12 },
  );
  const codes = (filtro: Parameters<typeof filterPurchaseRows>[1]["filtro"], busca = "") =>
    filterPurchaseRows(v.rows, { busca, filtro }).map((r) => r.code);

  it("busca no nome sem diferenciar maiúsculas e acentos", () => {
    expect(codes("todos", "colonia")).toEqual(["A1"]);
    expect(codes("todos", "GOLDEN")).toEqual(["A1"]);
  });
  it("busca no código", () => {
    expect(codes("todos", "b2")).toEqual(["B2"]);
  });
  it("Vai para o pedido = só destacados", () => {
    expect(codes("pedido")).toEqual(["A1"]);
  });
  it("Sem mínimo = mínimo vazio ou 0", () => {
    expect(codes("semMinimo")).toEqual(["B2"]);
  });
  it("Novos = só com selo Novo", () => {
    expect(codes("novos")).toEqual(["B2"]);
  });
});
