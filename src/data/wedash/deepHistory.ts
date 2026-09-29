/**
 * Carga funda do histórico (madrugada): depois da carga do onboarding, volta mês a mês até a
 * inauguração da loja (teto = `.env DEEP_HISTORY` do worker), só de madrugada.
 * Regras puras — o worker (`enqueueDueDeepHistoryJobs`) consulta o banco e aplica.
 */
import { addDays, localClock } from "./autoRefresh.ts";

/** Intervalo entre um mês e o próximo. */
export const DEEP_HISTORY_SPACING_MIN = 15;
/** Madrugada no fuso da loja: [início, fim) em horas. */
export const DEEP_WINDOW_START_H = 0;
export const DEEP_WINDOW_END_H = 6;
/** Loja sem inauguração cadastrada: para após N meses seguidos sem venda. */
export const DEEP_EMPTY_MONTHS = 3;
/** Mês que falhou (sessão caída, ERP fora) só tenta de novo na próxima madrugada. */
export const DEEP_FAIL_WAIT_H = 12;

export function monthStart(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`;
}

export function addMonths(isoDay: string, delta: number): string {
  const [y, m] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + delta, 1)).toISOString().slice(0, 10);
}

/** Madrugada = 0h–6h no fuso de todas as lojas. */
export function isDeepHistoryWindow(stores: Array<{ timezone: string }>, now: Date): boolean {
  if (stores.length === 0) return false;
  return stores.every((s) => {
    const h = localClock(now, s.timezone).minutes / 60;
    return h >= DEEP_WINDOW_START_H && h < DEEP_WINDOW_END_H;
  });
}

/** Dia mais antigo a carregar: inauguração, sem passar do teto (`cap`, 1º dia do mês mais antigo). */
export function deepHistoryFloor(openedAt: string | null | undefined, cap: string): string {
  const opened = openedAt ? openedAt.slice(0, 10) : null;
  return opened && opened > cap ? opened : cap;
}

export type DeepStore = {
  id: string;
  /** Dia mais antigo já gravado (null = loja ainda sem nenhum dia — espera o onboarding). */
  oldestDay: string | null;
  floor: string;
  /** Sem inauguração: os últimos meses mais antigos já carregados vieram zerados. */
  emptyTail: boolean;
};

export type DeepPlan = { day: string; fillUntil: string; storeIds: string[] };

export function deepStoreDone(s: DeepStore): boolean {
  return s.oldestDay == null || s.oldestDay <= s.floor || s.emptyTail;
}

/**
 * Próximo mês: o mais recente que falta entre as lojas (dia anterior ao mais antigo gravado),
 * com todas as lojas que precisam desse mesmo mês. Null = nada a carregar.
 */
export function planDeepHistory(stores: DeepStore[]): DeepPlan | null {
  const pending = stores
    .filter((s) => !deepStoreDone(s))
    .map((s) => ({ ...s, next: addDays(s.oldestDay!, -1) }));
  if (pending.length === 0) return null;
  const day = pending.map((s) => s.next).reduce((a, b) => (b > a ? b : a));
  const month = monthStart(day);
  const group = pending.filter((s) => monthStart(s.next) === month);
  const lowestFloor = group.map((s) => s.floor).reduce((a, b) => (b < a ? b : a));
  return {
    day,
    fillUntil: lowestFloor > month ? lowestFloor : month,
    storeIds: group.map((s) => s.id),
  };
}
