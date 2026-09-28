import { describe, expect, it } from "vitest";
import { syncHistoryItem, type SyncJobRow } from "./syncHistory";

const row = (over: Partial<SyncJobRow>): SyncJobRow => ({
  id: "j1",
  kind: "FORCE",
  status: "SUCCEEDED",
  payload: null,
  finished_at: "2026-09-25T23:32:00.000Z",
  ...over,
});

describe("syncHistoryItem", () => {
  it("Atualizar (manual ou automático) ok → Vendas atualizadas", () => {
    expect(syncHistoryItem(row({}))?.text).toBe("Vendas atualizadas");
    expect(syncHistoryItem(row({ payload: { auto: true } }))?.text).toBe("Vendas atualizadas");
    expect(syncHistoryItem(row({ kind: "SEED" }))?.text).toBe("Vendas atualizadas");
  });

  it("falha: manual aparece; automática fica de fora", () => {
    const f = syncHistoryItem(row({ status: "FAILED" }));
    expect(f).toMatchObject({ text: "Não foi possível atualizar as vendas", ok: false });
    expect(syncHistoryItem(row({ status: "FAILED", payload: { auto: true } }))).toBeNull();
  });

  it("carga do histórico em período e fechamento da madrugada", () => {
    expect(
      syncHistoryItem(
        row({ kind: "CLOSE", payload: { from: "2026-08-31", to: "2026-08-31", fillUntil: "2026-08-01", progressDay: "2026-08-01" } }),
      )?.text,
    ).toBe("Histórico de vendas carregado · 01/08 a 31/08");
    expect(syncHistoryItem(row({ kind: "CLOSE", payload: { from: "2026-09-24", to: "2026-09-24" } }))?.text).toBe(
      "Vendas de 24/09 consolidadas",
    );
    expect(syncHistoryItem(row({ kind: "CLOSE", status: "FAILED", payload: { to: "2026-09-24" } }))).toBeNull();
  });

  it("histórico antigo (madrugada): meses em silêncio, 1 aviso ao completar", () => {
    const deep = { from: "2026-07-31", to: "2026-07-31", fillUntil: "2026-07-01", deep: true };
    expect(syncHistoryItem(row({ kind: "CLOSE", payload: deep }))).toBeNull();
    expect(syncHistoryItem(row({ kind: "CLOSE", payload: { deepDone: true, since: "2024-11-03" } }))?.text).toBe(
      "Histórico de vendas completo · desde 11/2024",
    );
  });

  it("ignora jobs sem término e tipos fora do histórico", () => {
    expect(syncHistoryItem(row({ finished_at: null }))).toBeNull();
    expect(syncHistoryItem(row({ kind: "RANGE" }))).toBeNull();
  });
});
