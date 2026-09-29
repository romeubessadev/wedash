import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { calendarTodayIso } from "@/data/wedash/clock";
import { fetchSalesProductDayAggs } from "@/data/wedash/salesRepo";
import { buildStockProductsView, suggestSaleTable, type StockCatalogItem, type StockInput } from "@/data/wedash/stockProducts";
import {
  fetchCostPrices,
  fetchPriceTableUsage,
  fetchSalePrices,
  fetchSaleTables,
  fetchStockCatalog,
  fetchStoreStock,
  syncStockNow,
  type SaleTable,
} from "@/data/wedash/stockRepo";
import type { Store } from "@/data/wedash/stores";
import { deIso, paraIso } from "@/lib/format";
import { FORCE_REFRESH_CLICK_EVENT } from "@/pages/dashboard/useForceRefresh";
import { useScopedStores } from "@/pages/operation/shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const STOCK_MAX_AGE_MS = 30 * 60 * 1000;

export type StockLoaded = {
  catalog: Map<string, StockCatalogItem>;
  saleTables: SaleTable[];
  usage: { sugerida: number | null; usadas: number[] };
  usageNames: Map<number, string>;
  costPrices: Map<number, Map<string, number>>;
  stock: StockInput["stock"];
  syncedAt: Map<string, string | null>;
  charged: StockInput["charged"];
};

