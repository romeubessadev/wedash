/**
 * Períodos de sincronização do `.env`, mesma escrita nas duas chaves:
 *   off = desligado · Nd = N dias contando hoje (1d = só hoje) · Nm = N meses contando o atual (1m = mês atual)
 *
 * - SYNC_ONBOARDING (padrão 1m): o que entra depois do onboarding. off = sem vendas — ao conectar só
 *   traz o cadastro (gerador, equipe e produtos); sem carga do histórico, sem atualização automática e sem
 *   fechamento da madrugada; o Atualizar manual continua.
 * - DEEP_HISTORY (padrão off, só Nm): histórico antigo na madrugada, até a inauguração da loja.
 *
 * Valor inválido derruba o worker na partida (`assertSyncConfig`).
 */
import { addDays } from "./autoRefresh.ts";
import { addMonths, monthStart } from "./deepHistory.ts";

type Env = Record<string, string | undefined>;

export type SyncSpan = "off" | { n: number; unit: "d" | "m" };

export function parseSyncSpan(name: string, raw: string | undefined, fallback: SyncSpan): SyncSpan {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return fallback;
  if (value === "off") return "off";
  const match = /^(\d+)([dm])$/.exec(value);
  const n = match ? Number(match[1]) : 0;
  if (!match || n < 1) throw new Error(`${name}=${raw} inválido — use off, Nd (ex.: 2d) ou Nm (ex.: 2m)`);
  return { n, unit: match[2] as "d" | "m" };
}

/** Primeiro dia coberto pelo período (inclui hoje / o mês atual). */
export function spanStart(span: Exclude<SyncSpan, "off">, todayIso: string): string {
  return span.unit === "d" ? addDays(todayIso, -(span.n - 1)) : addMonths(monthStart(todayIso), -(span.n - 1));
}

export function describeSpan(span: SyncSpan): string {
  if (span === "off") return "desligado";
  if (span.unit === "d") return span.n === 1 ? "só hoje" : span.n === 2 ? "hoje e ontem" : `últimos ${span.n} dias`;
  return span.n === 1 ? "mês atual" : `${span.n} meses (mês atual + ${span.n - 1} anterior(es))`;
}

export function onboardingSpan(env: Env = process.env): SyncSpan {
  return parseSyncSpan("SYNC_ONBOARDING", env.SYNC_ONBOARDING, { n: 1, unit: "m" });
}

export function syncOnboardingOff(env: Env = process.env): boolean {
  return onboardingSpan(env) === "off";
}

/** Anotação do SEED pulado com SYNC_ONBOARDING=off (status SUCCEEDED; o sino ignora). */
export const SYNC_OFF_NOTE = "sync desligado (SYNC_ONBOARDING=off)";

/** Dia mais antigo da carga do histórico depois do SEED (que já trouxe hoje); null = nada antes de hoje. */
export function onboardingHistoryUntil(todayIso: string, env: Env = process.env): string | null {
  const span = onboardingSpan(env);
  if (span === "off") return null;
  const start = spanStart(span, todayIso);
  return start < todayIso ? start : null;
}

export function deepHistorySpan(env: Env = process.env): SyncSpan {
  const span = parseSyncSpan("DEEP_HISTORY", env.DEEP_HISTORY, "off");
  if (span !== "off" && span.unit !== "m") throw new Error(`DEEP_HISTORY=${env.DEEP_HISTORY} inválido — use off ou Nm (ex.: 24m)`);
  return span;
}

export function assertSyncConfig(env: Env = process.env): void {
  onboardingSpan(env);
  deepHistorySpan(env);
}
