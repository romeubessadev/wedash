import { describe, expect, it } from "vitest";
import {
  assertSyncConfig,
  autoRefreshEnabled,
  deepHistorySpan,
  describeSpan,
  onboardingHistoryUntil,
  parseSyncSpan,
  spanStart,
  syncOnboardingOff,
} from "./syncConfig.ts";

describe("syncConfig", () => {
  it("parseSyncSpan: off · Nd · Nm; vazio = padrão; inválido lança", () => {
    expect(parseSyncSpan("X", "off", "off")).toBe("off");
    expect(parseSyncSpan("X", " 2D ", "off")).toEqual({ n: 2, unit: "d" });
    expect(parseSyncSpan("X", "24m", "off")).toEqual({ n: 24, unit: "m" });
    expect(parseSyncSpan("X", undefined, { n: 1, unit: "m" })).toEqual({ n: 1, unit: "m" });
    for (const bad of ["0", "0d", "hoje", "1", "abc", "2 m"]) {
      expect(() => parseSyncSpan("X", bad, "off")).toThrow(/X=.* inválido/);
    }
  });

  it("SYNC_ONBOARDING: Nd conta hoje; Nm conta o mês atual; histórico = dias antes de hoje", () => {
    const until = (v?: string) => onboardingHistoryUntil("2026-09-25", { SYNC_ONBOARDING: v });
    expect(until("off")).toBeNull();
    expect(until("1d")).toBeNull();
    expect(until("2d")).toBe("2026-09-24");
    expect(until("7d")).toBe("2026-09-19");
    expect(until("1m")).toBe("2026-09-01");
    expect(until("2m")).toBe("2026-08-01");
    expect(until(undefined)).toBe("2026-09-01");
    expect(onboardingHistoryUntil("2026-09-01", { SYNC_ONBOARDING: "1m" })).toBeNull();
    expect(onboardingHistoryUntil("2026-01-15", { SYNC_ONBOARDING: "2m" })).toBe("2025-12-01");
    expect(syncOnboardingOff({ SYNC_ONBOARDING: "OFF" })).toBe(true);
    expect(syncOnboardingOff({})).toBe(false);
  });

  it("DEEP_HISTORY: off (padrão) ou Nm, contando o mês atual", () => {
    expect(deepHistorySpan({})).toBe("off");
    expect(deepHistorySpan({ DEEP_HISTORY: "off" })).toBe("off");
    const span = deepHistorySpan({ DEEP_HISTORY: "24m" });
    expect(span !== "off" && spanStart(span, "2026-09-25")).toBe("2024-10-01");
    expect(() => deepHistorySpan({ DEEP_HISTORY: "30d" })).toThrow(/DEEP_HISTORY/);
    expect(() => assertSyncConfig({ SYNC_ONBOARDING: "2x" })).toThrow(/SYNC_ONBOARDING/);
  });

  it("AUTO_REFRESH: on (padrão) ou off; CLOSE_HOUR: off ou 0–23", () => {
    expect(autoRefreshEnabled({})).toBe(true);
    expect(autoRefreshEnabled({ AUTO_REFRESH: "ON" })).toBe(true);
    expect(autoRefreshEnabled({ AUTO_REFRESH: "off" })).toBe(false);
    expect(() => autoRefreshEnabled({ AUTO_REFRESH: "1" })).toThrow(/AUTO_REFRESH/);
    expect(() => assertSyncConfig({ CLOSE_HOUR: "3" })).not.toThrow();
    expect(() => assertSyncConfig({ CLOSE_HOUR: "off" })).not.toThrow();
    expect(() => assertSyncConfig({ CLOSE_HOUR: "24" })).toThrow(/CLOSE_HOUR/);
    expect(() => assertSyncConfig({ CLOSE_HOUR: "3h" })).toThrow(/CLOSE_HOUR/);
  });

  it("describeSpan", () => {
    expect(describeSpan("off")).toBe("desligado");
    expect(describeSpan({ n: 1, unit: "d" })).toBe("só hoje");
    expect(describeSpan({ n: 2, unit: "d" })).toBe("hoje e ontem");
    expect(describeSpan({ n: 7, unit: "d" })).toBe("últimos 7 dias");
    expect(describeSpan({ n: 1, unit: "m" })).toBe("mês atual");
    expect(describeSpan({ n: 24, unit: "m" })).toBe("24 meses (mês atual + 23 anterior(es))");
  });
});
