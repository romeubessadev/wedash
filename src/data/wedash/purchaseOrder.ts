/**
 * Pedido de compra (Estoque > Pedido de compra), mesma regra da planilha do dono.
 * Fonte = Saldo Atual e Futuro do Millennium (ESTOQUEEMCOMPRA): Total = saldo + pedidos em aberto.
 * Elegível = código sem "WP", não bloqueado para compra e múltipla > 0.
 * A pedir = (mínimo × multiplicador − Total) arredondado para cima até a múltipla; Total negativo conta como 0.
 */

export type PurchaseStockRow = {
  code: string;
  color: string;
  print: string;
  size: string;
  description: string;
  balance: number;
  openOrder: number;
  total: number;
  multiple: number | null;
  blocked: boolean;
  /** YYYY-MM-DD (DATA_CADASTRO no fuso de Brasília). */
  registeredAt: string | null;
  /** Ordem em que o relatório devolveu a linha. */
  position: number;
};

export type PurchaseOrderRow = {
  code: string;
  nome: string;
  variantes: PurchaseStockRow[];
  position: number;
  saldo: number;
  pedidosAbertos: number;
  total: number;
  vendidos30: number;
  multipla: number;
  minimo: number | null;
  novo: boolean;
  variasVariantes: boolean;
  /** null = "—" (sem mínimo ou várias variantes). */
  aPedir: number | null;
  noPedido: boolean;
};

export type PurchaseOrderView = {
  rows: PurchaseOrderRow[];
  contagens: { noPedido: number; semMinimo: number; novos: number };
  /** Produtos e itens que vão para o arquivo no multiplicador atual. */
  resumo: { produtos: number; itens: number };
};

export type PurchaseFilter = "todos" | "pedido" | "semMinimo" | "novos";

export const PURCHASE_FACTORS = [1, 2, 3, 4, 5] as const;
export const PURCHASE_MIN_MAX = 99_999;
const NEW_PRODUCT_DAYS = 30;

export function isEligible(r: PurchaseStockRow): boolean {
  return !r.code.toUpperCase().includes("WP") && !r.blocked && (r.multiple ?? 0) > 0;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function isNewProduct(registeredAt: string | null, todayIso: string): boolean {
  if (!registeredAt) return false;
  const dias = dayNumber(todayIso) - dayNumber(registeredAt);
  return dias >= 0 && dias < NEW_PRODUCT_DAYS;
}

export function purchaseQuantity(total: number, min: number | null, multiple: number, factor: number): number {
  if (!min || min <= 0 || multiple <= 0) return 0;
  const alvo = min * factor;
  const estoque = Math.max(0, total);
  if (estoque >= alvo) return 0;
  return Math.ceil((alvo - estoque) / multiple) * multiple;
}

export function parseMinInput(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t)) return { ok: false };
  const n = Number(t);
  return n <= PURCHASE_MIN_MAX ? { ok: true, value: n } : { ok: false };
}

export function buildPurchaseOrderView(input: {
  stock: PurchaseStockRow[];
  mins: Map<string, number>;
  sold30: Map<string, number>;
  factor: number;
  todayIso: string;
}): PurchaseOrderView {
  const porCodigo = new Map<string, PurchaseStockRow[]>();
  for (const r of [...input.stock].sort((a, b) => a.position - b.position)) {
    if (!isEligible(r)) continue;
    const lista = porCodigo.get(r.code);
    if (lista) lista.push(r);
    else porCodigo.set(r.code, [r]);
  }

  const rows: PurchaseOrderRow[] = [...porCodigo.entries()].map(([code, variantes]) => {
    const first = variantes[0];
    const soma = (f: (v: PurchaseStockRow) => number) => variantes.reduce((s, v) => s + f(v), 0);
    const total = soma((v) => v.total);
    const multipla = first.multiple ?? 0;
    const minimo = input.mins.get(code) ?? null;
    const variasVariantes = variantes.length > 1;
    const aPedir = variasVariantes || !minimo ? null : purchaseQuantity(total, minimo, multipla, input.factor);
    return {
      code,
      nome: first.description,
      variantes,
      position: first.position,
      saldo: soma((v) => v.balance),
      pedidosAbertos: soma((v) => v.openOrder),
      total,
      vendidos30: input.sold30.get(code) ?? 0,
      multipla,
      minimo,
      novo: isNewProduct(variantes.find((v) => v.registeredAt)?.registeredAt ?? null, input.todayIso),
      variasVariantes,
      aPedir,
      noPedido: (aPedir ?? 0) > 0,
    };
  });

  const noPedido = rows.filter((r) => r.noPedido);
  return {
    rows,
    contagens: {
      noPedido: noPedido.length,
      semMinimo: rows.filter((r) => !r.minimo).length,
      novos: rows.filter((r) => r.novo).length,
    },
    resumo: { produtos: noPedido.length, itens: noPedido.reduce((s, r) => s + (r.aPedir ?? 0), 0) },
  };
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function filterPurchaseRows(rows: PurchaseOrderRow[], opts: { busca: string; filtro: PurchaseFilter }): PurchaseOrderRow[] {
  const q = fold(opts.busca.trim());
  return rows.filter((r) => {
    if (opts.filtro === "pedido" && !r.noPedido) return false;
    if (opts.filtro === "semMinimo" && r.minimo) return false;
    if (opts.filtro === "novos" && !r.novo) return false;
    return !q || fold(r.nome).includes(q) || fold(r.code).includes(q);
  });
}
