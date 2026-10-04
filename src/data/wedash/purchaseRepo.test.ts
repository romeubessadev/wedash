import { describe, expect, it } from "vitest";
import {
  PURCHASE_SYNC_ERROR,
  purchaseStockFromRow,
  purchaseSyncMessage,
  sold30FromAggs,
  type PurchaseStockDbRow,
} from "./purchaseRepo";

const row = (over: Partial<PurchaseStockDbRow> = {}): PurchaseStockDbRow => ({
  product_code: "526",
  color: "000",
  print: "000",
  size: "U",
  description: "BODY SPLASH VF GOLDEN",
  balance: "10.000",
  open_order: "24.000",
  total: "34.000",
  purchase_multiple: 12,
  purchase_blocked: false,
  registered_at: "2024-06-05",
  position: 3,
  ...over,
});

describe("purchaseStockFromRow", () => {
  it("numeric do Postgres (texto) vira número; variantes como texto", () => {
    expect(purchaseStockFromRow(row())).toEqual({
      code: "526",
      color: "000",
      print: "000",
      size: "U",
      description: "BODY SPLASH VF GOLDEN",
      balance: 10,
      openOrder: 24,
      total: 34,
      multiple: 12,
      blocked: false,
      registeredAt: "2024-06-05",
      position: 3,
    });
  });

  it("negativo e nulos: saldo negativo fica como veio; nulos = 0 / vazio / null", () => {
    const r = purchaseStockFromRow(
      row({ balance: "-3.000", open_order: null, total: null, color: null, description: null, purchase_multiple: null, purchase_blocked: null, registered_at: null }),
    );
    expect(r).toMatchObject({ balance: -3, openOrder: 0, total: 0, color: "", description: "", multiple: null, blocked: false, registeredAt: null });
  });

  it("múltipla zero = null; bloqueado só com true", () => {
    expect(purchaseStockFromRow(row({ purchase_multiple: 0 })).multiple).toBeNull();
    expect(purchaseStockFromRow(row({ purchase_blocked: true })).blocked).toBe(true);
  });
});

describe("sold30FromAggs (PC-04)", () => {
  it("soma os itens por código em todas as lojas/dias; código vazio fica de fora", () => {
    const m = sold30FromAggs([
      { productCode: "526", itemCount: 3 },
      { productCode: "526 ", itemCount: 2 },
      { productCode: "BSPPAR-ATH-001", itemCount: 1 },
      { productCode: "", itemCount: 9 },
    ]);
    expect([...m]).toEqual([
      ["526", 5],
      ["BSPPAR-ATH-001", 1],
    ]);
  });

  it("sem vendas = mapa vazio", () => {
    expect(sold30FromAggs([]).size).toBe(0);
  });
});

describe("purchaseSyncMessage (PC-08)", () => {
  it("usuário do Millennium em outro lugar tem texto próprio; o resto é a falha padrão", () => {
    expect(purchaseSyncMessage("erp_busy")).toMatch(/conectado em outro local/);
    expect(purchaseSyncMessage("erp_request_failed")).toBe(PURCHASE_SYNC_ERROR);
    expect(purchaseSyncMessage(undefined)).toBe("O pedido usará o último saldo disponível.");
  });
});
