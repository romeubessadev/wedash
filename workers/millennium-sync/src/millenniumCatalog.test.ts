import { describe, expect, it } from "vitest";
import { parseProductRegistry } from "./millenniumCatalog.ts";

describe("parseProductRegistry (Saldo Atual e Futuro)", () => {
  it("data de cadastro no dia de Brasília, múltipla e bloqueio; 1 linha por código", () => {
    const rows = parseProductRegistry([
      { COD_PRODUTO: "FTWINC-ATH-001", TAMANHO: "U", BLOQUEADO_COMPRA: true, QUANTIDADE_MULTIPLA: 12, DATA_CADASTRO: "2024-06-05T03:00:00.000Z" },
      { COD_PRODUTO: "FTWINC-ATH-001", TAMANHO: "P", BLOQUEADO_COMPRA: true, QUANTIDADE_MULTIPLA: 12, DATA_CADASTRO: "2024-06-05T03:00:00.000Z" },
      { COD_PRODUTO: "238", BLOQUEADO_COMPRA: false, QUANTIDADE_MULTIPLA: 24, DATA_CADASTRO: "2024-12-16T03:00:00.000Z" },
      { COD_PRODUTO: "", QUANTIDADE_MULTIPLA: 6 },
    ]);
    expect(rows).toEqual([
      { code: "FTWINC-ATH-001", registeredAt: "2024-06-05", purchaseMultiple: 12, purchaseBlocked: true },
      { code: "238", registeredAt: "2024-12-16", purchaseMultiple: 24, purchaseBlocked: false },
    ]);
  });

  it("campos ausentes ou múltipla 0 viram null", () => {
    expect(parseProductRegistry({ value: [{ COD_PRODUTO: "X1", QUANTIDADE_MULTIPLA: 0, DATA_CADASTRO: null }] })).toEqual([
      { code: "X1", registeredAt: null, purchaseMultiple: null, purchaseBlocked: null },
    ]);
  });
});
