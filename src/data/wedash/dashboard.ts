/**
 * Camada de visões da Visão geral. Faz o papel do backend: recebe o escopo
 * (filial, período, divisão) e devolve os blocos com números prontos.
 *
 * AD-047 — adaptar, não esconder: o gráfico principal é por hora (1 dia) ou
 * por dia (período > 1 dia), inclusive na rede. A régua sempre aparece:
 * % da meta, % da marca na rede, ou participação da marca na loja única.
 * AD-048 — KPIs com subtítulo só do próprio indicador; gráfico compara
 * períodos no mesmo eixo (padrão Finance / Revenue vs expenses).
 */
import { categorias, stores, productStores, tarefas, grupos, storeOperatingCostsConfigured, type Division, type Store, type Grupo } from "./stores";
import { goalOfStore } from "./goals";
import { productsOfCategory } from "./products";
import { buildProductLineIndex } from "./productLines";
import { NOW, UPDATED_AT, TODAY_ISO, CURRENT_HOUR, SYNC_INTERVAL_MIN, LAST_SYNC, calendarTodayIso, calendarCurrentHour } from "./clock";
import { effectiveWeekHours, unionConfiguredWindow, unionOpenWindow, type Dow } from "./storeHours";
import { dailyGoal, hourShares, weekdayWeights } from "./goalCurve";
import { dayAggregate, salesDay, salesDays, storeOpen, dayWeight, sumAggregates, type Aggregate } from "./sales";
import { brl, brlCent, dataCompleta, dataCurta, deIso, delta as fmtDelta, diaSemanaCurto, fimDoMes, horaCurta, inicioDoMes, intervaloDias, labelUpper, mesAno, mesCurto, pct, somarDias } from "@/lib/format";
import type { TintKey } from "@/pages/dashboards/icons";
import { buildStoreInsight } from "./insight";

export type PeriodType =
  | "hoje"
  | "ontem"
  | "estaSemana"
  | "esteMes"
  | "esteTrimestre"
  | "esteSemestre"
  | "esteAno"
  /** Legados (URL antiga / testes) — ainda resolvem. */
  | "7dias"
  | "mesPassado"
  | "personalizado";

/** Uma cor por loja, fixa pela posição no cadastro: a loja não muda de cor conforme o desempenho, como não muda o "Desktop"/"Mobile" da demo. */
const PALETA_LOJAS: TintKey[] = ["acc", "ok", "info", "warn", "bad"];

export interface Period {
  tipo: PeriodType;
  inicio?: string;
  fim?: string;
}

export type Granularity = "dia" | "periodo" | "mes";

export interface ResolvedPeriod {
  tipo: PeriodType;
  inicio: string;
  fim: string;
  granularidade: Granularity;
  atravessaMeses: boolean;
  ehHoje: boolean;
  /** Último dia do período = hoje (dia ainda em andamento). */
  terminaHoje: boolean;
  mesAberto: boolean;
  rotulo: string;
}

export interface Scope {
  /**
   * Lojas selecionadas (multi-select). Array vazio = "Todas as lojas"
   * (consolida a rede). Um id = visão detalhada daquela loja. Vários =
   * soma daquelas lojas. Substitui o antigo `filialId: string | "todas"`.
   */
  filialIds: string[];
  periodo: Period;
  divisao: Division | null;
}

export const periodLabels: Record<PeriodType, string> = {
  hoje: "Hoje",
  estaSemana: "Esta semana",
  esteMes: "Este mês",
  esteTrimestre: "Este trimestre",
  esteSemestre: "Este semestre",
  esteAno: "Este ano",
  ontem: "Ontem",
  "7dias": "7 dias",
  mesPassado: "Mês passado",
  personalizado: "Personalizado",
};

/** Presets do DateRangePicker (ordem dos pills). */
export const PERIOD_PRESETS: PeriodType[] = [
  "hoje",
  "ontem",
  "estaSemana",
  "esteMes",
  "esteTrimestre",
  "esteSemestre",
  "esteAno",
];

/* ---------- Tipos do motor de trilho ---------- */

export type BlockState = "disponivel" | "carregando" | "sem_dados" | "indisponivel";

export interface StoreBlockStates {
  kpis: BlockState;
  trilho: BlockState;
  vendaNecessaria: BlockState;
  projecao: BlockState;
  diagnostico: BlockState;
  mix: BlockState;
  lojas: BlockState;
}

export type TrackStatus = "no_trilho" | "atencao" | "abaixo" | "meta_batida" | "meta_nao_batida";

export interface TrackView {
  status: TrackStatus;
  /** Percentual do trilho (realizado ÷ meta × fração acumulada da curva), null em competência encerrada. */
  pctTrilho: number | null;
  competencia: string;
}

export interface RequiredSalesView {
  /** (faltaRestante × pesoHoje ÷ Σ pesosRestantes) − realizadoHoje */
  valor: number | null;
  realizadoHoje: number;
  faltaRestante: number;
  diasRestantes: number;
  diaReferencia: string;
  cumpridaHoje: boolean;
  metaMesAtingida: boolean;
  semMeta: boolean;
}

export interface GapView {
  exibir: boolean;
  efeitoFluxo: number;
  efeitoTicket: number;
  gapTotal: number;
  alavancaDominante: "fluxo" | "ticket" | null;
  semMeta: boolean;
}

export interface MixView {
  itens: { categoria: string; divisao: string; margem: number; receita: number; pct: number }[];
  periodo: string;
}

