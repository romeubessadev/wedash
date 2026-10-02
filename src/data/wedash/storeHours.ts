/** Horário de funcionamento e fusos — Configurações > Lojas. */

/** 0 = domingo … 6 = sábado (Date#getDay). */
export type Dow = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** null = fechado nesse dia. */
export type DayHours = { open: string; close: string } | null;

export type StoreWeekHours = Record<Dow, DayHours>;

export const DOW_LABELS: Record<Dow, string> = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

export const DOW_SHORT: Record<Dow, string> = {
  0: "D",
  1: "S",
  2: "T",
  3: "Q",
  4: "Q",
  5: "S",
  6: "S",
};

/** Fusos oficiais do Brasil (sem horário de verão desde 2019), ordenados pelo offset. */
export const STORE_TIMEZONES: Array<{ value: string; label: string; states: string }> = [
  { value: "America/Noronha", label: "(UTC−02:00) Fernando de Noronha", states: "Fernando de Noronha" },
  {
    value: "America/Sao_Paulo",
    label: "(UTC−03:00) Horário de Brasília",
    states: "DF, Sul, Sudeste, Nordeste, GO, TO, PA e AP",
  },
  { value: "America/Manaus", label: "(UTC−04:00) Horário do Amazonas", states: "AM, MS, MT, RO e RR" },
  { value: "America/Rio_Branco", label: "(UTC−05:00) Horário do Acre", states: "AC e sudoeste do AM" },
];

/** IANA equivalentes (mesmo offset, sem DST) → fuso oficial da lista. */
const TZ_ALIAS: Record<string, string> = {
  "America/Campo_Grande": "America/Manaus",
  "America/Cuiaba": "America/Manaus",
  "America/Porto_Velho": "America/Manaus",
  "America/Boa_Vista": "America/Manaus",
  "America/Fortaleza": "America/Sao_Paulo",
  "America/Belem": "America/Sao_Paulo",
  "America/Recife": "America/Sao_Paulo",
  "America/Bahia": "America/Sao_Paulo",
  "America/Maceio": "America/Sao_Paulo",
  "America/Araguaina": "America/Sao_Paulo",
  "America/Santarem": "America/Sao_Paulo",
  "America/Eirunepe": "America/Rio_Branco",
};

export function canonicalStoreTimezone(tz: string): string {
  return TZ_ALIAS[tz] ?? tz;
}

/** Default = todos os dias desligados (não configurado; o gestor preenche em Configurações > Lojas). */
export function defaultWeekHours(): StoreWeekHours {
  return { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
}

/** Nenhum dia aberto = horário ainda não configurado. */
export function weekHoursConfigured(h: StoreWeekHours): boolean {
  return ([0, 1, 2, 3, 4, 5, 6] as Dow[]).some((d) => h[d] != null);
}

/**
 * Horário usado nos gráficos (eixo por hora, curva da meta): sem configuração = 10:00–22:00
 * todos os dias, só para o cálculo não zerar. O sync não usa horário (atualiza o dia inteiro).
 */
export function effectiveWeekHours(h: StoreWeekHours): StoreWeekHours {
  if (weekHoursConfigured(h)) return h;
  const day: DayHours = { open: "10:00", close: "22:00" };
  return { 0: { ...day }, 1: { ...day }, 2: { ...day }, 3: { ...day }, 4: { ...day }, 5: { ...day }, 6: { ...day } };
}

export function parseWeekHours(raw: unknown): StoreWeekHours {
  const base = defaultWeekHours();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (let d = 0; d <= 6; d++) {
    const key = String(d);
    if (!(key in o)) continue;
    const v = o[key];
    if (v == null) {
      base[d as Dow] = null;
      continue;
    }
    if (typeof v !== "object") continue;
    const row = v as Record<string, unknown>;
    const open = typeof row.open === "string" ? row.open : null;
    const close = typeof row.close === "string" ? row.close : null;
    if (open && close) base[d as Dow] = { open, close };
  }
  return base;
}

/** "09:00" → 9; "09:30" → 9.5 */
export function hhmmToHour(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return 0;
  return h + min / 60;
}

/** Primeira hora cheia inclusiva do expediente. */
export function openHourFloor(day: DayHours): number | null {
  if (!day) return null;
  return Math.floor(hhmmToHour(day.open));
}

/** Última hora cheia exclusiva do expediente (ex.: fecha 21:00 → eixo até 20). */
export function closeHourCeil(day: DayHours): number | null {
  if (!day) return null;
  const c = hhmmToHour(day.close);
  const floor = Math.floor(c);
  return c > floor ? floor + 1 : Math.max(floor, openHourFloor(day)! + 1);
}

/** Opções de select a cada 30 min (00:00–23:30). */
export function halfHourOptions(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
}

/**
 * Janela união das lojas no dia da semana (gráficos).
 * Se todas fechadas, cai no default 9–21.
 */
/** União do expediente só das lojas com horário configurado; null = nenhuma → o eixo sai das vendas. */
export function unionConfiguredWindow(
  hoursList: StoreWeekHours[],
  dow: Dow,
): { abertura: number; fechamento: number } | null {
  const configured = hoursList.filter(weekHoursConfigured);
  if (configured.length === 0) return null;
  const w = unionOpenWindow(configured, dow);
  return configured.some((h) => openHourFloor(h[dow]) != null) ? w : null;
}

/**
 * Eixo dos gráficos por hora (1 dia), igual em todas as telas: expediente configurado das lojas no dia
 * (Configurações > Loja); venda fora do expediente estende o eixo. Nenhuma loja com horário → horas com
 * venda ∪ `fallbackHours` (ex.: horas com meta); sem nada, 10h–22h. `first`/`last` inclusivos.
 */
export function hourAxisRange(
  hoursList: StoreWeekHours[],
  dow: Dow,
  soldHours: number[],
  fallbackHours: number[] = [],
): { first: number; last: number; win: { abertura: number; fechamento: number } } {
  const configured = unionConfiguredWindow(hoursList, dow);
  const livres = [...soldHours, ...fallbackHours];
  const win =
    configured ??
    (livres.length > 0
      ? { abertura: Math.min(...livres), fechamento: Math.max(...livres) + 1 }
      : { abertura: 10, fechamento: 22 });
  return {
    first: Math.min(win.abertura, ...soldHours),
    last: Math.max(win.fechamento - 1, ...soldHours),
    win,
  };
}

export function unionOpenWindow(
  hoursList: StoreWeekHours[],
  dow: Dow,
): { abertura: number; fechamento: number } {
  let abertura = 24;
  let fechamento = 0;
  for (const hours of hoursList) {
    const day = hours[dow];
    const a = openHourFloor(day);
    const c = closeHourCeil(day);
    if (a == null || c == null) continue;
    abertura = Math.min(abertura, a);
    fechamento = Math.max(fechamento, c);
  }
  if (abertura >= fechamento) return { abertura: 9, fechamento: 21 };
  return { abertura, fechamento };
}
