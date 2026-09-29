/** Formatação pt-BR usada em todas as telas do produto. */

const brlInteiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCentavos = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** R$ 84.210 — sem centavos, para painéis. */
export function brl(v: number): string {
  return brlInteiro.format(v);
}

/** R$ 1,2K · R$ 84K · R$ 1,2M — compacto para cards e gráficos. */
export function brlK(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: abs >= 10_000 ? 0 : 1, maximumFractionDigits: abs >= 10_000 ? 0 : 1 })}K`;
  return brlInteiro.format(v);
}

/** R$ 84.210,37 — com centavos, para conferência. */
export function brlCent(v: number): string {
  return brlCentavos.format(v);
}

/** LOJA / CATEGORIA / PRODUTO — rótulos de catálogo em caixa alta (pt-BR). */
export function labelUpper(s: string): string {
  return s.trim().toLocaleUpperCase("pt-BR");
}

const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Nome da empresa (tenant): caixa alta, igual ao nome das lojas vindo do ERP. */
export function companyNameCase(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

/** Nome de colaborador (equipe vinda do Millennium): caixa alta em todo o app. */
export function collaboratorName(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

/**
 * Nome de pessoa / turno: primeira letra de cada palavra maiúscula ("Ana Paula de Souza").
 * Partículas (de, da, do, das, dos, e) ficam minúsculas fora do início. Espelho SQL na migration
 * `20260926170000_title_case_names` e em `supabase/functions/_shared/text.ts`.
 */
export function titleName(s: string | null | undefined): string {
  const words = (s ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR").split(" ");
  return words
    .map((w, i) =>
      i > 0 && NAME_PARTICLES.has(w)
        ? w
        : w.replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toLocaleUpperCase("pt-BR")),
    )
    .join(" ");
}

/**
 * Nome de produto / categoria / tabela vindo do ERP em Title Case ("DESOD COL VF GOLDEN 100ML" →
 * "Desod Col VF Golden 100ml"). Sigla sem vogal (VF, WP, FPS) fica em maiúsculas.
 */
export function labelCase(s: string | null | undefined): string {
  const raw = (s ?? "").trim().replace(/\s+/g, " ").split(" ");
  const cased = titleName(raw.join(" ")).split(" ");
  return cased
    .map((w, i) => (/^[\p{L}]{2,4}$/u.test(raw[i]!) && !/[aeiouyáéíóúâêôãõàü]/iu.test(raw[i]!) ? raw[i]!.toLocaleUpperCase("pt-BR") : w))
    .join(" ");
}

/** 2,3 · 184,5 — número com casas decimais em pt-BR. */
export function num(v: number, casas = 0): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** 48% · 48,3% */
export function pct(v: number, casas = 0): string {
  return `${num(v, casas)}%`;
}

/** +12% · −8% — sinal explícito para variações. */
export function delta(v: number, casas = 0): string {
  const sinal = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sinal}${num(Math.abs(v), casas)}%`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_SEMANA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Converte "2026-09-15" em Date local (meia-noite), sem armadilha de fuso. */
export function deIso(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

/** Converte Date em "2026-09-15" no fuso local. */
export function paraIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 15/09 */
export function dataCurta(iso: string): string {
  const d = deIso(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 15/09/2026 */
export function dataCompleta(iso: string): string {
  return `${dataCurta(iso)}/${deIso(iso).getFullYear()}`;
}

/** terça, 15 de setembro */
export function dataExtenso(iso: string): string {
  const d = deIso(iso);
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** setembro de 2026 */
export function mesAno(iso: string): string {
  const d = deIso(iso);
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Setembro 2026 (para nome de meta) */
export function mesAnoTitulo(iso: string): string {
  const d = deIso(iso);
  const m = MESES[d.getMonth()];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getFullYear()}`;
}

/** set */
export function mesCurto(iso: string): string {
  return MESES_CURTO[deIso(iso).getMonth()];
}

/** ter */
export function diaSemanaCurto(iso: string): string {
  return DIAS_SEMANA_CURTO[deIso(iso).getDay()];
}

/** 14:32 */
export function hora(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 14h */
export function horaCurta(h: number): string {
  return `${h}h`;
}

/** Adiciona dias a um ISO. */
export function somarDias(iso: string, dias: number): string {
  const d = deIso(iso);
  d.setDate(d.getDate() + dias);
  return paraIso(d);
}

/** Primeiro dia do mês do ISO. */
export function inicioDoMes(iso: string): string {
  const d = deIso(iso);
  return paraIso(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Último dia do mês do ISO. */
export function fimDoMes(iso: string): string {
  const d = deIso(iso);
  return paraIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Lista de ISOs entre início e fim, inclusive. */
export function intervaloDias(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let atual = inicio;
  while (atual <= fim) {
    out.push(atual);
    atual = somarDias(atual, 1);
  }
  return out;
}

/** Tooltip de delta: "Em relação ao mês passado." / "Em relação aos 7 dias anteriores." */
export function tipRelacao(vs: string): string {
  if (vs.startsWith("os ")) return `Em relação aos ${vs.slice(3)}.`;
  if (vs.startsWith("o ")) return `Em relação ao ${vs.slice(2)}.`;
  if (vs.startsWith("a ")) return `Em relação à ${vs.slice(2)}.`;
  return `Em relação a ${vs}.`;
}

/** Tooltip do badge de delta com o valor comparado: "Em relação ao mês passado: R$ 12.345,67." */
export function tipDelta(delta: { vs?: string; anterior?: string }): string {
  if (!delta.vs) return delta.anterior ? `Período anterior: ${delta.anterior}.` : "";
  const base = tipRelacao(delta.vs);
  return delta.anterior ? `${base.slice(0, -1)}: ${delta.anterior}.` : base;
}

/** `1 dia` / `N dias` — prazos e badges. */
export function rotuloDias(n: number): string {
  return n === 1 ? "1 dia" : `${n} dias`;
}
