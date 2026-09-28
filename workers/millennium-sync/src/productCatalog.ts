/**
 * Produtos compartilhados pela rede: catálogo (product_type + product_catalog) + tabelas de custo
 * (product_cost_table + product_cost_table_price). Uma recarga só traz tudo (~30 chamadas).
 * Sem relógio — recarrega quando:
 * - catálogo ou tabelas de custo vazios;
 * - aparece produto desconhecido nas vendas;
 * - produto vendido com custo 0 na margem não tem preço na tabela da loja.
 * No máx. 1× por job e 1× a cada 15 min na rede inteira (lease no banco — o 1º worker que precisar busca).
 * O que segue faltando depois da recarga não força outra por 24h.
 */
import type { CatalogProduct, ProductType } from "./millenniumCatalog.ts";
import type { CostTable } from "./millenniumCostTable.ts";

export const CATALOG_MIN_INTERVAL_SEC = 15 * 60;
export const CATALOG_LEASE_SEC = 300;

export type SeenProduct = { erpProductId: number; code: string };
export type CatalogEntry = { code: string; description: string; typeId: number | null };

export type CatalogDeps = {
  countCatalog: () => Promise<number>;
  /** Ids já no catálogo ou marcados como desconhecidos nas últimas 24h. */
  knownProductIds: (ids: number[]) => Promise<Set<number>>;
  lookupProducts: (ids: number[]) => Promise<Map<number, CatalogEntry>>;
  claimRefresh: (owner: string, leaseSec: number, minIntervalSec: number) => Promise<boolean>;
  releaseRefresh: (owner: string, ok: boolean, error?: string) => Promise<void>;
  upsertTypes: (types: ProductType[]) => Promise<void>;
  upsertProducts: (products: CatalogProduct[]) => Promise<void>;
  recordMisses: (items: SeenProduct[]) => Promise<void>;
  fetchTypes: (session: string) => Promise<ProductType[]>;
  fetchProductsOfType: (session: string, typeId: number) => Promise<CatalogProduct[]>;
  countCostTables: () => Promise<number>;
  storeCostTable: (storeId: string) => Promise<number | null>;
  /** Códigos com preço na tabela ou marcados sem preço nas últimas 24h. */
  coveredCostCodes: (tableId: number, codes: string[]) => Promise<Set<string>>;
  recordCostMisses: (tableId: number, codes: string[]) => Promise<void>;
  fetchCostTables: (session: string) => Promise<CostTable[]>;
  fetchCostTablePrices: (session: string, tableId: number) => Promise<Map<string, number>>;
  saveCostTables: (tables: CostTable[]) => Promise<void>;
  saveCostTablePrices: (tableId: number, prices: Map<string, number>) => Promise<void>;
};

/** Estado por job: no máx. 1 recarga. */
export type CatalogGuard = { attempted: boolean };

export type ProductsRefresh = {
  types: number;
  products: number;
  tables: number;
  prices: number;
  calls: number;
};

export type EnsureCatalogResult =
  | { status: "ok"; unknown: 0 }
  | { status: "skipped"; unknown: number; reason: "job" | "busy" }
  | ({ status: "refreshed"; unknown: number; stillUnknown: number; costMissing: number; stillCostMissing: number } & ProductsRefresh);

/** Mesmo código de produto em 2 tipos / mesmo id com 2 códigos: fica o último visto. */
export function dedupeCatalogProducts(products: CatalogProduct[]): CatalogProduct[] {
  const byCode = new Map<string, CatalogProduct>();
  const codeById = new Map<number, string>();
  for (const p of products) {
    const prevCode = codeById.get(p.erpProductId);
    if (prevCode != null && prevCode !== p.code) byCode.delete(prevCode);
    byCode.set(p.code, p);
    codeById.set(p.erpProductId, p.code);
  }
  return [...byCode.values()];
}