export function tableLabel(id: number | null, tables: SaleTable[], usageNames: Map<number, string>): string {
  if (id == null) return "Sem tabela";
  const t = tables.find((x) => x.id === id);
  return t?.description.trim() || usageNames.get(id)?.trim() || `Tabela ${t?.code || id}`;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function uniqueIds(ids: Array<number | null | undefined>): number[] {
  return [...new Set(ids.filter((v): v is number => v != null))];
}

function hora(iso: string): string {
  const d = new Date(iso);
  const h = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (d.toDateString() === new Date().toDateString()) return `às ${h}`;
  return `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${h}`;
}

async function loadAll(tenantId: string, lojas: Store[]): Promise<StockLoaded> {
  const storeIds = lojas.map((s) => s.id);
  const today = calendarTodayIso();
  const start = deIso(today);
  start.setDate(start.getDate() - 29);
  const from30 = paraIso(start);
  const costIds = uniqueIds(lojas.map((s) => s.costTableId));
  const [catalog, saleTables, usageRows, stock, products, costPrices] = await Promise.all([
    fetchStockCatalog(),
    fetchSaleTables(),
    fetchPriceTableUsage(tenantId, storeIds, from30, today),
    fetchStoreStock(tenantId, storeIds),
    storeIds.length === 0 ? Promise.resolve([]) : fetchSalesProductDayAggs({ tenantId, storeIds, from: from30, to: today }),
    fetchCostPrices(costIds),
  ]);
  const usageNames = new Map<number, string>();
  for (const u of usageRows) if (u.tableName) usageNames.set(u.tableId, u.tableName);
  return {
    catalog,
    saleTables,
    usage: suggestSaleTable(usageRows),
    usageNames,
    costPrices,
    stock: stock.rows,
    syncedAt: stock.syncedAt,
    charged: products.map((p) => ({ storeId: p.storeId, code: p.productCode.trim(), revenueCents: p.revenueCents, items: p.itemCount })),
  };
}

/**
 * Dados das abas de Estoque. `prices` = aba Tabelas de venda (lista de tabelas + preços); sem ela, só o estoque.
 * Busca no Millennium o que está velho ao abrir: estoque (30 min), lista de tabelas (1 dia) e preços das tabelas em uso (hoje).
 */
export function useStockData({ prices }: { prices: boolean }) {
  const { show } = useToast();
  const { session, lojas, loading: lojasLoading } = useScopedStores();
  const storeKey = lojas.map((s) => s.id).join(",");
  const [data, setData] = useState<StockLoaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [salePrices, setSalePrices] = useState<Map<number, Map<string, number>>>(new Map());
  const [tabelaSel, setTabelaSel] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncRef = useRef(false);
  const lojasRef = useRef(lojas);
  lojasRef.current = lojas;

  const tabelaAtiva = prices ? (tabelaSel ?? data?.usage.sugerida ?? data?.saleTables[0]?.id ?? null) : null;
  const tabelaNome = data && prices ? tableLabel(tabelaAtiva, data.saleTables, data.usageNames) : "";

  const reload = useCallback(async () => {
    const d = await loadAll(session.tenantId, lojasRef.current);
    setData(d);
    setSalePrices(new Map());
    return d;
  }, [session.tenantId]);

  const syncIfStale = useCallback(
    async (d: StockLoaded, opts: { force?: boolean; selected?: number | null } = {}) => {
      if (syncRef.current) return;
      const now = Date.now();
      const storeIds = lojasRef.current.map((s) => s.id);
      const newest = d.saleTables.reduce((m, t) => Math.max(m, Date.parse(t.updatedAt) || 0), 0);
      const tablesStale = prices && (!!opts.force || d.saleTables.length === 0 || now - newest > DAY_MS);
      const effective = opts.selected ?? d.usage.sugerida ?? d.saleTables[0]?.id ?? null;
      const byId = new Map(d.saleTables.map((t) => [t.id, t]));
      const priceIds = prices
        ? uniqueIds([effective, ...d.usage.usadas]).filter((id) => {
            const at = byId.get(id)?.pricesAt;
            return (opts.force && id === effective) || !at || Date.parse(at) < startOfTodayMs();
          })
        : [];
      const stockIds = prices
        ? []
        : storeIds.filter((id) => {
            const at = d.syncedAt.get(id);
            return opts.force || !at || now - Date.parse(at) > STOCK_MAX_AGE_MS;
          });
      if (!tablesStale && priceIds.length === 0 && stockIds.length === 0) return;

      syncRef.current = true;
      setSyncing(true);
      try {
        const r = await syncStockNow({
          saleTables: tablesStale || undefined,
          salePriceTableIds: priceIds.length > 0 ? priceIds : undefined,
          stockStoreIds: stockIds.length > 0 ? stockIds : undefined,
        });
        if (!r.ok) {
          show(r.message, "danger");
          return;
        }
        if (r.failed.length > 0) show("Não foi possível buscar parte dos dados no Millennium. Tente novamente mais tarde.", "warning");
        const next = await reload();
        syncRef.current = false;
        if (tablesStale && d.saleTables.length === 0 && opts.selected == null) await syncIfStale(next);
      } finally {
        syncRef.current = false;
        setSyncing(false);
      }
    },
    [prices, reload, show],
  );

  useEffect(() => {
    if (lojasLoading) return;
    let cancelled = false;
    setLoading(true);
    setTabelaSel(null);
    (async () => {
      try {
        const d = await reload();
        if (cancelled) return;
        setLoading(false);
        void syncIfStale(d);
      } catch (e) {
        console.warn("useStockData:", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeKey, lojasLoading, reload, syncIfStale]);

  useEffect(() => {
    const onForce = () => {
      if (data) void syncIfStale(data, { force: true, selected: tabelaSel });
    };
    window.addEventListener(FORCE_REFRESH_CLICK_EVENT, onForce);
    return () => window.removeEventListener(FORCE_REFRESH_CLICK_EVENT, onForce);
  }, [data, tabelaSel, syncIfStale]);

  const priceIdsNeeded = useMemo(() => (data && prices ? uniqueIds([tabelaAtiva, ...data.usage.usadas]) : []), [data, prices, tabelaAtiva]);
  useEffect(() => {
    const missing = priceIdsNeeded.filter((id) => !salePrices.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void fetchSalePrices(missing).then((m) => {
      if (cancelled) return;
      setSalePrices((prev) => {
        const next = new Map(prev);
        for (const id of missing) next.set(id, m.get(id) ?? new Map());
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [priceIdsNeeded, salePrices]);

  const escolherTabela = (id: number) => {
    setTabelaSel(id);
    const t = data?.saleTables.find((x) => x.id === id);
    if (data && (!t?.pricesAt || Date.parse(t.pricesAt) < startOfTodayMs())) void syncIfStale(data, { selected: id });
  };

  const view = useMemo(
    () =>
      data
        ? buildStockProductsView({
            stores: lojas,
            catalog: data.catalog,
            stock: data.stock,
            costPrices: data.costPrices,
            salePrices,
            saleTableId: tabelaAtiva,
            charged: data.charged,
            includeSold: !prices,
          })
        : null,
    [data, lojas, salePrices, tabelaAtiva, prices],
  );

  const syncedTimes = lojas.map((s) => data?.syncedAt.get(s.id) ?? null);
  const oldestSync = syncedTimes.every((t) => t != null)
    ? syncedTimes.reduce<string | null>((m, t) => (m == null || Date.parse(t!) < Date.parse(m) ? t : m), null)
    : null;
  const newestPrices = data?.saleTables.find((t) => t.id === tabelaAtiva)?.pricesAt ?? null;
  const atualizadoTexto = prices
    ? syncing
      ? "Atualizando os preços…"
      : newestPrices
        ? `Preços atualizados ${hora(newestPrices)}`
        : "Preços ainda não atualizados"
    : syncing
      ? "Atualizando o estoque…"
      : oldestSync
        ? `Estoque atualizado ${hora(oldestSync)}`
        : "Estoque ainda não atualizado";

  const usadas = data?.usage.usadas ?? [];
  const todasTabelas = uniqueIds([...(data?.saleTables ?? []).map((t) => t.id), ...usadas]);

  return {
    session,
    lojas,
    storeKey,
    data,
    view,
    loading: loading || lojasLoading,
    syncing,
    salePrices,
    tabelaAtiva,
    tabelaNome,
    escolherTabela,
    todasTabelas,
    usadas,
    atualizadoTexto,
  };
}
