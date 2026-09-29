/**
 * Atualização automática: regras puras (worker + front).
 * - Rodadas a cada 30 min o dia inteiro, todas as lojas (sem horário de funcionamento).
 * - Toda rodada ok fecha antes os dias pendentes (até o dia 1 do mês anterior) → a 1ª rodada
 *   depois da meia-noite fecha ontem (`store.last_closed_day`).
 */

/** Intervalo fixo entre rodadas (sem opção na UI). */
export const AUTO_REFRESH_MIN = 30;
/** Dias pendentes fechados por rodada (o resto fica para as próximas / madrugada). */
export const RECOVERY_DAYS_PER_ROUND = 3;
/** Marca no `sync_job.error` da rodada pulada por sessão caída → a próxima pode fazer login. */
export const AUTO_SESSION_MARK = "[auto-sessao]";

/** Dia (YYYY-MM-DD), dia da semana (0=dom) e minuto do dia no fuso. */
export function localClock(date: Date, timeZone: string): { day: string; dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    dow: Math.max(0, dows.indexOf(get("weekday"))),
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

export function addDays(isoDay: string, delta: number): string {
  const d = new Date(`${isoDay}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Chão da recuperação de dias: dia 1 do mês anterior. */
export function recoveryFloor(todayIso: string): string {
  const [y, m] = todayIso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 10);
}

/**
 * Dias pendentes da loja (depois do último fechado, antes de hoje), do mais antigo ao mais novo.
 * Sem último dia fechado ainda = nada pendente (a carga do histórico / madrugada cria a base).
 */
export function pendingDays(
  lastClosedDay: string | null | undefined,
  todayIso: string,
  max = RECOVERY_DAYS_PER_ROUND,
): string[] {
  if (!lastClosedDay) return [];
  const floor = recoveryFloor(todayIso);
  let day = addDays(lastClosedDay, 1);
  if (day < floor) day = floor;
  const out: string[] = [];
  while (day < todayIso && out.length < max) {
    out.push(day);
    day = addDays(day, 1);
  }
  return out;
}

/**
 * Rodada automática devida agora? Todas as lojas, `intervalMin` depois da última rodada automática
 * (Atualizar manual não conta). Rodada perdida (integração desconectada, worker parado) = última
 * rodada ficou para trás → roda assim que voltar.
 */
export function planAutoRound(args: {
  storeIds: string[];
  now: Date;
  intervalMin: number;
  lastAutoAt: Date | null;
}): { storeIds: string[] } | null {
  if (args.storeIds.length === 0) return null;
  const sinceMin = args.lastAutoAt ? (args.now.getTime() - args.lastAutoAt.getTime()) / 60_000 : Infinity;
  return sinceMin >= args.intervalMin ? { storeIds: args.storeIds } : null;
}

/** Próxima rodada automática (tooltip do Atualizar): última rodada + intervalo; atrasada = agora. */
export function nextAutoRefreshAt(args: { now: Date; intervalMin: number; lastAutoAt: Date | null }): Date {
  const due = args.lastAutoAt ? new Date(args.lastAutoAt.getTime() + args.intervalMin * 60_000) : args.now;
  return due < args.now ? args.now : due;
}
