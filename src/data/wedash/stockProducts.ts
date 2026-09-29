/**
 * Estoque > Produtos: custo, despesas sobre a venda e lucro por peça de cada produto, por loja.
 * Custo de aquisição = custo da tabela de custo da loja + ICMS ST (% do custo).
 * Despesas sobre a venda = ICMS + royalties + taxa de marketing (da marca do produto) + aluguel percentual
 * (só Shopping) — todas em % do preço. Lucro por peça = preço − despesas − custo de aquisição.
 * Preço mínimo = custo de aquisição ÷ (1 − Σ%): o menor preço que não dá prejuízo.
 */
import type { Store } from "./stores";

export type StockCatalogItem = { code: string; name: string; category: string };

export type StockInput = {
  stores: Store[];
  catalog: Map<string, StockCatalogItem>;
  /** qty = soma dos locais; locations = saldo por local de estoque (ESTOQUE, QUIOSQUE, SHOP010…). */
  stock: Array<{ storeId: string; code: string; qty: number; locations?: Record<string, number> }>;
  /** tabela de custo → COD_PRODUTO → custo unitário (centavos). */
  costPrices: Map<number, Map<string, number>>;
  /** tabela de venda → COD_PRODUTO → preço (centavos). */
  salePrices: Map<number, Map<string, number>>;
  saleTableId: number | null;
  /** Vendas dos últimos 30 dias por loja × produto (preço médio praticado). */
  charged: Array<{ storeId: string; code: string; revenueCents: number; items: number }>;
};

export type CostLine = { label: string; pct: number; valor: number };

export type PriceComposition = {
  preco: number | null;
  custo: number | null;
  icmsStPct: number;
  icmsSt: number | null;
  custoAquisicao: number | null;
  /** Despesas sobre a venda (só as > 0%); valor = % × preço. */
  despesas: CostLine[];
  pctTotal: number;
  impostos: number | null;
  franquiaAluguel: number | null;
  custoTotal: number | null;
  lucro: number | null;
  margemPct: number | null;
  precoMinimo: number | null;
};

export function productBrand(code: string): "WEPINK" | "WPINK" {
  const t = code.trim().toUpperCase();
  return /^WP[\dA-Z]/.test(t) || t === "WP" || t.startsWith("WP ") ? "WPINK" : "WEPINK";
}

/** % sobre o preço de venda que a loja paga em cada peça do produto. */
export function saleCostPcts(store: Store, code: string): CostLine[] {
  const c = store.custos;
  const wpink = productBrand(code) === "WPINK";
  const rent = store.pointType === "SHOPPING" ? (c?.rentWepinkPct ?? c?.rentWpinkPct ?? 0) : 0;
  const lines: CostLine[] = [
    { label: "ICMS", pct: c?.icmsPct ?? 0, valor: 0 },
    { label: "Royalties", pct: (wpink ? c?.royaltiesWpinkPct : c?.royaltiesWepinkPct) ?? 0, valor: 0 },
    { label: "Taxa de marketing", pct: (wpink ? c?.marketingWpinkPct : c?.marketingWepinkPct) ?? 0, valor: 0 },
    { label: "Aluguel percentual", pct: rent, valor: 0 },
  ];
  return lines.filter((l) => l.pct > 0);
}

export function composePrice(store: Store, code: string, priceCents: number | null, costCents: number | null): PriceComposition {
  const preco = priceCents == null ? null : priceCents / 100;
  const custo = costCents == null ? null : costCents / 100;
  const icmsStPct = store.custos?.icmsStPct ?? 0;
  const icmsSt = custo == null ? null : (custo * icmsStPct) / 100;
  const custoAquisicao = custo == null ? null : custo + (icmsSt ?? 0);
  const pcts = saleCostPcts(store, code);
  const pctTotal = pcts.reduce((s, l) => s + l.pct, 0);
  const despesas = pcts.map((l) => ({ ...l, valor: preco == null ? 0 : (preco * l.pct) / 100 }));
  const icms = despesas.find((l) => l.label === "ICMS")?.valor ?? 0;
  const franquiaAluguel = preco == null ? null : despesas.filter((l) => l.label !== "ICMS").reduce((s, l) => s + l.valor, 0);
  const impostos = custo == null ? null : (icmsSt ?? 0) + (preco == null ? 0 : icms);
  const custoTotal = custoAquisicao == null || preco == null ? null : custoAquisicao + icms + (franquiaAluguel ?? 0);
  const lucro = custoTotal == null || preco == null ? null : preco - custoTotal;
  return {
    preco,
    custo,
    icmsStPct,
    icmsSt,
    custoAquisicao,
    despesas,
    pctTotal,
    impostos,
    franquiaAluguel,
    custoTotal,
    lucro,
    margemPct: lucro == null || !preco ? null : (lucro / preco) * 100,
    precoMinimo: custoAquisicao == null || pctTotal >= 100 ? null : custoAquisicao / (1 - pctTotal / 100),
  };
}

