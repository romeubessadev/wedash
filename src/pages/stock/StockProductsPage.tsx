import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Dropdown, Modal, Pagination, Segmented, ThSort, useToast, type SortDir } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { StockProductsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { calendarTodayIso } from "@/data/wedash/clock";
import { fetchSalesProductDayAggs } from "@/data/wedash/salesRepo";
import {
  buildStockProductsView,
  composePrice,
  costCentsFor,
  suggestSaleTable,
  type PriceComposition,
  type StockCatalogItem,
  type StockInput,
  type StockLocation,
  type StockProductRow,
  type StockStoreDetail,
  type StockTransfer,
} from "@/data/wedash/stockProducts";
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
import { isGestor } from "@/layout/nav-wedash";
import { cn } from "@/lib/cn";
import { brlCent, deIso, num, paraIso } from "@/lib/format";
import { usePrintMode } from "@/lib/printMode";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { TABLE_PAGE_SIZE } from "@/lib/usePagedRows";
import { paths } from "@/router/paths";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { ReportHeader, useExportPdf } from "@/pages/dashboard/ReportHeader";
import { FORCE_REFRESH_CLICK_EVENT } from "@/pages/dashboard/useForceRefresh";
import { AlertTriangleIcon } from "@/pages/dashboards/icons";
import { SectionHeader, useScopedStores } from "@/pages/operation/shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const STOCK_MAX_AGE_MS = 30 * 60 * 1000;

type Loaded = {
  catalog: Map<string, StockCatalogItem>;
  saleTables: SaleTable[];
  usage: { sugerida: number | null; usadas: number[] };
  usageNames: Map<number, string>;
  costPrices: Map<number, Map<string, number>>;
  stock: StockInput["stock"];
  syncedAt: Map<string, string | null>;
  charged: StockInput["charged"];
};

type SortKey = "nome" | "estoque" | "custo" | "preco" | "lucro";

const TipHelp = ({ label }: { label: string }) => (
  <Tooltip label={label}>
    <span className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full bg-bg-inset text-[10px] font-semibold text-t2 transition-colors hover:text-t1 print:hidden">
      ?
    </span>
  </Tooltip>
);

const filtroInputClass =
  "h-8 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3 text-xs font-semibold text-t0 transition-colors hover:border-acc focus:border-acc focus:outline-none";

const money = (v: number | null) => (v == null ? "—" : brlCent(v));
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);
const pctRate = (v: number) => `${num(v, v % 1 === 0 ? 0 : 2)}%`;
const qty = (v: number) => num(v, v % 1 === 0 ? 0 : 3);

function transferText(t: StockTransfer): string {
  const origem = t.de.length === 1 ? `do ${t.de[0]}` : `de ${t.de.join(" / ")}`;
  return `Transferir ${qty(t.qtd)} ${origem} para o ${t.para}`;
}

function transferTip(lojas: StockStoreDetail[], variasLojas: boolean): string {
  return lojas
    .flatMap((l) => l.transferencias.map((t) => (variasLojas ? `${l.store.fantasia}: ${transferText(t)}` : transferText(t))))
    .join(" · ");
}

type EstoqueFiltro = "com" | "todos" | "transferir" | "negativo";

const temNegativo = (r: StockProductRow) => r.lojas.some((l) => l.estoque < 0);

function hora(iso: string): string {
  const d = new Date(iso);
  const h = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (d.toDateString() === new Date().toDateString()) return `às ${h}`;
  return `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${h}`;
}

