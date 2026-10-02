import { brlCent, collaboratorName, dataCurta, deIso, intervaloDias, num, somarDias } from "@/lib/format";
import {
  usesScope,
  type ChallengeAggInput,
  type ChallengeInput,
  type ChallengeMetric,
  type ChallengeMode,
  type ChallengePrize,
  type ChallengeRecord,
  type ChallengeScope,
} from "./challengesRepo";
import type { GoalTeamMember } from "./goalsRepo";
import { goalStatus, prazoRestante, type GoalStatus } from "./goalView";

export type ChallengeStatus = GoalStatus;

export const CHALLENGE_STATUS_LABEL: Record<ChallengeStatus, string> = {
  active: "Em andamento",
  upcoming: "A começar",
  ended: "Encerrado",
};

export const CHALLENGE_METRIC_LABEL: Record<ChallengeMetric, string> = {
  QUANTITY: "Quantidade",
  VALUE: "Valor",
  PA: "P.A.",
  TICKET: "Ticket médio",
};

export const CHALLENGE_SCOPE_LABEL: Record<ChallengeScope, string> = {
  PRODUCTS: "Produtos escolhidos",
  CATEGORIES: "Categorias escolhidas",
  ALL: "Tudo o que vender",
};

export const CHALLENGE_MODE_LABEL: Record<ChallengeMode, string> = {
  CONTEST: "Quem fizer mais",
  MINIMUM: "Quem chegar ao mínimo",
};

export interface ChallengeParticipant {
  key: string;
  nome: string;
  grupo: string | null;
  /** null = a começar ou P.A. sem itens gravados ("—"). */
  resultado: number | null;
  vendas: number;
  /** Disputa: posição entre quem concorre (empate compartilha). */
  posicao: number | null;
  /** Disputa: venceu · Mínimo: atingiu. */
  vencedor: boolean;
  premio: ChallengePrize | null;
  /** Só em andamento. */
  falta: string | null;
}

export interface ChallengeManagerResult {
  resultado: number | null;
  alvo: number;
  atingiu: boolean;
  premio: ChallengePrize;
}

export interface ChallengeView {
  mode: ChallengeMode;
  status: ChallengeStatus;
  prazo: string;
  /** Encerrado ontem: o último dia fecha na madrugada e ainda pode mudar. */
  emFechamento: boolean;
  participantes: ChallengeParticipant[];
  /** Mínimo: quantas pessoas atingiram. */
  atingiram: number;
  gerencia: ChallengeManagerResult | null;
  /** Dias com venda da loja e sem itens por pessoa (produtos/categorias escolhidos). */
  diasIncompletos: string[];
}

const usesMinSales = (m: ChallengeMetric) => m === "PA" || m === "TICKET";
const round2 = (v: number) => Math.round(v * 100) / 100;

function diasEntre(inicio: string, fim: string): number {
  return Math.round((deIso(fim).getTime() - deIso(inicio).getTime()) / 86_400_000) + 1;
}

/** 12 itens · 1 item · 7,5 itens · 1,85 · R$ 92,30 */
export function metricValueLabel(metric: ChallengeMetric, value: number): string {
  if (metric === "PA") return num(value, 2);
  if (metric === "TICKET" || metric === "VALUE") return brlCent(value);
  const inteiro = Number.isInteger(value);
  return `${num(value, inteiro ? 0 : 1)} ${value === 1 ? "item" : "itens"}`;
}

export function prizeLabel(p: ChallengePrize): string {
  return p.kind === "MONEY" ? brlCent(p.amount) : p.label;
}

function faltaLabel(metric: ChallengeMetric, diff: number): string {
  if (metric === "PA") return `Falta ${num(diff, 2)} de P.A.`;
  if (metric === "TICKET" || metric === "VALUE") return `Faltam ${brlCent(diff)}`;
  const n = Math.ceil(diff - 1e-9);
  return n === 1 ? "Falta 1 item" : `Faltam ${num(n)} itens`;
}

const faltaVendas = (n: number) => (n === 1 ? "Falta 1 venda" : `Faltam ${num(n)} vendas`);

