import { describe, expect, it } from "vitest";
import {
  defaultWeekHours,
  effectiveWeekHours,
  hhmmToHour,
  openHourFloor,
  closeHourCeil,
  parseWeekHours,
  unionConfiguredWindow,
  unionOpenWindow,
  weekHoursConfigured,
} from "./storeHours";
describe("storeHours", () => {
  it("parses jsonb and defaults", () => {
    const h = parseWeekHours({
      0: null,
      1: { open: "10:00", close: "22:00" },
    });
    expect(h[0]).toBeNull();
    expect(h[1]).toEqual({ open: "10:00", close: "22:00" });
    expect(h[2]).toBeNull();
  });

  it("padrão = tudo desligado; cálculos usam 10h–22h enquanto não configurado", () => {
    const vazio = defaultWeekHours();
    expect(Object.values(vazio).every((d) => d === null)).toBe(true);
    expect(weekHoursConfigured(vazio)).toBe(false);
    expect(effectiveWeekHours(vazio)[0]).toEqual({ open: "10:00", close: "22:00" });
    const umDia = parseWeekHours({ 1: { open: "09:00", close: "18:00" } });
    expect(weekHoursConfigured(umDia)).toBe(true);
    expect(effectiveWeekHours(umDia)).toBe(umDia);
  });

  it("hhmm / open-close floors", () => {
    expect(hhmmToHour("09:30")).toBe(9.5);
    expect(openHourFloor({ open: "09:30", close: "21:00" })).toBe(9);
    expect(closeHourCeil({ open: "09:00", close: "21:00" })).toBe(21);
    expect(closeHourCeil({ open: "09:00", close: "21:30" })).toBe(22);
  });

  it("unionConfiguredWindow ignora lojas sem horário (eixo sai das vendas)", () => {
    const semHorario = defaultWeekHours();
    const comHorario = parseWeekHours({ 1: { open: "08:00", close: "18:00" } });
    expect(unionConfiguredWindow([semHorario], 1)).toBeNull();
    expect(unionConfiguredWindow([semHorario, comHorario], 1)).toEqual({ abertura: 8, fechamento: 18 });
    expect(unionConfiguredWindow([comHorario], 0)).toBeNull();
  });

  it("unionOpenWindow across stores", () => {
    const a = defaultWeekHours();
    a[1] = { open: "10:00", close: "22:00" };
    const b = defaultWeekHours();
    b[1] = { open: "08:00", close: "18:00" };
    expect(unionOpenWindow([a, b], 1)).toEqual({ abertura: 8, fechamento: 22 });
    expect(unionOpenWindow([a], 0).abertura).toBe(9); // domingo null → default
  });
});