function tableLabel(id: number | null, tables: SaleTable[], usageNames: Map<number, string>): string {
  if (id == null) return "Sem tabela";
  const t = tables.find((x) => x.id === id);
  return t?.description.trim() || usageNames.get(id)?.trim() || `Tabela ${t?.code || id}`;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function uniqueIds(ids: Array<number | null | undefined>): number[] {
  return [...new Set(ids.filter((v): v is number => v != null))];
}

async function loadAll(tenantId: string, lojas: Store[]): Promise<Loaded> {
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

export function StockProductsPage() {
  const { show } = useToast();
  const { session, lojas, loading: lojasLoading } = useScopedStores();
  const storeKey = lojas.map((s) => s.id).join(",");
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [salePrices, setSalePrices] = useState<Map<number, Map<string, number>>>(new Map());
  const [tabelaSel, setTabelaSel] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [filtroEstoque, setFiltroEstoque] = useState<EstoqueFiltro>("com");
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const printing = usePrintMode();
  const showSkeleton = useMinSkeleton(loading || lojasLoading);
  const syncRef = useRef(false);
  const lojasRef = useRef(lojas);
  lojasRef.current = lojas;

  const tabelaAtiva = tabelaSel ?? data?.usage.sugerida ?? data?.saleTables[0]?.id ?? null;
  const tabelaNome = data ? tableLabel(tabelaAtiva, data.saleTables, data.usageNames) : "";
  const exportar = useExportPdf("Estoque - Produtos", tabelaNome, { periodo: false });

  const reload = useCallback(async () => {
    const d = await loadAll(session.tenantId, lojasRef.current);
    setData(d);
    setSalePrices(new Map());
    return d;
  }, [session.tenantId]);

  /** Busca no Millennium o que está velho: lista de tabelas (1 dia), preços das tabelas em uso (hoje) e estoque (30 min). */
  const syncIfStale = useCallback(
    async (d: Loaded, opts: { force?: boolean; selected?: number | null } = {}) => {
      if (syncRef.current) return;
      const now = Date.now();
      const storeIds = lojasRef.current.map((s) => s.id);
      const newest = d.saleTables.reduce((m, t) => Math.max(m, Date.parse(t.updatedAt) || 0), 0);
      const tablesStale = !!opts.force || d.saleTables.length === 0 || now - newest > DAY_MS;
      const effective = opts.selected ?? d.usage.sugerida ?? d.saleTables[0]?.id ?? null;
      const byId = new Map(d.saleTables.map((t) => [t.id, t]));
      const priceIds = uniqueIds([effective, ...d.usage.usadas]).filter((id) => {
        const at = byId.get(id)?.pricesAt;
        return (opts.force && id === effective) || !at || Date.parse(at) < startOfTodayMs();
      });
      const stockIds = storeIds.filter((id) => {
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
    [reload, show],
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
        console.warn("StockProductsPage:", e);
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

  const priceIdsNeeded = useMemo(() => (data ? uniqueIds([tabelaAtiva, ...data.usage.usadas]) : []), [data, tabelaAtiva]);
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
    setPage(1);
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
          })
        : null,
    [data, lojas, salePrices, tabelaAtiva],
  );

  const nTransferir = useMemo(() => view?.rows.filter((r) => r.transferir > 0).length ?? 0, [view]);
  const nNegativo = useMemo(() => view?.rows.filter(temNegativo).length ?? 0, [view]);
  const soComEstoque: EstoqueFiltro =
    (filtroEstoque === "transferir" && nTransferir === 0) || (filtroEstoque === "negativo" && nNegativo === 0) ? "com" : filtroEstoque;

  const linhas = useMemo(() => {
    if (!view) return [];
    const q = busca.trim().toLowerCase();
    const passaFiltro = (r: StockProductRow) =>
      soComEstoque === "todos" ||
      (soComEstoque === "transferir" ? r.transferir > 0 : soComEstoque === "negativo" ? temNegativo(r) : r.estoque > 0);
    const out = view.rows.filter(
      (r) =>
        passaFiltro(r) &&
        (categoria == null || r.categoria === categoria) &&
        (!q || r.nome.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q)),
    );
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      if (sortKey === "nome") return a.nome.localeCompare(b.nome, "pt-BR") * dir;
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return a.nome.localeCompare(b.nome, "pt-BR");
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir || a.nome.localeCompare(b.nome, "pt-BR");
    });
    return out;
  }, [view, busca, soComEstoque, categoria, sortKey, sortDir]);

  useEffect(() => setPage(1), [busca, soComEstoque, categoria, sortKey, sortDir, storeKey]);

  const totalPages = Math.max(1, Math.ceil(linhas.length / TABLE_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = printing ? linhas : linhas.slice((pageSafe - 1) * TABLE_PAGE_SIZE, pageSafe * TABLE_PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "nome" ? "asc" : "desc");
    }
  };

  const syncedTimes = lojas.map((s) => data?.syncedAt.get(s.id) ?? null);
  const oldestSync = syncedTimes.every((t) => t != null)
    ? syncedTimes.reduce<string | null>((m, t) => (m == null || Date.parse(t!) < Date.parse(m) ? t : m), null)
    : null;
  const atualizadoTexto = syncing
    ? "Atualizando estoque e preços…"
    : oldestSync
      ? `Estoque atualizado ${hora(oldestSync)}`
      : "Estoque ainda não atualizado";

  const lojasSemTabela = lojas.filter((s) => s.costTableId == null);
  const produtoDetalhe = detalhe ? view?.rows.find((r) => r.codigo === detalhe) ?? null : null;
  const usadas = data?.usage.usadas ?? [];
  const outras = (data?.saleTables ?? []).filter((t) => !usadas.includes(t.id));

  const limpar = () => {
    setBusca("");
    setCategoria(null);
    setFiltroEstoque("todos");
  };
  const umaLoja = lojas.length === 1;

  return (
    <div className="flex flex-col p-4 sm:p-6 print:p-0">
      <ReportHeader periodo={false} atualizado={atualizadoTexto} filtros={data ? [{ label: "Tabela de venda", valor: tabelaNome }] : []} />
      <SectionHeader
        section="Estoque"
        title="Produtos"
        subtitle="Veja o estoque, o custo, o preço e o lucro por peça de cada produto."
        actions={
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end print:hidden">
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              {data && data.saleTables.length > 0 && (
                <Dropdown
                  align="right"
                  menuClassName="max-h-80 overflow-y-auto"
                  trigger={<FiltroTrigger rotulo={tabelaNome} prefixo="Tabela de venda" />}
                  items={[
                    ...(usadas.length > 0 ? [{ label: "Usadas nos últimos 30 dias", heading: true }] : []),
                    ...usadas.map((id) => ({
                      label: tableLabel(id, data.saleTables, data.usageNames),
                      active: id === tabelaAtiva,
                      trailing: id === data.usage.sugerida ? <span className="text-[10.5px] text-t2">mais usada</span> : undefined,
                      onClick: () => escolherTabela(id),
                    })),
                    ...(usadas.length > 0 && outras.length > 0 ? [{ label: "", divider: true }, { label: "Outras tabelas", heading: true }] : []),
                    ...outras.map((t) => ({
                      label: tableLabel(t.id, data.saleTables, data.usageNames),
                      active: t.id === tabelaAtiva,
                      onClick: () => escolherTabela(t.id),
                    })),
                  ]}
                />
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={exportar}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                }
              >
                Exportar
              </Button>
            </div>
            <Tooltip label="Estoque buscado no Millennium ao abrir a tela (a cada 30 minutos) e no botão Atualizar do topo.">
              <span className="cursor-help text-[11.5px] text-t2">{atualizadoTexto}</span>
            </Tooltip>
          </div>
        }
      />

      {showSkeleton || !view ? (
        <StockProductsSkeleton />
      ) : (
        <>
          {lojasSemTabela.length > 0 && (
            <Notice>
              <span className="font-semibold">
                {lojasSemTabela.length === 1
                  ? `A loja ${lojasSemTabela[0].fantasia} está sem tabela de custo.`
                  : `${lojasSemTabela.length} lojas estão sem tabela de custo.`}
              </span>
              <span className="text-t1"> Sem ela não dá para calcular o custo e o lucro dos produtos.</span>
              {isGestor(session.role) && (
                <Link to={paths.operation.productsTaxes} className="ml-2 font-semibold text-t0 underline-offset-2 hover:underline">
                  Escolher tabela
                </Link>
              )}
            </Notice>
          )}
          {nTransferir > 0 && (
            <Notice
              action={
                soComEstoque !== "transferir" && (
                  <button
                    type="button"
                    onClick={() => setFiltroEstoque("transferir")}
                    className="shrink-0 text-[12px] font-semibold text-t0 underline-offset-2 hover:underline"
                  >
                    Ver produtos
                  </button>
                )
              }
            >
              <span className="font-semibold">
                {nTransferir === 1
                  ? "1 produto precisa de transferência entre locais de estoque."
                  : `${nTransferir} produtos precisam de transferência entre locais de estoque.`}
              </span>
              <span className="text-t1"> Um local está com saldo negativo e outro local da loja tem o produto.</span>
            </Notice>
          )}
          {nNegativo > 0 && (
            <Notice
              action={
                soComEstoque !== "negativo" && (
                  <button
                    type="button"
                    onClick={() => setFiltroEstoque("negativo")}
                    className="shrink-0 text-[12px] font-semibold text-t0 underline-offset-2 hover:underline"
                  >
                    Ver produtos
                  </button>
                )
              }
            >
              <span className="font-semibold">
                {nNegativo === 1 ? "1 produto está com estoque negativo no Millennium." : `${nNegativo} produtos estão com estoque negativo no Millennium.`}
              </span>
              <span className="text-t1"> Confira as entradas e saídas desses produtos na loja.</span>
            </Notice>
          )}

          <Card className="mt-4" padding="none">
            <div className="flex flex-col gap-3 px-5 py-4">
              <p className="text-[12px] text-t2">
                Lucro por peça vendendo na tabela <span className="font-semibold text-t0">{tabelaNome}</span>, já descontando impostos, royalties,
                marketing e aluguel. Clique no produto para ver a conta.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <Segmented
                  options={[
                    { value: "com", label: "Com estoque" },
                    { value: "todos", label: "Todos" },
                    ...(nTransferir > 0 ? [{ value: "transferir" as const, label: `Transferir (${nTransferir})` }] : []),
                    ...(nNegativo > 0 ? [{ value: "negativo" as const, label: `Estoque negativo (${nNegativo})` }] : []),
                  ]}
                  value={soComEstoque}
                  onChange={(v) => v && setFiltroEstoque(v)}
                />
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  {view.categorias.length > 1 && (
                    <Dropdown
                      align="right"
                      menuClassName="max-h-72 overflow-y-auto"
                      trigger={<FiltroTrigger rotulo={categoria ?? "Todas as categorias"} />}
                      items={[
                        { label: "Todas as categorias", active: categoria == null, onClick: () => setCategoria(null) },
                        ...view.categorias.map((c) => ({ label: c, active: categoria === c, onClick: () => setCategoria(c) })),
                      ]}
                    />
                  )}
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar produto ou código"
                    className={cn(filtroInputClass, "w-full sm:w-56")}
                  />
                </div>
              </div>
            </div>

            {linhas.length === 0 ? (
              <div className="flex p-4">
                {view.rows.length === 0 ? (
                  <EmptyBlock icon="📦" title="Sem produtos" description={syncing ? "Buscando o estoque e os preços no Millennium…" : "Nenhum produto com preço ou estoque para as lojas selecionadas."} />
                ) : (
                  <EmptyBlock
                    icon="🔍"
                    title="Nenhum produto encontrado"
                    description={soComEstoque === "com" && !busca && !categoria ? "Nenhum produto com estoque nas lojas selecionadas." : "Tente buscar por outro nome ou código."}
                    action={
                      <Button variant="outline" size="sm" onClick={limpar}>
                        Limpar filtros
                      </Button>
                    }
                  />
                )}
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto p-4 md:block">
                  <table className="w-full min-w-[720px] border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b-2 border-line">
                        <ThSort label="Produto" active={sortKey === "nome"} dir={sortDir} onClick={() => toggleSort("nome")} align="left" />
                        <ThSort label="Estoque" active={sortKey === "estoque"} dir={sortDir} onClick={() => toggleSort("estoque")} />
                        <ThSort label="Preço de custo" active={sortKey === "custo"} dir={sortDir} onClick={() => toggleSort("custo")} />
                        <ThSort label="Preço de venda" active={sortKey === "preco"} dir={sortDir} onClick={() => toggleSort("preco")} />
                        <ThSort label="Lucro por peça" active={sortKey === "lucro"} dir={sortDir} onClick={() => toggleSort("lucro")} />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => (
                        <tr
                          key={r.codigo}
                          className={cn("cursor-pointer border-b border-line", r.transferir > 0 ? "bg-warn-soft hover:bg-warn/20" : "hover:bg-bg-3")}
                          onClick={() => setDetalhe(r.codigo)}
                        >
                          <td className="px-3 py-2.5">
                            <p className="text-[13px] font-bold text-t0">{r.nome}</p>
                            <p className="text-[11px] text-t2">
                              {r.codigo}
                              {r.categoria && ` · ${r.categoria}`}
                              {r.variaPorLoja && " · média das lojas"}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <EstoqueCell row={r} umaLoja={umaLoja} />
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-t1">{money(r.custo)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-t0">{money(r.preco)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <Lucro valor={r.lucro} margem={r.margemPct} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
                  {pageRows.map((r) => (
                    <button
                      key={r.codigo}
                      type="button"
                      onClick={() => setDetalhe(r.codigo)}
                      className={cn("rounded-xl border p-3.5 text-left", r.transferir > 0 ? "border-warn/40 bg-warn-soft" : "border-line bg-bg-inset")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-bold text-t0">{r.nome}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-t2">
                            {r.codigo}
                            {r.variaPorLoja && " · média das lojas"}
                          </p>
                        </div>
                        <span className={cn("shrink-0 text-[12px] font-bold tabular-nums", r.estoque < 0 ? "text-bad" : "text-t0")}>
                          {qty(r.estoque)} un.
                        </span>
                      </div>
                      {umaLoja && r.lojas[0] && r.lojas[0].locais.length > 1 && (
                        <p className="mt-1.5 text-[11px] text-t2">
                          <Locais locais={r.lojas[0].locais} />
                        </p>
                      )}
                      {r.transferir > 0 && <p className="mt-1.5 text-[11.5px] font-semibold text-warn">{transferTip(r.lojas, !umaLoja)}</p>}
                      <div className="mt-2.5 flex flex-col gap-1.5 border-t border-line pt-2.5 text-[11.5px]">
                        <Metrica label="Preço de custo" value={money(r.custo)} />
                        <Metrica label="Preço de venda" value={money(r.preco)} />
                        <Metrica label="Lucro por peça" value={<Lucro valor={r.lucro} margem={r.margemPct} inline />} />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 print:hidden">
                  <span className="text-[12.5px] text-t2">
                    Mostrando {pageRows.length} de {num(linhas.length)} produtos
                  </span>
                  {totalPages > 1 && <Pagination page={pageSafe} totalPages={totalPages} onChange={setPage} />}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {produtoDetalhe && data && (
        <ProductDetailModal
          row={produtoDetalhe}
          tabelaAtiva={tabelaAtiva}
          tabelas={uniqueIds([tabelaAtiva, ...usadas])}
          nomeTabela={(id) => tableLabel(id, data.saleTables, data.usageNames)}
          salePrices={salePrices}
          costCents={(store) => costCentsFor(data.costPrices, store, produtoDetalhe.codigo)}
          onClose={() => setDetalhe(null)}
        />
      )}
    </div>
  );
}

export default StockProductsPage;

function Lucro({ valor, margem, inline = false }: { valor: number | null; margem: number | null; inline?: boolean }) {
  if (valor == null) return <span className="text-t2">—</span>;
  const cor = valor < 0 ? "text-bad" : "text-ok";
  if (inline)
    return (
      <span className={cn("font-semibold tabular-nums", cor)}>
        {brlCent(valor)} · {pct(margem)}
      </span>
    );
  return (
    <span className="block">
      <span className={cn("block font-extrabold", cor)}>{brlCent(valor)}</span>
      <span className="block text-[11px] text-t2">{pct(margem)}</span>
    </span>
  );
}

function Locais({ locais }: { locais: StockLocation[] }) {
  return (
    <>
      {locais.map((l, i) => (
        <Fragment key={l.nome}>
          {i > 0 && " · "}
          {l.nome} <span className={cn("font-semibold tabular-nums", l.qtd < 0 ? "text-bad" : "text-t1")}>{qty(l.qtd)}</span>
        </Fragment>
      ))}
    </>
  );
}

function EstoqueCell({ row, umaLoja }: { row: StockProductRow; umaLoja: boolean }) {
  const locais = umaLoja ? (row.lojas[0]?.locais ?? []) : [];
  return (
    <span className="flex flex-col items-end gap-1">
      <span className={cn("font-semibold tabular-nums", row.estoque < 0 ? "text-bad" : "text-t0")}>{qty(row.estoque)}</span>
      {locais.length > 1 && (
        <span className="whitespace-nowrap text-[11px] text-t2">
          <Locais locais={locais} />
        </span>
      )}
      {row.transferir > 0 && (
        <Tooltip label={transferTip(row.lojas, !umaLoja)}>
          <span>
            <Badge variant="warning">Transferir {qty(row.transferir)}</Badge>
          </span>
        </Tooltip>
      )}
    </span>
  );
}

function Metrica({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-t2">{label}</span>
      <span className="font-semibold tabular-nums text-t0">{value}</span>
    </div>
  );
}

function FiltroTrigger({ rotulo, prefixo }: { rotulo: string; prefixo?: string }) {
  return (
    <button
      type="button"
      className="flex h-8 min-w-0 max-w-[280px] items-center gap-2 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3 text-left transition-colors hover:border-acc"
    >
      <span className="min-w-0 truncate text-xs font-semibold text-t0">
        {prefixo && <span className="font-normal text-t2">{prefixo}: </span>}
        {rotulo}
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-t2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-4 rounded-[var(--radius-vela-md)] border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-t0 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="flex min-w-0 items-center gap-2">
          <AlertTriangleIcon size={16} className="shrink-0 text-warn" />
          <span>{children}</span>
        </p>
        {action}
      </div>
    </div>
  );
}

function ProductDetailModal({
  row,
  tabelaAtiva,
  tabelas,
  nomeTabela,
  salePrices,
  costCents,
  onClose,
}: {
  row: StockProductRow;
  tabelaAtiva: number | null;
  tabelas: number[];
  nomeTabela: (id: number | null) => string;
  salePrices: Map<number, Map<string, number>>;
  costCents: (store: Store) => number | null;
  onClose: () => void;
}) {
  const [lojaId, setLojaId] = useState(row.lojas[0]?.store.id ?? "");
  const loja = row.lojas.find((l) => l.store.id === lojaId) ?? row.lojas[0];
  if (!loja) return null;
  const comp = loja.composicao;
  const cost = costCents(loja.store);
  const comparacao = tabelas.map((id) => ({
    id,
    comp: composePrice(loja.store, row.codigo, salePrices.get(id)?.get(row.codigo) ?? null, cost),
  }));

  return (
    <Modal open onClose={onClose} title={row.nome} size="lg">
      <p className="-mt-1 text-[12px] text-t2">
        {row.codigo}
        {row.categoria && ` · ${row.categoria}`} · Estoque {qty(row.estoque)} un.
      </p>

      {row.lojas.some((l) => l.locais.length > 1 || l.transferencias.length > 0) && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-t2">Estoque por local</p>
          <div className="flex flex-col gap-2">
            {row.lojas
              .filter((l) => l.locais.length > 0)
              .map((l) => (
                <div
                  key={l.store.id}
                  className={cn(
                    "rounded-[var(--radius-vela-sm)] px-3 py-2.5 text-[12.5px]",
                    l.transferencias.length > 0 ? "border border-warn/30 bg-warn-soft" : "bg-bg-inset",
                  )}
                >
                  {row.lojas.length > 1 && <p className="mb-1 font-semibold uppercase text-t0">{l.store.fantasia}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {l.locais.map((x) => (
                      <span key={x.nome} className="text-t1">
                        {x.nome}{" "}
                        <span className={cn("font-bold tabular-nums", x.qtd < 0 ? "text-bad" : "text-t0")}>{qty(x.qtd)}</span>
                      </span>
                    ))}
                    <span className="text-t2">
                      Total <span className="font-bold tabular-nums text-t0">{qty(l.estoque)}</span>
                    </span>
                  </div>
                  {l.transferencias.map((t) => (
                    <p key={t.para} className="mt-1.5 flex items-center gap-1.5 font-semibold text-warn">
                      <AlertTriangleIcon size={14} className="shrink-0" />
                      {transferText(t)}
                    </p>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}

      {row.lojas.length > 1 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-t2">Por loja · {nomeTabela(tabelaAtiva)}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-t2">
                  <th className="px-2 py-1.5 text-left font-semibold">Loja</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Estoque</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Custo total</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Lucro por peça</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Margem</th>
                </tr>
              </thead>
              <tbody>
                {row.lojas.map((l) => (
                  <tr
                    key={l.store.id}
                    onClick={() => setLojaId(l.store.id)}
                    className={cn("cursor-pointer border-b border-line last:border-b-0 hover:bg-bg-3", l.store.id === loja.store.id && "bg-acc-soft")}
                  >
                    <td className="px-2 py-1.5 font-semibold uppercase text-t0">{l.store.fantasia}</td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums", l.estoque < 0 ? "text-bad" : "text-t1")}>{qty(l.estoque)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-t1">{money(l.composicao.custoTotal)}</td>
                    <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums", l.composicao.lucro == null ? "text-t2" : l.composicao.lucro < 0 ? "text-bad" : "text-ok")}>
                      {money(l.composicao.lucro)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-t1">{pct(l.composicao.margemPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-t2">
          Composição do preço{row.lojas.length > 1 && ` · ${loja.store.fantasia}`}
        </p>
        {comp.custo == null ? (
          <p className="rounded-[var(--radius-vela-sm)] bg-bg-inset px-3 py-2.5 text-[12.5px] text-t1">
            {loja.store.costTableId == null
              ? "A loja está sem tabela de custo. Escolha a tabela em Configurações > Produtos e impostos."
              : "Este produto não tem custo na tabela de custo da loja."}
          </p>
        ) : (
          <Composicao comp={comp} tabela={nomeTabela(tabelaAtiva)} />
        )}
      </div>

      {comparacao.length > 1 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-t2">Tabelas usadas nos últimos 30 dias</p>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[11px] text-t2">
                <th className="px-2 py-1.5 text-left font-semibold">Tabela</th>
                <th className="px-2 py-1.5 text-right font-semibold">Preço</th>
                <th className="px-2 py-1.5 text-right font-semibold">Lucro por peça</th>
                <th className="px-2 py-1.5 text-right font-semibold">Margem</th>
              </tr>
            </thead>
            <tbody>
              {comparacao.map(({ id, comp: c }) => (
                <tr key={id} className={cn("border-b border-line last:border-b-0", id === tabelaAtiva && "bg-acc-soft")}>
                  <td className="px-2 py-1.5 font-semibold text-t0">{nomeTabela(id)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-t1">{money(c.preco)}</td>
                  <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums", c.lucro == null ? "text-t2" : c.lucro < 0 ? "text-bad" : "text-ok")}>
                    {money(c.lucro)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-t1">{pct(c.margemPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-t2">Preço praticado · últimos 30 dias</p>
        {loja.praticado ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Preço médio" value={brlCent(loja.praticado.preco)} />
            <Mini label="Peças vendidas" value={num(loja.praticado.itens)} />
            <Mini label="Lucro por peça" value={money(loja.praticado.lucro)} cor={loja.praticado.lucro != null && loja.praticado.lucro < 0 ? "text-bad" : "text-ok"} />
            <Mini label="Margem" value={pct(loja.praticado.margemPct)} />
          </div>
        ) : (
          <p className="text-[12.5px] text-t2">Sem vendas deste produto na loja nos últimos 30 dias.</p>
        )}
      </div>
    </Modal>
  );
}

function Mini({ label, value, cor = "text-t0" }: { label: string; value: string; cor?: string }) {
  return (
    <div className="rounded-[var(--radius-vela-sm)] bg-bg-inset px-3 py-2">
      <p className="text-[11px] text-t2">{label}</p>
      <p className={cn("mt-0.5 text-[13.5px] font-bold tabular-nums", cor)}>{value}</p>
    </div>
  );
}

function Composicao({ comp, tabela }: { comp: PriceComposition; tabela: string }) {
  const linha = (label: ReactNode, valor: string, opts: { forte?: boolean; cor?: string; sub?: boolean } = {}) => (
    <div className={cn("flex items-center justify-between gap-3 py-1.5", opts.forte && "border-t border-line pt-2 font-bold", opts.sub && "pl-3 text-t1")}>
      <span className={cn(opts.forte ? "text-t0" : "text-t1")}>{label}</span>
      <span className={cn("tabular-nums", opts.cor ?? (opts.forte ? "text-t0" : "text-t1"))}>{valor}</span>
    </div>
  );
  return (
    <div className="text-[12.5px]">
      {linha(
        <>
          Preço de venda <span className="text-t2">· {tabela}</span>
        </>,
        money(comp.preco),
        { cor: "font-semibold text-t0" },
      )}
      {linha("Custo do produto", money(comp.custo))}
      {comp.icmsStPct > 0 && linha(`ICMS ST (${pctRate(comp.icmsStPct)} do custo)`, money(comp.icmsSt), { sub: true })}
      {comp.preco == null ? (
        <p className="mt-2 text-t2">Este produto não tem preço na tabela de venda selecionada.</p>
      ) : (
        <>
          {comp.despesas.map((d) => (
            <Fragment key={d.label}>{linha(`${d.label} (${pctRate(d.pct)} do preço)`, brlCent(d.valor), { sub: true })}</Fragment>
          ))}
          {linha("Custo total", money(comp.custoTotal), { forte: true })}
          {linha("Lucro por peça", `${money(comp.lucro)} · ${pct(comp.margemPct)}`, {
            forte: true,
            cor: comp.lucro != null && comp.lucro < 0 ? "text-bad" : "text-ok",
          })}
          {linha(
            <span className="inline-flex items-center gap-1">
              Preço mínimo <TipHelp label="Menor preço de venda que não dá prejuízo com os custos desta loja." />
            </span>,
            money(comp.precoMinimo),
          )}
        </>
      )}
    </div>
  );
}
