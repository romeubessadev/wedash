import { describe, expect, it } from "vitest";
import { parseStoreHours } from "./autoRefresh";
import { addMonths, deepHistoryFloor, isDeepHistoryWindow, planDeepHistory, type DeepStore } from "./deepHistory";

const TZ = "America/Sao_Paulo";
const at = (hhmm: string) => new Date(`2026-09-25T${hhmm}:00-03:00`);
const store = { hours: parseStoreHours(null), timezone: TZ };

describe("isDeepHistoryWindow", () => {
  it("só com todas as lojas fechadas: 30 min após o fechamento até 30 min antes de abrir", () => {
    expect(isDeepHistoryWindow([store], at("15:00"))).toBe(false);
    expect(isDeepHistoryWindow([store], at("22:10"))).toBe(false);
    expect(isDeepHistoryWindow([store], at("22:40"))).toBe(true);
    expect(isDeepHistoryWindow([store], at("03:00"))).toBe(true);
    expect(isDeepHistoryWindow([store], at("09:20"))).toBe(true);
    expect(isDeepHistoryWindow([store], at("09:45"))).toBe(false);
  });

  it("uma loja aberta segura a carga", () => {
    const late = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { open: "12:00", close: "23:30" }]));
    const lateStore = { hours: parseStoreHours(late), timezone: TZ };
    expect(isDeepHistoryWindow([store, lateStore], at("22:40"))).toBe(false);
    expect(isDeepHistoryWindow([], at("03:00"))).toBe(false);
  });
});

describe("deepHistoryFloor", () => {
  it("inauguração, sem passar do teto", () => {
    expect(deepHistoryFloor("2025-03-10", "2024-10-01")).toBe("2025-03-10");
    expect(deepHistoryFloor("2019-01-01", "2024-10-01")).toBe("2024-10-01");
    expect(deepHistoryFloor(null, "2024-10-01")).toBe("2024-10-01");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
  });
});

describe("planDeepHistory", () => {
  const s = (over: Partial<DeepStore>): DeepStore => ({
    id: "s1",
    oldestDay: "2026-08-01",
    floor: "2024-09-01",
    emptyTail: false,
    ...over,
  });

  it("mês anterior ao mais antigo gravado, juntando as lojas no mesmo mês", () => {
    expect(planDeepHistory([s({}), s({ id: "s2" })])).toEqual({
      day: "2026-07-31",
      fillUntil: "2026-07-01",
      storeIds: ["s1", "s2"],
    });
  });

  it("loja atrasada espera: primeiro o mês mais recente que falta", () => {
    expect(planDeepHistory([s({}), s({ id: "s2", oldestDay: "2026-07-01" })])).toEqual({
      day: "2026-07-31",
      fillUntil: "2026-07-01",
      storeIds: ["s1"],
    });
  });

  it("para na inauguração (no meio do mês) e em loja sem venda nos meses mais antigos", () => {
    expect(planDeepHistory([s({ floor: "2026-07-10" })])?.fillUntil).toBe("2026-07-10");
    expect(planDeepHistory([s({ oldestDay: "2026-07-10", floor: "2026-07-10" })])).toBeNull();
    expect(planDeepHistory([s({ emptyTail: true })])).toBeNull();
    expect(planDeepHistory([s({ oldestDay: null })])).toBeNull();
  });
});