interface Acc {
  key: string;
  nome: string;
  grupo: string | null;
  /** Itens e R$ dos produtos/categorias escolhidos. */
  itens: number;
  valorCents: number;
  vendas: number;
  itensVendas: number;
  faturamentoCents: number;
  semItens: boolean;
}

export function buildChallengeView(args: {
  challenge: ChallengeRecord;
  aggs: ChallengeAggInput;
  today: string;
}): ChallengeView {
  const { challenge: c, aggs, today } = args;
  const status = goalStatus(c, today);
  const ate = c.endsOn < today ? c.endsOn : today;
  const noPeriodo = (r: { storeId: string; day: string }) => r.storeId === c.storeId && r.day >= c.startsOn && r.day <= ate;

  const team = aggs.team.filter((m) => m.storeId === c.storeId);
  const porCodigo = new Map(team.map((m) => [m.employeeId, m]));
  const porGerador = new Map<number, GoalTeamMember>();
  for (const m of team) if (m.geradorId != null) porGerador.set(m.geradorId, m);
  const porNome = new Map<string, GoalTeamMember>();
  for (const m of team) for (const k of m.nameKeys) if (!porNome.has(k)) porNome.set(k, m);

  const accs = new Map<string, Acc>();
  const acc = (membro: GoalTeamMember | undefined, sellerKey: string, sellerName: string): Acc => {
    const key = membro ? `e:${membro.employeeId}` : `n:${sellerKey}`;
    let a = accs.get(key);
    if (!a) {
      a = {
        key,
        nome: collaboratorName(membro?.name ?? (sellerName || sellerKey)),
        grupo: membro?.shiftName ?? null,
        itens: 0,
        valorCents: 0,
        vendas: 0,
        itensVendas: 0,
        faturamentoCents: 0,
        semItens: false,
      };
      accs.set(key, a);
    }
    return a;
  };

  for (const m of team) if (m.salesPerson) acc(m, "", m.name);

  const porProduto = usesScope(c.metric) && c.scope !== "ALL";
  if (status !== "upcoming") {
    if (porProduto) {
      const codigos = new Set(c.products.map((p) => p.code));
      const tipos = new Set(c.categories.map((t) => t.typeId));
      const conta = (code: string) =>
        c.scope === "PRODUCTS" ? codigos.has(code) : tipos.has(aggs.typeByCode.get(code) ?? Number.NaN);
      for (const r of aggs.sellerProducts) {
        if (!noPeriodo(r)) continue;
        const membro = porGerador.get(r.sellerGeradorId) ?? porNome.get(r.sellerKey);
        const a = acc(membro, r.sellerKey, r.sellerName);
        if (conta(r.productCode)) {
          a.itens += r.itemCount;
          a.valorCents += r.revenueCents;
        }
      }
    }
    for (const r of aggs.sellerDays) {
      if (!noPeriodo(r)) continue;
      const membro =
        (r.sellerEmployeeId != null ? porCodigo.get(r.sellerEmployeeId) : undefined) ??
        (r.sellerGeradorId != null ? porGerador.get(r.sellerGeradorId) : undefined) ??
        porNome.get(r.sellerKey);
      const a = acc(membro, r.sellerKey, r.sellerName);
      a.vendas += r.salesCount;
      a.faturamentoCents += r.revenueCents;
      a.itensVendas += r.itemCount ?? 0;
      if (r.salesCount > 0 && !(r.itemCount && r.itemCount > 0)) a.semItens = true;
    }
  }

  const resultadoDe = (a: Acc): number | null => {
    if (status === "upcoming") return null;
    if (c.metric === "QUANTITY") return porProduto ? a.itens : a.semItens ? null : a.itensVendas;
    if (c.metric === "VALUE") return round2((porProduto ? a.valorCents : a.faturamentoCents) / 100);
    if (a.vendas <= 0) return 0;
    if (c.metric === "PA") return a.semItens ? null : round2(a.itensVendas / a.vendas);
    return round2(a.faturamentoCents / 100 / a.vendas);
  };

  const minVendas = usesMinSales(c.metric) ? Math.max(1, c.minSales ?? 1) : 0;
  const base = [...accs.values()].map((a) => ({ a, resultado: resultadoDe(a) }));
  const concorre = (x: { a: Acc; resultado: number | null }) =>
    x.resultado != null && x.resultado > 0 && x.a.vendas >= minVendas;
  const alcancaAlvo = (v: number | null) => v != null && v > 0 && (c.target == null || v >= c.target - 1e-9);

  const posicaoDe = new Map<string, number>();
  if (c.mode === "CONTEST" && status !== "upcoming") {
    const pool = base.filter(concorre).sort((x, y) => (y.resultado ?? 0) - (x.resultado ?? 0));
    pool.forEach((x, i) => {
      const anterior = pool[i - 1];
      posicaoDe.set(x.a.key, anterior && anterior.resultado === x.resultado ? posicaoDe.get(anterior.a.key)! : i + 1);
    });
  }

  const valoresAcima = base
    .filter((x) => concorre(x) && posicaoDe.has(x.a.key))
    .map((x) => ({ valor: x.resultado!, posicao: posicaoDe.get(x.a.key)! }));

  const participantes: ChallengeParticipant[] = base.map(({ a, resultado }) => {
    const posicao = posicaoDe.get(a.key) ?? null;
    let vencedor = false;
    let premio: ChallengePrize | null = null;
    if (status !== "upcoming") {
      if (c.mode === "CONTEST") {
        vencedor = posicao != null && posicao <= c.prizes.length && alcancaAlvo(resultado);
        premio = vencedor ? (c.prizes[posicao! - 1] ?? null) : null;
      } else {
        vencedor = alcancaAlvo(resultado) && a.vendas >= minVendas && c.target != null;
        premio = vencedor ? (c.prizes[0] ?? null) : null;
      }
    }

    let falta: string | null = null;
    if (status === "active" && resultado != null) {
      if (a.vendas < minVendas) falta = faltaVendas(minVendas - a.vendas);
      else if (c.mode === "MINIMUM") {
        if (!vencedor && c.target != null) falta = faltaLabel(c.metric, c.target - resultado);
      } else if (c.target != null && resultado < c.target - 1e-9) {
        falta = `${faltaLabel(c.metric, c.target - resultado)} para o mínimo`;
      } else {
        const acima = valoresAcima
          .filter((v) => v.valor > resultado + 1e-9)
          .sort((x, y) => x.valor - y.valor)[0];
        if (acima) falta = `${faltaLabel(c.metric, acima.valor - resultado)} para o ${acima.posicao}º lugar`;
      }
    }

    return { key: a.key, nome: a.nome, grupo: a.grupo, resultado, vendas: a.vendas, posicao, vencedor, premio, falta };
  });

  participantes.sort((x, y) => {
    if (status !== "upcoming") {
      if (c.mode === "CONTEST") {
        const px = x.posicao ?? Number.POSITIVE_INFINITY;
        const py = y.posicao ?? Number.POSITIVE_INFINITY;
        if (px !== py) return px - py;
      } else if (x.vencedor !== y.vencedor) return x.vencedor ? -1 : 1;
      const rx = x.resultado ?? Number.NEGATIVE_INFINITY;
      const ry = y.resultado ?? Number.NEGATIVE_INFINITY;
      if (rx !== ry) return ry - rx;
    }
    return x.nome.localeCompare(y.nome, "pt-BR");
  });

  let gerencia: ChallengeManagerResult | null = null;
  const metaGerencia = c.managerTarget;
  if (c.managerPrize && metaGerencia != null) {
    let resultado: number | null = null;
    if (status !== "upcoming") {
      const todos = [...accs.values()];
      const vendas = todos.reduce((s, a) => s + a.vendas, 0);
      if (usesScope(c.metric)) {
        const porPessoa = todos.map(resultadoDe);
        resultado = porPessoa.some((v) => v == null)
          ? null
          : todos.length > 0
            ? round2(porPessoa.reduce<number>((s, v) => s + (v ?? 0), 0) / todos.length)
            : 0;
      } else if (c.metric === "PA") {
        resultado = todos.some((a) => a.semItens)
          ? null
          : vendas > 0
            ? round2(todos.reduce((s, a) => s + a.itensVendas, 0) / vendas)
            : 0;
      } else {
        resultado = vendas > 0 ? round2(todos.reduce((s, a) => s + a.faturamentoCents, 0) / 100 / vendas) : 0;
      }
    }
    gerencia = {
      resultado,
      alvo: metaGerencia,
      atingiu: resultado != null && resultado > 0 && resultado >= metaGerencia - 1e-9,
      premio: c.managerPrize,
    };
  }

  const diasIncompletos: string[] = [];
  if (porProduto && status !== "upcoming") {
    const comItens = new Set(aggs.sellerProducts.filter(noPeriodo).map((r) => r.day));
    for (const day of intervaloDias(c.startsOn, ate)) {
      if (aggs.storeSaleDays.has(`${c.storeId}|${day}`) && !comItens.has(day)) diasIncompletos.push(day);
    }
  }

  const prazo =
    status === "active"
      ? prazoRestante(diasEntre(today, c.endsOn))
      : status === "upcoming"
        ? `Começa em ${dataCurta(c.startsOn)}`
        : "Encerrado";

  return {
    mode: c.mode,
    status,
    prazo,
    emFechamento: status === "ended" && today <= somarDias(c.endsOn, 1),
    participantes,
    atingiram: c.mode === "MINIMUM" ? participantes.filter((p) => p.vencedor).length : 0,
    gerencia,
    diasIncompletos,
  };
}