export type StockLocation = { nome: string; qtd: number };

/** Local negativo coberto por outro local positivo da mesma loja: `qtd` peças `de` → `para`. */
export type StockTransfer = { para: string; de: string[]; qtd: number };

/** Transferências pendentes entre locais de estoque de uma loja (a venda sai de um local e a entrada caiu em outro). */
export function stockTransfers(locais: StockLocation[]): StockTransfer[] {
  const positivos = locais.filter((l) => l.qtd > 0).sort((a, b) => b.qtd - a.qtd);
  let disponivel = positivos.reduce((s, l) => s + l.qtd, 0);
  const out: StockTransfer[] = [];
  for (const l of [...locais].filter((x) => x.qtd < 0).sort((a, b) => a.qtd - b.qtd)) {
    const qtd = Math.min(-l.qtd, disponivel);
    if (qtd <= 0) continue;
    disponivel -= qtd;
    out.push({ para: l.nome, de: positivos.map((p) => p.nome), qtd });
  }
  return out;
}

export type StockStoreDetail = {
  store: Store;
  estoque: number;
  /** Saldo por local (só locais com saldo ≠ 0), maior primeiro. */
  locais: StockLocation[];
  transferencias: StockTransfer[];
  composicao: PriceComposition;
  praticado: { preco: number; itens: number; lucro: number | null; margemPct: number | null } | null;
};

export type StockProductRow = {
  codigo: string;
  nome: string;
  categoria: string;
  estoque: number;
  /** Peças a transferir entre locais de estoque, somando as lojas do filtro. */
  transferir: number;
  custo: number | null;
  impostos: number | null;
  franquiaAluguel: number | null;
  custoTotal: number | null;
  preco: number | null;
  lucro: number | null;
  margemPct: number | null;
  precoMinimo: number | null;
  precoPraticado: number | null;
  margemPraticadaPct: number | null;
  itensVendidos30d: number;
  /** Custo / lucro diferentes entre as lojas do filtro: valores = média das lojas. */
  variaPorLoja: boolean;
  lojas: StockStoreDetail[];
};

export type NegativeStock = { codigo: string; nome: string; quantidade: number; lojas: string[] };

export type StockProductsView = {
  rows: StockProductRow[];
  categorias: string[];
  negativos: NegativeStock[];
};

const same = (vals: Array<number | null>) => vals.every((v) => v != null && Math.abs(v - vals[0]!) < 0.005);
const mean = (vals: Array<number | null>): number | null => {
  const ok = vals.filter((v): v is number => v != null);
  return ok.length === 0 ? null : ok.reduce((s, v) => s + v, 0) / ok.length;
};

export function costCentsFor(costPrices: StockInput["costPrices"], store: Store, code: string): number | null {
  if (store.costTableId == null) return null;
  return costPrices.get(store.costTableId)?.get(code) ?? null;
}

