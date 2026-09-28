/**
 * Carga funda do histórico (madrugada): depois da carga do onboarding, volta mês a mês até a
 * inauguração da loja (teto = `.env DEEP_HISTORY` do worker), só com todas as lojas fechadas.
 * Regras puras — o worker (`enqueueDueDeepHistoryJobs`) consulta o banco e aplica.
 */
import { addDays, minutesUntilOpen, storePhase, type WeekHours } from "./autoRefresh.ts";

/** Intervalo entre um mês e o próximo. */
export const DEEP_HISTORY_SPACING_MIN = 15;
/** Para esse tempo antes da abertura da primeira loja. */
export const DEEP_OPEN_MARGIN_MIN = 30;
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

/**
 * Madrugada = todas as lojas fechadas: fechou há 30 min ou mais (depois da última rodada automática),
 * não abre hoje, ou ainda faltam mais de 30 min para abrir.
 */
export function isDeepHistoryWindow(stores: Array<{ hours: WeekHours; timezone: string }>, now: Date): boolean {
  if (stores.length === 0) return false;
  return stores.every((s) => {
    const phase = storePhase(s.hours, now, s.timezone);
    if (phase === "closeDue" || phase === "closed") return true;
    if (phase === "before") return (minutesUntilOpen(s.hours, now, s.timezone) ?? 0) > DEEP_OPEN_MARGIN_MIN;
    return false;
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
