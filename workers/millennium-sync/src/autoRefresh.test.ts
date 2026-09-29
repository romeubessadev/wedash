import { describe, expect, it } from "vitest";
import { localClock, nextAutoRefreshAt, pendingDays, planAutoRound, recoveryFloor } from "./autoRefresh.ts";

const TZ = "America/Campo_Grande"; // UTC−4
/** Horário local em Campo Grande → Date. */
const at = (isoLocal: string) => new Date(`${isoLocal}-04:00`);

describe("localClock", () => {
  it("dia, dia da semana e minuto no fuso", () => {
    // 2026-09-25 é sexta.
    expect(localClock(at("2026-09-25T13:45:00"), TZ)).toEqual({ day: "2026-09-25", dow: 5, minutes: 13 * 60 + 45 });
  });
});

describe("pendingDays", () => {
  it("dias entre o último fechado e hoje, no máx. 3, do mais antigo", () => {
    expect(pendingDays("2026-09-24", "2026-09-25")).toEqual([]);
    expect(pendingDays("2026-09-20", "2026-09-25")).toEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
  });
  it("sem base = nada; chão = dia 1 do mês anterior", () => {
    expect(pendingDays(null, "2026-09-25")).toEqual([]);
    expect(recoveryFloor("2026-01-10")).toBe("2025-12-01");
    expect(pendingDays("2026-05-01", "2026-09-25", 1)).toEqual(["2026-08-01"]);
  });
});

describe("planAutoRound", () => {
  it("todas as lojas quando o intervalo venceu, a qualquer hora", () => {
    const now = at("2026-09-25T14:00:00");
    expect(planAutoRound({ storeIds: ["a", "b"], now, intervalMin: 30, lastAutoAt: null })).toEqual({
      storeIds: ["a", "b"],
    });
    expect(
      planAutoRound({ storeIds: ["a"], now, intervalMin: 30, lastAutoAt: at("2026-09-25T13:40:00") }),
    ).toBeNull();
    expect(
      planAutoRound({ storeIds: ["a"], now: at("2026-09-26T03:10:00"), intervalMin: 30, lastAutoAt: at("2026-09-26T02:40:00") }),
    ).toEqual({ storeIds: ["a"] });
  });

  it("rodada perdida (desconectado) → roda assim que voltar; sem lojas = nada", () => {
    expect(
      planAutoRound({ storeIds: ["a"], now: at("2026-09-25T15:26:00"), intervalMin: 30, lastAutoAt: at("2026-09-25T14:52:00") }),
    ).toEqual({ storeIds: ["a"] });
    expect(planAutoRound({ storeIds: [], now: at("2026-09-25T15:26:00"), intervalMin: 30, lastAutoAt: null })).toBeNull();
  });
});

describe("nextAutoRefreshAt", () => {
  const next = (now: string, lastAutoAt: string | null) =>
    nextAutoRefreshAt({ now: at(now), intervalMin: 30, lastAutoAt: lastAutoAt ? at(lastAutoAt) : null });
  it("última rodada automática + intervalo; atrasada = agora", () => {
    expect(next("2026-09-25T14:10:00", "2026-09-25T14:00:00")).toEqual(at("2026-09-25T14:30:00"));
    expect(next("2026-09-25T23:50:00", "2026-09-25T23:45:00")).toEqual(at("2026-09-26T00:15:00"));
    expect(next("2026-09-25T15:26:00", "2026-09-25T14:52:00")).toEqual(at("2026-09-25T15:26:00"));
    expect(next("2026-09-25T15:26:00", null)).toEqual(at("2026-09-25T15:26:00"));
  });
});