/** Recarga completa: tipos, produtos de cada tipo, tabelas de custo e preços de todas as tabelas. */
export async function refreshProducts(
  deps: CatalogDeps,
  session: string,
): Promise<ProductsRefresh & { productIds: Set<number>; pricesByTable: Map<number, Map<string, number>> }> {
  const types = await deps.fetchTypes(session);
  if (types.length === 0) throw new Error("lookup de tipos voltou vazio");
  await deps.upsertTypes(types);
  const all: CatalogProduct[] = [];
  for (const t of types) all.push(...(await deps.fetchProductsOfType(session, t.typeId)));
  const products = dedupeCatalogProducts(all);
  await deps.upsertProducts(products);

  const tables = await deps.fetchCostTables(session);
  if (tables.length === 0) throw new Error("lookup de tabelas de custo voltou vazio");
  await deps.saveCostTables(tables);
  const pricesByTable = new Map<number, Map<string, number>>();
  let prices = 0;
  for (const t of tables) {
    const p = await deps.fetchCostTablePrices(session, t.tableId);
    await deps.saveCostTablePrices(t.tableId, p);
    pricesByTable.set(t.tableId, p);
    prices += p.size;
  }
  return {
    types: types.length,
    products: products.length,
    tables: tables.length,
    prices,
    calls: 1 + types.length + 1 + tables.length,
    productIds: new Set(products.map((p) => p.erpProductId)),
    pricesByTable,
  };
}

export async function ensureProductCatalog(
  deps: CatalogDeps,
  args: {
    session: string;
    seen: SeenProduct[];
    /** Produtos vendidos com custo 0 na margem (completa pela tabela da loja). */
    zeroCost?: { storeId: string; codes: string[] };
    guard: CatalogGuard;
    owner: string;
  },
): Promise<EnsureCatalogResult> {
  const empty = (await deps.countCatalog()) === 0 || (await deps.countCostTables()) === 0;

  let unknown: SeenProduct[] = [];
  const ids = [...new Set(args.seen.map((s) => s.erpProductId))];
  if (ids.length > 0) {
    const known = empty ? new Set<number>() : await deps.knownProductIds(ids);
    const seenIds = new Set<number>();
    for (const s of args.seen) {
      if (known.has(s.erpProductId) || seenIds.has(s.erpProductId)) continue;
      seenIds.add(s.erpProductId);
      unknown.push(s);
    }
  }

  let costTable: number | null = null;
  let costMissing: string[] = [];
  const zeroCodes = [...new Set(args.zeroCost?.codes ?? [])];
  if (args.zeroCost && zeroCodes.length > 0 && !empty) {
    costTable = await deps.storeCostTable(args.zeroCost.storeId);
    if (costTable != null) {
      const covered = await deps.coveredCostCodes(costTable, zeroCodes);
      costMissing = zeroCodes.filter((c) => !covered.has(c));
    }
  }

  if (!empty && unknown.length === 0 && costMissing.length === 0) return { status: "ok", unknown: 0 };
  if (args.guard.attempted) return { status: "skipped", unknown: unknown.length, reason: "job" };
  args.guard.attempted = true;

  const claimed = await deps.claimRefresh(args.owner, CATALOG_LEASE_SEC, empty ? 0 : CATALOG_MIN_INTERVAL_SEC);
  if (!claimed) return { status: "skipped", unknown: unknown.length, reason: "busy" };

  try {
    const r = await refreshProducts(deps, args.session);
    const still = unknown.filter((u) => !r.productIds.has(u.erpProductId));
    if (still.length > 0) await deps.recordMisses(still);
    const tablePrices = costTable != null ? r.pricesByTable.get(costTable) : undefined;
    const stillCost = tablePrices ? costMissing.filter((c) => !tablePrices.has(c)) : costMissing;
    if (costTable != null && stillCost.length > 0) await deps.recordCostMisses(costTable, stillCost);
    await deps.releaseRefresh(args.owner, true);
    return {
      status: "refreshed",
      unknown: unknown.length,
      stillUnknown: still.length,
      costMissing: costMissing.length,
      stillCostMissing: stillCost.length,
      types: r.types,
      products: r.products,
      tables: r.tables,
      prices: r.prices,
      calls: r.calls,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await deps.releaseRefresh(args.owner, false, msg.slice(0, 500)).catch(() => {});
    throw e;
  }
}