/** Linha da visão de grupo (LOJA-05): status do trilho por loja + se tem meta. */
export interface StoreSummaryView {
  filialId: string;
  nome: string;
  pctTrilho: number | null;
  status: TrackStatus;
  temMeta: boolean;
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const TIP_CMV = "Custo das mercadorias vendidas no período.";
const TIP_CMV_INDISPONIVEL = "O CMV não está disponível para este período.";
const TIP_LUCRO_BRUTO = "Valor que permanece após descontar do faturamento o CMV e os impostos considerados pela operação.";
const TIP_MARGEM = "Percentual do faturamento que permanece como lucro bruto após CMV e impostos.";
const DIA_SEMANA_PASSADO = [
  "o domingo passado",
  "a segunda-feira passada",
  "a terça-feira passada",
  "a quarta-feira passada",
  "a quinta-feira passada",
  "a sexta-feira passada",
  "o sábado passado",
];

/** Segunda-feira da semana ISO (PT-BR) que contém `hojeIso`. */
function inicioDaSemana(hojeIso: string): string {
  const d = deIso(hojeIso);
  const dow = d.getDay(); // 0=dom … 6=sáb
  const diff = dow === 0 ? -6 : 1 - dow;
  return somarDias(hojeIso, diff);
}

function inicioDoTrimestre(hojeIso: string): string {
  const d = deIso(hojeIso);
  const mes = Math.floor(d.getMonth() / 3) * 3; // 0,3,6,9
  return `${d.getFullYear()}-${String(mes + 1).padStart(2, "0")}-01`;
}

function inicioDoSemestre(hojeIso: string): string {
  const d = deIso(hojeIso);
  const mes = d.getMonth() < 6 ? 0 : 6;
  return `${d.getFullYear()}-${String(mes + 1).padStart(2, "0")}-01`;
}

export function resolvePeriod(p: Period, hojeIso: string = TODAY_ISO): ResolvedPeriod {
  const hojeD = deIso(hojeIso);
  const mesPassadoRef = new Date(hojeD.getFullYear(), hojeD.getMonth() - 1, 1);
  const mesPassadoIso = `${mesPassadoRef.getFullYear()}-${String(mesPassadoRef.getMonth() + 1).padStart(2, "0")}-01`;
  let inicio: string;
  let fim: string;
  switch (p.tipo) {
    case "hoje":
      inicio = fim = hojeIso;
      break;
    case "ontem":
      inicio = fim = somarDias(hojeIso, -1);
      break;
    case "7dias":
      inicio = somarDias(hojeIso, -6);
      fim = hojeIso;
      break;
    case "estaSemana":
      inicio = inicioDaSemana(hojeIso);
      fim = hojeIso;
      break;
    case "esteMes":
      inicio = inicioDoMes(hojeIso);
      fim = hojeIso;
      break;
    case "esteTrimestre":
      inicio = inicioDoTrimestre(hojeIso);
      fim = hojeIso;
      break;
    case "esteSemestre":
      inicio = inicioDoSemestre(hojeIso);
      fim = hojeIso;
      break;
    case "esteAno":
      inicio = `${hojeD.getFullYear()}-01-01`;
      fim = hojeIso;
      break;
    case "mesPassado":
      inicio = mesPassadoIso;
      fim = fimDoMes(mesPassadoIso);
      break;
    case "personalizado":
      inicio = p.inicio ?? somarDias(hojeIso, -6);
      fim = p.fim ?? hojeIso;
      if (fim > hojeIso) fim = hojeIso;
      if (inicio > fim) inicio = fim;
      break;
  }
  const dias = intervaloDias(inicio, fim).length;
  const atravessaMeses = inicio.slice(0, 7) !== fim.slice(0, 7);
  const granularidade: Granularity =
    dias === 1 ? "dia" : p.tipo === "esteMes" || p.tipo === "mesPassado" ? "mes" : "periodo";
  const ehHoje = inicio === hojeIso && fim === hojeIso;
  const terminaHoje = fim === hojeIso;
  const mesAberto = granularidade === "mes" && !atravessaMeses && inicio.slice(0, 7) === hojeIso.slice(0, 7);

  let rotulo: string;
  if (
    p.tipo !== "personalizado" &&
    p.tipo !== "7dias" &&
    p.tipo !== "esteMes" &&
    p.tipo !== "mesPassado"
  ) {
    rotulo = periodLabels[p.tipo];
  } else if (granularidade === "dia") rotulo = ehHoje ? "Hoje" : dataCurta(inicio);
  else if (p.tipo === "esteMes" || p.tipo === "mesPassado") rotulo = mesAno(inicio);
  else rotulo = `${dataCurta(inicio)} a ${dataCurta(fim)}`;

  return { tipo: p.tipo, inicio, fim, granularidade, atravessaMeses, ehHoje, terminaHoje, mesAberto, rotulo };
}

/* ---------- Tipos dos blocos ---------- */

export interface SystemAlert {
  id: string;
  texto: string;
  tom: "warning" | "danger" | "info";
}

/** Um indicador do topo, no formato do KpiTile do template. */
export interface KpiValor {
  valor: string;
  delta?: { value: string; positive: boolean; /** Rótulo curto da base, ex.: "ago" / "Segunda passada" */ vs?: string };
  /** Série curta para o traço de tendência. Só o Faturamento usa. */
  serie?: number[];
  /** Só o Faturamento sobrescreve rótulo e subtítulo — os outros usam o texto fixo do componente. */
  rotulo?: string;
  sub?: string;
}

/** Segundo tile da fileira: Meta do mês (dia), Projeção (mês) ou Participação da marca (recorte por marca). Mesmo lugar, papel diferente conforme o contexto. */
export interface GoalProjectionTile {
  tipo: "meta" | "projecao" | "participacao" | "indisponivel";
  rotulo: string;
  valorPrincipal: string;
  barraPct: number;
  detalhe: string;
}

/** Card lateral da rede: só enquanto a meta está em jogo (não fechada, não batida antes da hora). */
export interface RitmoCard {
  realizadoDia: string;
  necessarioDia: string;
  projecaoLinha: string;
  /** Projeção sobre meta, 0-100, pra desenhar a barra. */
  barraPct: number;
}

export interface RulerRow {
  filialId: string;
  nome: string;
  faturamento: string;
  faturamentoValor: number;
  atingimentoPct: number;
  /** Já inclui o sufixo pronto: "42% da meta" ou "23% da marca". */
  atingimentoTexto: string;
  barraPct: number;
  /** Cor de identidade da loja, estável independente da ordenação por desempenho. */
  tint: TintKey;
  variacaoDia: { value: string; positive: boolean } | null;
  variacaoDiaValor: number | null;
}

/** Loja fora do ritmo da própria meta: quem precisa de atenção, não quem vendeu mais. */
export interface AttentionPoint {
  filialId: string;
  nome: string;
  atingimentoTexto: string;
  status: string;
  faltaPorDia: string;
  veredito: "nao_atinge" | "incerto";
}

export interface HourChart {
  horas: number[];
  valores: number[];
  /** Mesmo dia da semana anterior (semana passada), alinhado por hora — AD-048. */
  anterior: number[] | null;
  rotuloAnterior: string;
  horaAtual: number | null;
}

/** Por hora, empilhado por loja — só na rede, período de um dia. Acima de 5 lojas, colapsa: uma cor só, soma simples. */
export interface NetworkHourChart {
  horas: number[];
  series: { filialId: string; nome: string; tint: TintKey; valores: number[] }[];
  horaAtual: number | null;
  colapsado: boolean;
}

export interface EvolutionChart {
  rotulos: string[];
  valores: number[];
  anterior: number[] | null;
  rotuloAnterior: string;
}

export interface ProfitItem {
  rotulo: string;
  valor: string;
  pct: string;
}

export interface CategoryRow {
  categoriaId: number;
  nome: string;
  receita: string;
  margem: string;
  margemPct: string;
  /** Relativa à maior margem em R$ do grupo — pra desenhar a barra da lista. */
  barraPct: number;
}

export interface GroupRow {
  id: string;
  nome: string;
  horario: string;
  estado: "encerrado" | "andamento" | "naoComecou";
  feitas: number;
  total: number;
  tarefas: { titulo: string; feita: boolean }[];
}

/** Checklist do dia: um grupo por linha, cada um com o próprio estado e lista de tarefas. */
export interface DayChecklist {
  dataTexto: string;
  grupos: GroupRow[];
}

export interface ProjectionView {
  valor: number | null;
  disponivel: boolean;
  encerrada: boolean;
  /** Índice de desempenho da competência (realizado ÷ meta acumulada), usado para escalar a curva restante. */
  indice: number | null;
  /** Meta mensal em R$ — para a UI desenhar a barra sem duplicar o pct (AD-029). */
  metaValor: number;
}

/** Período com agregados consolidados para a comparação única (LOJA-06 AC 1-3). */
export interface PeriodAggregateComparison {
  inicio: string;
  fim: string;
  faturamento: number;
  atendimentos: number;
  itens: number;
}

export interface ComparisonView {
  atual: PeriodAggregateComparison;
  anterior: PeriodAggregateComparison;
  rotuloAtual: string;
  rotuloAnterior: string;
}

export interface StoreView {
  escopo: Scope;
  periodo: ResolvedPeriod;
  atualizadoAs: string;
  proximoSyncMin: number;
  visao: "rede" | "dia" | "periodo";
  alertas: SystemAlert[];
  leitura: string | null;
  avisos: string[];
  comparacao: ComparisonView | null;
  trilho: TrackView | null;
  vendaNecessaria: RequiredSalesView | null;
  projecao: ProjectionView | null;
  diagnostico: GapView | null;
  mix: MixView | null;
  lojas: StoreSummaryView[];
  estados: StoreBlockStates;
  kpiFaturamento: KpiValor;
  kpiTicket: KpiValor;
  kpiPA: KpiValor;
  kpiAtendimentos: KpiValor;
  tileMeta: GoalProjectionTile | null;
  ritmo: RitmoCard | null;
  ritmoAviso: string | null;
  regua: RulerRow[] | null;
  /** Título da régua: "Desempenho das lojas" (rede) ou "Desempenho da loja" (uma loja). */
  reguaTitulo: string;
  pontosAtencao: AttentionPoint[] | null;
  graficoHora: HourChart | null;
  graficoHoraRede: NetworkHourChart | null;
  evolucao: EvolutionChart | null;
  checklist: DayChecklist | null;
  lucroBruto: { itens: ProfitItem[]; aviso: string; divisaoLinha: string | null } | null;
  categorias: CategoryRow[] | null;
}

/* ---------- Helpers ---------- */

function storesInScope(escopo: Scope): Store[] {
  // Array vazio = "Todas as lojas" → consolida a rede (ERP hidratado, sem misturar mock).
  const catalog = productStores();
  return escopo.filialIds.length === 0
    ? catalog
    : catalog.filter((f) => escopo.filialIds.includes(f.id));
}

/** `horaMax` recorta só o último dia (`fim`) — dia equivalente ao "hoje" em andamento. */
function agregadoPeriodo(f: Store, inicio: string, fim: string, divisao: Division | null, horaMax?: number): Aggregate {
  return sumAggregates(salesDays(f.id, inicio, fim).map((d) => dayAggregate(d, divisao, d.data === fim ? horaMax : undefined)));
}

function divSeguro(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function pctDelta(atual: number, anterior: number): number {
  if (anterior === 0) return 0;
  return ((atual - anterior) / anterior) * 100;
}

/** Delta pronto para o KpiTile do template: sem sinal no texto, a seta já indica. */
export function kpiDelta(atual: number, anterior: number, vs?: string, monetario = true): { value: string; positive: boolean; vs?: string; diff?: string; anterior?: string } | undefined {
  if (anterior <= 0) return undefined;
  const v = pctDelta(atual, anterior);
  const casas = Math.abs(v) < 10 ? 1 : 0;
  if (num(Math.abs(v), casas) === num(0, casas)) return undefined;
  const diferenca = Math.abs(atual - anterior);
  return {
    value: fmtDelta(v, casas).replace(/^[+−]/, ""),
    positive: v >= 0,
    ...(vs ? { vs } : {}),
    ...(monetario && diferenca > 0 ? { diff: brl(diferenca) } : {}),
    // Valor do período comparado (tooltip do badge).
    anterior: monetario ? brlCent(anterior) : num(anterior, Number.isInteger(anterior) ? 0 : 2),
  };
}

/** Delta em pontos percentuais (margem etc.). Omite ~0 p.p. — mesmo critério do kpiDelta. */
export function kpiDeltaPp(atual: number, anterior: number, vs?: string): { value: string; positive: boolean; vs?: string; anterior?: string } | undefined {
  const diff = Math.abs(atual - anterior);
  if (num(diff, 1) === num(0, 1)) return undefined;
  return {
    value: `${num(diff, 1)} p.p.`,
    positive: atual >= anterior,
    ...(vs ? { vs } : {}),
    anterior: `${num(anterior, 1)}%`,
  };
}

/** Dias com loja aberta que ainda restam no mês corrente. */
function diasRestantesMes(fs: Store[]): number {
  return intervaloDias(somarDias(TODAY_ISO, 1), fimDoMes(TODAY_ISO)).filter((iso) => fs.some((f) => storeOpen(f, iso))).length;
}

/**
 * Série curta de faturamento para o traço de tendência do KPI: por hora
 * quando o período é um dia só (truncada na hora atual, sem horas futuras
 * zeradas que pareceriam queda), por dia nos demais períodos. Serve rede,
 * loja e mês com a mesma função, porque soma sobre `fs`.
 */
function serieTendenciaAgregada(fs: Store[], periodo: ResolvedPeriod, divisao: Division | null): Aggregate[] {
  if (periodo.granularidade === "dia") {
    const abertura = Math.min(...fs.map((f) => f.abertura));
    const fechamento = Math.max(...fs.map((f) => f.fechamento));
    const horas: number[] = [];
    for (let h = abertura; h < fechamento; h++) horas.push(h);
    let pontos = horas.map((h) =>
      fs.reduce(
        (soma, f) => {
          const dia = salesDay(f.id, periodo.inicio);
          const a = dia?.porHora[h];
          if (!a) return soma;
          if (!divisao) return { faturamento: soma.faturamento + a.faturamento, atendimentos: soma.atendimentos + a.atendimentos, itens: soma.itens + a.itens };
          const fr = dia!.total.faturamento > 0 ? dia!.porDivisao[divisao].faturamento / dia!.total.faturamento : 0;
          return { faturamento: soma.faturamento + Math.round(a.faturamento * fr), atendimentos: soma.atendimentos + Math.round(a.atendimentos * fr), itens: soma.itens + Math.round(a.itens * fr) };
        },
        { faturamento: 0, atendimentos: 0, itens: 0 },
      ),
    );
    if (periodo.ehHoje) {
      const idx = horas.indexOf(CURRENT_HOUR);
      if (idx >= 0) pontos = pontos.slice(0, idx + 1);
    }
    return pontos;
  }
  const dias = intervaloDias(periodo.inicio, periodo.fim);
  return dias.map((iso) => sumAggregates(fs.map((f) => dayAggregate(salesDay(f.id, iso)!, divisao))));
}

/** Uma série por métrica, derivada dos mesmos pontos (por hora no dia, por dia nos demais períodos). */
function seriesTendencia(fs: Store[], periodo: ResolvedPeriod, divisao: Division | null): { faturamento?: number[]; ticket?: number[]; pa?: number[]; atendimentos?: number[] } {
  const pontos = serieTendenciaAgregada(fs, periodo, divisao);
  if (pontos.length < 2) return {};
  return {
    faturamento: pontos.map((p) => p.faturamento),
    ticket: pontos.map((p) => divSeguro(p.faturamento, p.atendimentos)),
    pa: pontos.map((p) => divSeguro(p.itens, p.atendimentos)),
    atendimentos: pontos.map((p) => p.atendimentos),
  };
}

/** Expectativa para um dia: média do mesmo dia da semana nas 4 semanas anteriores. */
function esperadoDia(f: Store, iso: string, divisao: Division | null): number {
  if (!storeOpen(f, iso)) return 0;
  let soma = 0;
  let n = 0;
  for (let k = 1; k <= 4; k++) {
    const ref = somarDias(iso, -7 * k);
    const d = salesDay(f.id, ref);
    if (d && ref !== TODAY_ISO) {
      soma += dayAggregate(d, divisao).faturamento;
      n++;
    }
  }
  return n ? soma / n : 0;
}

/** R$ 85,3k — valor curto, pra não quebrar componente. R$ 1,2M a partir de 1 milhão. Abaixo de R$ 10.000, valor cheio — R$ 3.022, não R$ 3k, que esconderia precisão que cabe na tela. Sem ",0" à toa: só mostra casa decimal quando ela diz algo (283k, não 283,0k). */
/** Formata número inteiro com separador de milhar (ex.: 5778 → "5.778"). */
export function num(v: number, casas?: number): string {
  if (casas !== undefined) return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return Math.round(v).toLocaleString("pt-BR");
}

export function brlK(v: number): string {
  const abs = Math.abs(v);
  const compacto = (dividido: number) => dividido.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `R$ ${compacto(v / 1_000_000)}M`;
  if (abs >= 10_000) return `R$ ${compacto(v / 1000)}k`;
  return brl(v);
}


interface MetaCalculada {
  valor: number;
  realizado: number;
  atingimentoPct: number;
  necessarioDia: number | null;
  diasRestantes: number;
  diaDoMes: number;
  diasNoMes: number;
  projecao: number | null;
  pessimista: number | null;
  otimista: number | null;
  veredito: "atinge" | "incerto" | "nao_atinge" | null;
  fechada: boolean;
}

/** Meta do mês. Sempre mensal, mesmo quando o período exibido é diferente. */
function calcularMeta(fs: Store[], competencia: string): MetaCalculada | null {
  const metasFs = fs.map((f) => goalOfStore(f.id, competencia)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  if (metasFs.length === 0) return null;

  const primeiroDia = `${competencia}-01`;
  const ultimoDia = fimDoMes(primeiroDia);
  const fechada = ultimoDia < TODAY_ISO;
  const fimReal = fechada ? ultimoDia : TODAY_ISO;

  const valor = metasFs.reduce((s, m) => s + m.valorLoja, 0);
  const realizado = fs.reduce((s, f) => s + agregadoPeriodo(f, primeiroDia, fimReal, null).faturamento, 0);
  const diasRestantes = fechada ? 0 : diasRestantesMes(fs);
  const necessarioDia = fechada || diasRestantes === 0 || realizado >= valor ? null : (valor - realizado) / diasRestantes;
  const atingimentoPct = divSeguro(realizado, valor) * 100;

  // Projeção só a partir do dia 7: cinco dias não projetam trinta.
  const diaDoMes = deIso(fechada ? ultimoDia : TODAY_ISO).getDate();
  let projecao: number | null = null;
  let pessimista: number | null = null;
  let otimista: number | null = null;
  let veredito: MetaCalculada["veredito"] = null;

  if (fechada) {
    veredito = atingimentoPct >= 100 ? "atinge" : "nao_atinge";
  } else if (diaDoMes >= 7) {
    let futuro = 0;
    for (const iso of intervaloDias(somarDias(TODAY_ISO, 1), ultimoDia)) {
      for (const f of fs) futuro += esperadoDia(f, iso, null);
    }
    let restoHoje = 0;
    for (const f of fs) {
      const feito = dayAggregate(salesDay(f.id, TODAY_ISO)!, null).faturamento;
      restoHoje += Math.max(0, esperadoDia(f, TODAY_ISO, null) - feito);
    }
    // A faixa se estreita conforme o mês avança: menos dias por vir, menos incerteza.
    const fracaoRestante = divSeguro(futuro + restoHoje, realizado + futuro + restoHoje);
    const amplitude = 0.06 + 0.22 * fracaoRestante;
    projecao = realizado + futuro + restoHoje;
    pessimista = realizado + (futuro + restoHoje) * (1 - amplitude);
    otimista = realizado + (futuro + restoHoje) * (1 + amplitude);
    veredito = pessimista >= valor ? "atinge" : otimista < valor ? "nao_atinge" : "incerto";
  }

  return { valor, realizado, atingimentoPct, necessarioDia, diasRestantes, diaDoMes, diasNoMes: deIso(ultimoDia).getDate(), projecao, pessimista, otimista, veredito, fechada };
}

/** "abaixo do ritmo" / "no ritmo" / "acima do ritmo": realizado por dia contra o necessário por dia, a mesma conta em todo lugar que fala de ritmo. */
function statusRitmo(m: MetaCalculada): string {
  const emJogo = m.necessarioDia !== null;
  const ritmoDiario = m.diaDoMes > 0 ? m.realizado / m.diaDoMes : 0;
  if (m.fechada) return m.atingimentoPct >= 100 ? "meta batida" : "meta não batida";
  if (!emJogo) return "meta batida";
  if (ritmoDiario >= m.necessarioDia! * 1.05) return "acima do ritmo";
  if (ritmoDiario >= m.necessarioDia!) return "no ritmo";
  return "abaixo do ritmo";
}

/** Período anterior comparável, com o rótulo que a tela exibe. */
/**
 * Período anterior equivalente. Se o período atual termina hoje, `horaMax` vale só para o último
 * dia (`fim`) do anterior — o dia equivalente entra até a hora atual, os demais inteiros.
 */
export function previousPeriod(
  periodo: ResolvedPeriod,
  horaAtual: number = CURRENT_HOUR,
): { inicio: string; fim: string; rotulo: string; horaMax?: number } {
  const horaMax = periodo.terminaHoje ? horaAtual : undefined;
  if (periodo.granularidade === "dia") {
    const ref = somarDias(periodo.inicio, -7);
    return { inicio: ref, fim: ref, rotulo: DIA_SEMANA_PASSADO[deIso(ref).getDay()], horaMax };
  }
  if (periodo.granularidade === "mes") {
    const ini = deIso(periodo.inicio);
    const mesAnt = new Date(ini.getFullYear(), ini.getMonth() - 1, 1);
    const inicio = `${mesAnt.getFullYear()}-${String(mesAnt.getMonth() + 1).padStart(2, "0")}-01`;
    const fim = periodo.mesAberto ? somarDias(inicio, deIso(periodo.fim).getDate() - 1) : fimDoMes(inicio);
    return { inicio, fim, rotulo: "o mês passado", horaMax: periodo.mesAberto ? horaMax : undefined };
  }
  if (periodo.tipo === "estaSemana") {
    return { inicio: somarDias(periodo.inicio, -7), fim: somarDias(periodo.fim, -7), rotulo: "a semana passada", horaMax };
  }
  const n = intervaloDias(periodo.inicio, periodo.fim).length;
  const fim = somarDias(periodo.inicio, -1);
  return { inicio: somarDias(fim, -(n - 1)), fim, rotulo: `os ${n} dias anteriores`, horaMax };
}

/** "15/09/2026" para um único dia, "01/09/2026 – 07/09/2026" para um intervalo. */
function formatarIntervalo(inicio: string, fim: string): string {
  return inicio === fim ? dataCompleta(inicio) : `${dataCompleta(inicio)} – ${dataCompleta(fim)}`;
}

interface CustoAgregado {
  cmv: number;
  porCategoria: Record<number, { faturamento: number; cmv: number }>;
}

function custoPeriodo(fs: Store[], inicio: string, fim: string, divisao: Division | null): CustoAgregado {
  const out: CustoAgregado = { cmv: 0, porCategoria: {} };
  for (const f of fs) {
    for (const d of salesDays(f.id, inicio, fim)) {
      for (const [id, c] of Object.entries(d.porCategoria)) {
        const cat = categorias.find((x) => x.id === Number(id));
        if (!cat || (divisao && cat.divisao !== divisao)) continue;
        const acc = (out.porCategoria[cat.id] ??= { faturamento: 0, cmv: 0 });
        acc.faturamento += c.faturamento;
        acc.cmv += c.cmv;
        out.cmv += c.cmv;
      }
    }
  }
  return out;
}

/** Alertas de sistema: aparecem acima de tudo e somem quando resolvem. */
function montarAlertas(fs: Store[]): SystemAlert[] {
  const alertas: SystemAlert[] = [];
  const minutosSemSync = Math.floor((NOW.getTime() - LAST_SYNC.getTime()) / 60000);
  if (minutosSemSync > 60) {
    const h = Math.floor(minutosSemSync / 60);
    alertas.push({ id: "sync", tom: "warning", texto: `Dados de ${UPDATED_AT}. Sync não roda há ${h}h${String(minutosSemSync % 60).padStart(2, "0")}.` });
  }
  for (const f of fs.filter((x) => x.id === "f2")) {
    alertas.push({ id: `nota-${f.id}`, tom: "info", texto: `${f.fantasia} tem 8 produtos com nota de entrada pendente.` });
  }
  return alertas;
}

/* ---------- Motor de trilho ---------- */

/** Curva de pesos normalizados: `peso(iso)` soma 1 nos dias abertos; `pesoBruto` é o valor pré-normalização. */
export interface RevenueCurve {
  peso: (iso: string) => number;
  pesoBruto: (iso: string) => number;
  soma: number;
}

/**
 * curvaReceita (AD-034): pesos diários normalizados (soma = 1 nos dias abertos)
 * derivados do histórico real de faturamento — média simples das quatro
 * ocorrências equivalentes anteriores do mesmo dia da semana; menos ocorrências
 * usa o que houver; nenhuma usa `pesoDia` como base.
 */
export function revenueCurve(fs: Store[], competencia: string): RevenueCurve {
  const primeiroDia = `${competencia}-01`;
  const ultimoDia = fimDoMes(primeiroDia);
  const pesos = new Map<string, number>();
  let soma = 0;
  for (const iso of intervaloDias(primeiroDia, ultimoDia)) {
    let bruto = 0;
    let abertas = 0;
    for (const f of fs) {
      if (!storeOpen(f, iso)) continue;
      const ocas = ocorrenciasAnteriores(f, iso, 4);
      bruto += ocas.length > 0 ? ocas.reduce((s, d) => s + d.total.faturamento, 0) / ocas.length : dayWeight(f, iso);
      abertas++;
    }
    if (abertas === 0) continue; // nenhuma loja abre nesse dia
    pesos.set(iso, bruto);
    soma += bruto;
  }
  return {
    soma,
    peso: (iso: string) => (soma > 0 ? (pesos.get(iso) ?? 0) / soma : 0),
    pesoBruto: (iso: string) => pesos.get(iso) ?? 0,
  };
}

/** As últimas `n` ocorrências anteriores do mesmo dia da semana, com loja aberta (AD-034). */
function ocorrenciasAnteriores(f: Store, iso: string, n: number): DiaVendasVendas[] {
  const out: DiaVendasVendas[] = [];
  for (let i = 7; out.length < n && i <= 28; i += 7) {
    const ref = somarDias(iso, -i);
    const d = salesDay(f.id, ref);
    // Só contam ocorrências com loja aberta e registro no histórico (undefined antes do início).
    if (d && storeOpen(f, ref)) out.push(d);
  }
  return out;
}

/** Tipo mínimo de DiaVendas usado pelas curvas. */
interface DiaVendasVendas {
  data: string;
  total: { faturamento: number; atendimentos: number };
}

/** Meta acumulada esperada até hoje: meta mensal × fração acumulada da curvaReceita (LOJA-01 AC 2-7). */
function metaAcumuladaAteHoje(fs: Store[], competencia: string, metaValor: number, hojeIso: string): number {
  const curva = revenueCurve(fs, competencia);
  const primeiroDia = `${competencia}-01`;
  let fração = 0;
  for (const iso of intervaloDias(primeiroDia, hojeIso)) fração += curva.peso(iso);
  return metaValor * fração;
}

/** Status do trilho do mês (LOJA-01). */
function calcularTrilho(fs: Store[], competencia: string): TrackView | null {
  const metasFs = fs.map((f) => goalOfStore(f.id, competencia)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  if (metasFs.length === 0) return null;
  const valor = metasFs.reduce((s, m) => s + m.valorLoja, 0);

  const primeiroDia = `${competencia}-01`;
  const ultimoDia = fimDoMes(primeiroDia);
  const fechada = ultimoDia < TODAY_ISO;
  const fimReal = fechada ? ultimoDia : TODAY_ISO;
  const realizado = fs.reduce((s, f) => s + agregadoPeriodo(f, primeiroDia, fimReal, null).faturamento, 0);

  const metaAcum = metaAcumuladaAteHoje(fs, competencia, valor, fimReal);

  let status: TrackStatus;
  let pctTrilho: number | null;
  if (fechada) {
    status = realizado >= valor ? "meta_batida" : "meta_nao_batida";
    pctTrilho = null;
  } else {
    const pct = metaAcum > 0 ? (realizado / metaAcum) * 100 : 0;
    pctTrilho = pct;
    status = pct >= 98 ? "no_trilho" : pct >= 90 ? "atencao" : "abaixo";
  }
  return { status, pctTrilho, competencia };
}

/** Venda necessária hoje (LOJA-02): (falta × pesoHoje ÷ Σ pesos restantes) − realizadoHoje. */
function vendaNecessariaHoje(fs: Store[], competencia: string): RequiredSalesView | null {
  const metasFs = fs.map((f) => goalOfStore(f.id, competencia)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  if (metasFs.length === 0) return { valor: null, realizadoHoje: 0, faltaRestante: 0, diasRestantes: 0, diaReferencia: TODAY_ISO, cumpridaHoje: false, metaMesAtingida: false, semMeta: true };

  const valor = metasFs.reduce((s, m) => s + m.valorLoja, 0);
  const primeiroDia = `${competencia}-01`;
  const ultimoDia = fimDoMes(primeiroDia);
  const fechada = ultimoDia < TODAY_ISO;
  const fimReal = fechada ? ultimoDia : TODAY_ISO;
  const realizado = fs.reduce((s, f) => s + agregadoPeriodo(f, primeiroDia, fimReal, null).faturamento, 0);
  if (fechada) return null;

  const realizadoHoje = fs.reduce((s, f) => s + (salesDay(f.id, TODAY_ISO) ? dayAggregate(salesDay(f.id, TODAY_ISO)!, null).faturamento : 0), 0);
  const faltaRestante = valor - realizado;
  const curva = revenueCurve(fs, competencia);
  const abertosRestantes = intervaloDias(TODAY_ISO, ultimoDia).filter((iso) => fs.some((f) => storeOpen(f, iso)));
  if (abertosRestantes.length === 0) return null;

  // Dia de referência: hoje se aberto, senão o próximo dia aberto (LOJA-02 AC 5).
  const diaRef = fs.some((f) => storeOpen(f, TODAY_ISO)) ? TODAY_ISO : abertosRestantes[0];
  const pesoHoje = curva.peso(diaRef);
  const somaPesosRest = abertosRestantes.reduce((s, iso) => s + curva.peso(iso), 0);
  const faltaRestanteRef = valor - realizado; // gap absoluto no mês (sem descontar a projeção futura)
  const necessarioBruto = somaPesosRest > 0 ? (faltaRestanteRef * pesoHoje) / somaPesosRest : 0;
  const valorHoje = Math.max(0, necessarioBruto - (diaRef === TODAY_ISO ? realizadoHoje : 0));

  return {
    valor: valorHoje,
    realizadoHoje,
    faltaRestante,
    diasRestantes: abertosRestantes.length,
    diaReferencia: diaRef,
    cumpridaHoje: valorHoje === 0 && realizado > 0,
    metaMesAtingida: realizado >= valor,
    semMeta: false,
  };
}

/** Projeção de fechamento (LOJA-03): índice da competência × curva restante, com gate do dia 7. */
function calcularProjecao(fs: Store[], competencia: string): ProjectionView {
  const metasFs = fs.map((f) => goalOfStore(f.id, competencia)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  const valor = metasFs.reduce((s, m) => s + m.valorLoja, 0);
  if (metasFs.length === 0) return { valor: null, disponivel: false, encerrada: false, indice: null, metaValor: 0 };

  const primeiroDia = `${competencia}-01`;
  const ultimoDia = fimDoMes(primeiroDia);
  const fechada = ultimoDia < TODAY_ISO;
  const fimReal = fechada ? ultimoDia : TODAY_ISO;
  const realizado = fs.reduce((s, f) => s + agregadoPeriodo(f, primeiroDia, fimReal, null).faturamento, 0);

  if (fechada) return { valor: realizado, disponivel: false, encerrada: true, indice: null, metaValor: valor };

  const diaDoMes = deIso(fimReal).getDate();
  if (diaDoMes < 7) return { valor: null, disponivel: false, encerrada: false, indice: null, metaValor: valor };

  const metaAcum = metaAcumuladaAteHoje(fs, competencia, valor, fimReal);
  const indice = metaAcum > 0 ? realizado / metaAcum : 0;
  const fracaoRestante = 1 - metaAcumuladaAteHoje(fs, competencia, 1, fimReal);
  const projecao = realizado + valor * fracaoRestante * indice;
  return { valor: projecao, disponivel: true, encerrada: false, indice, metaValor: valor };
}

/** curvaAtendimentos (AD-034): pesos diários normalizados a partir do histórico de atendimentos. */
function curvaAtendimentos(fs: Store[], competencia: string): RevenueCurve {
  const primeiroDia = `${competencia}-01`;
  const ultimoDia = fimDoMes(primeiroDia);
  const pesos = new Map<string, number>();
  let soma = 0;
  for (const iso of intervaloDias(primeiroDia, ultimoDia)) {
    let bruto = 0;
    let abertas = 0;
    for (const f of fs) {
      if (!storeOpen(f, iso)) continue;
      const ocas = ocorrenciasAnteriores(f, iso, 4);
      bruto += ocas.length > 0 ? ocas.reduce((s, d) => s + d.total.atendimentos, 0) / ocas.length : dayWeight(f, iso);
      abertas++;
    }
    if (abertas === 0) continue;
    pesos.set(iso, bruto);
    soma += bruto;
  }
  return {
    soma,
    peso: (iso: string) => (soma > 0 ? (pesos.get(iso) ?? 0) / soma : 0),
    pesoBruto: (iso: string) => pesos.get(iso) ?? 0,
  };
}

/** Diagnóstica a lacuna de receita entre fluxo e ticket (LOJA-04 AC 1-9). */
function calcularLacuna(fs: Store[], competencia: string, pctTrilho: number | null): GapView {
  const metasFs = fs.map((f) => goalOfStore(f.id, competencia)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  if (metasFs.length === 0) return { exibir: false, efeitoFluxo: 0, efeitoTicket: 0, gapTotal: 0, alavancaDominante: null, semMeta: true };

  const meta = metasFs.reduce((s, m) => s + m.valorLoja, 0);
  const primeiroDia = `${competencia}-01`;
  const ultimoDia = fimDoMes(primeiroDia);
  const fechada = ultimoDia < TODAY_ISO;
  const fimReal = fechada ? ultimoDia : TODAY_ISO;

  // Atendimentos esperados no mês: soma da curvaAtendimentos (peso normalizado × faturamento? Não—
  // é o total esperado de atendimentos do mês). O total esperado = (média diária × dias abertos).
  const cA = curvaAtendimentos(fs, competencia);
  const cR = revenueCurve(fs, competencia);
  // Total esperado do mês = soma dos pesos brutos de atendimentos (cada dia = média de 4 semanas).
  const totalEsperadoMes = cA.soma; // soma dos pesos brutos = média diária × nº dias — já é n atendimentos esperados.
  const ticketMeta = totalEsperadoMes > 0 ? meta / totalEsperadoMes : 0;

  // Atendimentos esperados até hoje = total mensal × fração acumulada da curvaReceita.
  const fracaoAcumReceita = intervaloDias(primeiroDia, fimReal).reduce((s, iso) => s + cR.peso(iso), 0);
  const atendimentosEsperadosAteHoje = totalEsperadoMes * fracaoAcumReceita;

  // Atendimentos realizados até hoje.
  const atendimentosRealizadosAteHoje = fs.reduce((s, f) => s + agregadoPeriodo(f, primeiroDia, fimReal, null).atendimentos, 0);

  // Ticket realizado até hoje.
  const realizadoReceita = fs.reduce((s, f) => s + agregadoPeriodo(f, primeiroDia, fimReal, null).faturamento, 0);
  const ticketRealAteHoje = atendimentosRealizadosAteHoje > 0 ? realizadoReceita / atendimentosRealizadosAteHoje : 0;

  // Efeitos (LOJA-04 AC 5-6); interação já contida no efeito fluxo.
  const efeitoFluxo = (atendimentosEsperadosAteHoje - atendimentosRealizadosAteHoje) * ticketMeta;
  const efeitoTicket = (ticketMeta - ticketRealAteHoje) * atendimentosRealizadosAteHoje;
  const gapTotal = meta * fracaoAcumReceita - realizadoReceita;

  // Alavanca dominante (AC 8-9): apenas efeitos positivos; maior ≥ 60% da soma dos positivos.
  const positivos = [efeitoFluxo, efeitoTicket].filter((e) => e > 0);
  const somaPositivos = positivos.reduce((s, e) => s + e, 0);
  let alavancaDominante: GapView["alavancaDominante"] = null;
  if (somaPositivos > 0 && positivos.length > 0) {
    const maior = Math.max(...positivos);
    if (maior >= 0.6 * somaPositivos) alavancaDominante = efeitoFluxo >= efeitoTicket ? "fluxo" : "ticket";
  }

  // Exibe apenas quando pctTrilho < 90 (AD-033).
  return {
    exibir: pctTrilho !== null && pctTrilho < 90,
    efeitoFluxo,
    efeitoTicket,
    gapTotal,
    alavancaDominante,
    semMeta: false,
  };
}

/** Mix do período/marca selecionados: participação por categoria com margem (LOJA-04 AC 10). */
function montarMix(fs: Store[], inicio: string, fim: string, divisao: Division | null, rotuloPeriodo: string): MixView {
  const catResumo = new Map<number, { receita: number; cmv: number }>();
  for (const f of fs) {
    for (const d of salesDays(f.id, inicio, fim)) {
      for (const [id, c] of Object.entries(d.porCategoria)) {
        const cat = categorias.find((x) => x.id === Number(id));
        if (!cat || (divisao && cat.divisao !== divisao)) continue;
        let acc = catResumo.get(cat.id);
        if (!acc) {
          acc = { receita: 0, cmv: 0 };
          catResumo.set(cat.id, acc);
        }
        acc.receita += c.faturamento;
        acc.cmv += c.cmv;
      }
    }
  }
  const total = [...catResumo.values()].reduce((s, c) => s + c.receita, 0);
  const itens = [...catResumo.entries()]
    .map(([id, c]) => {
      const cat = categorias.find((x) => x.id === id)!;
      const margem = c.receita - c.cmv;
      return { categoria: cat.nome, divisao: cat.divisao, margem, receita: c.receita, pct: total > 0 ? (c.receita / total) * 100 : 0 };
    })
    .sort((a, b) => b.receita - a.receita);
  return { itens, periodo: rotuloPeriodo };
}

/** Visão de grupo (LOJA-05): status do trilho por loja na competência. */
function montarLojasGrupo(fs: Store[], competencia: string): StoreSummaryView[] {
  return fs.map((f) => {
    const trilho = calcularTrilho([f], competencia);
    return {
      filialId: f.id,
      nome: f.fantasia,
      pctTrilho: trilho?.pctTrilho ?? null,
      status: trilho?.status ?? "abaixo",
      temMeta: Boolean(goalOfStore(f.id, competencia)),
    };
  });
}

export function buildStoreView(escopo: Scope): StoreView {
  const periodo = resolvePeriod(escopo.periodo);
  const fs = storesInScope(escopo);
  const divisao = escopo.divisao;
  const todas = escopo.filialIds.length === 0 || escopo.filialIds.length > 1;
  const unica = todas ? null : fs[0];
  const visao: StoreView["visao"] = todas ? "rede" : periodo.granularidade === "dia" ? "dia" : "periodo";

  const atual = sumAggregates(fs.map((f) => agregadoPeriodo(f, periodo.inicio, periodo.fim, divisao)));
  const ant = previousPeriod(periodo);
  const anterior = sumAggregates(fs.map((f) => agregadoPeriodo(f, ant.inicio, ant.fim, divisao, ant.horaMax)));

  const ticket = divSeguro(atual.faturamento, atual.atendimentos);
  const pa = divSeguro(atual.itens, atual.atendimentos);
  const ticketAnt = divSeguro(anterior.faturamento, anterior.atendimentos);
  const paAnt = divSeguro(anterior.itens, anterior.atendimentos);

  const temComparacao = anterior.atendimentos > 0;
  const vsRotulo = temComparacao ? ant.rotulo : undefined;
  const series = seriesTendencia(fs, periodo, divisao);
  const kpiTicket: KpiValor = { valor: brl(ticket), delta: temComparacao ? kpiDelta(ticket, ticketAnt, vsRotulo) : undefined, serie: series.ticket };
  const kpiPA: KpiValor = { valor: num(pa, 2), delta: temComparacao ? kpiDelta(pa, paAnt, vsRotulo, false) : undefined, serie: series.pa };

  // Meta é sempre mensal. Divisão ou período cruzando meses desligam.
  const competencia = periodo.granularidade === "mes" ? periodo.inicio.slice(0, 7) : TODAY_ISO.slice(0, 7);
  const semMetaPeriodo = periodo.atravessaMeses && periodo.granularidade !== "mes";
  const metaCalc = divisao || semMetaPeriodo ? null : calcularMeta(fs, competencia);

  // Subtítulos: cada KPI fala só do próprio indicador (AD-048).
  // Faturamento NÃO repete atendimentos nem “precisa R$/dia” (régua/meta cobrem ritmo).
  const nDiasPeriodo = intervaloDias(periodo.inicio, periodo.fim).length;
  let subFaturamento: string | undefined;
  if (!divisao && metaCalc) {
    if (metaCalc.atingimentoPct >= 100) subFaturamento = "meta do mês atingida";
    else if (periodo.granularidade === "mes") subFaturamento = `${pct(metaCalc.atingimentoPct)} da meta`;
    else subFaturamento = `${pct(metaCalc.atingimentoPct)} da meta do mês`;
  } else if (periodo.granularidade !== "dia" && nDiasPeriodo > 0) {
    subFaturamento = `média ${brlK(atual.faturamento / nDiasPeriodo)}/dia`;
  }

  const kpiAtendimentos: KpiValor = {
    valor: num(atual.atendimentos),
    delta: temComparacao ? kpiDelta(atual.atendimentos, anterior.atendimentos, vsRotulo, false) : undefined,
    serie: series.atendimentos,
    sub: periodo.granularidade !== "dia" && nDiasPeriodo > 0 ? `média ${num(atual.atendimentos / nDiasPeriodo, 0)}/dia` : undefined,
  };

  const kpiFaturamento: KpiValor = {
    valor: brlK(atual.faturamento),
    delta: temComparacao ? kpiDelta(atual.faturamento, anterior.faturamento, vsRotulo) : undefined,
    serie: series.faturamento,
    // O período já está no filtro logo acima do card; sem sufixo "· HOJE".
    // A marca selecionada continua no rótulo porque muda o dado.
    rotulo: `FATURAMENTO${divisao ? ` ${divisao}` : ""}`,
    sub: subFaturamento,
  };

  // Segundo tile: Participação da marca quando filtrado, Meta/Projeção quando não.
  let tileMeta: GoalProjectionTile | null = null;
  if (divisao) {
    const totalTudo = sumAggregates(fs.map((f) => agregadoPeriodo(f, periodo.inicio, periodo.fim, null))).faturamento;
    const participacaoPct = totalTudo > 0 ? (atual.faturamento / totalTudo) * 100 : 0;
    tileMeta = {
      tipo: "participacao",
      rotulo: "PARTICIPAÇÃO",
      valorPrincipal: pct(participacaoPct),
      barraPct: Math.min(100, participacaoPct),
      detalhe: `do faturamento da ${visao === "rede" ? "rede" : "loja"}`,
    };
  } else if (semMetaPeriodo) {
    tileMeta = { tipo: "indisponivel", rotulo: "META DO MÊS", valorPrincipal: "—", barraPct: 0, detalhe: "meta é mensal" };
  } else if (metaCalc) {
    if (periodo.granularidade === "mes") {
      if (!metaCalc.fechada && metaCalc.projecao === null) {
        tileMeta = { tipo: "projecao", rotulo: "PROJEÇÃO", valorPrincipal: "—", barraPct: 0, detalhe: "Projeção disponível a partir do dia 7" };
      } else {
        const valorFinal = metaCalc.fechada ? metaCalc.realizado : metaCalc.projecao!;
        const pctFinal = metaCalc.valor > 0 ? (valorFinal / metaCalc.valor) * 100 : 0;
        tileMeta = {
          tipo: "projecao",
          rotulo: "PROJEÇÃO",
          valorPrincipal: brlK(valorFinal),
          barraPct: Math.min(100, pctFinal),
          detalhe: `${pct(pctFinal)} da meta · ${statusRitmo(metaCalc)}`,
        };
      }
    } else {
      tileMeta = {
        tipo: "meta",
        rotulo: "META DO MÊS",
        valorPrincipal: pct(metaCalc.atingimentoPct),
        barraPct: Math.min(100, metaCalc.atingimentoPct),
        detalhe: `${brlK(metaCalc.realizado)} de ${brlK(metaCalc.valor)} · ${statusRitmo(metaCalc)}`,
      };
    }
  }

  // Ritmo da meta: aparece em qualquer visão (rede ou loja) sempre que houver
  // uma meta mensal aplicável — some só com marca filtrada ou período cruzando
  // meses (metaCalc já vem null nesses dois casos). Sem meta cadastrada, uma
  // linha de aviso no lugar do card. Mês fechado: "Projeção" vira "Fechou em".
  let ritmo: RitmoCard | null = null;
  let ritmoAviso: string | null = null;
  if (!divisao && !semMetaPeriodo) {
    if (!metaCalc) {
      ritmoAviso = `Sem meta cadastrada para ${mesAno(`${competencia}-01`).split(" de ")[0]}.`;
    } else {
      const ritmoDiario = metaCalc.diaDoMes > 0 ? metaCalc.realizado / metaCalc.diaDoMes : 0;
      const necessarioTexto = metaCalc.necessarioDia !== null ? brlK(metaCalc.necessarioDia) : metaCalc.atingimentoPct >= 100 ? "Meta batida" : "—";
      const barraPct = metaCalc.fechada
        ? Math.min(100, metaCalc.atingimentoPct)
        : metaCalc.projecao !== null && metaCalc.valor > 0
          ? Math.min(100, (metaCalc.projecao / metaCalc.valor) * 100)
          : 0;
      ritmo = {
        realizadoDia: brlK(ritmoDiario),
        necessarioDia: necessarioTexto,
        barraPct,
        projecaoLinha: metaCalc.fechada ? `Fechou em ${brlK(metaCalc.realizado)}` : metaCalc.projecao !== null ? `Projeção ${brlK(metaCalc.projecao)}` : "Projeção disponível a partir do dia 7",
      };
    }
  }

  const avisos: string[] = [];
  if (semMetaPeriodo) avisos.push("Meta e lucro bruto são mensais e não aparecem neste período.");
  if (divisao) avisos.push(`Marca ${divisao} selecionada. Meta e projeção são da loja inteira e não aparecem no recorte por marca.`);

  /* --- Régua de lojas e pontos de atenção --- */
  let regua: RulerRow[] | null = null;
  let pontosAtencao: AttentionPoint[] | null = null;
  let reguaTitulo: string = "Desempenho das lojas";
  // Sempre adaptamos ao filtro (AD-047): rede = uma linha por loja; loja única =
  // painel de meta (ou de participação da marca, se houver marca). Nunca some.
  if (visao === "rede" || unica) {
    const variacaoBadge = (v: number | null): { value: string; positive: boolean } | null => {
      if (v === null) return null;
      if (Math.abs(v) < 0.5) return { value: "=", positive: true };
      return { value: fmtDelta(v, Math.abs(v) < 10 ? 1 : 0).replace(/^[+−]/, ""), positive: v >= 0 };
    };
    const variacaoDoDia = (f: Store) => {
      const hojeF = dayAggregate(salesDay(f.id, TODAY_ISO)!, divisao).faturamento;
      const refIso = somarDias(TODAY_ISO, -7);
      const diaRef = salesDay(f.id, refIso);
      const refF = diaRef ? dayAggregate(diaRef, divisao, CURRENT_HOUR).faturamento : 0;
      return refF > 0 ? pctDelta(hojeF, refF) : null;
    };

    if (unica && divisao) {
      // Loja + marca: painel da participação da marca no faturamento da loja.
      const fatMarca = agregadoPeriodo(unica, periodo.inicio, periodo.fim, divisao).faturamento;
      const fatLoja = agregadoPeriodo(unica, periodo.inicio, periodo.fim, null).faturamento;
      const participacao = fatLoja > 0 ? (fatMarca / fatLoja) * 100 : 0;
      const indiceCor = stores.findIndex((x) => x.id === unica.id);
      reguaTitulo = `Desempenho · ${divisao === "WPINK" ? "Wpink" : "Wepink"}`;
      regua = [
        {
          filialId: unica.id,
          nome: unica.fantasia,
          faturamento: brlK(fatMarca),
          faturamentoValor: fatMarca,
          atingimentoPct: participacao,
          atingimentoTexto: `${pct(participacao)} da loja`,
          barraPct: Math.min(100, participacao),
          tint: PALETA_LOJAS[indiceCor % PALETA_LOJAS.length],
          variacaoDia: variacaoBadge(variacaoDoDia(unica)),
          variacaoDiaValor: variacaoDoDia(unica),
        },
      ];
      pontosAtencao = null;
    } else if (divisao) {
      // Rede + marca: a barra vira participação daquela loja no total da marca.
      const receitas = fs.map((f) => ({ f, receita: agregadoPeriodo(f, periodo.inicio, periodo.fim, divisao).faturamento }));
      const totalMarca = receitas.reduce((s, r) => s + r.receita, 0);
      regua = receitas
        .map(({ f, receita }) => {
          const participacao = totalMarca > 0 ? (receita / totalMarca) * 100 : 0;
          const indiceCor = stores.findIndex((x) => x.id === f.id);
          return { filialId: f.id, nome: f.fantasia, receita, participacao, tint: PALETA_LOJAS[indiceCor % PALETA_LOJAS.length], variacaoDiaValor: variacaoDoDia(f) };
        })
        .sort((a, b) => b.participacao - a.participacao)
        .map((b) => ({
          filialId: b.filialId,
          nome: b.nome,
          faturamento: brlK(b.receita),
          faturamentoValor: b.receita,
          atingimentoPct: b.participacao,
          atingimentoTexto: `${pct(b.participacao)} da marca`,
          barraPct: Math.min(100, b.participacao),
          tint: b.tint,
          variacaoDia: variacaoBadge(b.variacaoDiaValor),
          variacaoDiaValor: b.variacaoDiaValor,
        }));
      pontosAtencao = null;
    } else {
      // Título no singular quando o escopo tem uma loja só (painel de meta dela);
      // plural na rede. Não há variação de hoje nem ordenação na loja única.
      reguaTitulo = fs.length > 1 ? "Desempenho das lojas" : "Desempenho da loja";
      const base = fs.map((f) => {
        const m = calcularMeta([f], competencia);
        const atingimento = m?.atingimentoPct ?? 0;
        const indiceCor = stores.findIndex((x) => x.id === f.id);
        return { filialId: f.id, nome: f.fantasia, atingimento, tint: PALETA_LOJAS[indiceCor % PALETA_LOJAS.length], variacaoDiaValor: variacaoDoDia(f), m };
      });

      regua = [...base]
        .sort((a, b) => a.atingimento - b.atingimento)
        .map((b) => ({
          filialId: b.filialId,
          nome: b.nome,
          faturamento: brlK(b.m?.realizado ?? 0),
          faturamentoValor: b.m?.realizado ?? 0,
          atingimentoPct: b.atingimento,
          atingimentoTexto: `${pct(b.atingimento)} da meta`,
          barraPct: Math.min(100, b.atingimento),
          tint: b.tint,
          variacaoDia: variacaoBadge(b.variacaoDiaValor),
          variacaoDiaValor: b.variacaoDiaValor,
        }));

      // Ordenada por desempenho (régua), não por faturamento: quem está pior no
      // ritmo da própria meta aparece primeiro, seja loja grande ou pequena.
      pontosAtencao = base
        .filter((b) => b.m?.veredito === "nao_atinge" || b.m?.veredito === "incerto")
        .sort((a, b) => a.atingimento - b.atingimento)
        .map((b) => ({
          filialId: b.filialId,
          nome: b.nome,
          atingimentoTexto: pct(b.atingimento),
          status: statusRitmo(b.m!),
          faltaPorDia: b.m?.necessarioDia !== null && b.m?.necessarioDia !== undefined ? brlK(b.m.necessarioDia) : "Meta batida",
          veredito: b.m!.veredito as "nao_atinge" | "incerto",
        }));
    }
  }

  /* --- Por hora: loja única OU rede (soma) — mesmo gráfico AreaLine com comparação (AD-048) --- */
  let graficoHora: HourChart | null = null;
  if (periodo.granularidade === "dia" && fs.length > 0) {
    const refIso = somarDias(periodo.inicio, -7);
    const aberturaMin = Math.min(...fs.map((f) => f.abertura));
    const fechamentoMax = Math.max(...fs.map((f) => f.fechamento));
    const horas: number[] = [];
    for (let h = aberturaMin; h < fechamentoMax; h++) horas.push(h);

    const fatiaHora = (filialId: string, iso: string, h: number) => {
      const d = salesDay(filialId, iso);
      const a = d?.porHora[h];
      if (!a) return 0;
      if (!divisao) return a.faturamento;
      const fr = d!.total.faturamento > 0 ? d!.porDivisao[divisao].faturamento / d!.total.faturamento : 0;
      return Math.round(a.faturamento * fr);
    };
    const somaHora = (iso: string, h: number) => fs.reduce((s, f) => s + fatiaHora(f.id, iso, h), 0);

    const valores = horas.map((h) => somaHora(periodo.inicio, h));
    const valoresAnt = horas.map((h) => {
      if (periodo.ehHoje && h > CURRENT_HOUR) return 0;
      return somaHora(refIso, h);
    });
    const totalRef = valoresAnt.reduce((s, v) => s + v, 0);

    graficoHora = {
      horas,
      valores,
      anterior: totalRef > 0 ? valoresAnt : null,
      rotuloAnterior: `${DIAS_SEMANA[deIso(refIso).getDay()]} passada`,
      horaAtual: periodo.ehHoje ? CURRENT_HOUR : null,
    };
  }

  /* Rede por loja empilhada: não usada na Visão geral — o gráfico principal unificou em AreaLine (AD-048). */
  const graficoHoraRede: NetworkHourChart | null = null;

  /* --- Evolução diária: período > 1 dia (loja única OU rede) — AD-047 --- */
  let evolucao: EvolutionChart | null = null;
  if (periodo.granularidade !== "dia") {
    const dias = intervaloDias(periodo.inicio, periodo.fim);
    const diasAnt = intervaloDias(ant.inicio, ant.fim);
    const valores = dias.map((iso) => sumAggregates(fs.map((f) => dayAggregate(salesDay(f.id, iso)!, divisao))).faturamento);
    const anteriores = diasAnt.map((iso) => sumAggregates(fs.map((f) => (salesDay(f.id, iso) ? dayAggregate(salesDay(f.id, iso)!, divisao) : { faturamento: 0, atendimentos: 0, itens: 0 }))).faturamento);
    evolucao = {
      rotulos: dias.map((iso) => (periodo.granularidade === "mes" ? String(deIso(iso).getDate()) : diaSemanaCurto(iso))),
      valores,
      anterior: anteriores.length === valores.length ? anteriores : null,
      rotuloAnterior: ant.rotulo,
    };
  }

  /* --- Checklist do dia: todos os grupos da loja, em Hoje ou Ontem --- */
  let checklist: DayChecklist | null = null;
  if (unica && (periodo.tipo === "hoje" || periodo.tipo === "ontem")) {
    const gruposDaLoja = grupos.filter((x) => x.filialId === unica.id).sort((a, b) => a.horaInicio - b.horaInicio);
    if (gruposDaLoja.length > 0) {
      // Mock de conclusão: grupo encerrado sai como tudo feito, grupo em
      // andamento usa uma marcação fixa por grupo, grupo futuro nada feito.
      const feitasEmAndamento: Record<string, string[]> = { "t-f1-manha": ["tf1", "tf2", "tf3", "tf5"], "t-f2-tarde": ["tf14"] };
      const linhas: GroupRow[] = gruposDaLoja.map((t) => {
        const estado: GroupRow["estado"] = periodo.tipo === "ontem" ? "encerrado" : CURRENT_HOUR >= t.horaFim ? "encerrado" : CURRENT_HOUR >= t.horaInicio ? "andamento" : "naoComecou";
        const tarefasDoGrupo = tarefas.filter((x) => x.grupoId === t.id).sort((a, b) => a.ordem - b.ordem);
        const feitasIds = estado === "andamento" ? (feitasEmAndamento[t.id] ?? []) : estado === "encerrado" ? tarefasDoGrupo.map((x) => x.id) : [];
        const itens = tarefasDoGrupo.map((x) => ({ titulo: x.titulo, feita: feitasIds.includes(x.id) }));
        return {
          id: t.id,
          nome: t.nome,
          horario: `${Math.max(t.horaInicio, unica.abertura)}h às ${Math.min(t.horaFim, unica.fechamento)}h`,
          estado,
          feitas: itens.filter((i) => i.feita).length,
          total: itens.length,
          tarefas: itens,
        };
      });
      checklist = { dataTexto: dataCurta(periodo.inicio), grupos: linhas };
    }
  }

  /* --- Lucro bruto e categorias: período de mês, dentro de uma loja. Continuam filtrados por marca. --- */
  let lucroBruto: StoreView["lucroBruto"] = null;
  let cats: CategoryRow[] | null = null;
  if (visao === "periodo" && periodo.granularidade === "mes") {
    const custo = custoPeriodo(fs, periodo.inicio, periodo.fim, divisao);
    const lucro = atual.faturamento - custo.cmv;

    let divisaoLinha: string | null = null;
    if (unica?.temWpink && !divisao) {
      const wepink = agregadoPeriodo(unica, periodo.inicio, periodo.fim, "WEPINK").faturamento;
      const wpink = agregadoPeriodo(unica, periodo.inicio, periodo.fim, "WPINK").faturamento;
      const totalMarca = wepink + wpink;
      if (totalMarca > 0) divisaoLinha = `Wepink ${brlK(wepink)} · ${pct((wepink / totalMarca) * 100, 0)} — Wpink ${brlK(wpink)} · ${pct((wpink / totalMarca) * 100, 0)}`;
    }

    lucroBruto = {
      itens: [
        { rotulo: "Faturamento", valor: brl(atual.faturamento), pct: "100%" },
        { rotulo: "CMV", valor: brl(custo.cmv), pct: pct(divSeguro(custo.cmv, atual.faturamento) * 100) },
        { rotulo: "Lucro bruto", valor: brl(lucro), pct: pct(divSeguro(lucro, atual.faturamento) * 100) },
      ],
      aviso: "Configure aluguel e custo fixo para ver a margem de contribuição.",
      divisaoLinha,
    };

    const catsBase = Object.entries(custo.porCategoria)
      .map(([id, v]) => {
        const cat = categorias.find((c) => c.id === Number(id))!;
        const margem = v.faturamento - v.cmv;
        return { categoriaId: cat.id, nome: cat.nome, margemValor: margem, receita: brl(v.faturamento), margem: brl(margem), margemPct: pct(divSeguro(margem, v.faturamento) * 100) };
      })
      .sort((a, b) => b.margemValor - a.margemValor)
      .slice(0, 4);
    const maiorMargem = Math.max(...catsBase.map((c) => c.margemValor), 1);
    cats = catsBase.map(({ categoriaId, nome, receita, margem, margemPct, margemValor }) => ({
      categoriaId,
      nome,
      receita,
      margem,
      margemPct,
      barraPct: Math.max(0, Math.round((margemValor / maiorMargem) * 100)),
    }));
  }

  // Motor de trilho: sempre da competência do período (AD-023).
  const competenciaTrilho = periodo.granularidade === "mes" ? periodo.inicio.slice(0, 7) : TODAY_ISO.slice(0, 7);
  const trilho = calcularTrilho(fs, competenciaTrilho);
  const vendaNecessaria = trilho ? vendaNecessariaHoje(fs, competenciaTrilho) : null;

  const view: StoreView = {
    escopo,
    periodo,
    atualizadoAs: UPDATED_AT,
    proximoSyncMin: Math.max(0, SYNC_INTERVAL_MIN - Math.floor((NOW.getTime() - LAST_SYNC.getTime()) / 60000)),
    visao,
    alertas: montarAlertas(fs),
    leitura: null,
    avisos,
    comparacao: temComparacao
      ? {
          atual: { inicio: periodo.inicio, fim: periodo.fim, faturamento: atual.faturamento, atendimentos: atual.atendimentos, itens: atual.itens },
          anterior: { inicio: ant.inicio, fim: ant.fim, faturamento: anterior.faturamento, atendimentos: anterior.atendimentos, itens: anterior.itens },
          rotuloAtual: formatarIntervalo(periodo.inicio, periodo.fim),
          rotuloAnterior: formatarIntervalo(ant.inicio, ant.fim),
        }
      : null,
    trilho,
    vendaNecessaria,
    projecao: calcularProjecao(fs, competenciaTrilho),
    diagnostico: calcularLacuna(fs, competenciaTrilho, trilho?.pctTrilho ?? null),
    mix: visao === "periodo" ? montarMix(fs, periodo.inicio, periodo.fim, divisao, periodo.rotulo) : null,
    lojas: todas && periodo.granularidade === "mes" ? montarLojasGrupo(fs, competenciaTrilho) : [],
    estados: {
      kpis: "disponivel",
      trilho: trilho ? "disponivel" : "sem_dados",
      vendaNecessaria: vendaNecessaria ? "disponivel" : "sem_dados",
      projecao: trilho && vendaNecessaria ? "disponivel" : trilho ? "sem_dados" : "indisponivel",
      diagnostico: trilho?.status === "abaixo" ? "disponivel" : "sem_dados",
      mix: visao === "periodo" ? "disponivel" : "sem_dados",
      lojas: todas && periodo.granularidade === "mes" ? "disponivel" : "sem_dados",
    },
    kpiFaturamento,
    kpiTicket,
    kpiPA,
    kpiAtendimentos,
    tileMeta,
    ritmo,
    ritmoAviso,
    regua,
    reguaTitulo,
    pontosAtencao,
    graficoHora,
    graficoHoraRede,
    evolucao,
    checklist,
    lucroBruto,
    categorias: cats,
  };
  view.leitura = buildStoreInsight(view);
  return view;
}

/* ================================================================
 * TELA FINANCEIRO — camada de dados (montarFinanceiroView)
 * ================================================================ */

export interface FinanceKpi {
  label: string;
  valor: string;
  delta?: { value: string; positive: boolean; vs?: string; anterior?: string };
  serie?: number[];
  tooltip?: string;
  sub?: string;
}

export interface CostProfitMonth {
  mes: string;
  custo: number;
  lucro: number;
  margemPct: number;
  faturamento: number;
}

export interface OpResultMonth {
  mes: string;
  lucro: number;
  resultado: number;
  margemOpPct: number;
  faturamento: number;
}

export interface PaymentMethodRevenue {
  forma: string;
  valor: number;
  pct: number;
  cor: string;
}

export interface FixedCostRow {
  rotulo: string;
  valor: number;
  ehTotal?: boolean;
  ehResultado?: boolean;
}

export interface MonthlyEvolutionRow {
  mes: string;
  faturamento: number;
  custo: number;
  lucro: number;
  margemPct: number;
  ticketMedio: number;
}

export interface RevenueByBrand {
  marca: string;
  valor: number;
  pct: number;
  cor: string;
}

export interface FinanceView {
  escopo: Scope;
  periodo: ResolvedPeriod;
  kpis: FinanceKpi[];
  /** Eixo dos cards de tendência (CMV/Lucro e Resultado). */
  eixoSerie: SeriesAxis;
  /** Ex.: "Hoje · por hora". */
  rotuloSerie: string;
  /** True quando custos fixos foram rateados no eixo (hora/dia). */
  resultadoRateado: boolean;
  custoLucroMargem: CostProfitMonth[];
  resultadoOperacional: OpResultMonth[];
  deltaResultado?: { value: string; positive: boolean; vs?: string; diff?: string };
  formasPagamento: PaymentMethodRevenue[];
  /** Só quando filtro = todas as marcas; null se WEPINK ou WPINK isolada. */
  faturamentoPorMarca: RevenueByBrand[] | null;
  custosFixosFranquia: FixedCostRow[];
  /** Alguma loja do escopo tem custo da operação preenchido (senão o card mostra "Custos não configurados"). */
  custosConfigurados: boolean;
  evolucaoMensal: MonthlyEvolutionRow[];
  /** Card só em período mensal (ver `monthlyEvolutionMonths`). */
  mostrarEvolucaoMensal: boolean;
  rotuloEvolucaoMensal: string;
  /** Faixa WPINK (Faturamento · CMV · Lucro · Margem) — só se alguma loja do escopo tem a marca. */
  kpisWpink: OverviewKpiWpink[];
  /** Itens vendidos (mesma regra de comparativo dos KPIs) — usado pela tela Produtos. */
  kpiItens?: FinanceKpi;
  /** Faturamento do período (R$) — aviso "sem vendas" independente do eixo. */
  faturamentoAtual?: number;
  /** Produtos vendidos no período com custo R$ 0 no Millennium (maior faturamento primeiro). */
  produtosSemCusto?: ProductWithoutCost[];
}

const CORES_FORMAS: Record<string, string> = {
  Pix: "var(--ok)",
  "Cartão de crédito": "var(--acc)",
  "Cartão de débito": "var(--info)",
  Dinheiro: "var(--warn)",
};

/** Percentuais mockados de custos variáveis sobre faturamento (parametrização futura). */
const PCT_CUSTOS_FIXOS = {
  aluguelShopping: 5,
  royaltiesWepink: 5,
  royaltiesWpink: 5,
  taxaMktWepink: 2,
  taxaMktWpink: 2,
} as const;

/** Aluguel fixo mockado por filial (mensal). Variáveis (% sobre fat) são calculadas no view. */
function aluguelFixoMock(f: Store): number {
  const base = f.id === "f1" ? 6100 : 3450;
  return Math.round(18000 * (base / 5000));
}

/** Custos da loja (Configurações > Lojas); campo vazio cai no padrão mockado. */
function custosDaFilial(f: Store) {
  const c = f.custos;
  return {
    aluguelFixo: c?.rentMin ?? aluguelFixoMock(f),
    aluguelWepinkPct: c?.rentWepinkPct ?? PCT_CUSTOS_FIXOS.aluguelShopping,
    aluguelWpinkPct: c?.rentWpinkPct ?? PCT_CUSTOS_FIXOS.aluguelShopping,
    royaltiesWepinkPct: c?.royaltiesWepinkPct ?? PCT_CUSTOS_FIXOS.royaltiesWepink,
    royaltiesWpinkPct: c?.royaltiesWpinkPct ?? PCT_CUSTOS_FIXOS.royaltiesWpink,
    mktWepinkPct: c?.marketingWepinkPct ?? PCT_CUSTOS_FIXOS.taxaMktWepink,
    mktWpinkPct: c?.marketingWpinkPct ?? PCT_CUSTOS_FIXOS.taxaMktWpink,
  };
}

/** "(5%)" quando todas as lojas usam o mesmo %; vazio se variam. */
function rotuloPct(valores: number[]): string {
  const unicos = [...new Set(valores)];
  return unicos.length === 1 ? ` (${String(unicos[0]).replace(".", ",")}%)` : "";
}

const PRESETS_MENSAIS = new Set<PeriodType>(["esteMes", "mesPassado", "esteTrimestre", "esteSemestre", "esteAno"]);
const MESES_ANTERIORES_EVOLUCAO = 5;

/**
 * Meses da Evolução mensal. Período mensal pelo calendário (preset de mês/trimestre/semestre/ano
 * ou personalizado do dia 1 ao fim do mês / hoje) — nunca por contagem de dias (fevereiro tem 28).
 * 1 mês só → ele + 5 anteriores (comparação); vários meses ou eixo por mês → meses do período.
 */
export function monthlyEvolutionMonths(
  periodo: ResolvedPeriod,
  eixoSerie: SeriesAxis,
): { meses: string[]; comAnteriores: boolean } {
  const doPeriodo = mesesEntre(periodo.inicio, periodo.fim);
  const mensal =
    PRESETS_MENSAIS.has(periodo.tipo) ||
    (periodo.tipo === "personalizado" &&
      periodo.inicio !== periodo.fim &&
      periodo.inicio.endsWith("-01") &&
      (periodo.fim === fimDoMes(periodo.fim) || periodo.terminaHoje));
  if (mensal && doPeriodo.length === 1) {
    const [y, m] = doPeriodo[0]!.split("-").map(Number) as [number, number];
    const meses: string[] = [];
    for (let i = MESES_ANTERIORES_EVOLUCAO; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return { meses, comAnteriores: true };
  }
  if (mensal || eixoSerie === "mes") return { meses: doPeriodo, comAnteriores: false };
  return { meses: [], comAnteriores: false };
}

/** Nome do mês na Evolução mensal; ano só se a lista atravessa anos; recorte "(01 a 26)" em mês parcial. */
function rotuloMesEvolucao(mes: string, meses: string[], ini?: string, fim?: string): string {
  const nome = mesAno(`${mes}-01`);
  const base = meses[0]!.slice(0, 4) === meses[meses.length - 1]!.slice(0, 4) ? nome.split(" de ")[0]! : nome;
  if (!ini || !fim || (ini === `${mes}-01` && fim === fimDoMes(`${mes}-01`))) return base;
  return `${base} · ${ini.slice(8)} a ${fim.slice(8)}`;
}

function rotuloEvolucao(periodo: ResolvedPeriod, comAnteriores: boolean): string {
  return comAnteriores ? `${mesAno(periodo.inicio)} e meses anteriores` : periodo.rotulo;
}

/** Eixo dos cards de tendência: 1 dia → hora; 2–31 dias → dia; >31 dias → mês. */
export type SeriesAxis = "hora" | "dia" | "mes";

export function seriesAxisForPeriod(periodo: ResolvedPeriod): SeriesAxis {
  const n = intervaloDias(periodo.inicio, periodo.fim).length;
  if (n <= 1) return "hora";
  if (n <= 31) return "dia";
  return "mes";
}

/** Subtítulo dos cards de série (ex.: "Hoje · por hora"). */
export function seriesAxisLabel(periodo: ResolvedPeriod, eixo: SeriesAxis): string {
  if (eixo === "hora") return `${periodo.rotulo} · por hora`;
  if (eixo === "dia") return `${periodo.rotulo} · por dia`;
  return `${periodo.rotulo} · por mês`;
}

function mesesEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let y = Number(inicio.slice(0, 4));
  let m = Number(inicio.slice(5, 7));
  const yF = Number(fim.slice(0, 4));
  const mF = Number(fim.slice(5, 7));
  while (y < yF || (y === yF && m <= mF)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function diasNoMes(mesYm: string): number {
  const [y, m] = mesYm.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function agregadoMes(fs: Store[], mes: string, divisao: Division | null): Aggregate & { cmv: number; porMeio: Record<string, number> } {
  const inicio = `${mes}-01`;
  const fim = fimDoMes(inicio);
  const agg = sumAggregates(fs.map((f) => agregadoPeriodo(f, inicio, fim, divisao)));
  const custo = custoPeriodo(fs, inicio, fim, divisao).cmv;
  // Soma das formas de pagamento no mês.
  const dias = intervaloDias(inicio, fim);
  const porMeio: Record<string, number> = {};
  for (const f of fs) {
    for (const diaIso of dias) {
      const dv = salesDay(f.id, diaIso);
      if (!dv) continue;
      for (const [meio, val] of Object.entries(dv.porMeio)) {
        porMeio[meio] = (porMeio[meio] ?? 0) + val;
      }
    }
  }
  return { ...agg, cmv: custo, porMeio };
}

export function buildFinanceView(escopo: Scope, aggs?: FinanceAggInput | null): FinanceView {
  if (aggs) return buildFinanceViewFromAggs(escopo, aggs);
  const periodo = resolvePeriod(escopo.periodo);
  const fs = storesInScope(escopo);
  const divisao = escopo.divisao;

  // Atual e anterior para deltas dos KPIs.
  const atual = sumAggregates(fs.map((f) => agregadoPeriodo(f, periodo.inicio, periodo.fim, divisao)));
  const custoAtual = custoPeriodo(fs, periodo.inicio, periodo.fim, divisao).cmv;
  const ant = previousPeriod(periodo);
  const anterior = sumAggregates(fs.map((f) => agregadoPeriodo(f, ant.inicio, ant.fim, divisao, ant.horaMax)));
  const custoAnterior = custoPeriodo(fs, ant.inicio, ant.fim, divisao).cmv;

  const lucroAtual = atual.faturamento - custoAtual;
  const lucroAnterior = anterior.faturamento - custoAnterior;
  const margemAtual = divSeguro(lucroAtual, atual.faturamento) * 100;
  const margemAnterior = divSeguro(lucroAnterior, anterior.faturamento) * 100;

  const temComp = anterior.atendimentos > 0;
  const vsRotulo = temComp ? ant.rotulo : undefined;

  // Séries de tendência (últimos 7 pontos do período, ou 7 dias se período curto).
  const serieFaturamento = (seriesTendencia(fs, periodo, divisao).faturamento ?? []).slice(-7);
  const serieCmv = serieFaturamento.map((_, i) => {
    const frac = custoAtual / (atual.faturamento || 1);
    return Math.round(serieFaturamento[i] * frac);
  });
  const serieLucro = serieFaturamento.map((v, i) => v - serieCmv[i]);
  const serieMargem = serieFaturamento.map((v, i) => v > 0 ? ((v - serieCmv[i]) / v) * 100 : 0);

  const kpis: FinanceKpi[] = [
    {
      label: "Faturamento",
      valor: brlCent(atual.faturamento),
      delta: temComp ? kpiDelta(atual.faturamento, anterior.faturamento, vsRotulo) : undefined,
      serie: serieFaturamento,
    },
    {
      label: "CMV",
      valor: brlCent(custoAtual),
      sub: `${(divSeguro(custoAtual, atual.faturamento) * 100).toFixed(0)}% do faturamento`,
      delta: temComp ? kpiDelta(custoAtual, custoAnterior, vsRotulo) : undefined,
      serie: serieCmv,
      tooltip: TIP_CMV,
    },
    {
      label: "Lucro bruto",
      valor: brlCent(lucroAtual),
      delta: temComp ? kpiDelta(lucroAtual, lucroAnterior, vsRotulo) : undefined,
      serie: serieLucro,
      tooltip: TIP_LUCRO_BRUTO,
    },
    {
      label: "Margem",
      valor: pct(margemAtual),
      delta: temComp ? kpiDeltaPp(margemAtual, margemAnterior, vsRotulo) : undefined,
      serie: serieMargem,
      tooltip: TIP_MARGEM,
    },
  ];

  // Série de tendência: eixo hora / dia / mês conforme o período filtrado.
  const eixoSerie = seriesAxisForPeriod(periodo);
  const rotuloSerie = seriesAxisLabel(periodo, eixoSerie);
  const resultadoRateado = eixoSerie !== "mes";

  // Faturamento por marca (sempre calculado; donut só quando filtro = todas).
  const fatWepink = sumAggregates(fs.map((f) => agregadoPeriodo(f, periodo.inicio, periodo.fim, "WEPINK"))).faturamento;
  const fatWpink = sumAggregates(fs.map((f) => agregadoPeriodo(f, periodo.inicio, periodo.fim, "WPINK"))).faturamento;
  const fatTodasMarcas = fatWepink + fatWpink;

  // Custos por loja (Configurações > Lojas): aluguel fixo compartilhado; % só sobre a(s) marca(s) do filtro.
  const incluiWepink = !divisao || divisao === "WEPINK";
  const incluiWpink = !divisao || divisao === "WPINK";
  const custosLojas = fs.map((f) => ({
    c: custosDaFilial(f),
    wepink: incluiWepink ? agregadoPeriodo(f, periodo.inicio, periodo.fim, "WEPINK").faturamento : 0,
    wpink: incluiWpink ? agregadoPeriodo(f, periodo.inicio, periodo.fim, "WPINK").faturamento : 0,
  }));
  const somaPct = (fn: (l: (typeof custosLojas)[number]) => number) =>
    Math.round(custosLojas.reduce((s, l) => s + fn(l), 0));
  const aluguelFixo = custosLojas.reduce((s, l) => s + l.c.aluguelFixo, 0);
  const aluguelPct = somaPct((l) => (l.wepink * l.c.aluguelWepinkPct + l.wpink * l.c.aluguelWpinkPct) / 100);
  const royaltiesWepink = somaPct((l) => (l.wepink * l.c.royaltiesWepinkPct) / 100);
  const royaltiesWpink = somaPct((l) => (l.wpink * l.c.royaltiesWpinkPct) / 100);
  const taxaMktWepink = somaPct((l) => (l.wepink * l.c.mktWepinkPct) / 100);
  const taxaMktWpink = somaPct((l) => (l.wpink * l.c.mktWpinkPct) / 100);
  const pctAluguel = rotuloPct(
    custosLojas.flatMap((l) => [
      ...(incluiWepink ? [l.c.aluguelWepinkPct] : []),
      ...(incluiWpink && l.wpink > 0 ? [l.c.aluguelWpinkPct] : []),
    ]),
  );
  const custosAgg = {
    aluguelFixo,
    aluguelPct,
    royaltiesWepink,
    royaltiesWpink,
    taxaMktWepink,
    taxaMktWpink,
  };
  const totalCustosFixos =
    custosAgg.aluguelFixo +
    custosAgg.aluguelPct +
    custosAgg.royaltiesWepink +
    custosAgg.royaltiesWpink +
    custosAgg.taxaMktWepink +
    custosAgg.taxaMktWpink;

  const custoLucroMargem: CostProfitMonth[] = [];
  const resultadoOperacional: OpResultMonth[] = [];

  if (eixoSerie === "hora") {
    const abertura = Math.min(...fs.map((f) => f.abertura));
    const fechamento = Math.max(...fs.map((f) => f.fechamento));
    const horas: number[] = [];
    for (let h = abertura; h < fechamento; h++) horas.push(h);
    const horasVisiveis = periodo.ehHoje ? horas.filter((h) => h <= CURRENT_HOUR) : horas;
    const diaFat = atual.faturamento;
    const diaCmv = custoAtual;
    const ratioCmv = divSeguro(diaCmv, diaFat);
    const custoHora = totalCustosFixos / diasNoMes(periodo.inicio.slice(0, 7)) / (horas.length || 1);
    for (const h of horasVisiveis) {
      const fatH = fs.reduce((s, f) => {
        const a = salesDay(f.id, periodo.inicio)?.porHora[h];
        if (!a) return s;
        if (!divisao) return s + a.faturamento;
        const dia = salesDay(f.id, periodo.inicio)!;
        const fr = dia.total.faturamento > 0 ? dia.porDivisao[divisao].faturamento / dia.total.faturamento : 0;
        return s + Math.round(a.faturamento * fr);
      }, 0);
      const cmv = Math.round(fatH * ratioCmv);
      const lucro = fatH - cmv;
      const label = horaCurta(h);
      custoLucroMargem.push({ mes: label, custo: cmv, lucro, margemPct: divSeguro(lucro, fatH) * 100, faturamento: fatH });
      const resultado = lucro - custoHora;
      resultadoOperacional.push({
        mes: label,
        lucro,
        resultado,
        margemOpPct: divSeguro(resultado, fatH) * 100,
        faturamento: fatH,
      });
    }
  } else if (eixoSerie === "dia") {
    for (const iso of intervaloDias(periodo.inicio, periodo.fim)) {
      const agg = sumAggregates(fs.map((f) => {
        const d = salesDay(f.id, iso);
        return d ? dayAggregate(d, divisao) : { faturamento: 0, atendimentos: 0, itens: 0 };
      }));
      const cmv = custoPeriodo(fs, iso, iso, divisao).cmv;
      const lucro = agg.faturamento - cmv;
      const label = periodo.granularidade === "mes"
        ? String(deIso(iso).getDate())
        : diaSemanaCurto(iso);
      const custoDia = totalCustosFixos / diasNoMes(iso.slice(0, 7));
      custoLucroMargem.push({
        mes: label,
        custo: cmv,
        lucro,
        margemPct: divSeguro(lucro, agg.faturamento) * 100,
        faturamento: agg.faturamento,
      });
      const resultado = lucro - custoDia;
      resultadoOperacional.push({
        mes: label,
        lucro,
        resultado,
        margemOpPct: divSeguro(resultado, agg.faturamento) * 100,
        faturamento: agg.faturamento,
      });
    }
  } else {
    for (const mes of mesesEntre(periodo.inicio, periodo.fim)) {
      const agg = agregadoMes(fs, mes, divisao);
      const lucro = agg.faturamento - agg.cmv;
      const label = mesAno(`${mes}-01`).split(" de ")[0];
      custoLucroMargem.push({
        mes: label,
        custo: agg.cmv,
        lucro,
        margemPct: divSeguro(lucro, agg.faturamento) * 100,
        faturamento: agg.faturamento,
      });
      const resultado = lucro - totalCustosFixos;
      resultadoOperacional.push({
        mes: label,
        lucro,
        resultado,
        margemOpPct: divSeguro(resultado, agg.faturamento) * 100,
        faturamento: agg.faturamento,
      });
    }
  }

  const resultadoAtual = lucroAtual - totalCustosFixos;
  const resultadoAnterior = lucroAnterior - totalCustosFixos;
  const deltaResultado = temComp ? kpiDelta(resultadoAtual, resultadoAnterior, vsRotulo) : undefined;

  // Formas de pagamento no período.
  const diasPeriodo = intervaloDias(periodo.inicio, periodo.fim);
  const totaisForma: Record<string, number> = {};
  for (const f of fs) {
    for (const diaIso of diasPeriodo) {
      const dv = salesDay(f.id, diaIso);
      if (!dv) continue;
      for (const [meio, val] of Object.entries(dv.porMeio)) {
        totaisForma[meio] = (totaisForma[meio] ?? 0) + val;
      }
    }
  }
  const totalFormas = Object.values(totaisForma).reduce((s, v) => s + v, 0) || 1;
  const formasPagamento: PaymentMethodRevenue[] = Object.entries(totaisForma)
    .sort((a, b) => b[1] - a[1])
    .map(([forma, valor]) => ({
      forma,
      valor,
      pct: (valor / totalFormas) * 100,
      cor: CORES_FORMAS[forma] ?? "var(--t2)",
    }));

  // Mini-DRE → Resultado Operacional. Linhas de marca só aparecem no filtro correspondente.
  const linhasMarca: FixedCostRow[] = [];
  if (incluiWepink) {
    linhasMarca.push(
      { rotulo: `Royalties WEPINK${rotuloPct(custosLojas.map((l) => l.c.royaltiesWepinkPct))}`, valor: custosAgg.royaltiesWepink },
      { rotulo: `Marketing WEPINK${rotuloPct(custosLojas.map((l) => l.c.mktWepinkPct))}`, valor: custosAgg.taxaMktWepink },
    );
  }
  if (incluiWpink) {
    linhasMarca.push(
      { rotulo: `Royalties WPINK${rotuloPct(custosLojas.map((l) => l.c.royaltiesWpinkPct))}`, valor: custosAgg.royaltiesWpink },
      { rotulo: `Marketing WPINK${rotuloPct(custosLojas.map((l) => l.c.mktWpinkPct))}`, valor: custosAgg.taxaMktWpink },
    );
  }
  const custosFixosFranquia: FixedCostRow[] = [
    { rotulo: "Lucro bruto", valor: lucroAtual },
    { rotulo: "Aluguel fixo", valor: custosAgg.aluguelFixo },
    { rotulo: `Aluguel variável${pctAluguel}`, valor: custosAgg.aluguelPct },
    ...linhasMarca,
    { rotulo: "Total de custos", valor: totalCustosFixos, ehTotal: true },
    { rotulo: "Resultado operacional", valor: resultadoAtual, ehResultado: true },
  ];

  const faturamentoPorMarca: RevenueByBrand[] | null = divisao
    ? null
    : [
        { marca: "WEPINK", valor: fatWepink, pct: fatTodasMarcas > 0 ? (fatWepink / fatTodasMarcas) * 100 : 0, cor: "var(--wepink)" },
        { marca: "WPINK", valor: fatWpink, pct: fatTodasMarcas > 0 ? (fatWpink / fatTodasMarcas) * 100 : 0, cor: "var(--wpink)" },
      ].filter((m) => m.valor > 0);

  const evo = monthlyEvolutionMonths(periodo, eixoSerie);
  const rotuloEvolucaoMensal = rotuloEvolucao(periodo, evo.comAnteriores);
  const evolucaoMensal: MonthlyEvolutionRow[] = evo.meses.map((mes) => {
    const agg = agregadoMes(fs, mes, divisao);
    const lucro = agg.faturamento - agg.cmv;
    return {
      mes: rotuloMesEvolucao(mes, evo.meses),
      faturamento: agg.faturamento,
      custo: agg.cmv,
      lucro,
      margemPct: divSeguro(lucro, agg.faturamento) * 100,
      ticketMedio: divSeguro(agg.faturamento, agg.atendimentos),
    };
  });

  return {
    escopo,
    periodo,
    kpis,
    eixoSerie,
    rotuloSerie,
    resultadoRateado,
    custoLucroMargem,
    resultadoOperacional,
    deltaResultado,
    formasPagamento,
    faturamentoPorMarca,
    custosFixosFranquia,
    custosConfigurados: true,
    evolucaoMensal,
    mostrarEvolucaoMensal: evo.meses.length > 0,
    rotuloEvolucaoMensal,
    kpisWpink: [],
  };
}

/* ---------- Financeiro com agregados reais (sales_day_agg / hour / payment) ---------- */

export type FinanceAggInput = {
  /** Período + período anterior + últimos 6 meses, todas as marcas (ALL/WEPINK/WPINK). */
  dayAggs: import("./salesTypes").SalesDayAgg[];
  /** Horas do dia filtrado (período de 1 dia). */
  hourAggs?: import("./salesTypes").SalesHourAgg[];
  /** Horas do dia de comparação — hoje compara com a mesma hora da semana passada. */
  prevHourAggs?: import("./salesTypes").SalesHourAgg[];
  /** Formas de pagamento (CONDICAO) — só brand=ALL. */
  paymentDayAggs?: import("./salesTypes").SalesPaymentDayAgg[];
  /** CMV por produto (RELATORIOMARGEM) do período — produtos sem custo no ERP e dias com margem gravada. */
  productCostDayAggs?: import("./salesTypes").SalesProductCostDayAgg[];
  /** COD_PRODUTO → descrição (catálogo), para o aviso de produtos sem custo. */
  productNames?: Record<string, string>;
};

/** Produto vendido com custo R$ 0 no Millennium (CMV e margem ficam otimistas). */
export interface ProductWithoutCost {
  codigo: string;
  nome: string;
  itens: number;
  faturamento: number;
}

type FinMoney = { rev: number; cmv: number; sales: number; items: number };
type FinCell = { ALL?: FinMoney; WEPINK?: FinMoney; WPINK?: FinMoney };
type FinCosts = {
  aluguelPct: number;
  royWepink: number;
  royWpink: number;
  mktWepink: number;
  mktWpink: number;
  /** Custos variáveis da loja (% do faturamento) — hoje sempre 0; volta com a tela de DRE. */
  variaveis: number;
};
/**
 * Custos mensais rateados por dia (não seguem o faturamento). `fixos`/`outras` hoje sempre 0 por loja
 * (voltam com a tela de DRE); no eixo por hora `fixos` carrega o rateio dos custos mensais.
 */
type FinMonthly = {
  fixos: number;
  outras: number;
  /** Aluguel mínimo rateado no período. */
  aluguelMinBase: number;
  /** Quanto falta para o % chegar no mínimo: max(0, mínimo − aluguel %), por loja no período. */
  aluguelMin: number;
};
type FinLine = FinMoney & FinCosts & FinMonthly & { icms: number; icmsSt: number };

const FIN_ZERO: FinMoney = { rev: 0, cmv: 0, sales: 0, items: 0 };
const FIN_LINE_ZERO: FinLine = {
  ...FIN_ZERO,
  aluguelPct: 0,
  royWepink: 0,
  royWpink: 0,
  mktWepink: 0,
  mktWpink: 0,
  variaveis: 0,
  fixos: 0,
  outras: 0,
  aluguelMinBase: 0,
  aluguelMin: 0,
  icms: 0,
  icmsSt: 0,
};

/** Lucro bruto = Faturamento − CMV − impostos (ICMS sobre o faturamento, ICMS ST sobre o CMV). */
function finLucro(l: FinLine): number {
  return l.rev - l.cmv - l.icms - l.icmsSt;
}

function finAdd<T extends Record<string, number>>(a: T, b: T): T {
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof T)[]) out[k] = ((a[k] ?? 0) + (b[k] ?? 0)) as T[keyof T];
  return out;
}

function finScale<T extends Record<string, number>>(a: T, f: number): T {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof T)[]) out[k] = (a[k] * f) as T[keyof T];
  return out;
}

/** Custos da operação da linha: aluguel (% + complemento do mínimo) + franquia + custos da loja. */
function finOperatingCosts(l: FinCosts & FinMonthly): number {
  return l.aluguelPct + l.aluguelMin + l.royWepink + l.royWpink + l.mktWepink + l.mktWpink + l.variaveis + l.fixos + l.outras;
}

/** Custos mensais (fixos, outras despesas, complemento do aluguel mínimo) — rateados nas horas abertas. */
function finMonthlyCosts(l: FinMonthly): number {
  return l.fixos + l.outras + l.aluguelMin;
}

/** Custos da loja para dados reais: campo sem configuração = 0 (não inventa R$). */
function custosDaFilialReal(f: Store) {
  const c = f.custos;
  const rua = f.pointType === "RUA";
  return {
    aluguelMin: c?.rentMin ?? 0,
    aluguelWepinkPct: rua ? 0 : (c?.rentWepinkPct ?? 0),
    aluguelWpinkPct: rua ? 0 : (c?.rentWpinkPct ?? 0),
    royaltiesWepinkPct: c?.royaltiesWepinkPct ?? 0,
    royaltiesWpinkPct: c?.royaltiesWpinkPct ?? 0,
    mktWepinkPct: c?.marketingWepinkPct ?? 0,
    mktWpinkPct: c?.marketingWpinkPct ?? 0,
    icmsPct: f.custos?.icmsPct ?? 0,
    icmsStPct: f.custos?.icmsStPct ?? 0,
  };
}

/** Financeiro a partir dos agregados do sync (sem fixture). Custos % por marca; aluguel fixo rateado por dia/hora. */
export function buildFinanceViewFromAggs(escopo: Scope, input: FinanceAggInput): FinanceView {
  const today = calendarTodayIso();
  const periodo = resolvePeriod(escopo.periodo, today);
  const fs = storesInScope(escopo);
  const storeById = new Map(fs.map((f) => [f.id, f]));
  const divisao = escopo.divisao;
  const incluiWepink = !divisao || divisao === "WEPINK";
  const incluiWpink = !divisao || divisao === "WPINK";

  const cells = new Map<string, FinCell>();
  for (const r of input.dayAggs) {
    if (!storeById.has(r.storeId)) continue;
    const key = `${r.storeId}|${r.day}`;
    const cell = cells.get(key) ?? {};
    const prev = cell[r.brand] ?? FIN_ZERO;
    cell[r.brand] = finAdd(prev, {
      rev: r.revenueCents / 100,
      cmv: (r.cmvCents ?? 0) / 100,
      sales: r.salesCount,
      items: r.itemCount,
    });
    cells.set(key, cell);
  }

  /** Linha loja×dia no filtro de marca: receita/CMV/contagens + custos % (marca) + aluguel fixo do dia. */
  function storeDay(f: Store, iso: string): FinLine {
    const cell = cells.get(`${f.id}|${iso}`) ?? {};
    const hasSplit = Boolean(cell.WEPINK || cell.WPINK);
    const all = cell.ALL ?? (hasSplit ? finAdd(cell.WEPINK ?? FIN_ZERO, cell.WPINK ?? FIN_ZERO) : FIN_ZERO);
    // Loja sem split de marca (sem WPINK ou split ainda não rodou) → tudo WEPINK.
    const wepink = cell.WEPINK ?? (hasSplit ? FIN_ZERO : all);
    const wpink = cell.WPINK ?? FIN_ZERO;
    let m = !divisao ? all : divisao === "WEPINK" ? wepink : wpink;
    // Relatório de marca pode vir sem contagens: rateia do ALL pela receita.
    if (divisao && m.sales === 0 && m.rev > 0 && all.rev > 0) {
      const share = m.rev / all.rev;
      m = { ...m, sales: Math.round(all.sales * share), items: Math.round(all.items * share) };
    }
    const c = custosDaFilialReal(f);
    const w = incluiWepink ? wepink.rev : 0;
    const p = incluiWpink ? wpink.rev : 0;
    const diasMes = diasNoMes(iso.slice(0, 7));
    const aluguelPct = (w * c.aluguelWepinkPct + p * c.aluguelWpinkPct) / 100;
    const aluguelMinBase = c.aluguelMin / diasMes;
    return {
      ...m,
      aluguelPct,
      royWepink: (w * c.royaltiesWepinkPct) / 100,
      royWpink: (p * c.royaltiesWpinkPct) / 100,
      mktWepink: (w * c.mktWepinkPct) / 100,
      mktWpink: (p * c.mktWpinkPct) / 100,
      variaveis: 0,
      fixos: 0,
      outras: 0,
      aluguelMinBase,
      aluguelMin: Math.max(0, aluguelMinBase - aluguelPct),
      icms: (m.rev * c.icmsPct) / 100,
      icmsSt: (m.cmv * c.icmsStPct) / 100,
    };
  }

  /** Soma loja × mês: o aluguel do mês é o maior entre o mínimo (rateado nos dias do recorte) e o %, não dia a dia. */
  function sumDays(dias: string[]): FinLine {
    const porMes = new Map<string, string[]>();
    for (const iso of dias) {
      const mes = iso.slice(0, 7);
      porMes.set(mes, [...(porMes.get(mes) ?? []), iso]);
    }
    let acc = FIN_LINE_ZERO;
    for (const f of fs) {
      for (const diasMes of porMes.values()) {
        let loja = FIN_LINE_ZERO;
        for (const iso of diasMes) loja = finAdd(loja, storeDay(f, iso));
        acc = finAdd(acc, { ...loja, aluguelMin: Math.max(0, loja.aluguelMinBase - loja.aluguelPct) });
      }
    }
    return acc;
  }

  /** Horas de uma loja no filtro de marca; sem hora×marca, usa ALL × participação da marca no dia. */
  function storeHours(rows: import("./salesTypes").SalesHourAgg[], f: Store, day: FinLine, iso: string): Map<number, FinMoney> {
    const own = rows.filter((h) => h.storeId === f.id && h.day === iso);
    const pick = (brand: string) => own.filter((h) => h.brand === brand);
    let base = divisao ? pick(divisao) : pick("ALL");
    let factor = 1;
    if (base.length === 0) {
      if (divisao) {
        base = pick("ALL");
        const cell = cells.get(`${f.id}|${iso}`) ?? {};
        const allRev = cell.ALL?.rev ?? 0;
        factor = allRev > 0 ? day.rev / allRev : 0;
      } else {
        base = own.filter((h) => h.brand === "WEPINK" || h.brand === "WPINK");
      }
    }
    const out = new Map<number, FinMoney>();
    for (const h of base) {
      const cur = out.get(h.hour) ?? FIN_ZERO;
      out.set(h.hour, finAdd(cur, {
        rev: (h.revenueCents / 100) * factor,
        cmv: 0,
        sales: h.salesCount * factor,
        items: h.itemCount * factor,
      }));
    }
    return out;
  }

  const diasPeriodo = intervaloDias(periodo.inicio, periodo.fim);
  const atual = sumDays(diasPeriodo);

  // Período anterior equivalente. Terminando hoje, o último dia do anterior entra até a hora atual (precisa das horas).
  const ant = previousPeriod(periodo, calendarCurrentHour());
  const diasAnt = intervaloDias(ant.inicio, ant.fim);
  let anterior: FinLine | null = sumDays(diasAnt);
  if (ant.horaMax != null) {
    let parcial = sumDays(diasAnt.slice(0, -1));
    let faltaHora = false;
    for (const f of fs) {
      const dia = storeDay(f, ant.fim);
      const horas = storeHours(input.prevHourAggs ?? [], f, dia, ant.fim);
      if (horas.size === 0 && dia.rev > 0) faltaHora = true;
      let rev = 0;
      let sales = 0;
      let items = 0;
      for (const [h, m] of horas) {
        if (h > ant.horaMax) continue;
        rev += m.rev;
        sales += m.sales;
        items += m.items;
      }
      const frac = dia.rev > 0 ? rev / dia.rev : 0;
      const escalado = finScale(dia, frac);
      parcial = finAdd(parcial, {
        ...escalado,
        rev,
        sales,
        items,
        fixos: dia.fixos,
        outras: dia.outras,
        aluguelMinBase: dia.aluguelMinBase,
        aluguelMin: Math.max(0, dia.aluguelMinBase - escalado.aluguelPct),
      });
    }
    anterior = faltaHora ? null : parcial;
  }

  // Sem venda no período atual não é queda de 100% — é falta de dado (sem badge).
  const temComp = anterior != null && anterior.rev > 0 && atual.rev > 0;
  const vsRotulo = temComp ? ant.rotulo : undefined;
  const antLine = anterior ?? FIN_LINE_ZERO;

  const lucroAtual = finLucro(atual);
  const impostosAtual = atual.icms + atual.icmsSt;
  const margemAtual = divSeguro(lucroAtual, atual.rev) * 100;
  const temCmv = atual.cmv > 0;
  // CMV não existe por hora: terminando hoje, CMV/lucro/margem/resultado comparam sem o dia de hoje nos dois lados.
  const cortaHoje = ant.horaMax != null;
  const atualCmp = cortaHoje ? sumDays(diasPeriodo.slice(0, -1)) : atual;
  const antCmp = cortaHoje ? sumDays(diasAnt.slice(0, -1)) : antLine;
  const vsCmv = cortaHoje ? `${ant.rotulo}, até o mesmo dia` : ant.rotulo;
  const cmvComparavel = temComp && temCmv && atualCmp.cmv > 0 && antCmp.cmv > 0;
  const lucroAtualCmp = finLucro(atualCmp);
  const lucroAnteriorCmp = finLucro(antCmp);
  const margemAtualCmp = divSeguro(lucroAtualCmp, atualCmp.rev) * 100;
  const margemAnteriorCmp = divSeguro(lucroAnteriorCmp, antCmp.rev) * 100;

  const kpis: FinanceKpi[] = [
    {
      label: "Faturamento",
      valor: brlCent(atual.rev),
      delta: temComp ? kpiDelta(atual.rev, antLine.rev, vsRotulo) : undefined,
    },
    {
      label: "CMV",
      valor: temCmv ? brlCent(atual.cmv) : "—",
      sub: temCmv ? `${(divSeguro(atual.cmv, atual.rev) * 100).toFixed(0)}% do faturamento` : undefined,
      delta: cmvComparavel ? kpiDelta(atualCmp.cmv, antCmp.cmv, vsCmv) : undefined,
      tooltip: temCmv ? TIP_CMV : TIP_CMV_INDISPONIVEL,
    },
    {
      label: "Lucro bruto",
      valor: temCmv ? brlCent(lucroAtual) : "—",
      sub: temCmv && impostosAtual > 0 ? `Impostos: ${brlCent(impostosAtual)}` : undefined,
      delta: cmvComparavel ? kpiDelta(lucroAtualCmp, lucroAnteriorCmp, vsCmv) : undefined,
      tooltip: TIP_LUCRO_BRUTO,
    },
    {
      label: "Margem",
      valor: temCmv ? pct(margemAtual) : "—",
      delta: cmvComparavel ? kpiDeltaPp(margemAtualCmp, margemAnteriorCmp, vsCmv) : undefined,
      tooltip: TIP_MARGEM,
    },
  ];

  const eixoSerie = seriesAxisForPeriod(periodo);
  const rotuloSerie = seriesAxisLabel(periodo, eixoSerie);
  const resultadoRateado = eixoSerie !== "mes";

  const custoLucroMargem: CostProfitMonth[] = [];
  const resultadoOperacional: OpResultMonth[] = [];
  const pushPonto = (label: string, l: FinLine) => {
    const lucro = finLucro(l);
    const resultado = lucro - finOperatingCosts(l);
    custoLucroMargem.push({ mes: label, custo: l.cmv, lucro, margemPct: divSeguro(lucro, l.rev) * 100, faturamento: l.rev });
    resultadoOperacional.push({ mes: label, lucro, resultado, margemOpPct: divSeguro(resultado, l.rev) * 100, faturamento: l.rev });
  };

  if (eixoSerie === "hora") {
    const iso = periodo.inicio;
    const dow = deIso(iso).getDay() as Dow;
    const porHora = new Map<number, FinLine>();
    for (const f of fs) {
      const dia = storeDay(f, iso);
      const horas = storeHours(input.hourAggs ?? [], f, dia, iso);
      const cmvRatio = divSeguro(dia.cmv, dia.rev);
      const costRatio = dia.rev > 0 ? 1 / dia.rev : 0;
      for (const [h, m] of horas) {
        const cur = porHora.get(h) ?? FIN_LINE_ZERO;
        porHora.set(h, finAdd(cur, {
          ...FIN_LINE_ZERO,
          ...m,
          cmv: m.rev * cmvRatio,
          aluguelPct: m.rev * dia.aluguelPct * costRatio,
          royWepink: m.rev * dia.royWepink * costRatio,
          royWpink: m.rev * dia.royWpink * costRatio,
          mktWepink: m.rev * dia.mktWepink * costRatio,
          mktWpink: m.rev * dia.mktWpink * costRatio,
          variaveis: m.rev * dia.variaveis * costRatio,
          icms: m.rev * dia.icms * costRatio,
          icmsSt: m.rev * dia.icmsSt * costRatio,
        }));
      }
    }
    const comVenda = [...porHora.entries()].filter(([, l]) => l.rev > 0).map(([h]) => h);
    // Sem horário configurado em nenhuma loja: expediente = da 1ª à última hora com venda.
    const win =
      unionConfiguredWindow(fs.map((f) => f.horas), dow) ??
      (comVenda.length > 0
        ? { abertura: Math.min(...comVenda), fechamento: Math.max(...comVenda) + 1 }
        : unionOpenWindow(fs.map((f) => effectiveWeekHours(f.horas)), dow));
    const horasAbertas = Math.max(1, win.fechamento - win.abertura);
    const mensalHora = finMonthlyCosts(atual) / horasAbertas;
    const first = Math.min(win.abertura, ...comVenda);
    let last = Math.max(win.fechamento - 1, ...comVenda);
    if (periodo.ehHoje) last = Math.max(Math.min(last, calendarCurrentHour()), ...comVenda, first);
    for (let h = first; h <= last; h++) {
      const l = porHora.get(h) ?? FIN_LINE_ZERO;
      const dentro = h >= win.abertura && h < win.fechamento;
      pushPonto(horaCurta(h), { ...l, fixos: dentro ? mensalHora : 0, outras: 0, aluguelMinBase: 0, aluguelMin: 0 });
    }
  } else if (eixoSerie === "dia") {
    // Complemento do aluguel mínimo é do mês: dividido igualmente pelos dias do mês no período.
    const complementoDia = new Map<string, number>();
    for (const mes of new Set(diasPeriodo.map((iso) => iso.slice(0, 7)))) {
      const diasDoMes = diasPeriodo.filter((iso) => iso.startsWith(mes));
      complementoDia.set(mes, sumDays(diasDoMes).aluguelMin / diasDoMes.length);
    }
    for (const iso of diasPeriodo) {
      const label = periodo.granularidade === "mes" ? String(deIso(iso).getDate()) : diaSemanaCurto(iso);
      pushPonto(label, { ...sumDays([iso]), aluguelMin: complementoDia.get(iso.slice(0, 7)) ?? 0 });
    }
  } else {
    for (const mes of mesesEntre(periodo.inicio, periodo.fim)) {
      const ini = `${mes}-01` < periodo.inicio ? periodo.inicio : `${mes}-01`;
      const fimMes = fimDoMes(`${mes}-01`);
      const fim = fimMes > periodo.fim ? periodo.fim : fimMes;
      pushPonto(mesAno(`${mes}-01`).split(" de ")[0], sumDays(intervaloDias(ini, fim)));
    }
  }

  const totalCustos = finOperatingCosts(atual);
  const resultadoAtual = lucroAtual - totalCustos;
  const resultadoAtualCmp = lucroAtualCmp - finOperatingCosts(atualCmp);
  const resultadoAnteriorCmp = lucroAnteriorCmp - finOperatingCosts(antCmp);
  const deltaResultado = cmvComparavel ? kpiDelta(resultadoAtualCmp, resultadoAnteriorCmp, vsCmv) : undefined;

  // Formas de pagamento: sempre total (a Lista não traz marca).
  const scopedIds = new Set(fs.map((f) => f.id));
  const totaisForma: Record<string, number> = {};
  for (const row of input.paymentDayAggs ?? []) {
    if (!scopedIds.has(row.storeId)) continue;
    if (row.day < periodo.inicio || row.day > periodo.fim || row.revenueCents <= 0) continue;
    const forma = row.paymentMethod || "Outros";
    totaisForma[forma] = (totaisForma[forma] ?? 0) + row.revenueCents / 100;
  }
  const totalFormas = Object.values(totaisForma).reduce((s, v) => s + v, 0) || 1;
  const FORMAS_FALLBACK = ["var(--acc)", "var(--info)", "var(--ok)", "var(--warn)", "var(--t2)"];
  const formasPagamento: PaymentMethodRevenue[] = Object.entries(totaisForma)
    .sort((a, b) => b[1] - a[1])
    .map(([forma, valor], i) => ({
      forma,
      valor,
      pct: (valor / totalFormas) * 100,
      cor: CORES_FORMAS[forma] ?? FORMAS_FALLBACK[i % FORMAS_FALLBACK.length]!,
    }));

  // Mini-DRE. Linhas WPINK só se alguma loja do escopo tem a marca.
  const custos = fs.map((f) => custosDaFilialReal(f));
  const temWpink = fs.some((f) => f.temWpink);
  const linhasMarca: FixedCostRow[] = [];
  if (incluiWepink) {
    linhasMarca.push(
      { rotulo: `Royalties WEPINK${rotuloPct(custos.map((c) => c.royaltiesWepinkPct))}`, valor: atual.royWepink },
      { rotulo: `Marketing WEPINK${rotuloPct(custos.map((c) => c.mktWepinkPct))}`, valor: atual.mktWepink },
    );
  }
  if (incluiWpink && temWpink) {
    const cw = fs.filter((f) => f.temWpink).map((f) => custosDaFilialReal(f));
    linhasMarca.push(
      { rotulo: `Royalties WPINK${rotuloPct(cw.map((c) => c.royaltiesWpinkPct))}`, valor: atual.royWpink },
      { rotulo: `Marketing WPINK${rotuloPct(cw.map((c) => c.mktWpinkPct))}`, valor: atual.mktWpink },
    );
  }
  // Aluguel do mês = maior entre o fixo e o %: mostra o fixo e, se o % passar dele, só o excedente.
  const aluguelFixo = atual.aluguelMinBase;
  const aluguelExcedente = Math.max(0, atual.aluguelPct + atual.aluguelMin - aluguelFixo);
  const rotuloAluguelPct = `${aluguelFixo > 0 ? "Aluguel percentual excedente" : "Aluguel percentual"}${rotuloPct(custos.map((c) => c.aluguelWepinkPct))}`;
  const custosFixosFranquia: FixedCostRow[] = [
    { rotulo: "Lucro bruto", valor: lucroAtual },
    ...(aluguelFixo > 0 ? [{ rotulo: "Aluguel", valor: aluguelFixo }] : []),
    ...(aluguelExcedente >= 0.005 ? [{ rotulo: rotuloAluguelPct, valor: aluguelExcedente }] : []),
    ...linhasMarca,
    { rotulo: "Total de custos", valor: totalCustos, ehTotal: true },
    { rotulo: "Resultado operacional", valor: resultadoAtual, ehResultado: true },
  ];

  let faturamentoPorMarca: RevenueByBrand[] | null = null;
  if (!divisao) {
    let fatWepink = 0;
    let fatWpink = 0;
    for (const f of fs) {
      for (const iso of diasPeriodo) {
        const cell = cells.get(`${f.id}|${iso}`);
        fatWepink += cell?.WEPINK?.rev ?? 0;
        fatWpink += cell?.WPINK?.rev ?? 0;
      }
    }
    const tot = fatWepink + fatWpink;
    faturamentoPorMarca = temWpink
      ? [
          { marca: "WEPINK", valor: fatWepink, pct: tot > 0 ? (fatWepink / tot) * 100 : 0, cor: "var(--wepink)" },
          { marca: "WPINK", valor: fatWpink, pct: tot > 0 ? (fatWpink / tot) * 100 : 0, cor: "var(--wpink)" },
        ].filter((m) => m.valor > 0)
      : null;
  }

  // Evolução mensal: período mensal (calendário) — meses do filtro, recortados nas pontas; 1 mês só = + 5 anteriores inteiros.
  const evo = monthlyEvolutionMonths(periodo, eixoSerie);
  const evolucaoMensal: MonthlyEvolutionRow[] = evo.meses
    .map((mes) => {
      const iniMes = mes === periodo.inicio.slice(0, 7) ? periodo.inicio : `${mes}-01`;
      const fimMes = fimDoMes(`${mes}-01`);
      const fimCorte = [fimMes, periodo.fim, today].sort()[0]!;
      const l = sumDays(intervaloDias(iniMes, fimCorte));
      const lucro = finLucro(l);
      return {
        mes: rotuloMesEvolucao(mes, evo.meses, iniMes, fimCorte),
        faturamento: l.rev,
        custo: l.cmv,
        lucro,
        margemPct: divSeguro(lucro, l.rev) * 100,
        ticketMedio: divSeguro(l.rev, l.sales),
      };
    })
    .filter((r) => r.faturamento > 0);

  const costDays = new Set<string>();
  const semCusto = new Map<string, ProductWithoutCost>();
  for (const r of input.productCostDayAggs ?? []) {
    if (!storeById.has(r.storeId)) continue;
    costDays.add(`${r.storeId}|${r.day}`);
    if (r.day < periodo.inicio || r.day > periodo.fim || r.revenueCents <= 0 || r.cmvCents !== 0) continue;
    const codigo = r.productCode.trim();
    if (!codigo) continue;
    const p = semCusto.get(codigo) ?? { codigo, nome: input.productNames?.[codigo] ?? "", itens: 0, faturamento: 0 };
    p.itens += r.itemCount;
    p.faturamento += r.revenueCents / 100;
    semCusto.set(codigo, p);
  }
  const produtosSemCusto = [...semCusto.values()].sort((a, b) => b.faturamento - a.faturamento);

  return {
    escopo,
    periodo,
    kpis,
    eixoSerie,
    rotuloSerie,
    resultadoRateado,
    custoLucroMargem,
    resultadoOperacional,
    deltaResultado,
    formasPagamento,
    faturamentoPorMarca,
    custosFixosFranquia,
    custosConfigurados: fs.some(storeOperatingCostsConfigured),
    evolucaoMensal,
    mostrarEvolucaoMensal: evo.meses.length > 0,
    rotuloEvolucaoMensal: rotuloEvolucao(periodo, evo.comAnteriores),
    faturamentoAtual: atual.rev,
    kpiItens: {
      label: "Itens vendidos",
      valor: num(Math.round(atual.items)),
      delta:
        temComp && antLine.items > 0 && atual.items > 0
          ? kpiDelta(Math.round(atual.items), Math.round(antLine.items), vsRotulo, false)
          : undefined,
    },
    kpisWpink: buildFinanceWpinkKpis({
      mostrar: fs.some((f) => f.temWpink),
      atual: wpinkTotals(input.dayAggs, storeById, periodo.inicio, periodo.fim, costDays),
      anterior: wpinkPrevTotals(input.dayAggs, input.prevHourAggs ?? [], storeById, ant),
      faturamentoTotal: atual.rev,
      vsRotulo: ant.rotulo,
      cmvCompare: {
        atual: wpinkTotals(input.dayAggs, storeById, periodo.inicio, cortaHoje ? somarDias(periodo.fim, -1) : periodo.fim, costDays),
        anterior: wpinkTotals(input.dayAggs, storeById, ant.inicio, cortaHoje ? somarDias(ant.fim, -1) : ant.fim, costDays),
        vsRotulo: vsCmv,
      },
    }),
    produtosSemCusto,
  };
}

/** Início da janela de dias que o Financeiro precisa (período anterior e 6 meses de evolução). */
export function financeFetchRange(escopo: Scope): { from: string; to: string; prevHourDay: string | null } {
  const today = calendarTodayIso();
  const periodo = resolvePeriod(escopo.periodo, today);
  const ant = previousPeriod(periodo);
  const evo = monthlyEvolutionMonths(periodo, seriesAxisForPeriod(periodo));
  const from = [periodo.inicio, ant.inicio, ...(evo.comAnteriores ? [`${evo.meses[0]}-01`] : [])].sort()[0]!;
  const to = periodo.fim > today ? periodo.fim : today;
  const prevHourDay = periodo.terminaHoje ? ant.fim : null;
  return { from, to, prevHourDay };
}

/* ================================================================
 * TELA PRODUTOS — camada de dados (agregados reais do sync)
 * ================================================================ */

export type ProductsKpi = FinanceKpi;

export interface CategoryRevenue {
  categoriaId: number;
  nome: string;
  faturamento: number;
  itens: number;
}

/** Linha da tabela de produtos (relatório {E7A5C5C7} + CMV do RELATORIOMARGEM por COD_PRODUTO). */
export interface ProductItemRow {
  /** `COD_PRODUTO` ou `#productId` (sem código) — abre o detalhe. */
  chave: string;
  codigo: string;
  nome: string;
  faturamento: number;
  itens: number;
  precoMedio: number;
  /** Participação no faturamento dos produtos do período (0–100). */
  participacaoPct: number;
  /** null = algum dia com venda do produto sem custo gravado (nada estimado). */
  cmv: number | null;
  lucro: number | null;
  margemPct: number | null;
  /** Faturamento vs período anterior (%); null sem base de comparação. */
  variacaoPct: number | null;
  /** Faturamento nos dois lados do comparativo (mesmo recorte da Variação) — variação do total. */
  faturamentoCmp: number;
  faturamentoAnt: number;
}

export type AbcClass = "A" | "B" | "C";

/** Categoria na curva ABC (Pareto): ordenada por faturamento desc. */
export interface AbcCategory {
  categoriaId: number;
  nome: string;
  faturamento: number;
  pct: number;
  pctAcumulado: number;
  classe: AbcClass;
}

export interface AbcCurveSummary {
  classe: AbcClass;
  qtdCategorias: number;
  /** Participação da classe no faturamento total (0–100). */
  pctReceita: number;
  /** Soma do faturamento das categorias da classe. */
  faturamento: number;
}

export interface AbcCurveCategories {
  itens: AbcCategory[];
  resumo: AbcCurveSummary[];
}

export interface ProductsView {
  escopo: Scope;
  periodo: ResolvedPeriod;
  /** Faturamento · Lucro bruto · Margem · Itens vendidos (mesmas regras do Financeiro). */
  kpis: ProductsKpi[];
  kpisWpink: OverviewKpiWpink[];
  temVendas: boolean;
  categorias: CategoryRevenue[];
  deltaCategorias?: { value: string; positive: boolean; vs?: string; anterior?: string };
  /** Curva ABC (Pareto) das categorias — cortes 80% / 95%. */
  curvaAbcCategorias: AbcCurveCategories;
  produtos: ProductItemRow[];
  /** Linhas de produto (fragrância), ranking completo por faturamento. */
  linhas: ProductLineRow[];
  /** Faturamento de produtos sem linha (skincare, cabelo, maquiagem, suplementos, kits). */
  semLinhaFaturamento: number;
  /** Algum produto do período tem CMV gravado. */
  temCustoProduto: boolean;
  /** Base da coluna Variação (tooltip). */
  vsVariacao: string;
  /** Produtos vendidos no período com custo R$ 0 no Millennium. */
  produtosSemCusto: ProductWithoutCost[];
}

export type ProductsAggInput = FinanceAggInput & {
  categoryDayAggs?: import("./salesTypes").SalesCategoryDayAgg[];
  productDayAggs?: import("./salesTypes").SalesProductDayAgg[];
  productCostDayAggs?: import("./salesTypes").SalesProductCostDayAgg[];
  /** Descrições do catálogo — nome estável das linhas de produto. */
  catalogDescriptions?: string[];
  /** id do produto no ERP → tipo (categoria) — detalhe da Curva ABC. */
  catalogTypes?: Record<number, number>;
};

export interface ProductLineRow {
  nome: string;
  faturamento: number;
  itens: number;
  /** Produtos da linha vendidos no período. */
  produtos: number;
  /** Tipos vendidos (desodorante colônia, body splash…), do maior faturamento para o menor. */
  tipos: string[];
  participacaoPct: number;
  /** null = algum produto da linha sem custo gravado. */
  margemPct: number | null;
  variacaoPct: number | null;
  /** Chaves (`ProductItemRow.chave`) de todos os produtos da linha — abre o detalhe. */
  chaves: string[];
}

/** Classifica categorias em A/B/C (80%/95% acumulado), já ordenadas por fat. desc. */
export function classifyAbcCurve(cats: Array<{ categoriaId: number; nome: string; faturamento: number }>): AbcCurveCategories {
  const total = cats.reduce((s, c) => s + c.faturamento, 0) || 1;
  let acum = 0;
  const itens: AbcCategory[] = cats.map((c) => {
    const pct = (c.faturamento / total) * 100;
    const antes = acum;
    acum += pct;
    const classe: AbcClass = antes < 80 ? "A" : antes < 95 ? "B" : "C";
    return {
      categoriaId: c.categoriaId,
      nome: c.nome,
      faturamento: c.faturamento,
      pct,
      pctAcumulado: acum,
      classe,
    };
  });
  const classes: AbcClass[] = ["A", "B", "C"];
  const resumo: AbcCurveSummary[] = classes.map((classe) => {
    const doGrupo = itens.filter((i) => i.classe === classe);
    const faturamento = doGrupo.reduce((s, i) => s + i.faturamento, 0);
    return {
      classe,
      qtdCategorias: doGrupo.length,
      pctReceita: doGrupo.reduce((s, i) => s + i.pct, 0),
      faturamento,
    };
  });
  return { itens, resumo };
}

/** Janela de leitura de categorias/produtos: período anterior + período atual. */
export function productsFetchRange(escopo: Scope): { from: string; to: string } {
  const periodo = resolvePeriod(escopo.periodo, calendarTodayIso());
  const ant = previousPeriod(periodo);
  return { from: ant.inicio < periodo.inicio ? ant.inicio : periodo.inicio, to: periodo.fim };
}

/**
 * Produtos a partir dos agregados do sync. Sem filtro de marca (tudo ALL).
 * KPIs e faixa WPINK = Financeiro. Categorias e produtos sem hora: terminando hoje,
 * os comparativos usam "até ontem" nos dois lados.
 */
export function buildProductsView(escopo: Scope, input: ProductsAggInput = { dayAggs: [] }): ProductsView {
  const esc: Scope = { ...escopo, divisao: null };
  const fin = buildFinanceViewFromAggs(esc, input);
  const periodo = fin.periodo;
  const storeById = new Map(storesInScope(esc).map((f) => [f.id, f]));

  const ant = previousPeriod(periodo, calendarCurrentHour());
  const cortaHoje = ant.horaMax != null;
  const fimCmp = cortaHoje ? somarDias(periodo.fim, -1) : periodo.fim;
  const antFimCmp = cortaHoje ? somarDias(ant.fim, -1) : ant.fim;
  const vsCmp = cortaHoje ? `${ant.rotulo}, até o mesmo dia` : ant.rotulo;
  const noAtual = (d: string) => d >= periodo.inicio && d <= periodo.fim;
  const noAtualCmp = (d: string) => d >= periodo.inicio && d <= fimCmp;
  const noAntCmp = (d: string) => d >= ant.inicio && d <= antFimCmp;

  const kpiPorLabel = (label: string) => fin.kpis.find((k) => k.label === label);
  const kpis = [kpiPorLabel("Faturamento"), kpiPorLabel("Lucro bruto"), kpiPorLabel("Margem"), fin.kpiItens].filter(
    (k): k is ProductsKpi => Boolean(k),
  );

  // Categorias (itens vendidos × catálogo) — chave = PRODUTO_TIPO; nome = o do dia mais recente.
  const catAcc = new Map<number, { nome: string; nomeDia: string; fat: number; itens: number; fatCmp: number; fatAnt: number }>();
  for (const r of input.categoryDayAggs ?? []) {
    if (!storeById.has(r.storeId)) continue;
    const acc = catAcc.get(r.categoryId) ?? { nome: "", nomeDia: "", fat: 0, itens: 0, fatCmp: 0, fatAnt: 0 };
    if (r.categoryName && r.day >= acc.nomeDia) {
      acc.nome = r.categoryName;
      acc.nomeDia = r.day;
    }
    const v = r.revenueCents / 100;
    if (noAtual(r.day)) {
      acc.fat += v;
      acc.itens += r.itemCount;
    }
    if (noAtualCmp(r.day)) acc.fatCmp += v;
    if (noAntCmp(r.day)) acc.fatAnt += v;
    catAcc.set(r.categoryId, acc);
  }
  const categorias: CategoryRevenue[] = [...catAcc.entries()]
    .filter(([, c]) => c.fat > 0)
    .map(([id, c]) => ({ categoriaId: id, nome: labelUpper(c.nome || `Tipo ${id}`), faturamento: c.fat, itens: c.itens }))
    .sort((a, b) => b.faturamento - a.faturamento || a.nome.localeCompare(b.nome, "pt-BR"));
  const catCmp = [...catAcc.values()].reduce((s, c) => s + c.fatCmp, 0);
  const catAnt = [...catAcc.values()].reduce((s, c) => s + c.fatAnt, 0);
  const deltaCategorias = catCmp > 0 && catAnt > 0 ? kpiDelta(catCmp, catAnt, vsCmp) : undefined;

  // CMV por produto (RELATORIOMARGEM) — loja × dia × COD_PRODUTO.
  const custoKey = (storeId: string, day: string, code: string) => `${storeId}|${day}|${code}`;
  const custos = new Map<string, number>();
  for (const r of input.productCostDayAggs ?? []) {
    if (!storeById.has(r.storeId) || !noAtual(r.day)) continue;
    const k = custoKey(r.storeId, r.day, r.productCode.trim());
    custos.set(k, (custos.get(k) ?? 0) + r.cmvCents / 100);
  }
  const custosLoja = new Map<string, ReturnType<typeof custosDaFilialReal>>();
  const custoDaLoja = (storeId: string) => {
    let c = custosLoja.get(storeId);
    if (!c) {
      c = custosDaFilialReal(storeById.get(storeId)!);
      custosLoja.set(storeId, c);
    }
    return c;
  };

  type ProdAcc = {
    nome: string;
    nomeDia: string;
    fat: number;
    itens: number;
    cmv: number;
    impostos: number;
    semCusto: boolean;
    fatCmp: number;
    fatAnt: number;
  };
  const prodAcc = new Map<string, ProdAcc>();
  const custosUsados = new Set<string>();
  for (const r of input.productDayAggs ?? []) {
    if (!storeById.has(r.storeId)) continue;
    const code = r.productCode.trim();
    const key = code || `#${r.productId}`;
    const acc = prodAcc.get(key) ?? {
      nome: "",
      nomeDia: "",
      fat: 0,
      itens: 0,
      cmv: 0,
      impostos: 0,
      semCusto: false,
      fatCmp: 0,
      fatAnt: 0,
    };
    if (r.productName && r.day >= acc.nomeDia) {
      acc.nome = r.productName;
      acc.nomeDia = r.day;
    }
    const v = r.revenueCents / 100;
    if (noAtual(r.day)) {
      acc.fat += v;
      acc.itens += r.itemCount;
      const taxa = custoDaLoja(r.storeId);
      acc.impostos += (v * taxa.icmsPct) / 100;
      if (v > 0) {
        const k = custoKey(r.storeId, r.day, code);
        const cmv = code ? custos.get(k) : undefined;
        if (cmv == null) acc.semCusto = true;
        else if (!custosUsados.has(k)) {
          custosUsados.add(k);
          acc.cmv += cmv;
          acc.impostos += (cmv * taxa.icmsStPct) / 100;
        }
      }
    }
    if (noAtualCmp(r.day)) acc.fatCmp += v;
    if (noAntCmp(r.day)) acc.fatAnt += v;
    prodAcc.set(key, acc);
  }

  const totalProdutos = [...prodAcc.values()].reduce((s, p) => s + p.fat, 0);
  const produtos: ProductItemRow[] = [...prodAcc.entries()]
    .filter(([, p]) => p.fat > 0)
    .map(([key, p]) => {
      const cmv = p.semCusto ? null : p.cmv;
      const lucro = cmv == null ? null : p.fat - cmv - p.impostos;
      return {
        chave: key,
        codigo: key.startsWith("#") ? "" : key,
        nome: labelUpper(p.nome || key),
        faturamento: p.fat,
        itens: p.itens,
        precoMedio: divSeguro(p.fat, p.itens),
        participacaoPct: divSeguro(p.fat, totalProdutos) * 100,
        cmv,
        lucro,
        margemPct: lucro == null ? null : divSeguro(lucro, p.fat) * 100,
        variacaoPct: p.fatAnt > 0 && p.fatCmp > 0 ? ((p.fatCmp - p.fatAnt) / p.fatAnt) * 100 : null,
        faturamentoCmp: p.fatCmp,
        faturamentoAnt: p.fatAnt,
      };
    })
    .sort((a, b) => b.faturamento - a.faturamento || a.nome.localeCompare(b.nome, "pt-BR"));

  // Linhas de produto: fragrância da descrição (catálogo = nome estável da linha).
  const lineIndex = buildProductLineIndex([
    ...(input.catalogDescriptions ?? []),
    ...[...prodAcc.values()].map((p) => p.nome).filter(Boolean),
  ]);
  type LineAcc = {
    fat: number;
    itens: number;
    produtos: number;
    lucro: number;
    semCusto: boolean;
    fatCmp: number;
    fatAnt: number;
    tipos: Map<string, number>;
    chaves: string[];
  };
  const lineAcc = new Map<string, LineAcc>();
  let semLinhaFaturamento = 0;
  for (const [chave, p] of prodAcc) {
    const l = p.nome ? lineIndex.lineOf(p.nome) : null;
    if (!l) {
      semLinhaFaturamento += p.fat;
      continue;
    }
    const acc = lineAcc.get(l.line) ?? {
      fat: 0,
      itens: 0,
      produtos: 0,
      lucro: 0,
      semCusto: false,
      fatCmp: 0,
      fatAnt: 0,
      tipos: new Map<string, number>(),
      chaves: [],
    };
    acc.chaves.push(chave);
    acc.fatCmp += p.fatCmp;
    acc.fatAnt += p.fatAnt;
    if (p.fat > 0) {
      acc.fat += p.fat;
      acc.itens += p.itens;
      acc.produtos += 1;
      acc.tipos.set(l.kind, (acc.tipos.get(l.kind) ?? 0) + p.fat);
      if (p.semCusto) acc.semCusto = true;
      else acc.lucro += p.fat - p.cmv - p.impostos;
    }
    lineAcc.set(l.line, acc);
  }
  const linhas: ProductLineRow[] = [...lineAcc.entries()]
    .filter(([, l]) => l.fat > 0)
    .map(([nome, l]) => ({
      nome,
      faturamento: l.fat,
      itens: l.itens,
      produtos: l.produtos,
      tipos: [...l.tipos.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
      participacaoPct: divSeguro(l.fat, totalProdutos) * 100,
      margemPct: l.semCusto ? null : divSeguro(l.lucro, l.fat) * 100,
      variacaoPct: l.fatAnt > 0 && l.fatCmp > 0 ? ((l.fatCmp - l.fatAnt) / l.fatAnt) * 100 : null,
      chaves: l.chaves,
    }))
    .sort((a, b) => b.faturamento - a.faturamento || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    escopo: esc,
    periodo,
    kpis,
    kpisWpink: fin.kpisWpink,
    temVendas: (fin.faturamentoAtual ?? 0) > 0,
    categorias,
    deltaCategorias,
    curvaAbcCategorias: classifyAbcCurve(categorias),
    produtos,
    linhas,
    semLinhaFaturamento,
    temCustoProduto: produtos.some((p) => p.cmv != null),
    vsVariacao: vsCmp,
    produtosSemCusto: (fin.produtosSemCusto ?? []).map((p) => ({
      ...p,
      nome: p.nome || prodAcc.get(p.codigo)?.nome || "",
    })),
  };
}

export interface ProductDetailStore {
  filialId: string;
  nome: string;
  faturamento: number;
  itens: number;
  /** Fatia do faturamento do produto no escopo (0–100). */
  pct: number;
}

export interface ProductDetailItem {
  chave: string;
  codigo: string;
  nome: string;
  faturamento: number;
  itens: number;
  /** Fatia do faturamento da linha (0–100). */
  pct: number;
  /** null = algum dia com venda do produto sem custo (nada estimado). */
  margemPct: number | null;
}

export interface ProductDetailCategory {
  categoriaId: number;
  nome: string;
  itens: number;
  faturamento: number;
  margemPct: number | null;
  /** Participação no faturamento de todas as categorias (0–100). */
  pct: number;
  pctAcumulado: number;
}

export interface ProductDetail {
  tipo: "produto" | "linha" | "categoria" | "classe";
  /** Produto = `ProductItemRow.chave`; linha = nome; categoria = id; classe = A/B/C. */
  chave: string;
  codigo: string;
  nome: string;
  faturamento: number;
  itens: number;
  precoMedio: number;
  participacaoPct: number;
  cmv: number | null;
  lucro: number | null;
  margemPct: number | null;
  /** Faturamento/itens por dia (2–31 dias) ou por mês (> 31); null em 1 dia (sem dado por hora). */
  serie: { label: string; faturamento: number; itens: number }[] | null;
  serieGranularidade: "dia" | "mes";
  /** Só com mais de 1 loja no escopo. */
  lojas: ProductDetailStore[];
  /** Mesmo recorte da coluna Variação (período terminando hoje = até ontem nos dois lados). */
  comparativo: {
    vs: string;
    faturamento?: ReturnType<typeof kpiDelta>;
    itens?: ReturnType<typeof kpiDelta>;
    margem?: ReturnType<typeof kpiDeltaPp>;
  } | null;
  /** Linha: produtos vendidos no período (maior faturamento primeiro). Produto: vazio. */
  produtos: ProductDetailItem[];
  /** Linha: tipos vendidos (desodorante colônia, body splash…). */
  tipos: string[];
  /** Classe da Curva ABC: categorias da classe. */
  categorias: ProductDetailCategory[];
  /** Categoria: classe dela na Curva ABC. */
  classe?: AbcClass;
}

type ItemsDetail = Omit<ProductDetail, "tipo" | "chave" | "codigo" | "nome" | "participacaoPct" | "tipos" | "categorias" | "classe">;

/** Mesma chave do `buildProductsView`: `COD_PRODUTO` ou `#productId`. */
const productRowKey = (r: { productCode: string; productId: number }) => r.productCode.trim() || `#${r.productId}`;

/** Detalhe de um conjunto de produtos — mesmas regras de custo/impostos do `buildProductsView`. */
function buildItemsDetail(
  escopo: Scope,
  input: ProductsAggInput,
  chaves: Set<string>,
  opts: { margemPorProduto?: boolean } = {},
): ItemsDetail {
  const margemPorProduto = opts.margemPorProduto ?? true;
  const esc: Scope = { ...escopo, divisao: null };
  const periodo = resolvePeriod(esc.periodo, calendarTodayIso());
  const storeById = new Map(storesInScope(esc).map((f) => [f.id, f]));

  const ant = previousPeriod(periodo, calendarCurrentHour());
  const cortaHoje = ant.horaMax != null;
  const fimCmp = cortaHoje ? somarDias(periodo.fim, -1) : periodo.fim;
  const antFimCmp = cortaHoje ? somarDias(ant.fim, -1) : ant.fim;
  const vsCmp = cortaHoje ? `${ant.rotulo}, até o mesmo dia` : ant.rotulo;
  const noAtual = (d: string) => d >= periodo.inicio && d <= periodo.fim;
  const noAtualCmp = (d: string) => d >= periodo.inicio && d <= fimCmp;
  const noAntCmp = (d: string) => d >= ant.inicio && d <= antFimCmp;

  const linhas = (input.productDayAggs ?? []).filter((r) => storeById.has(r.storeId) && chaves.has(productRowKey(r)));

  const custoKey = (storeId: string, day: string, code: string) => `${storeId}|${day}|${code}`;
  const custos = new Map<string, number>();
  for (const r of input.productCostDayAggs ?? []) {
    const code = r.productCode.trim();
    if (!storeById.has(r.storeId) || !code || !chaves.has(code)) continue;
    const k = custoKey(r.storeId, r.day, code);
    custos.set(k, (custos.get(k) ?? 0) + r.cmvCents / 100);
  }
  const taxas = new Map<string, ReturnType<typeof custosDaFilialReal>>();
  const taxaDaLoja = (storeId: string) => {
    let t = taxas.get(storeId);
    if (!t) {
      t = custosDaFilialReal(storeById.get(storeId)!);
      taxas.set(storeId, t);
    }
    return t;
  };

  const acumular = (no: (d: string) => boolean, chave?: string) => {
    let fat = 0;
    let itens = 0;
    let cmv = 0;
    let impostos = 0;
    let semCusto = false;
    const usados = new Set<string>();
    for (const r of linhas) {
      if (!no(r.day) || (chave != null && productRowKey(r) !== chave)) continue;
      const v = r.revenueCents / 100;
      fat += v;
      itens += r.itemCount;
      const taxa = taxaDaLoja(r.storeId);
      impostos += (v * taxa.icmsPct) / 100;
      if (v > 0) {
        const code = r.productCode.trim();
        const k = custoKey(r.storeId, r.day, code);
        const c = code ? custos.get(k) : undefined;
        if (c == null) semCusto = true;
        else if (!usados.has(k)) {
          usados.add(k);
          cmv += c;
          impostos += (c * taxa.icmsStPct) / 100;
        }
      }
    }
    const lucro = semCusto ? null : fat - cmv - impostos;
    return {
      fat,
      itens,
      cmv: semCusto ? null : cmv,
      lucro,
      margemPct: lucro == null || fat <= 0 ? null : divSeguro(lucro, fat) * 100,
    };
  };

  const atual = acumular(noAtual);

  let serie: ProductDetail["serie"] = null;
  const dias = intervaloDias(periodo.inicio, periodo.fim);
  const serieGranularidade: ProductDetail["serieGranularidade"] = dias.length > 31 ? "mes" : "dia";
  if (dias.length > 1) {
    const porDia = new Map<string, { faturamento: number; itens: number }>();
    for (const r of linhas) {
      if (!noAtual(r.day)) continue;
      const k = serieGranularidade === "mes" ? r.day.slice(0, 7) : r.day;
      const acc = porDia.get(k) ?? { faturamento: 0, itens: 0 };
      acc.faturamento += r.revenueCents / 100;
      acc.itens += r.itemCount;
      porDia.set(k, acc);
    }
    const eixo = serieGranularidade === "mes" ? [...new Set(dias.map((d) => d.slice(0, 7)))] : dias;
    const variosAnos = periodo.inicio.slice(0, 4) !== periodo.fim.slice(0, 4);
    serie = eixo.map((k) => ({
      label:
        serieGranularidade === "mes"
          ? `${mesCurto(`${k}-01`)}${variosAnos ? `/${k.slice(2, 4)}` : ""}`
          : dataCurta(k),
      faturamento: porDia.get(k)?.faturamento ?? 0,
      itens: porDia.get(k)?.itens ?? 0,
    }));
  }

  let lojas: ProductDetailStore[] = [];
  if (storeById.size > 1) {
    const porLoja = new Map<string, { faturamento: number; itens: number }>();
    for (const r of linhas) {
      if (!noAtual(r.day)) continue;
      const acc = porLoja.get(r.storeId) ?? { faturamento: 0, itens: 0 };
      acc.faturamento += r.revenueCents / 100;
      acc.itens += r.itemCount;
      porLoja.set(r.storeId, acc);
    }
    lojas = [...porLoja.entries()]
      .filter(([, l]) => l.faturamento > 0)
      .map(([id, l]) => ({
        filialId: id,
        nome: storeById.get(id)!.fantasia,
        faturamento: l.faturamento,
        itens: l.itens,
        pct: divSeguro(l.faturamento, atual.fat) * 100,
      }))
      .sort((a, b) => b.faturamento - a.faturamento || a.nome.localeCompare(b.nome, "pt-BR"));
  }

  const porProduto = new Map<string, { nome: string; nomeDia: string; faturamento: number; itens: number }>();
  for (const r of linhas) {
    const key = productRowKey(r);
    const acc = porProduto.get(key) ?? { nome: "", nomeDia: "", faturamento: 0, itens: 0 };
    if (r.productName && r.day >= acc.nomeDia) {
      acc.nome = r.productName;
      acc.nomeDia = r.day;
    }
    if (noAtual(r.day)) {
      acc.faturamento += r.revenueCents / 100;
      acc.itens += r.itemCount;
    }
    porProduto.set(key, acc);
  }
  const produtos: ProductDetailItem[] = [...porProduto.entries()]
    .filter(([, p]) => p.faturamento > 0)
    .map(([key, p]) => ({
      chave: key,
      codigo: key.startsWith("#") ? "" : key,
      nome: labelUpper(p.nome || key),
      faturamento: p.faturamento,
      itens: p.itens,
      pct: divSeguro(p.faturamento, atual.fat) * 100,
      margemPct: margemPorProduto ? acumular(noAtual, key).margemPct : null,
    }))
    .sort((a, b) => b.faturamento - a.faturamento || a.nome.localeCompare(b.nome, "pt-BR"));

  const cmpAtual = acumular(noAtualCmp);
  const cmpAnt = acumular(noAntCmp);
  const comparativo: ProductDetail["comparativo"] =
    cmpAtual.fat > 0 && cmpAnt.fat > 0
      ? {
          vs: vsCmp,
          faturamento: kpiDelta(cmpAtual.fat, cmpAnt.fat, vsCmp),
          itens: kpiDelta(cmpAtual.itens, cmpAnt.itens, vsCmp, false),
          margem:
            cmpAtual.margemPct != null && cmpAnt.margemPct != null
              ? kpiDeltaPp(cmpAtual.margemPct, cmpAnt.margemPct, vsCmp)
              : undefined,
        }
      : null;

  return {
    faturamento: atual.fat,
    itens: atual.itens,
    precoMedio: divSeguro(atual.fat, atual.itens),
    cmv: atual.cmv,
    lucro: atual.lucro,
    margemPct: atual.margemPct,
    serie,
    serieGranularidade,
    lojas,
    comparativo,
    produtos,
  };
}

/** Detalhe de 1 produto (chave da `ProductItemRow`). */
export function buildProductDetail(
  escopo: Scope,
  input: ProductsAggInput,
  produto: Pick<ProductItemRow, "chave" | "codigo" | "nome" | "participacaoPct">,
): ProductDetail {
  const d = buildItemsDetail(escopo, input, new Set([produto.chave]));
  return {
    ...d,
    tipo: "produto",
    chave: produto.chave,
    codigo: produto.codigo,
    nome: d.produtos[0]?.nome ?? produto.nome,
    participacaoPct: produto.participacaoPct,
    produtos: [],
    tipos: [],
    categorias: [],
  };
}

/** Detalhe de uma linha de produto (fragrância) — soma dos produtos dela + lista dos produtos. */
export function buildProductLineDetail(
  escopo: Scope,
  input: ProductsAggInput,
  linha: Pick<ProductLineRow, "nome" | "chaves" | "tipos" | "participacaoPct">,
): ProductDetail {
  const d = buildItemsDetail(escopo, input, new Set(linha.chaves));
  return {
    ...d,
    tipo: "linha",
    chave: linha.nome,
    codigo: "",
    nome: linha.nome,
    participacaoPct: linha.participacaoPct,
    tipos: linha.tipos,
    categorias: [],
  };
}

/** Mesmo join da `sales_category_day_view`: produto fora do catálogo = INDEFINIDO. */
const CATEGORIA_INDEFINIDA = -2000000000;

function productKeysByCategory(input: ProductsAggInput): Map<number, Set<string>> {
  const tipos = input.catalogTypes ?? {};
  const out = new Map<number, Set<string>>();
  for (const r of input.productDayAggs ?? []) {
    const cat = tipos[r.productId] ?? CATEGORIA_INDEFINIDA;
    let set = out.get(cat);
    if (!set) {
      set = new Set();
      out.set(cat, set);
    }
    set.add(productRowKey(r));
  }
  return out;
}

/** Detalhe de uma categoria (tipo de produto) — soma dos produtos dela + lista dos produtos. */
export function buildCategoryDetail(
  escopo: Scope,
  input: ProductsAggInput,
  categoria: Pick<AbcCategory, "categoriaId" | "nome" | "pct" | "classe">,
): ProductDetail {
  const chaves = productKeysByCategory(input).get(categoria.categoriaId) ?? new Set<string>();
  const d = buildItemsDetail(escopo, input, chaves);
  return {
    ...d,
    tipo: "categoria",
    chave: String(categoria.categoriaId),
    codigo: "",
    nome: categoria.nome,
    participacaoPct: categoria.pct,
    tipos: [],
    categorias: [],
    classe: categoria.classe,
  };
}

/** Detalhe de uma classe da Curva ABC — soma das categorias dela + lista das categorias. */
export function buildAbcClassDetail(
  escopo: Scope,
  input: ProductsAggInput,
  view: Pick<ProductsView, "curvaAbcCategorias" | "categorias">,
  classe: AbcClass,
): ProductDetail {
  const porCategoria = productKeysByCategory(input);
  const daClasse = view.curvaAbcCategorias.itens.filter((i) => i.classe === classe);
  const chaves = new Set<string>();
  for (const c of daClasse) for (const k of porCategoria.get(c.categoriaId) ?? []) chaves.add(k);
  const d = buildItemsDetail(escopo, input, chaves, { margemPorProduto: false });
  const categorias: ProductDetailCategory[] = daClasse.map((c) => {
    const det = buildItemsDetail(escopo, input, porCategoria.get(c.categoriaId) ?? new Set<string>(), { margemPorProduto: false });
    return {
      categoriaId: c.categoriaId,
      nome: c.nome,
      itens: view.categorias.find((x) => x.categoriaId === c.categoriaId)?.itens ?? det.itens,
      faturamento: c.faturamento,
      margemPct: det.margemPct,
      pct: c.pct,
      pctAcumulado: c.pctAcumulado,
    };
  });
  return {
    ...d,
    tipo: "classe",
    chave: classe,
    codigo: "",
    nome: `Classe ${classe}`,
    participacaoPct: view.curvaAbcCategorias.resumo.find((r) => r.classe === classe)?.pctReceita ?? 0,
    produtos: [],
    tipos: [],
    categorias,
  };
}

/**
 * Turno da pessoa (Configurações > Lojas): liga pelo código da funcionária → gerador → nome,
 * na ordem das lojas recebida (maior venda primeiro). Rótulo "Manhã · 09:00–15:00".
 */
function sellerShiftResolver(shifts: import("./salesTypes").SellerShiftRef[] = []) {
  const porFunc = new Map<string, string>();
  const porGerador = new Map<number, string>();
  const porNome = new Map<string, string>();
  for (const s of shifts) {
    const label = `${s.name} · ${s.start}–${s.end}`;
    if (s.employeeId != null) porFunc.set(`${s.storeId}|${s.employeeId}`, label);
    if (s.geradorId != null) porGerador.set(s.geradorId, label);
    for (const k of s.nameKeys) porNome.set(`${s.storeId}|${k}`, label);
  }
  return (p: { employeeId: number | null; geradorId: number | null; sellerKeys: Set<string>; lojas: string[] }): string | undefined => {
    for (const loja of p.lojas) {
      const f = p.employeeId != null ? porFunc.get(`${loja}|${p.employeeId}`) : undefined;
      if (f) return f;
    }
    if (p.geradorId != null && porGerador.has(p.geradorId)) return porGerador.get(p.geradorId);
    for (const loja of p.lojas) {
      for (const k of p.sellerKeys) {
        const n = porNome.get(`${loja}|${k}`);
        if (n) return n;
      }
    }
    return undefined;
  };
}

/* ================================================================
 * TELA EQUIPE — camada de dados (agregados reais do sync)
 * ================================================================ */

export interface TeamKpi {
  label: string;
  valor: string;
  sub?: string;
  delta?: { value: string; positive: boolean; vs?: string; diff?: string; anterior?: string };
  tooltip?: string;
}

export interface TeamMemberRow {
  key: string;
  nome: string;
  /** Lojas onde vendeu no período, da que mais faturou para a que menos. */
  lojas: string[];
  /** "Manhã · 09:00–15:00"; ausente = sem turno definido. */
  turno?: string;
  faturamento: number;
  vendas: number;
  itens: number;
  ticketMedio: number;
  /** Itens por venda; null se algum dia com venda não tem itens gravados (nada estimado). */
  pa: number | null;
  participacaoPct: number;
  /** Faturamento vs período anterior (sem hora: terminando hoje, até ontem nos dois lados). */
  variacaoPct: number | null;
}

export interface TeamShiftSlice {
  nome: string;
  faturamento: number;
  pessoas: number;
}

export interface TeamDashboardView {
  escopo: Scope;
  periodo: ResolvedPeriod;
  /** KPIs e tabela já filtrados pelo turno escolhido. */
  kpis: TeamKpi[];
  pessoas: TeamMemberRow[];
  /** Toda a equipe (sem filtro de turno). Maior faturamento primeiro; "Sem turno definido" sempre por último. */
  turnos: TeamShiftSlice[];
  /** Alguma pessoa das lojas do escopo tem turno cadastrado. */
  turnosConfigurados: boolean;
  /** Opções do filtro de turno (nome do turno; "Sem turno definido" se alguém vendeu sem turno). */
  turnosDisponiveis: string[];
  /** Turno aplicado (null = todos; valor fora das opções vira null). */
  turnoFiltro: string | null;
  /** Faturamento das lojas = equipe + vendas sem vendedor ou de gerência; `turno` = parte da equipe no turno filtrado. */
  composicao: { equipe: number; fora: number; total: number; turno?: number };
  vsVariacao: string;
  /** Mais de 1 loja no escopo → mostra a loja de cada pessoa. */
  multiLoja: boolean;
}

export type TeamAggInput = {
  dayAggs: import("./salesTypes").SalesDayAgg[];
  sellerDayAggs?: import("./salesTypes").SalesSellerDayAgg[];
  sellerShifts?: import("./salesTypes").SellerShiftRef[];
};

export const TEAM_SEM_TURNO = "Sem turno definido";

/** Nome do turno a partir do rótulo "Manhã · 09:00–15:00" (sem turno = TEAM_SEM_TURNO). */
export function teamShiftName(turno?: string): string {
  return turno ? (turno.split(" · ")[0] ?? turno) : TEAM_SEM_TURNO;
}

/**
 * Equipe a partir dos agregados do sync (sales_seller_day_agg, sem gerência / conta de freelancer).
 * Sem dado por hora: período terminando hoje compara até ontem nos dois lados; em "Hoje" fica sem badge.
 * `opts.turno` filtra KPIs e tabela pelo nome do turno (turno atual da pessoa vale também para o período anterior).
 */
export function buildTeamDashboardView(
  escopo: Scope,
  input: TeamAggInput = { dayAggs: [] },
  opts: { turno?: string | null } = {},
): TeamDashboardView {
  const esc: Scope = { ...escopo, divisao: null };
  const periodo = resolvePeriod(esc.periodo, calendarTodayIso());
  const fs = storesInScope(esc);
  const storeIds = new Set(fs.map((f) => f.id));
  const nomeLoja = new Map(fs.map((f) => [f.id, f.fantasia]));

  const ant = previousPeriod(periodo, calendarCurrentHour());
  const cortaHoje = ant.horaMax != null;
  const fimCmp = cortaHoje ? somarDias(periodo.fim, -1) : periodo.fim;
  const antFimCmp = cortaHoje ? somarDias(ant.fim, -1) : ant.fim;
  const vsCmp = cortaHoje ? `${ant.rotulo}, até o mesmo dia` : ant.rotulo;
  const noAtual = (d: string) => d >= periodo.inicio && d <= periodo.fim;
  const noAtualCmp = (d: string) => d >= periodo.inicio && d <= fimCmp;
  const noAntCmp = (d: string) => d >= ant.inicio && d <= antFimCmp;

  type Tot = { fat: number; vendas: number; itens: number; semItens: boolean };
  const novoTot = (): Tot => ({ fat: 0, vendas: 0, itens: 0, semItens: false });
  const somar = (t: Tot, r: { fat: number; vendas: number; itens: number; semItens: boolean }) => {
    t.fat += r.fat;
    t.vendas += r.vendas;
    t.itens += r.itens;
    if (r.semItens) t.semItens = true;
  };
  const linha = (r: import("./salesTypes").SalesSellerDayAgg) => ({
    fat: r.revenueCents / 100,
    vendas: r.salesCount,
    itens: r.itemCount ?? 0,
    semItens: r.salesCount > 0 && !(r.itemCount && r.itemCount > 0),
  });

  type Acc = {
    nome: string;
    nomeDia: string;
    atual: Tot;
    cmp: Tot;
    ant: Tot;
    fatPorLoja: Map<string, number>;
    employeeId: number | null;
    geradorId: number | null;
    sellerKeys: Set<string>;
  };
  const acc = new Map<string, Acc>();
  for (const r of input.sellerDayAggs ?? []) {
    if (!storeIds.has(r.storeId)) continue;
    const key = r.sellerEmployeeId != null ? `e:${r.sellerEmployeeId}` : `n:${r.sellerKey}`;
    const a = acc.get(key) ?? {
      nome: r.sellerName,
      nomeDia: r.day,
      atual: novoTot(),
      cmp: novoTot(),
      ant: novoTot(),
      fatPorLoja: new Map<string, number>(),
      employeeId: r.sellerEmployeeId ?? null,
      geradorId: null,
      sellerKeys: new Set<string>(),
    };
    a.sellerKeys.add(r.sellerKey);
    if (r.sellerGeradorId != null) a.geradorId = r.sellerGeradorId;
    if (r.day > a.nomeDia) {
      a.nome = r.sellerName;
      a.nomeDia = r.day;
    }
    const l = linha(r);
    if (noAtual(r.day)) {
      somar(a.atual, l);
      a.fatPorLoja.set(r.storeId, (a.fatPorLoja.get(r.storeId) ?? 0) + r.revenueCents);
    }
    if (noAtualCmp(r.day)) somar(a.cmp, l);
    if (noAntCmp(r.day)) somar(a.ant, l);
    acc.set(key, a);
  }

  const turnoDe = sellerShiftResolver(input.sellerShifts);
  const todas = [...acc.entries()].map(([key, a]) => {
    const lojasIds = [...a.fatPorLoja.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    const turno = turnoDe({
      employeeId: a.employeeId,
      geradorId: a.geradorId,
      sellerKeys: a.sellerKeys,
      // Sem venda no período (só no anterior): liga pelo código/nome em qualquer loja do escopo.
      lojas: lojasIds.length > 0 ? lojasIds : [...storeIds],
    });
    return { key, a, lojasIds, turno };
  });
  const comVenda = todas.filter(({ a }) => a.atual.fat > 0 || a.atual.vendas > 0);

  // Opções do filtro: turnos cadastrados nas lojas do escopo (ordem de início) + "Sem turno definido".
  const inicioPorNome = new Map<string, string>();
  for (const s of input.sellerShifts ?? []) {
    if (!storeIds.has(s.storeId)) continue;
    const atual = inicioPorNome.get(s.name);
    if (atual == null || s.start < atual) inicioPorNome.set(s.name, s.start);
  }
  const turnosDisponiveis = [...inicioPorNome.entries()]
    .sort((x, y) => x[1].localeCompare(y[1]) || x[0].localeCompare(y[0], "pt-BR"))
    .map(([nome]) => nome);
  if (turnosDisponiveis.length > 0 && comVenda.some((p) => !p.turno)) turnosDisponiveis.push(TEAM_SEM_TURNO);
  const turnoFiltro = opts.turno && turnosDisponiveis.includes(opts.turno) ? opts.turno : null;
  const noFiltro = (turno?: string) => !turnoFiltro || teamShiftName(turno) === turnoFiltro;

  const filtradas = todas.filter((p) => noFiltro(p.turno));
  const totAtual = novoTot();
  const totCmp = novoTot();
  const totAnt = novoTot();
  for (const { a } of filtradas) {
    somar(totAtual, a.atual);
    somar(totCmp, a.cmp);
    somar(totAnt, a.ant);
  }

  const pessoas: TeamMemberRow[] = filtradas
    .filter(({ a }) => a.atual.fat > 0 || a.atual.vendas > 0)
    .map(({ key, a, lojasIds, turno }) => ({
      key,
      nome: a.nome,
      lojas: lojasIds.map((id) => nomeLoja.get(id)).filter((n): n is string => Boolean(n)),
      turno,
      faturamento: a.atual.fat,
      vendas: a.atual.vendas,
      itens: a.atual.itens,
      ticketMedio: divSeguro(a.atual.fat, a.atual.vendas),
      pa: a.atual.semItens || a.atual.vendas === 0 ? null : a.atual.itens / a.atual.vendas,
      participacaoPct: divSeguro(a.atual.fat, totAtual.fat) * 100,
      variacaoPct: a.ant.fat > 0 && a.cmp.fat > 0 ? ((a.cmp.fat - a.ant.fat) / a.ant.fat) * 100 : null,
    }))
    .sort((x, y) => y.faturamento - x.faturamento || x.nome.localeCompare(y.nome, "pt-BR"));

  // Turnos (toda a equipe): soma por rótulo; sem turno por último.
  const porTurno = new Map<string, TeamShiftSlice>();
  let equipeTotal = 0;
  for (const { a, turno } of comVenda) {
    equipeTotal += a.atual.fat;
    const nome = turno ?? TEAM_SEM_TURNO;
    const s = porTurno.get(nome) ?? { nome, faturamento: 0, pessoas: 0 };
    s.faturamento += a.atual.fat;
    s.pessoas += 1;
    porTurno.set(nome, s);
  }
  const turnos = [...porTurno.values()]
    .filter((s) => s.faturamento > 0)
    .sort((a, b) => {
      if (a.nome === TEAM_SEM_TURNO) return 1;
      if (b.nome === TEAM_SEM_TURNO) return -1;
      return b.faturamento - a.faturamento;
    });
  const turnosConfigurados = (input.sellerShifts ?? []).some((s) => storeIds.has(s.storeId));

  const totalLojas = input.dayAggs
    .filter((r) => r.brand === "ALL" && storeIds.has(r.storeId) && noAtual(r.day))
    .reduce((s, r) => s + r.revenueCents / 100, 0);
  const fora = Math.max(0, totalLojas - equipeTotal);

  // Comparativos: só com venda no período atual (nunca −100%) e dado nos dois lados.
  const comparavel = totAtual.fat > 0 && totCmp.vendas > 0 && totAnt.vendas > 0;
  const ticketCmp = divSeguro(totCmp.fat, totCmp.vendas);
  const ticketAnt = divSeguro(totAnt.fat, totAnt.vendas);
  const n = pessoas.length;
  const ticket = divSeguro(totAtual.fat, totAtual.vendas);
  const pa = totAtual.semItens || totAtual.vendas === 0 ? null : totAtual.itens / totAtual.vendas;
  const paComparavel = comparavel && !totCmp.semItens && !totAnt.semItens;

  const kpis: TeamKpi[] = [
    {
      label: "Faturamento da equipe",
      valor: brlCent(totAtual.fat),
      sub: n > 0 ? `${n} ${n === 1 ? "pessoa" : "pessoas"} · média de ${brlCent(totAtual.fat / n)}` : undefined,
      delta: comparavel ? kpiDelta(totCmp.fat, totAnt.fat, vsCmp) : undefined,
      tooltip: "Faturamento das vendas atribuídas à equipe. Não inclui vendas sem vendedor identificado ou realizadas pela gerência.",
    },
    {
      label: "Nº de vendas",
      valor: num(totAtual.vendas),
      sub: totAtual.vendas > 0 && !totAtual.semItens ? `${num(totAtual.itens)} itens vendidos` : undefined,
      delta: comparavel ? kpiDelta(totCmp.vendas, totAnt.vendas, vsCmp, false) : undefined,
    },
    {
      label: "Ticket médio",
      valor: brlCent(ticket),
      delta: comparavel ? kpiDelta(ticketCmp, ticketAnt, vsCmp) : undefined,
    },
    {
      label: "P.A.",
      valor: pa == null ? (totAtual.vendas > 0 ? "—" : num(0, 2)) : num(pa, 2),
      sub: "Itens por venda",
      delta: paComparavel ? kpiDelta(totCmp.itens / totCmp.vendas, totAnt.itens / totAnt.vendas, vsCmp, false) : undefined,
      tooltip: pa == null && totAtual.vendas > 0 ? "O P.A. não está disponível para este período." : "Média de itens por venda.",
    },
  ];

  return {
    escopo: esc,
    periodo,
    kpis,
    pessoas,
    turnos,
    turnosConfigurados,
    turnosDisponiveis,
    turnoFiltro,
    composicao: {
      equipe: equipeTotal,
      fora,
      total: equipeTotal + fora,
      ...(turnoFiltro ? { turno: totAtual.fat } : {}),
    },
    vsVariacao: vsCmp,
    multiLoja: fs.length > 1,
  };
}

/* ================================================================
 * TELA GRUPOS — camada de dados (montarGruposView)
 * ================================================================ */

export interface GroupKpi {
  nome: string;
  faturamento: number;
  vendas: number;
  ticketMedio: number;
}

export interface GroupDayRevenue {
  dia: string;
  porGrupo: Record<string, number>;
}

export interface HourIndicator {
  hora: number;
  faturamento: number;
  atendimentos: number;
  ticketMedio: number;
  pctFatDia: number;
  fatAcumulado: number;
  pctFatAcumulado: number;
  deltaVsAnterior: { value: string; positive: boolean } | null;
}

export interface HeatmapCell {
  dia: string;
  hora: number;
  valor: number;
}

export interface SellerByHour {
  hora: number;
  reais: number;
  metaMinima: number;
}

export interface GroupsView {
  escopo: Scope;
  periodo: ResolvedPeriod;
  /** Nome do grupo ativo (`Grupo 1` / `Grupo 2`), ou null = todos. */
  grupoFiltro: string | null;
  /** Grupos únicos no escopo (por nome), para o select do header. */
  gruposDisponiveis: { id: string; nome: string }[];
  kpisPorGrupo: GroupKpi[];
  faturamentoPorDiaGrupo: GroupDayRevenue[];
  heatmap: HeatmapCell[];
  indicadoresPorHora: HourIndicator[] | null;
  vendedorasPorHora: SellerByHour[];
}

/** Horas de um grupo cadastrado. Sem grupo → 0–23. */
function horasDoGrupo(grupo: Grupo | null): number[] {
  if (!grupo) return Array.from({ length: 24 }, (_, i) => i);
  const horas: number[] = [];
  for (let h = grupo.horaInicio; h < grupo.horaFim; h++) horas.push(h);
  return horas;
}

/** União das faixas horárias de vários grupos (mesmo nome em lojas diferentes). */
function horasDosGrupos(lista: Grupo[]): number[] {
  if (lista.length === 0) return Array.from({ length: 24 }, (_, i) => i);
  const set = new Set<number>();
  for (const t of lista) {
    for (let h = t.horaInicio; h < t.horaFim; h++) set.add(h);
  }
  return [...set].sort((a, b) => a - b);
}

function grupoDaFilial(filialId: string, nomeGrupo: string) {
  return grupos.find((t) => t.filialId === filialId && t.nome === nomeGrupo);
}

/**
 * @param grupoFiltro Nome do grupo (`Grupo 1` / `Grupo 2`), não o id do cadastro.
 *   Null = todos os grupos.
 */
export function buildGroupsView(escopo: Scope, grupoFiltro: string | null = null): GroupsView {
  const periodo = resolvePeriod(escopo.periodo);
  const fs = storesInScope(escopo);
  const divisao = escopo.divisao;

  // Grupos das filiais do escopo; nomes únicos para o select.
  const gruposEscopo = grupos.filter((t) => fs.some((f) => f.id === t.filialId));
  const nomesUnicos = [...new Set(gruposEscopo.map((t) => t.nome))];
  const gruposDisponiveis = nomesUnicos.map((nome) => ({ id: nome, nome }));

  // Filtro por nome: une as faixas horárias desse grupo em todas as lojas do escopo.
  const gruposDoFiltro = grupoFiltro ? gruposEscopo.filter((t) => t.nome === grupoFiltro) : [];
  const horasAtivas = grupoFiltro ? horasDosGrupos(gruposDoFiltro) : horasDoGrupo(null);

  // KPIs por grupo — cada loja usa a faixa horária do seu próprio cadastro.
  const kpisPorGrupo: GroupKpi[] = nomesUnicos.map((nome) => {
    let faturamento = 0;
    let vendas = 0;
    for (const f of fs) {
      const grupo = grupoDaFilial(f.id, nome);
      if (!grupo) continue;
      for (const iso of intervaloDias(periodo.inicio, periodo.fim)) {
        const dv = salesDay(f.id, iso);
        if (!dv) continue;
        for (const h of horasDoGrupo(grupo)) {
          const ag = dv.porHora[h];
          if (!ag) continue;
          if (divisao) {
            const divAg = dv.porDivisao[divisao];
            const fr = divAg && dv.total.faturamento > 0 ? divAg.faturamento / dv.total.faturamento : 1;
            faturamento += Math.round(ag.faturamento * fr);
            vendas += Math.round(ag.atendimentos * fr);
          } else {
            faturamento += ag.faturamento;
            vendas += ag.atendimentos;
          }
        }
      }
    }
    return {
      nome,
      faturamento,
      vendas,
      ticketMedio: divSeguro(faturamento, vendas),
    };
  });

  // Faturamento por dia × grupo
  const dias = intervaloDias(periodo.inicio, periodo.fim);
  const faturamentoPorDiaGrupo: GroupDayRevenue[] = dias.map((iso) => {
    const porGrupo: Record<string, number> = {};
    for (const nome of nomesUnicos) {
      let fat = 0;
      for (const f of fs) {
        const grupo = grupoDaFilial(f.id, nome);
        if (!grupo) continue;
        const dv = salesDay(f.id, iso);
        if (!dv) continue;
        for (const h of horasDoGrupo(grupo)) {
          const ag = dv.porHora[h];
          if (!ag) continue;
          if (divisao) {
            const divAg = dv.porDivisao[divisao];
            const fr = divAg && dv.total.faturamento > 0 ? divAg.faturamento / dv.total.faturamento : 1;
            fat += Math.round(ag.faturamento * fr);
          } else {
            fat += ag.faturamento;
          }
        }
      }
      porGrupo[nome] = fat;
    }
    return { dia: iso, porGrupo };
  });

  // Heatmap (dia × hora) — valores de faturamento
  const heatmap: HeatmapCell[] = [];
  for (const iso of dias) {
    for (const h of horasAtivas) {
      let valor = 0;
      for (const f of fs) {
        const dv = salesDay(f.id, iso);
        if (!dv) continue;
        const ag = dv.porHora[h];
        if (!ag) continue;
        if (divisao) {
          const divAg = dv.porDivisao[divisao];
          const fr = divAg && dv.total.faturamento > 0 ? divAg.faturamento / dv.total.faturamento : 1;
          valor += Math.round(ag.faturamento * fr);
        } else {
          valor += ag.faturamento;
        }
      }
      heatmap.push({ dia: iso, hora: h, valor });
    }
  }

  // Indicadores por hora (só quando período = 1 dia)
  const ehUmDia = periodo.inicio === periodo.fim;
  let indicadoresPorHora: HourIndicator[] | null = null;
  if (ehUmDia) {
    const diaIso = periodo.inicio;
    const ant = previousPeriod(periodo);
    let fatTotalDia = 0;
    for (const f of fs) {
      const dv = salesDay(f.id, diaIso);
      if (!dv) continue;
      for (const h of horasAtivas) {
        const ag = dv.porHora[h];
        if (!ag) continue;
        if (divisao) {
          const divAg = dv.porDivisao[divisao];
          const fr = divAg && dv.total.faturamento > 0 ? divAg.faturamento / dv.total.faturamento : 1;
          fatTotalDia += Math.round(ag.faturamento * fr);
        } else {
          fatTotalDia += ag.faturamento;
        }
      }
    }
    let acumulado = 0;
    indicadoresPorHora = horasAtivas.map((h) => {
      let fat = 0;
      let atd = 0;
      for (const f of fs) {
        const dv = salesDay(f.id, diaIso);
        if (!dv) continue;
        const ag = dv.porHora[h];
        if (!ag) continue;
        if (divisao) {
          const divAg = dv.porDivisao[divisao];
          const fr = divAg && dv.total.faturamento > 0 ? divAg.faturamento / dv.total.faturamento : 1;
          fat += Math.round(ag.faturamento * fr);
          atd += Math.round(ag.atendimentos * fr);
        } else {
          fat += ag.faturamento;
          atd += ag.atendimentos;
        }
      }
      acumulado += fat;
      // Comparativo com mesmo horário do dia anterior
      let fatAnt = 0;
      for (const f of fs) {
        const dvAnt = salesDay(f.id, ant.inicio);
        if (!dvAnt) continue;
        const agAnt = dvAnt.porHora[h];
        if (!agAnt) continue;
        if (divisao) {
          const divAg = dvAnt.porDivisao[divisao];
          const fr = divAg && dvAnt.total.faturamento > 0 ? divAg.faturamento / dvAnt.total.faturamento : 1;
          fatAnt += Math.round(agAnt.faturamento * fr);
        } else {
          fatAnt += agAnt.faturamento;
        }
      }
      const delta = fatAnt > 0 ? ((fat - fatAnt) / fatAnt) * 100 : null;
      return {
        hora: h,
        faturamento: fat,
        atendimentos: atd,
        ticketMedio: divSeguro(fat, atd),
        pctFatDia: divSeguro(fat, fatTotalDia) * 100,
        fatAcumulado: acumulado,
        pctFatAcumulado: divSeguro(acumulado, fatTotalDia) * 100,
        deltaVsAnterior: delta !== null ? { value: `${Math.abs(delta).toFixed(0)}%`, positive: delta >= 0 } : null,
      };
    });
  }

  // Vendedoras por hora (staff real vs meta mínima) — agrega todos os dias do período
  const diasDoPeriodo = intervaloDias(periodo.inicio, periodo.fim);
  const numDias = diasDoPeriodo.length || 1;
  const vendedorasPorHora: SellerByHour[] = horasAtivas.map((h) => {
    let somaReais = 0;
    for (const dia of diasDoPeriodo) {
      for (const f of fs) {
        const dv = salesDay(f.id, dia);
        if (!dv) continue;
        const ag = dv.porHora[h];
        if (ag && ag.atendimentos > 0) {
          const vendedoresCount = Object.keys(dv.porVendedora).length || 1;
          somaReais += vendedoresCount;
        }
      }
    }
    const reais = Math.round(somaReais / numDias);
    const metaMinima = 2;
    return { hora: h, reais, metaMinima };
  });

  return {
    escopo,
    periodo,
    grupoFiltro,
    gruposDisponiveis,
    kpisPorGrupo,
    faturamentoPorDiaGrupo,
    heatmap,
    indicadoresPorHora,
    vendedorasPorHora,
  };
}


/* ================================================================
 * TELA VISÃO GERAL — camada de dados (montarVisaoGeralView)
 * ================================================================ */

import { collaboratorsOfStore } from "./team";

export interface OverviewKpi {
  label: string;
  valor: string;
  sub?: string;
  /** @deprecated Prefer `kpisWpink` strip — kept optional for compat. */
  subWpink?: string;
  delta?: { value: string; positive: boolean; vs?: string };
  serie?: number[];
  tooltip?: string;
  drillTo?: string;
}

/** Quick stats WPINK (estilo Sales overview / Ao vivo) — só quando a loja tem WPINK. */
export interface OverviewKpiWpink {
  label: string;
  valor: string;
  sub?: string;
  tooltip?: string;
  tint: "acc" | "ok" | "warn" | "info";
  delta?: { value: string; positive: boolean; vs?: string; diff?: string; anterior?: string };
}

export interface GoalGauge {
  nome: string;
  pct: number;
  alvo: number;
  realizado: number;
}

export interface CategoryVsGoal {
  categoria: string;
  /** Reservado p/ meta por categoria (CRUD Metas). Hoje sempre 0 neste card. */
  meta: number;
  realizado: number;
}

export interface DayVsGoal {
  dia: string;
  meta: number;
  realizado: number;
}

export interface EvolutionPoint {
  label: string;
  realizado: number;
  meta: number;
  projecao: number | null;
  /** Ponto-âncora R$ 0 na abertura (eixo hora "acumulado até") — fora do modo por período. */
  ancora?: boolean;
}

export interface TopItem {
  nome: string;
  valor: number;
}

export interface TopSeller extends TopItem {
  sub?: string;
  ticketMedio?: number;
  pctMeta?: number;
  /** Itens por venda; ausente se algum dia com venda não tem itens gravados (nada estimado). */
  pa?: number;
  /** Lojas onde vendeu no período, da que mais faturou para a que menos. */
  lojas: string[];
  /** Turno cadastrado em Configurações > Lojas ("Manhã · 09:00–15:00"); ausente = sem turno. */
  turno?: string;
}

export interface OverviewView {
  escopo: Scope;
  periodo: ResolvedPeriod;
  kpis: OverviewKpi[];
  /**
   * Faixa compacta WPINK (quick stats). Vazia se nenhuma loja do escopo tem WPINK.
   */
  kpisWpink: OverviewKpiWpink[];
  gauges: GoalGauge[];
  faltamParaMeta: string | null;
  projecaoFechamento: string | null;
  /** Delta do faturamento vs período anterior (badge dos cards de gráfico). */
  deltaFaturamento?: { value: string; positive: boolean; vs?: string };
  eixoSerie: SeriesAxis;
  rotuloSerie: string;
  categoriaVsMeta: CategoryVsGoal[];
  /** Vazio quando período = 1 dia (card oculto na UI). */
  diaVsMeta: DayVsGoal[];
  evolucao: EvolutionPoint[];
  formasPagamento: PaymentMethodRevenue[];
  topVendedoras: TopSeller[];
  /** Ranking completo (maior faturamento primeiro) — a tela escolhe a métrica e corta o Top N.
   *  `chave` = mesma do `ProductItemRow` (abre o detalhe do produto). */
  topProdutos: (TopItem & { chave?: string; sub?: string; itens?: number; categoria?: string; trend?: number })[];
  rankingLojas: (TopItem & { id?: string; pctMeta?: number; pctRede?: number; trend?: number })[];
  /** Faturamento da rede no período (badge do Ranking — independente do StorePicker). */
  rankingRedeTotal?: number;
  /** Com 1 loja no StorePicker: quantas outras lojas venderam no período (fatia "Demais lojas"). */
  rankingDemaisLojas?: number;
  /** True when KPIs come from sales_*_agg (possibly empty). */
  fromAggregates?: boolean;
}

export type OverviewAggInput = {
  dayAggs: import("./salesTypes").SalesDayAgg[];
  hourAggs?: import("./salesTypes").SalesHourAgg[];
  categoryDayAggs?: import("./salesTypes").SalesCategoryDayAgg[];
  /** Tipos já vistos no sync (histórico) — barras com R$ 0 no período. */
  categoryCatalog?: import("./salesTypes").SalesCategoryRef[];
  /** Formas de pagamento (CONDICAO) — brand=ALL. */
  paymentDayAggs?: import("./salesTypes").SalesPaymentDayAgg[];
  /** Ranking vendedoras (VENDEDOR_MILLENNIUM) — brand=ALL. */
  sellerDayAggs?: import("./salesTypes").SalesSellerDayAgg[];
  /** Turno de cada funcionária (store_seller.shift_id) — popover do Destaques da equipe. */
  sellerShifts?: import("./salesTypes").SellerShiftRef[];
  /** Top produtos ({E7A5C5C7}) — brand=ALL. Pode incluir dias do período anterior p/ variação. */
  productDayAggs?: import("./salesTypes").SalesProductDayAgg[];
  /** Histórico antes do período (curva da meta por dia da semana) — `goalHistoryDayRange`. */
  goalHistoryDayAggs?: import("./salesTypes").SalesDayAgg[];
  /** Mesmo dia da semana nas semanas anteriores (curva da meta por hora) — `goalHistorySameWeekdays`. */
  goalHistoryHourAggs?: import("./salesTypes").SalesHourAgg[];
  /** Período anterior (`previousPeriod`) — badges de comparativo dos KPIs e cards. */
  prevDayAggs?: import("./salesTypes").SalesDayAgg[];
  /** Período = hoje: horas do mesmo dia da semana passada (comparativo até a hora atual). */
  prevHourAggs?: import("./salesTypes").SalesHourAgg[];
};

/** Prefere linhas brand=ALL; sem ALL, soma WEPINK+WPINK. */
/**
 * Linhas WPINK do período. Dia só com receita (relatório de marca sem DetMov) deixa
 * CMV / nº de vendas incompletos — nada é estimado; a UI mostra "—" e sem badge.
 */
function wpinkRows<R extends import("./salesTypes").SalesDayAgg>(
  rows: R[],
  /** `loja|dia` com o relatório de margem gravado — CMV 0 ali é custo R$ 0 no ERP, não falta de dado. */
  costDays?: ReadonlySet<string>,
): { rows: R[]; cmvIncompleto: boolean; vendasIncompletas: boolean } {
  const out = rows.filter((r) => r.brand === "WPINK");
  const comVenda = out.filter((r) => r.revenueCents > 0);
  return {
    rows: out,
    cmvIncompleto: comVenda.some((r) => !r.cmvCents && !costDays?.has(`${r.storeId}|${r.day}`)),
    vendasIncompletas: comVenda.some((r) => r.salesCount <= 0),
  };
}

/** Totais WPINK; `null` = dado incompleto em algum dia com venda WPINK (nada é estimado). */
/** `impostos` = ICMS (faturamento) + ICMS ST (CMV) das lojas; 0 sem configuração. */
type WpinkTotals = { fat: number; cmv: number | null; vendas: number | null; itens: number | null; impostos: number };

type WpinkScope = { has(storeId: string): boolean; get?(storeId: string): Store | undefined };

function wpinkTotals(
  rows: import("./salesTypes").SalesDayAgg[],
  inScope: WpinkScope,
  from: string,
  to: string,
  costDays?: ReadonlySet<string>,
): WpinkTotals {
  const w = wpinkRows(rows.filter((d) => inScope.has(d.storeId) && d.day >= from && d.day <= to), costDays);
  const s = w.rows.reduce(
    (acc, d) => {
      const c = inScope.get?.(d.storeId)?.custos;
      const cmv = d.cmvCents ?? 0;
      return {
        rev: acc.rev + d.revenueCents,
        cmv: acc.cmv + cmv,
        sales: acc.sales + d.salesCount,
        items: acc.items + d.itemCount,
        tax: acc.tax + (d.revenueCents * (c?.icmsPct ?? 0) + cmv * (c?.icmsStPct ?? 0)) / 100,
      };
    },
    { rev: 0, cmv: 0, sales: 0, items: 0, tax: 0 },
  );
  return {
    fat: s.rev / 100,
    cmv: w.cmvIncompleto ? null : s.cmv / 100,
    vendas: w.vendasIncompletas ? null : s.sales,
    itens: w.vendasIncompletas ? null : s.items,
    impostos: s.tax / 100,
  };
}

/**
 * WPINK do período anterior. Com `horaMax`, o último dia (`fim`) entra pelas horas WPINK até a hora
 * atual e os demais inteiros (sem CMV por hora → CMV null). Loja com venda WPINK nesse dia sem
 * horas gravadas → null (sem comparativo).
 */
function wpinkPrevTotals(
  dayRows: import("./salesTypes").SalesDayAgg[],
  hourRows: import("./salesTypes").SalesHourAgg[],
  inScope: { has(storeId: string): boolean },
  ant: { inicio: string; fim: string; horaMax?: number },
): WpinkTotals | null {
  if (ant.horaMax == null) return wpinkTotals(dayRows, inScope, ant.inicio, ant.fim);
  const horaMax = ant.horaMax;
  const doDia = hourRows.filter((h) => h.brand === "WPINK" && inScope.has(h.storeId) && h.day === ant.fim);
  const lojasComHora = new Set(doDia.map((h) => h.storeId));
  const faltaHora = dayRows.some(
    (d) => d.brand === "WPINK" && inScope.has(d.storeId) && d.day === ant.fim && d.revenueCents > 0 && !lojasComHora.has(d.storeId),
  );
  if (faltaHora) return null;
  const hrs = doDia.filter((h) => h.hour <= horaMax);
  const cheios = wpinkTotals(dayRows, inScope, ant.inicio, somarDias(ant.fim, -1));
  const vendasHora = hrs.reduce((s, h) => s + h.salesCount, 0);
  const itensHora = hrs.reduce((s, h) => s + h.itemCount, 0);
  return {
    fat: cheios.fat + hrs.reduce((s, h) => s + h.revenueCents, 0) / 100,
    cmv: null,
    vendas: cheios.vendas == null ? null : cheios.vendas + vendasHora,
    itens: cheios.itens == null ? null : cheios.itens + itensHora,
    impostos: 0,
  };
}

/** Faixa WPINK do Financeiro: Faturamento · CMV · Lucro bruto · Margem (+ badge vs período anterior). */
function buildFinanceWpinkKpis(p: {
  mostrar: boolean;
  atual: WpinkTotals;
  anterior: WpinkTotals | null;
  faturamentoTotal: number;
  vsRotulo: string;
  /** Base dos badges de CMV/lucro/margem (terminando hoje = sem o dia de hoje nos dois lados). */
  cmvCompare: { atual: WpinkTotals; anterior: WpinkTotals; vsRotulo: string };
}): OverviewKpiWpink[] {
  if (!p.mostrar) return [];
  const { atual, anterior } = p;
  const temComp = anterior != null && anterior.fat > 0 && atual.fat > 0;
  const vs = temComp ? p.vsRotulo : undefined;
  const cmv = atual.cmv != null && atual.fat > 0 ? atual.cmv : null;
  const lucro = cmv != null ? atual.fat - cmv - atual.impostos : 0;
  const margem = divSeguro(lucro, atual.fat) * 100;
  const c = p.cmvCompare;
  const cmvA = c.atual.cmv != null && c.atual.cmv > 0 && c.atual.fat > 0 ? c.atual.cmv : null;
  const cmvB = c.anterior.cmv != null && c.anterior.cmv > 0 && c.anterior.fat > 0 ? c.anterior.cmv : null;
  const cmvComp = temComp && cmv != null && cmvA != null && cmvB != null;
  const lucroA = cmvA != null ? c.atual.fat - cmvA - c.atual.impostos : 0;
  const lucroB = cmvB != null ? c.anterior.fat - cmvB - c.anterior.impostos : 0;
  const margemA = divSeguro(lucroA, c.atual.fat) * 100;
  const margemB = divSeguro(lucroB, c.anterior.fat) * 100;
  return [
    {
      label: "Faturamento WPINK",
      valor: brlCent(atual.fat),
      sub: p.faturamentoTotal > 0 ? `${Math.round((atual.fat / p.faturamentoTotal) * 100)}% do faturamento` : undefined,
      tint: "acc",
      delta: temComp ? kpiDelta(atual.fat, anterior.fat, vs) : undefined,
    },
    {
      label: "CMV WPINK",
      valor: cmv != null ? brlCent(cmv) : "—",
      sub: cmv != null && atual.fat > 0 ? `${Math.round((cmv / atual.fat) * 100)}% do faturamento WPINK` : undefined,
      tooltip: cmv != null ? TIP_CMV : TIP_CMV_INDISPONIVEL,
      tint: "warn",
      delta: cmvComp ? kpiDelta(cmvA, cmvB, c.vsRotulo) : undefined,
    },
    {
      label: "Lucro bruto WPINK",
      valor: cmv != null ? brlCent(lucro) : "—",
      sub: cmv != null && atual.impostos > 0 ? `Impostos: ${brlCent(atual.impostos)}` : undefined,
      tooltip: TIP_LUCRO_BRUTO,
      tint: "ok",
      delta: cmvComp ? kpiDelta(lucroA, lucroB, c.vsRotulo) : undefined,
    },
    {
      label: "Margem WPINK",
      valor: cmv != null ? pct(margem) : "—",
      tooltip: TIP_MARGEM,
      tint: "info",
      delta: cmvComp ? kpiDeltaPp(margemA, margemB, c.vsRotulo) : undefined,
    },
  ];
}

function preferAllBrand<T extends { brand: string }>(rows: T[]): T[] {
  const all = rows.filter((r) => r.brand === "ALL");
  return all.length > 0 ? all : rows.filter((r) => r.brand !== "ALL");
}

/** Overview from real sales aggregates — CMV/top produtos stay empty until heavy sync. */
export function buildOverviewViewFromAggs(escopo: Scope, input: OverviewAggInput): OverviewView {
  const periodo = resolvePeriod(escopo.periodo, calendarTodayIso());
  const eixoSerie = seriesAxisForPeriod(periodo);
  const rotuloSerie = seriesAxisLabel(periodo, eixoSerie);
  // Overview: sempre total (ALL). WPINK na faixa quick stats (se loja tem a marca).
  const brand = null;
  const fs = storesInScope(escopo);
  const scopedStoreIds = new Set(fs.map((f) => f.id));

  function byBrand(rows: typeof input.dayAggs) {
    if (brand) return rows.filter((d) => d.brand === brand);
    const all = rows.filter((d) => d.brand === "ALL");
    return all.length > 0 ? all : rows.filter((d) => d.brand === "WEPINK" || d.brand === "WPINK");
  }

  // Rede (todas as lojas do fetch) — ranking / badge / % participação.
  const daysRede = byBrand(input.dayAggs);
  // Escopo do StorePicker — KPIs / gráficos.
  let days =
    escopo.filialIds.length > 0
      ? daysRede.filter((d) => scopedStoreIds.has(d.storeId))
      : daysRede;

  const hoursRaw = (input.hourAggs ?? []).filter((h) => {
    if (escopo.filialIds.length > 0 && !scopedStoreIds.has(h.storeId)) return false;
    if (brand) return h.brand === brand;
    const hourPool = input.hourAggs ?? [];
    if (hourPool.some((x) => x.brand === "ALL")) return h.brand === "ALL";
    return h.brand === "WEPINK" || h.brand === "WPINK" || h.brand === "ALL";
  });

  const sumDays = (rows: typeof days) =>
    rows.reduce(
      (acc, r) => {
        acc.revenueCents += r.revenueCents;
        acc.salesCount += r.salesCount;
        acc.itemCount += r.itemCount;
        return acc;
      },
      { revenueCents: 0, salesCount: 0, itemCount: 0 },
    );

  const atualAgg = sumDays(days);

  /**
   * Sem hora×marca (FORCE sem DetMov ainda): rateia horas ALL pelo share
   * marca/ALL de cada loja — mantém o gráfico Faturamento x meta no filtro WPINK/WEPINK.
   */
  let hours = hoursRaw;
  if (brand && hours.length === 0 && atualAgg.revenueCents > 0) {
    const scaled: typeof hoursRaw = [];
    const storeIdsForBrand = new Set(
      input.dayAggs
        .filter((d) => {
          if (d.brand !== brand || d.revenueCents <= 0) return false;
          if (escopo.filialIds.length > 0 && !scopedStoreIds.has(d.storeId)) return false;
          return true;
        })
        .map((d) => d.storeId),
    );
    for (const storeId of storeIdsForBrand) {
      const brandCents = input.dayAggs
        .filter((d) => d.storeId === storeId && d.brand === brand)
        .reduce((s, d) => s + d.revenueCents, 0);
      const allCents = input.dayAggs
        .filter((d) => d.storeId === storeId && d.brand === "ALL")
        .reduce((s, d) => s + d.revenueCents, 0);
      const share = allCents > 0 ? brandCents / allCents : 0;
      if (share <= 0) continue;
      for (const h of input.hourAggs ?? []) {
        if (h.storeId !== storeId || h.brand !== "ALL") continue;
        scaled.push({
          ...h,
          brand,
          revenueCents: Math.round(h.revenueCents * share),
          salesCount: Math.round(h.salesCount * share),
          itemCount: Math.round(h.itemCount * share),
        });
      }
    }
    hours = scaled;
  }

  const faturamento = atualAgg.revenueCents / 100;
  let atendimentos = atualAgg.salesCount;
  let itens = atualAgg.itemCount;

  // Relatório de marca grava só receita (counts=0). Até o próximo FORCE/SEED
  // com counts preenchidos, deriva de horas ou rateia do ALL.
  if (brand && atendimentos === 0 && atualAgg.revenueCents > 0) {
    const fromHours = hours.reduce(
      (acc, h) => {
        acc.salesCount += h.salesCount;
        acc.itemCount += h.itemCount;
        return acc;
      },
      { salesCount: 0, itemCount: 0 },
    );
    if (fromHours.salesCount > 0) {
      atendimentos = fromHours.salesCount;
      itens = fromHours.itemCount;
    } else {
      const allDays = input.dayAggs.filter((d) => {
        if (d.brand !== "ALL") return false;
        if (escopo.filialIds.length > 0 && !scopedStoreIds.has(d.storeId)) return false;
        return true;
      });
      const allSum = sumDays(allDays);
      if (allSum.salesCount > 0 && allSum.revenueCents > 0) {
        const otherBrandRev = input.dayAggs
          .filter((d) => {
            if (escopo.filialIds.length > 0 && !scopedStoreIds.has(d.storeId)) return false;
            return (d.brand === "WEPINK" || d.brand === "WPINK") && d.brand !== brand;
          })
          .reduce((s, d) => s + d.revenueCents, 0);
        if (otherBrandRev <= 0) {
          atendimentos = allSum.salesCount;
          itens = allSum.itemCount;
        } else {
          const share = atualAgg.revenueCents / allSum.revenueCents;
          atendimentos = Math.max(0, Math.round(allSum.salesCount * share));
          itens = Math.max(0, Math.round(allSum.itemCount * share));
        }
      }
    }
  }

  const ticket = atendimentos > 0 ? faturamento / atendimentos : 0;

  // Quick stats WPINK — só se alguma loja do escopo tem a marca.
  const showWpinkStrip = fs.some((f) => f.temWpink);
  const wpink = wpinkRows(
    input.dayAggs.filter((d) => {
      if (escopo.filialIds.length > 0 && !scopedStoreIds.has(d.storeId)) return false;
      return d.day >= periodo.inicio && d.day <= periodo.fim;
    }),
  );
  const wpinkSum = wpink.rows.reduce(
    (acc, d) => {
      acc.revenueCents += d.revenueCents;
      acc.cmvCents += d.cmvCents ?? 0;
      acc.salesCount += d.salesCount;
      acc.itemCount += d.itemCount;
      return acc;
    },
    { revenueCents: 0, cmvCents: 0, salesCount: 0, itemCount: 0 },
  );
  const wpinkFat = wpinkSum.revenueCents / 100;
  // CMV WPINK só quando todos os dias com venda WPINK têm CMV (senão soma parcial engana).
  const wpinkCmv = wpink.cmvIncompleto ? 0 : wpinkSum.cmvCents / 100;
  const wpinkVendas = wpink.vendasIncompletas ? 0 : wpinkSum.salesCount;
  const wpinkItens = wpink.vendasIncompletas ? 0 : wpinkSum.itemCount;
  const wpinkTicket = wpinkVendas > 0 ? wpinkFat / wpinkVendas : 0;
  const cmvTotalCents = days.reduce((s, d) => s + (d.cmvCents ?? 0), 0);
  const tipCmv = cmvTotalCents <= 0 ? TIP_CMV_INDISPONIVEL : TIP_CMV;
  const tipCmvWpink = wpinkCmv <= 0 ? TIP_CMV_INDISPONIVEL : TIP_CMV;
  const kpisWpink: OverviewKpiWpink[] = showWpinkStrip
    ? [
        {
          label: "Faturamento WPINK",
          valor: brlCent(wpinkFat),
          sub: faturamento > 0 ? `${Math.round((wpinkFat / faturamento) * 100)}% do faturamento` : undefined,
          tint: "acc",
        },
        {
          label: "CMV WPINK",
          valor: wpinkCmv > 0 ? brlCent(wpinkCmv) : "—",
          sub:
            wpinkCmv > 0 && wpinkFat > 0
              ? `${Math.round((wpinkCmv / wpinkFat) * 100)}% do faturamento`
              : undefined,
          tooltip: tipCmvWpink,
          tint: "warn",
        },
        {
          label: "Nº de vendas WPINK",
          valor: wpink.vendasIncompletas ? "—" : num(wpinkVendas),
          sub: wpink.vendasIncompletas ? undefined : `${num(wpinkItens)} itens`,
          tint: "ok",
        },
        {
          label: "Ticket médio WPINK",
          valor: wpink.vendasIncompletas ? "—" : brlCent(wpinkTicket),
          sub:
            wpinkVendas > 0
              ? `P.A. ${num(divSeguro(wpinkItens, wpinkVendas), 2)}`
              : undefined,
          tint: "info",
        },
      ]
    : [];

  const competencia = periodo.inicio.slice(0, 7);
  let metaTotal = 0;
  for (const f of fs) {
    const m = goalOfStore(f.id, competencia);
    if (m) metaTotal += m.valorLoja;
  }
  const atingMeta = metaTotal > 0 ? (faturamento / metaTotal) * 100 : 0;
  const faltam = metaTotal > 0 ? Math.max(0, metaTotal - faturamento) : 0;

  const byDay = new Map<string, number>();
  for (const d of days) {
    byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.revenueCents / 100);
  }
  const serieFat = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .slice(-7);

  // Comparativo: período anterior equivalente. Terminando hoje, o último dia do anterior entra até a hora atual.
  const antBase = previousPeriod(periodo, calendarCurrentHour());
  const antHoraMax = antBase.horaMax;
  const inScope = (storeId: string) => escopo.filialIds.length === 0 || scopedStoreIds.has(storeId);
  const prevDays = preferAllBrand(
    (input.prevDayAggs ?? []).filter((d) => inScope(d.storeId) && d.day >= antBase.inicio && d.day <= antBase.fim),
  );
  const somaPrev = (rows: typeof prevDays) =>
    rows.reduce(
      (acc, d) => ({
        fatCents: acc.fatCents + d.revenueCents,
        cmvCents: acc.cmvCents + (d.cmvCents ?? 0),
        vendas: acc.vendas + d.salesCount,
        itens: acc.itens + d.itemCount,
      }),
      { fatCents: 0, cmvCents: 0, vendas: 0, itens: 0 },
    );
  let anterior: { fatCents: number; cmvCents: number; vendas: number; itens: number } | null = null;
  if (antHoraMax == null) {
    anterior = somaPrev(prevDays);
  } else {
    const prevHours = preferAllBrand(
      (input.prevHourAggs ?? []).filter((h) => inScope(h.storeId) && h.day === antBase.fim),
    );
    const lojasComHora = new Set(prevHours.map((h) => h.storeId));
    // Loja que vendeu no dia equivalente sem horas gravadas → sem comparativo (nunca dia cheio × parcial).
    const faltaHora = prevDays.some((d) => d.day === antBase.fim && d.revenueCents > 0 && !lojasComHora.has(d.storeId));
    if (!faltaHora) {
      anterior = somaPrev(prevDays.filter((d) => d.day < antBase.fim));
      for (const h of prevHours) {
        if (h.hour > antHoraMax) continue;
        anterior.fatCents += h.revenueCents;
        anterior.vendas += h.salesCount;
        anterior.itens += h.itemCount;
      }
    }
  }
  // Sem venda no período atual (ex.: hoje antes do Atualizar) não é queda de 100% — é falta de dado.
  const temComp = anterior != null && anterior.fatCents > 0 && faturamento > 0;
  const vsRotulo = temComp ? antBase.rotulo : undefined;
  const antFat = (anterior?.fatCents ?? 0) / 100;
  const antVendas = anterior?.vendas ?? 0;
  const antTicket = antVendas > 0 ? antFat / antVendas : 0;
  const deltaFaturamento = temComp ? kpiDelta(faturamento, antFat, vsRotulo) : undefined;

  // CMV não existe por hora: terminando hoje, compara sem o dia de hoje nos dois lados.
  const cortaHoje = antHoraMax != null;
  const vsCmv = cortaHoje ? `${antBase.rotulo}, até o mesmo dia` : antBase.rotulo;
  const cmvAtualCmp = (cortaHoje ? days.filter((d) => d.day < periodo.fim) : days).reduce((s, d) => s + (d.cmvCents ?? 0), 0) / 100;
  const cmvAntCmp = somaPrev(cortaHoje ? prevDays.filter((d) => d.day < antBase.fim) : prevDays).cmvCents / 100;
  const deltaCmv = cmvTotalCents > 0 && cmvAtualCmp > 0 && cmvAntCmp > 0 ? kpiDelta(cmvAtualCmp, cmvAntCmp, vsCmv) : undefined;

  // Faixa WPINK: mesmo período anterior (último dia = horas WPINK até a hora atual; sem horas → sem badge).
  const antW = kpisWpink.length > 0
    ? wpinkPrevTotals(input.prevDayAggs ?? [], input.prevHourAggs ?? [], { has: inScope }, antBase)
    : null;
  if (antW && antW.fat > 0 && wpinkFat > 0) {
    const vsW = antBase.rotulo;
    const antWTicket = antW.vendas != null && antW.vendas > 0 ? antW.fat / antW.vendas : 0;
    const [kFat, , kVendas, kTicket] = kpisWpink;
    if (kFat) kFat.delta = kpiDelta(wpinkFat, antW.fat, vsW);
    if (kVendas && !wpink.vendasIncompletas && antW.vendas != null && antW.vendas > 0) {
      kVendas.delta = kpiDelta(wpinkVendas, antW.vendas, vsW, false);
    }
    if (kTicket && wpinkTicket > 0 && antWTicket > 0) kTicket.delta = kpiDelta(wpinkTicket, antWTicket, vsW);
  }
  const kCmvW = kpisWpink[1];
  if (kCmvW && wpinkCmv > 0) {
    const scopeW = { has: inScope };
    const fimAtual = cortaHoje ? somarDias(periodo.fim, -1) : periodo.fim;
    const fimAnt = cortaHoje ? somarDias(antBase.fim, -1) : antBase.fim;
    const cmvW = wpinkTotals(input.dayAggs, scopeW, periodo.inicio, fimAtual).cmv;
    const cmvWAnt = wpinkTotals(input.prevDayAggs ?? [], scopeW, antBase.inicio, fimAnt).cmv;
    if (cmvW != null && cmvW > 0 && cmvWAnt != null && cmvWAnt > 0) kCmvW.delta = kpiDelta(cmvW, cmvWAnt, vsCmv);
  }

  const kpis: OverviewKpi[] = [
    {
      label: "Faturamento",
      valor: brlCent(faturamento),
      sub: metaTotal > 0 ? `Meta: ${brlCent(metaTotal)}` : undefined,
      delta: deltaFaturamento,
      serie: serieFat,
    },
    {
      label: "CMV",
      valor: (() => {
        if (cmvTotalCents <= 0) return "—";
        return brlCent(cmvTotalCents / 100);
      })(),
      sub: (() => {
        if (cmvTotalCents <= 0) return undefined;
        const cmv = cmvTotalCents / 100;
        const pctCmv = faturamento > 0 ? (cmv / faturamento) * 100 : 0;
        return `${pctCmv.toFixed(0)}% do faturamento`;
      })(),
      delta: deltaCmv,
      tooltip: tipCmv,
    },
    {
      label: "Nº de vendas",
      valor: num(atendimentos),
      sub: `${num(itens)} itens vendidos`,
      delta: temComp ? kpiDelta(atendimentos, antVendas, vsRotulo, false) : undefined,
    },
    {
      label: "Ticket médio",
      valor: brlCent(ticket),
      sub: atendimentos > 0 ? `P.A. ${num(divSeguro(itens, atendimentos), 2)}` : undefined,
      delta: temComp && ticket > 0 ? kpiDelta(ticket, antTicket, vsRotulo) : undefined,
    },
  ];

  const filialComMeta = fs.find((f) => Boolean(goalOfStore(f.id, competencia)));
  const degraus = filialComMeta ? goalOfStore(filialComMeta.id, competencia)?.degraus ?? [] : [];
  const gauges: GoalGauge[] = degraus.slice(0, 3).map((d: { nome: string; atingimentoMinPct: number }) => ({
    nome: d.nome,
    pct: metaTotal > 0 ? Math.min(100, (faturamento / (metaTotal * d.atingimentoMinPct / 100)) * 100) : 0,
    alvo: Math.round(metaTotal * d.atingimentoMinPct / 100),
    realizado: faturamento,
  }));
  if (gauges.length === 0 && metaTotal > 0) {
    gauges.push({ nome: "Meta", pct: Math.min(100, atingMeta), alvo: metaTotal, realizado: faturamento });
  }

  // Curva da meta: meta mensal de cada loja → dia (peso do dia da semana) → hora (peso da hora).
  const histDayByStore = new Map<string, Map<string, number>>();
  for (const r of preferAllBrand(input.goalHistoryDayAggs ?? [])) {
    const m = histDayByStore.get(r.storeId) ?? new Map<string, number>();
    m.set(r.day, (m.get(r.day) ?? 0) + r.revenueCents / 100);
    histDayByStore.set(r.storeId, m);
  }
  const weekdayWeightsByStore = new Map(
    fs.map((f) => [f.id, weekdayWeights(histDayByStore.get(f.id) ?? new Map(), effectiveWeekHours(f.horas))]),
  );
  const metaLojaDia = (f: Store, iso: string) =>
    dailyGoal(goalOfStore(f.id, iso.slice(0, 7))?.valorLoja ?? 0, iso, weekdayWeightsByStore.get(f.id) ?? []);

  const evolucao: EvolutionPoint[] = [];
  if (eixoSerie === "hora") {
    const byHour = new Map<number, number>();
    for (const h of hours) {
      byHour.set(h.hour, (byHour.get(h.hour) ?? 0) + h.revenueCents / 100);
    }
    const dowMeta = deIso(periodo.inicio).getDay() as Dow;
    const histHourByStore = new Map<string, Map<number, number>>();
    for (const r of preferAllBrand(input.goalHistoryHourAggs ?? [])) {
      const m = histHourByStore.get(r.storeId) ?? new Map<number, number>();
      m.set(r.hour, (m.get(r.hour) ?? 0) + r.revenueCents / 100);
      histHourByStore.set(r.storeId, m);
    }
    const metaByHour = new Map<number, number>();
    for (const f of fs) {
      const metaDia = metaLojaDia(f, periodo.inicio);
      if (metaDia <= 0) continue;
      // Sem horário: curva pelas horas que venderam no histórico; sem histórico, 10h–22h (só a meta).
      const hist = histHourByStore.get(f.id) ?? new Map<number, number>();
      let shares = hourShares(hist, f.horas, dowMeta);
      if (shares.size === 0) shares = hourShares(hist, effectiveWeekHours(f.horas), dowMeta);
      for (const [h, share] of shares) {
        metaByHour.set(h, (metaByHour.get(h) ?? 0) + metaDia * share);
      }
    }
    // Eixo = união do expediente das lojas no dia (Configurações > Lojas).
    // Só lojas com venda no dia entram (evita loja sem horário/sem venda alargar o eixo).
    // Nenhuma com horário → eixo = da 1ª à última hora com venda (hoje: até agora).
    const storesWithSales = new Set(
      [...days, ...hours].filter((r) => r.revenueCents > 0).map((r) => r.storeId),
    );
    const winStores = storesWithSales.size > 0 ? fs.filter((f) => storesWithSales.has(f.id)) : fs;
    const win = unionConfiguredWindow(
      (winStores.length > 0 ? winStores : fs).map((f) => f.horas),
      dowMeta,
    );
    const vendidas = [...byHour.entries()].filter(([, v]) => v > 0).map(([h]) => h);
    const nowH = calendarCurrentHour();
    const first = win
      ? Math.min(win.abertura, ...vendidas)
      : vendidas.length > 0
        ? Math.min(...vendidas)
        : periodo.ehHoje
          ? nowH
          : 0;
    const lastCap = win
      ? periodo.ehHoje ? Math.min(win.fechamento - 1, nowH) : win.fechamento - 1
      : periodo.ehHoje ? nowH : first;
    const last = Math.max(first, lastCap, ...vendidas);
    const horas: number[] = [];
    for (let h = first; h <= last; h++) horas.push(h);
    // Meta de horas fora do eixo (loja sem venda com expediente mais largo) vai para as pontas.
    const metaNoEixo = (h: number) => {
      let v = metaByHour.get(h) ?? 0;
      for (const [mh, mv] of metaByHour) {
        if (h === first && mh < first) v += mv;
        if (h === last && mh > last && !periodo.ehHoje) v += mv;
      }
      return v;
    };
    // Rótulo = fim da faixa ("acumulado até"): abre 10h com R$ 0 … fecha 22h com o total.
    evolucao.push({ label: horaCurta(first), realizado: 0, meta: 0, projecao: null, ancora: true });
    let acum = 0;
    let acumM = 0;
    for (const h of horas) {
      acum += byHour.get(h) ?? 0;
      acumM += metaNoEixo(h);
      const emAndamento = periodo.ehHoje && h === nowH;
      evolucao.push({
        label: emAndamento ? "Agora" : horaCurta(h + 1),
        realizado: acum,
        meta: acumM,
        projecao: null,
      });
    }
  } else {
    let acum = 0;
    let acumM = 0;
    const diasPeriodo = intervaloDias(periodo.inicio, periodo.fim);
    const mesesLbl = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    for (const iso of diasPeriodo) {
      acum += byDay.get(iso) ?? 0;
      acumM += fs.reduce((s, f) => s + metaLojaDia(f, iso), 0);
      const d = deIso(iso);
      evolucao.push({
        label: `${String(d.getDate()).padStart(2, "0")} ${mesesLbl[d.getMonth()]}`,
        realizado: acum,
        meta: acumM,
        projecao: null,
      });
    }
  }

  const faltamParaMeta = faltam > 0 ? `Faltam ${brlCent(faltam)} para atingir a meta do mês` : metaTotal > 0 ? "Meta atingida" : null;
  const projecaoFechamento = null;

  // Faturamento por categoria — mix do período + catálogo histórico (zeros).
  // Meta por categoria fica p/ CRUD de Metas; não inventar Goal aqui.
  const catAcc = new Map<string, { realizado: number }>();
  for (const ref of input.categoryCatalog ?? []) {
    if (brand && ref.brand !== brand && ref.brand !== "ALL") continue;
    const name = ref.categoryName || `Tipo ${ref.categoryId}`;
    if (!catAcc.has(labelUpper(name))) catAcc.set(labelUpper(name), { realizado: 0 });
  }
  for (const row of input.categoryDayAggs ?? []) {
    if (brand && row.brand !== brand && row.brand !== "ALL") continue;
    if (brand && row.brand === "ALL") continue;
    const name = row.categoryName || `Tipo ${row.categoryId}`;
    const key = labelUpper(name);
    const cur = catAcc.get(key) ?? { realizado: 0 };
    cur.realizado += row.revenueCents / 100;
    catAcc.set(key, cur);
  }
  const categoriaVsMeta: CategoryVsGoal[] = [...catAcc.entries()]
    .map(([categoria, c]) => ({
      categoria,
      realizado: c.realizado,
      meta: 0,
    }))
    .sort((a, b) => b.realizado - a.realizado || a.categoria.localeCompare(b.categoria, "pt-BR"));

  // Ranking de lojas — totais da rede; lista pode filtrar 1 loja, mas %/badge = rede.
  const byStore = new Map<string, number>();
  for (const d of daysRede) {
    byStore.set(d.storeId, (byStore.get(d.storeId) ?? 0) + d.revenueCents / 100);
  }
  const rankingRedeTotal = [...byStore.values()].reduce((s, v) => s + v, 0);
  const catalog = productStores();
  const rankingLojas: (TopItem & { id?: string; pctMeta?: number; pctRede?: number; trend?: number })[] = [...byStore.entries()]
    .map(([id, valor]) => {
      const f = catalog.find((x) => x.id === id) ?? fs.find((x) => x.id === id);
      const m = goalOfStore(id, competencia);
      return {
        id,
        nome: labelUpper(f?.fantasia ?? id.slice(0, 8)),
        valor,
        pctMeta: m && m.valorLoja > 0 ? (valor / m.valorLoja) * 100 : undefined,
        pctRede: rankingRedeTotal > 0 ? (valor / rankingRedeTotal) * 100 : undefined,
      };
    })
    .filter((row) => {
      if (row.valor <= 0) return false;
      if (escopo.filialIds.length === 1) return row.id === escopo.filialIds[0];
      return true;
    })
    .sort((a, b) => b.valor - a.valor);
  const rankingDemaisLojas =
    escopo.filialIds.length === 1
      ? [...byStore.entries()].filter(([id, v]) => v > 0 && id !== escopo.filialIds[0]).length
      : undefined;

  // Formas: sempre brand=ALL (Lista não traz marca). Filtra só por loja/período.
  const totaisForma: Record<string, number> = {};
  for (const row of input.paymentDayAggs ?? []) {
    if (escopo.filialIds.length > 0 && !scopedStoreIds.has(row.storeId)) continue;
    if (row.day < periodo.inicio || row.day > periodo.fim) continue;
    if (row.revenueCents <= 0) continue;
    const forma = row.paymentMethod || "Outros";
    totaisForma[forma] = (totaisForma[forma] ?? 0) + row.revenueCents / 100;
  }
  const totalFormas = Object.values(totaisForma).reduce((s, v) => s + v, 0) || 1;
  const FORMAS_FALLBACK = ["var(--acc)", "var(--info)", "var(--ok)", "var(--warn)", "var(--t2)"];
  const formasPagamento: PaymentMethodRevenue[] = Object.entries(totaisForma)
    .sort((a, b) => b[1] - a[1])
    .map(([forma, valor], i) => ({
      forma,
      valor,
      pct: (valor / totalFormas) * 100,
      cor: CORES_FORMAS[forma] ?? FORMAS_FALLBACK[i % FORMAS_FALLBACK.length]!,
    }));

  // Top vendedoras — VENDEDOR_MILLENNIUM (sem % meta até CRUD de Metas).
  // Com código do ERP agrupa pela funcionária (nome trocado no ERP não divide a pessoa); nome = o do dia mais recente.
  type VendAcc = {
    nome: string;
    nomeDia: string;
    fat: number;
    vendas: number;
    itens: number;
    semItens: boolean;
    fatPorLoja: Map<string, number>;
    employeeId: number | null;
    geradorId: number | null;
    sellerKeys: Set<string>;
  };
  const vendMap = new Map<string, VendAcc>();
  for (const row of input.sellerDayAggs ?? []) {
    if (escopo.filialIds.length > 0 && !scopedStoreIds.has(row.storeId)) continue;
    const key = row.sellerEmployeeId != null ? `e:${row.sellerEmployeeId}` : `n:${row.sellerKey}`;
    const acc = vendMap.get(key) ?? {
      nome: row.sellerName,
      nomeDia: row.day,
      fat: 0,
      vendas: 0,
      itens: 0,
      semItens: false,
      fatPorLoja: new Map<string, number>(),
      employeeId: row.sellerEmployeeId ?? null,
      geradorId: null,
      sellerKeys: new Set<string>(),
    };
    acc.sellerKeys.add(row.sellerKey);
    if (row.sellerGeradorId != null) acc.geradorId = row.sellerGeradorId;
    if (row.day > acc.nomeDia) {
      acc.nome = row.sellerName;
      acc.nomeDia = row.day;
    }
    acc.fat += row.revenueCents / 100;
    acc.vendas += row.salesCount;
    acc.itens += row.itemCount ?? 0;
    if (row.salesCount > 0 && !(row.itemCount && row.itemCount > 0)) acc.semItens = true;
    acc.fatPorLoja.set(row.storeId, (acc.fatPorLoja.get(row.storeId) ?? 0) + row.revenueCents);
    vendMap.set(key, acc);
  }
  const nomeLoja = new Map(fs.map((f) => [f.id, f.fantasia]));
  const lojasDaVendedora = (v: VendAcc): string[] =>
    [...v.fatPorLoja.entries()]
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => nomeLoja.get(id))
      .filter((n): n is string => Boolean(n));

  const turnoDe = sellerShiftResolver(input.sellerShifts);
  const turnoDaVendedora = (v: VendAcc): string | undefined =>
    turnoDe({
      employeeId: v.employeeId,
      geradorId: v.geradorId,
      sellerKeys: v.sellerKeys,
      lojas: [...v.fatPorLoja.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
    });

  const topVendedoras: TopSeller[] = [...vendMap.values()]
    .sort((a, b) => b.fat - a.fat)
    .slice(0, 5)
    .map((v) => ({
      nome: v.nome,
      valor: v.fat,
      sub: `${v.vendas} venda${v.vendas === 1 ? "" : "s"}`,
      ticketMedio: v.vendas > 0 ? v.fat / v.vendas : 0,
      ...(!v.semItens && v.vendas > 0 ? { pa: v.itens / v.vendas } : {}),
      lojas: lojasDaVendedora(v),
      turno: turnoDaVendedora(v),
    }));

  // Top produtos — {E7A5C5C7}; variação vs período anterior se houver dados.
  const antPeriod = previousPeriod(periodo);
  const prodMap = new Map<number, { nome: string; codigo: string; fat: number; itens: number }>();
  const prodMapAnt = new Map<number, number>();
  for (const row of input.productDayAggs ?? []) {
    if (escopo.filialIds.length > 0 && !scopedStoreIds.has(row.storeId)) continue;
    if (row.day >= periodo.inicio && row.day <= periodo.fim) {
      const acc = prodMap.get(row.productId) ?? {
        nome: row.productName,
        codigo: "",
        fat: 0,
        itens: 0,
      };
      acc.fat += row.revenueCents / 100;
      acc.itens += row.itemCount;
      if (row.productName) acc.nome = row.productName;
      if (row.productCode?.trim()) acc.codigo = row.productCode.trim();
      prodMap.set(row.productId, acc);
    } else if (row.day >= antPeriod.inicio && row.day <= antPeriod.fim) {
      prodMapAnt.set(
        row.productId,
        (prodMapAnt.get(row.productId) ?? 0) + row.revenueCents / 100,
      );
    }
  }
  const topProdutos: (TopItem & { sub?: string; itens?: number; categoria?: string; trend?: number })[] = [
    ...prodMap.entries(),
  ]
    .sort((a, b) => b[1].fat - a[1].fat)
    .map(([pid, p]) => {
      const ant = prodMapAnt.get(pid) ?? 0;
      const trendPct = ant > 0 ? Math.round(((p.fat - ant) / ant) * 100) : undefined;
      return {
        chave: productRowKey({ productCode: p.codigo, productId: pid }),
        nome: labelUpper(p.nome),
        valor: p.fat,
        sub: `${p.itens} itens`,
        itens: p.itens,
        trend: trendPct,
      };
    });

  return {
    escopo,
    periodo,
    kpis,
    kpisWpink,
    gauges,
    faltamParaMeta,
    projecaoFechamento,
    eixoSerie,
    rotuloSerie,
    categoriaVsMeta,
    diaVsMeta: [],
    evolucao,
    formasPagamento,
    topVendedoras,
    topProdutos,
    rankingLojas,
    rankingRedeTotal,
    rankingDemaisLojas,
    deltaFaturamento,
    fromAggregates: true,
  };
}

export function buildOverviewView(escopo: Scope, aggs?: OverviewAggInput | null): OverviewView {
  if (aggs) return buildOverviewViewFromAggs(escopo, aggs);

  const periodo = resolvePeriod(escopo.periodo);
  const fs = storesInScope(escopo);
  // Overview fixture: mesmo contrato — total da operação (sem filtro de marca).
  const divisao = null as Division | null;

  // Agregados do período
  const atual = sumAggregates(fs.map((f) => agregadoPeriodo(f, periodo.inicio, periodo.fim, divisao)));
  const custoAtual = custoPeriodo(fs, periodo.inicio, periodo.fim, divisao).cmv;
  const lucroAtual = atual.faturamento - custoAtual;
  void lucroAtual; // reservado para KPIs futuros de margem/lucro
  // Período anterior para deltas
  const ant = previousPeriod(periodo);
  const anterior = sumAggregates(fs.map((f) => agregadoPeriodo(f, ant.inicio, ant.fim, divisao)));
  const custoAnterior = custoPeriodo(fs, ant.inicio, ant.fim, divisao).cmv;
  void custoAnterior; // reservado para KPIs futuros de margem/lucro
  const ticketAtual = divSeguro(atual.faturamento, atual.atendimentos);
  const ticketAnterior = divSeguro(anterior.faturamento, anterior.atendimentos);
  const temComp = anterior.atendimentos > 0;
  const vsRotulo = temComp ? ant.rotulo : undefined;

  const showWpinkStrip = fs.some((f) => f.temWpink);
  const tipCmv = TIP_CMV;
  const wpinkAgg = sumAggregates(fs.map((f) => agregadoPeriodo(f, periodo.inicio, periodo.fim, "WPINK")));
  const wpinkCmvFix = custoPeriodo(fs, periodo.inicio, periodo.fim, "WPINK").cmv;
  const tipCmvWpink = wpinkCmvFix <= 0 ? TIP_CMV_INDISPONIVEL : TIP_CMV;
  const wpinkTicketFix = divSeguro(wpinkAgg.faturamento, wpinkAgg.atendimentos);
  const kpisWpink: OverviewKpiWpink[] = showWpinkStrip
    ? [
        {
          label: "Faturamento WPINK",
          valor: brlCent(wpinkAgg.faturamento),
          sub:
            atual.faturamento > 0
              ? `${Math.round((wpinkAgg.faturamento / atual.faturamento) * 100)}% do faturamento`
              : undefined,
          tint: "acc",
        },
        {
          label: "CMV WPINK",
          valor: wpinkCmvFix > 0 ? brlCent(wpinkCmvFix) : "—",
          sub:
            wpinkCmvFix > 0 && wpinkAgg.faturamento > 0
              ? `${Math.round((wpinkCmvFix / wpinkAgg.faturamento) * 100)}% do faturamento`
              : undefined,
          tooltip: tipCmvWpink,
          tint: "warn",
        },
        {
          label: "Nº de vendas WPINK",
          valor: num(wpinkAgg.atendimentos),
          sub: `${num(wpinkAgg.itens)} itens`,
          tint: "ok",
        },
        {
          label: "Ticket médio WPINK",
          valor: brlCent(wpinkTicketFix),
          sub:
            wpinkAgg.atendimentos > 0
              ? `P.A. ${num(divSeguro(wpinkAgg.itens, wpinkAgg.atendimentos), 2)}`
              : undefined,
          tint: "info",
        },
      ]
    : [];

  // Meta da competência (mês corrente)
  const competencia = periodo.inicio.slice(0, 7);
  let metaTotal = 0;
  for (const f of fs) {
    const m = goalOfStore(f.id, competencia);
    if (m) metaTotal += m.valorLoja;
  }
  const atingMeta = metaTotal > 0 ? (atual.faturamento / metaTotal) * 100 : 0;
  const faltam = metaTotal > 0 ? Math.max(0, metaTotal - atual.faturamento) : 0;

  // Projeção de fechamento (curva de receita)
  const curva = revenueCurve(fs, competencia);
  let fracaoAcum = 0;
  for (const iso of intervaloDias(`${competencia}-01`, TODAY_ISO)) fracaoAcum += curva.peso(iso);
  const projetado = fracaoAcum > 0 ? atual.faturamento / fracaoAcum : 0;
  const projPct = metaTotal > 0 ? (projetado / metaTotal) * 100 : 0;

  // Série de tendência (7 pontos)
  const serieFat = seriesTendencia(fs, periodo, divisao).faturamento?.slice(-7) ?? [];

  // KPIs com drill-down
  const kpis: OverviewKpi[] = [
    {
      label: "Faturamento",
      valor: brlCent(atual.faturamento),
      sub: metaTotal > 0 ? `Meta: ${brlCent(metaTotal)}` : undefined,
      delta: temComp ? kpiDelta(atual.faturamento, anterior.faturamento, vsRotulo) : undefined,
      serie: serieFat,
    },
    {
      label: "CMV",
      valor: brlCent(custoAtual),
      sub: `${(divSeguro(custoAtual, atual.faturamento) * 100).toFixed(0)}% do faturamento`,
      delta: temComp ? kpiDelta(custoAtual, custoAnterior, vsRotulo) : undefined,
      tooltip: tipCmv,
    },
    {
      label: "Nº de vendas",
      valor: num(atual.atendimentos),
      sub: `${num(atual.itens)} itens vendidos`,
      delta: temComp ? kpiDelta(atual.atendimentos, anterior.atendimentos, vsRotulo, false) : undefined,
    },
    {
      label: "Ticket médio",
      valor: brlCent(ticketAtual),
      sub: `P.A. ${num(divSeguro(atual.itens, atual.atendimentos), 2)}`,
      delta: temComp ? kpiDelta(ticketAtual, ticketAnterior, vsRotulo) : undefined,
    },
  ];

  // Gauges: Meta / Super Meta / Hiper Meta (degraus da primeira filial com meta)
  const filialComMeta = fs.find((f) => Boolean(goalOfStore(f.id, competencia)));
  const degraus = filialComMeta ? goalOfStore(filialComMeta.id, competencia)?.degraus ?? [] : [];
  const gauges: GoalGauge[] = degraus.slice(0, 3).map((d: { nome: string; atingimentoMinPct: number }) => ({
    nome: d.nome,
    pct: Math.min(100, (atual.faturamento / (metaTotal * d.atingimentoMinPct / 100)) * 100),
    alvo: Math.round(metaTotal * d.atingimentoMinPct / 100),
    realizado: atual.faturamento,
  }));
  // Fallback se não houver degraus mas houver meta
  if (gauges.length === 0 && metaTotal > 0) {
    gauges.push({ nome: "Meta", pct: Math.min(100, atingMeta), alvo: metaTotal, realizado: atual.faturamento });
  }

  const faltamParaMeta = faltam > 0 ? `Faltam ${brlCent(faltam)} para atingir a meta do mês` : metaTotal > 0 ? "Meta atingida" : null;
  const projecaoFechamento = projetado > 0 ? `Projeção: ${brlCent(projetado)} · ${projPct.toFixed(0)}% da meta` : null;

  // Faturamento por categoria (fixture): todas as categorias da marca, mesmo com R$ 0.
  const catMap = new Map<number, { faturamento: number }>();
  for (const cat of categorias) {
    if (divisao && cat.divisao !== divisao) continue;
    catMap.set(cat.id, { faturamento: 0 });
  }
  for (const f of fs) {
    for (const d of salesDays(f.id, periodo.inicio, periodo.fim)) {
      for (const [id, c] of Object.entries(d.porCategoria)) {
        const cat = categorias.find((x) => x.id === Number(id));
        if (!cat || (divisao && cat.divisao !== divisao)) continue;
        const acc = catMap.get(cat.id) ?? { faturamento: 0 };
        acc.faturamento += c.faturamento;
        catMap.set(cat.id, acc);
      }
    }
  }
  const categoriaVsMeta: CategoryVsGoal[] = [...catMap.entries()]
    .map(([id, c]) => {
      const cat = categorias.find((x) => x.id === id)!;
      return { categoria: labelUpper(cat.nome), meta: 0, realizado: c.faturamento };
    })
    .sort((a, b) => b.realizado - a.realizado || a.categoria.localeCompare(b.categoria, "pt-BR"));

  // Faturamento por Dia da Semana vs Meta — oculto em período de 1 dia.
  const eixoSerie = seriesAxisForPeriod(periodo);
  const rotuloSerie = seriesAxisLabel(periodo, eixoSerie);
  const diasSemanaNomes = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const dowToIdx = (dow: number) => (dow === 0 ? 6 : dow - 1);
  let diaVsMeta: DayVsGoal[] = [];
  if (eixoSerie !== "hora") {
    const diaAgg: Record<number, { fat: number; count: number }> = {};
    for (const iso of intervaloDias(periodo.inicio, periodo.fim)) {
      const idx = dowToIdx(deIso(iso).getDay());
      if (!diaAgg[idx]) diaAgg[idx] = { fat: 0, count: 0 };
      for (const f of fs) {
        const dv = salesDay(f.id, iso);
        if (!dv) continue;
        if (divisao) {
          const divAg = dv.porDivisao[divisao];
          diaAgg[idx].fat += divAg?.faturamento ?? 0;
        } else {
          diaAgg[idx].fat += dv.total.faturamento;
        }
      }
      diaAgg[idx].count += 1;
    }
    const metaDiaria = metaTotal > 0 ? metaTotal / 7 : 0;
    diaVsMeta = diasSemanaNomes.map((nome, i) => ({
      dia: nome,
      meta: metaDiaria,
      realizado: diaAgg[i] ? diaAgg[i].fat / (diaAgg[i].count || 1) : 0,
    }));
  }

  // Evolução Fat vs Meta — eixo hora / dia / mês conforme o período.
  const diasPeriodo = intervaloDias(periodo.inicio, periodo.fim);
  const evolucao: EvolutionPoint[] = [];
  if (eixoSerie === "hora") {
    const dow = deIso(periodo.inicio).getDay() as Dow;
    const win = unionOpenWindow(
      fs.map((f) => effectiveWeekHours(f.horas)),
      dow,
    );
    const horas: number[] = [];
    for (let h = win.abertura; h < win.fechamento; h++) horas.push(h);
    const horasVisiveis = periodo.ehHoje ? horas.filter((h) => h <= CURRENT_HOUR) : horas;
    const metaPorHora = metaTotal > 0 && horas.length > 0 ? metaTotal / horas.length : 0;
    let acumR = 0;
    let acumM = 0;
    for (const h of horasVisiveis) {
      let fatH = 0;
      for (const f of fs) {
        const a = salesDay(f.id, periodo.inicio)?.porHora[h];
        if (!a) continue;
        if (!divisao) fatH += a.faturamento;
        else {
          const dia = salesDay(f.id, periodo.inicio)!;
          const fr = dia.total.faturamento > 0 ? dia.porDivisao[divisao].faturamento / dia.total.faturamento : 0;
          fatH += Math.round(a.faturamento * fr);
        }
      }
      acumR += fatH;
      acumM += metaPorHora;
      evolucao.push({ label: horaCurta(h), realizado: acumR, meta: acumM, projecao: null });
    }
  } else if (eixoSerie === "mes") {
    let acumR = 0;
    let acumM = 0;
    const meses = mesesEntre(periodo.inicio, periodo.fim);
    const metaPorMes = metaTotal > 0 && meses.length > 0 ? metaTotal / meses.length : 0;
    for (const mes of meses) {
      const agg = agregadoMes(fs, mes, divisao);
      acumR += agg.faturamento;
      acumM += metaPorMes;
      const label = mesAno(`${mes}-01`).split(" de ")[0];
      evolucao.push({ label, realizado: acumR, meta: acumM, projecao: null });
    }
  } else {
    let acumRealizado = 0;
    let acumMeta = 0;
    const metaPorDia = metaTotal > 0 ? metaTotal / diasPeriodo.length : 0;
    for (const iso of diasPeriodo) {
      let fatDia = 0;
      for (const f of fs) {
        const dv = salesDay(f.id, iso);
        if (!dv) continue;
        if (divisao) fatDia += dv.porDivisao[divisao]?.faturamento ?? 0;
        else fatDia += dv.total.faturamento;
      }
      acumRealizado += fatDia;
      acumMeta += metaPorDia;
      const d = deIso(iso);
      const mesesLbl = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      const label = periodo.granularidade === "mes"
        ? String(d.getDate())
        : `${String(d.getDate()).padStart(2, "0")} ${mesesLbl[d.getMonth()]}`;
      evolucao.push({ label, realizado: acumRealizado, meta: acumMeta, projecao: null });
    }
  }
  // Formas de pagamento (reusa lógica do Financeiro)
  const totaisForma: Record<string, number> = {};
  for (const f of fs) {
    for (const iso of diasPeriodo) {
      const dv = salesDay(f.id, iso);
      if (!dv) continue;
      for (const [meio, val] of Object.entries(dv.porMeio)) {
        totaisForma[meio] = (totaisForma[meio] ?? 0) + val;
      }
    }
  }
  const totalFormas = Object.values(totaisForma).reduce((s, v) => s + v, 0) || 1;
  const CORES_FORMAS: Record<string, string> = {
    Pix: "var(--ok)",
    "Cartão de crédito": "var(--acc)",
    "Cartão de débito": "var(--info)",
    Dinheiro: "var(--warn)",
  };
  const formasPagamento: PaymentMethodRevenue[] = Object.entries(totaisForma)
    .sort((a, b) => b[1] - a[1])
    .map(([forma, valor]) => ({
      forma,
      valor,
      pct: (valor / totalFormas) * 100,
      cor: CORES_FORMAS[forma] ?? "var(--t2)",
    }));

  // Top 5 Vendedoras (com % da meta individual)
  const vendMap = new Map<string, { nome: string; fat: number; vendas: number; itens: number; loja: string }>();
  for (const f of fs) {
    const cols = collaboratorsOfStore(f.id);
    for (const iso of diasPeriodo) {
      const dv = salesDay(f.id, iso);
      if (!dv) continue;
      for (const [colId, ag] of Object.entries(dv.porVendedora)) {
        const col = cols.find((c) => c.id === colId);
        if (!col) continue;
        const acc = vendMap.get(colId) ?? { nome: col.nome, fat: 0, vendas: 0, itens: 0, loja: f.fantasia };
        acc.fat += ag.faturamento;
        acc.vendas += ag.atendimentos;
        acc.itens += ag.itens;
        vendMap.set(colId, acc);
      }
    }
  }
  // Meta individual = meta total da loja / nº de vendedoras ativas
  const competenciaMeta = periodo.inicio.slice(0, 7); // YYYY-MM
  const metasFs = fs.map((f) => goalOfStore(f.id, competenciaMeta)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  const metaTotalLoja = metasFs.reduce((s, m) => s + m.valorLoja, 0);
  const numVendedoras = vendMap.size || 1;
  const individualGoal = metaTotalLoja / numVendedoras;
  const topVendedoras: TopSeller[] = [...vendMap.values()]
    .sort((a, b) => b.fat - a.fat)
    .slice(0, 5)
    .map((v) => ({
      nome: v.nome,
      valor: v.fat,
      sub: `${v.vendas} vendas · ${individualGoal > 0 ? Math.round((v.fat / individualGoal) * 100) : 0}% da meta`,
      ticketMedio: v.vendas > 0 ? v.fat / v.vendas : 0,
      pctMeta: individualGoal > 0 ? Math.min(100, (v.fat / individualGoal) * 100) : 0,
      ...(v.vendas > 0 ? { pa: v.itens / v.vendas } : {}),
      lojas: v.loja ? [v.loja] : [],
    }));

  // Top 5 Produtos (com categoria e trend)
  const prodMap = new Map<string, { nome: string; fat: number; itens: number; categoriaNome: string }>();
  for (const [catId, c] of catMap.entries()) {
    const cat = categorias.find((x) => x.id === catId);
    if (!cat) continue;
    const prods = productsOfCategory(cat.id, `${periodo.inicio}|${divisao ?? ""}`, c.faturamento, 0, 0);
    for (const p of prods) {
      const acc = prodMap.get(p.codProduto) ?? { nome: p.nome, fat: 0, itens: 0, categoriaNome: cat.nome };
      acc.fat += p.receita;
      acc.itens += p.itens;
      prodMap.set(p.codProduto, acc);
    }
  }
  // Calcular trend comparando com período anterior
  const prodMapAnt = new Map<string, number>();
  for (const [catId, c] of catMap.entries()) {
    const prodsAnt = productsOfCategory(catId, `${ant.inicio}|${divisao ?? ""}`, c.faturamento * 0.85, 0, 0);
    for (const p of prodsAnt) {
      prodMapAnt.set(p.codProduto, (prodMapAnt.get(p.codProduto) ?? 0) + p.receita);
    }
  }
  const topProdutos: (TopItem & { sub?: string; itens?: number; categoria?: string; trend?: number })[] = [...prodMap.entries()]
    .map(([cod, p]) => {
      const fatAnt = prodMapAnt.get(cod) ?? 0;
      const trendPct = fatAnt > 0 ? ((p.fat - fatAnt) / fatAnt) * 100 : null;
      return {
        nome: labelUpper(p.nome),
        valor: p.fat,
        sub: `${p.itens} itens`,
        itens: p.itens,
        categoria: labelUpper(p.categoriaNome),
        trend: trendPct != null ? Math.round(trendPct) : undefined,
      };
    })
    .sort((a, b) => b.valor - a.valor);

  // Ranking de lojas (faturamento + % da meta + trend) — fantasia = mesmo rótulo do StorePicker
  const rankingLojas: (TopItem & { pctMeta?: number; trend?: number })[] = fs.map((f) => {
    const fatPeriodo = agregadoPeriodo(f, periodo.inicio, periodo.fim, divisao).faturamento;
    const metaFilial = goalOfStore(f.id, periodo.inicio.slice(0, 7));
    const pctMeta = metaFilial ? (fatPeriodo / metaFilial.valorLoja) * 100 : null;
    // Trend real: faturamento do período vs período anterior
    const fatAnterior = agregadoPeriodo(f, ant.inicio, ant.fim, divisao).faturamento;
    const trend = fatAnterior > 0 ? Math.round(((fatPeriodo - fatAnterior) / fatAnterior) * 100) : undefined;
    return {
      nome: labelUpper(f.fantasia),
      valor: fatPeriodo,
      pctMeta: pctMeta ?? undefined,
      trend,
    };
  }).sort((a, b) => b.valor - a.valor);

  return {
    escopo,
    periodo,
    kpis,
    kpisWpink,
    gauges,
    faltamParaMeta,
    projecaoFechamento,
    deltaFaturamento: temComp ? kpiDelta(atual.faturamento, anterior.faturamento, vsRotulo) : undefined,
    eixoSerie,
    rotuloSerie,
    categoriaVsMeta,
    diaVsMeta,
    evolucao,
    formasPagamento,
    topVendedoras,
    topProdutos,
    rankingLojas,
  };
}