export function buildStockProductsView(input: StockInput): StockProductsView {
  const prices = input.saleTableId == null ? new Map<string, number>() : (input.salePrices.get(input.saleTableId) ?? new Map());
  const stockBy = new Map<string, number>();
  const locationsBy = new Map<string, Record<string, number>>();
  for (const s of input.stock) {
    const k = `${s.storeId}|${s.code}`;
    stockBy.set(k, (stockBy.get(k) ?? 0) + s.qty);
    const acc = locationsBy.get(k) ?? {};
    for (const [nome, q] of Object.entries(s.locations ?? {})) acc[nome] = (acc[nome] ?? 0) + q;
    locationsBy.set(k, acc);
  }
  const chargedBy = new Map<string, { revenueCents: number; items: number }>();
  for (const c of input.charged) {
    const k = `${c.storeId}|${c.code}`;
    const acc = chargedBy.get(k) ?? { revenueCents: 0, items: 0 };
    acc.revenueCents += c.revenueCents;
    acc.items += c.items;
    chargedBy.set(k, acc);
  }
  const storeIds = new Set(input.stores.map((s) => s.id));
  const codes = new Set<string>(prices.keys());
  for (const s of input.stock) {
    if (storeIds.has(s.storeId) && (s.qty !== 0 || Object.values(s.locations ?? {}).some((q) => q !== 0))) codes.add(s.code);
  }

  const rows: StockProductRow[] = [];
  const negativos: NegativeStock[] = [];

  for (const code of codes) {
    const cat = input.catalog.get(code);
    const nome = cat?.name || code;
    const priceCents = prices.get(code) ?? null;
    const lojas: StockStoreDetail[] = input.stores.map((store) => {
      const estoque = stockBy.get(`${store.id}|${code}`) ?? 0;
      const locais = Object.entries(locationsBy.get(`${store.id}|${code}`) ?? {})
        .filter(([, q]) => q !== 0)
        .map(([nome, q]) => ({ nome, qtd: q }))
        .sort((a, b) => b.qtd - a.qtd);
      const costCents = costCentsFor(input.costPrices, store, code);
      const composicao = composePrice(store, code, priceCents, costCents);
      const ch = chargedBy.get(`${store.id}|${code}`);
      let praticado: StockStoreDetail["praticado"] = null;
      if (ch && ch.items > 0 && ch.revenueCents > 0) {
        const p = composePrice(store, code, Math.round(ch.revenueCents / ch.items), costCents);
        praticado = { preco: ch.revenueCents / ch.items / 100, itens: ch.items, lucro: p.lucro, margemPct: p.margemPct };
      }
      return { store, estoque, locais, transferencias: stockTransfers(locais), composicao, praticado };
    });

    const neg = lojas.filter((l) => l.estoque < 0);
    if (neg.length > 0) {
      negativos.push({ codigo: code, nome, quantidade: neg.reduce((s, l) => s + l.estoque, 0), lojas: neg.map((l) => l.store.fantasia) });
    }

    const comp = lojas.map((l) => l.composicao);
    const pick = (f: (c: PriceComposition) => number | null) => {
      const vals = comp.map(f);
      return same(vals) ? vals[0]! : mean(vals);
    };
    const varia = comp.length > 1 && !same(comp.map((c) => c.lucro ?? c.custoAquisicao));
    const ch = lojas.filter((l) => l.praticado);
    const itensPraticados = ch.reduce((s, l) => s + l.praticado!.itens, 0);
    const receitaPraticada = ch.reduce((s, l) => s + l.praticado!.preco * l.praticado!.itens, 0);
    const lucroPraticado = ch.every((l) => l.praticado!.lucro != null)
      ? ch.reduce((s, l) => s + l.praticado!.lucro! * l.praticado!.itens, 0)
      : null;

    rows.push({
      codigo: code,
      nome,
      categoria: cat?.category || "Sem categoria",
      estoque: lojas.reduce((s, l) => s + l.estoque, 0),
      transferir: lojas.reduce((s, l) => s + l.transferencias.reduce((t, x) => t + x.qtd, 0), 0),
      custo: pick((c) => c.custo),
      impostos: pick((c) => c.impostos),
      franquiaAluguel: pick((c) => c.franquiaAluguel),
      custoTotal: pick((c) => c.custoTotal),
      preco: priceCents == null ? null : priceCents / 100,
      lucro: pick((c) => c.lucro),
      margemPct: pick((c) => c.margemPct),
      precoMinimo: pick((c) => c.precoMinimo),
      precoPraticado: itensPraticados > 0 ? receitaPraticada / itensPraticados : null,
      margemPraticadaPct: lucroPraticado != null && receitaPraticada > 0 ? (lucroPraticado / receitaPraticada) * 100 : null,
      itensVendidos30d: itensPraticados,
      variaPorLoja: varia,
      lojas,
    });
  }

  rows.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  negativos.sort((a, b) => a.quantidade - b.quantidade);
  return {
    rows,
    categorias: [...new Set(rows.map((r) => r.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    negativos,
  };
}

/** Tabela mais usada no último dia com venda (entre as lojas); `usadas` = tabelas com venda no período, mais usada primeiro. */
export function suggestSaleTable(usage: Array<{ day: string; tableId: number; items: number }>): {
  sugerida: number | null;
  usadas: number[];
} {
  if (usage.length === 0) return { sugerida: null, usadas: [] };
  const lastDay = usage.reduce((m, u) => (u.day > m ? u.day : m), "");
  const sum = (rows: typeof usage) => {
    const m = new Map<number, number>();
    for (const u of rows) m.set(u.tableId, (m.get(u.tableId) ?? 0) + u.items);
    return [...m].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  };
  return { sugerida: sum(usage.filter((u) => u.day === lastDay))[0] ?? null, usadas: sum(usage) };
}