export interface ChallengeWinner {
  nome: string;
  grupo: string | null;
  /** "1º lugar" · "Atingiu" */
  colocacao: string;
  premio: ChallengePrize;
}

export interface ChallengePayout {
  vencedores: ChallengeWinner[];
  gerencia: ChallengePrize | null;
  /** Σ prêmios em R$ (pessoas + gerência). */
  totalReais: number;
  /** Prêmios em espécie, um por vencedor (+ gerência). */
  especie: string[];
}

export function challengePayout(view: ChallengeView): ChallengePayout {
  const vencedores: ChallengeWinner[] = view.participantes
    .filter((p) => p.vencedor && p.premio)
    .map((p) => ({
      nome: p.nome,
      grupo: p.grupo,
      colocacao: p.posicao != null ? `${p.posicao}º lugar` : "Atingiu",
      premio: p.premio!,
    }));
  const gerencia = view.gerencia?.atingiu ? view.gerencia.premio : null;
  const premios = [...vencedores.map((w) => w.premio), ...(gerencia ? [gerencia] : [])];
  return {
    vencedores,
    gerencia,
    totalReais: premios.reduce((s, p) => s + (p.kind === "MONEY" ? p.amount : 0), 0),
    especie: premios.flatMap((p) => (p.kind === "ITEM" ? [p.label] : [])),
  };
}

function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Resumo do card da listagem: líder(es) na Disputa · quantas atingiram no Mínimo. */
export function challengeCardSummary(view: ChallengeView): { lider: string | null; atingiram: number | null } {
  if (view.mode === "MINIMUM") return { lider: null, atingiram: view.status === "upcoming" ? null : view.atingiram };
  const lideres = view.participantes.filter((p) => p.posicao === 1).map((p) => p.nome);
  return { lider: lideres.length > 0 ? juntarNomes(lideres) : null, atingiram: null };
}

/** Cópia para "Duplicar desafio": começa no dia seguinte ao fim, com a mesma duração. */
export function copyChallenge(c: ChallengeRecord): ChallengeInput {
  const { id: _id, ...rest } = c;
  const duracao = diasEntre(c.startsOn, c.endsOn);
  const startsOn = somarDias(c.endsOn, 1);
  return {
    ...rest,
    name: `${c.name} (cópia)`,
    startsOn,
    endsOn: somarDias(startsOn, duracao - 1),
    products: c.products.map((p) => ({ ...p })),
    categories: c.categories.map((t) => ({ ...t })),
    prizes: c.prizes.map((p) => ({ ...p })),
    managerPrize: c.managerPrize ? { ...c.managerPrize } : null,
  };
}
