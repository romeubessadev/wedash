import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Badge, Card, CardHeader, CardTitle, StatCard, DateRangePicker, PageHeader, Button, Pagination, ThSort, type SortDir } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { MOBILE_QUERY, useMediaQuery } from "@/lib/useMediaQuery";
import { TABLE_PAGE_SIZE, TABLE_PAGE_SIZE_MOBILE } from "@/lib/usePagedRows";
import { BarChart, DonutChart } from "@/components/charts";
import { useScope } from "@/pages/dashboard/useScope";
import {
  buildProductsView,
  financeFetchRange,
  productsFetchRange,
  resolvePeriod,
  type AbcClass,
  type ProductItemRow,
  type ProductLineRow,
  type ProductsAggInput,
  type ProductsKpi,
} from "@/data/wedash/dashboard";
import {
  fetchProductCatalogDescriptions,
  fetchSalesCategoryDayAggs,
  fetchSalesCoverage,
  fetchSalesDayAggs,
  fetchSalesHourAggs,
  fetchSalesProductCostDayAggs,
  fetchSalesProductDayAggs,
} from "@/data/wedash/salesRepo";
import type { SalesHourAgg } from "@/data/wedash/salesTypes";
import { calendarTodayIso } from "@/data/wedash/clock";
import { useActiveSession } from "@/session/SessionProvider";
import { SALES_SYNCED_EVENT } from "@/pages/dashboard/useForceRefresh";
import { useMonthFill } from "@/pages/dashboard/useMonthFill";
import { MonthFillNotice, pickerMinDate } from "@/pages/dashboard/MonthFillNotice";
import { InitialSyncNotice } from "@/pages/dashboard/InitialSyncNotice";
import { LastUpdated } from "@/pages/dashboard/LastUpdated";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { ProductsWithoutCostNotice } from "@/pages/dashboard/ProductsWithoutCostNotice";
import { ProductsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { brlCent, deIso, num, tipDelta, tipRelacao } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { DateRange, DateRangeChangeMeta } from "@/components/ui/DateRangePicker";
import {
  applyPeriodDateChange,
  dateRangeFromPeriod,
  periodActivePresetId,
  periodDisplayLabel,
} from "@/pages/dashboard/periodPicker";

/** Ícones dos KPIs — Fat/Lucro/Margem iguais ao Financeiro; Itens próprio da tela. */
const IconFat = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IconLucro = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);
const IconMargem = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);
const IconItens = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const KPI_ICONS = [IconFat, IconLucro, IconMargem, IconItens];

/** Heroes por métrica: Fat/Lucro/Margem iguais ao Financeiro; Itens = warn. */
const KPI_COLORS = [
  { iconColor: "var(--acc)", iconBg: "var(--acc-soft)" },
  { iconColor: "var(--ok)", iconBg: "var(--ok-soft)" },
  { iconColor: "var(--info)", iconBg: "rgba(59,130,246,0.12)" },
  { iconColor: "var(--warn)", iconBg: "rgba(245,158,11,0.12)" },
];

type SortKey = "nome" | "faturamento" | "itens" | "precoMedio" | "cmv" | "lucro" | "margemPct" | "participacaoPct" | "variacaoPct";
type TopProdSort = "nome" | "itens" | "faturamento" | "margem";

const PAGE_SIZE = TABLE_PAGE_SIZE;
const PAGE_SIZE_MOBILE = TABLE_PAGE_SIZE_MOBILE;

const TipHelp = ({ label }: { label: string }) => (
  <Tooltip label={label}>
    <span className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full bg-bg-inset text-[10px] font-semibold text-t2 hover:text-t1 transition-colors">
      ?
    </span>
  </Tooltip>
);

const CORES_ABC: Record<AbcClass, string> = {
  A: "var(--bad)",
  B: "var(--warn)",
  C: "var(--ok)",
};

/** Badge de delta — só % no chip; base do comparativo no tooltip (igual StatCard). */
function BadgeVsAnterior({ delta }: { delta?: { value: string; positive: boolean; vs?: string; anterior?: string } }) {
  if (!delta) return null;
  const badge = (
    <Badge variant={delta.positive ? "success" : "danger"}>
      {delta.positive ? "+" : "−"}
      {delta.value}
    </Badge>
  );
  const tip = tipDelta(delta);
  return tip ? <Tooltip label={tip}>{badge}</Tooltip> : badge;
}

const filtroInputClass =
  "h-8 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3 text-xs font-semibold text-t0 transition-colors hover:border-acc focus:border-acc focus:outline-none";

const CORES_RANK = ["var(--ok)", "var(--info)", "var(--warn)", "var(--acc)", "var(--bad)"];

function AvatarIniciais({ nome, idx }: { nome: string; idx: number }) {
  const iniciais = nome.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const cor = CORES_RANK[idx % CORES_RANK.length];
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-[13px] font-extrabold"
      style={{ background: `color-mix(in srgb, ${cor} 15%, transparent)`, color: cor }}
    >
      {iniciais || "?"}
    </span>
  );
}

const pctFmt = (v: number | null, casas = 1) => (v == null ? "—" : `${v.toFixed(casas).replace(".", ",")}%`);
const moneyOrDash = (v: number | null) => (v == null ? "—" : brlCent(v));

function Variacao({ v }: { v: number | null }) {
  if (v == null) return <span className="text-t2">—</span>;
  const r = Math.round(v);
  return (
    <span className="font-bold" style={{ color: r >= 0 ? "var(--ok)" : "var(--bad)" }}>
      {r >= 0 ? "+" : ""}
      {r}%
    </span>
  );
}

export default function ProductsPage() {
  const session = useActiveSession();
  const { escopo, mudar } = useScope();
  const [aggs, setAggs] = useState<ProductsAggInput>({ dayAggs: [] });
  const [coverageFrom, setCoverageFrom] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("faturamento");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [topProdSort, setTopProdSort] = useState<TopProdSort>("faturamento");
  const [topProdDir, setTopProdDir] = useState<SortDir>("desc");
  const [topLinhaSort, setTopLinhaSort] = useState<TopProdSort>("faturamento");
  const [topLinhaDir, setTopLinhaDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  // Catálogo de lojas (custos/impostos) hidratado depois do 1º render → recalcula.
  const [storesTick, setStoresTick] = useState(0);
  useEffect(() => {
    const onStores = () => setStoresTick((n) => n + 1);
    window.addEventListener("wedash:stores", onStores);
    return () => window.removeEventListener("wedash:stores", onStores);
  }, []);

  /** Só a leitura mais recente aplica setState. */
  const reloadGen = useRef(0);
  const reload = useCallback(async () => {
    const gen = ++reloadGen.current;
    const periodo = resolvePeriod(escopo.periodo, calendarTodayIso());
    const range = financeFetchRange(escopo);
    const prodRange = productsFetchRange(escopo);
    const storeIds = escopo.filialIds;
    const tenantId = session.tenantId;
    try {
      const [dayAggs, hourAggs, prevHourAggs, categoryDayAggs, productDayAggs, productCostDayAggs, cov, catalogDescriptions] = await Promise.all([
        fetchSalesDayAggs({ tenantId, storeIds, from: range.from, to: range.to, brand: null }),
        periodo.inicio === periodo.fim
          ? fetchSalesHourAggs({ tenantId, storeIds, day: periodo.inicio, brand: null })
          : Promise.resolve([] as SalesHourAgg[]),
        range.prevHourDay
          ? fetchSalesHourAggs({ tenantId, storeIds, day: range.prevHourDay, brand: null })
          : Promise.resolve([] as SalesHourAgg[]),
        fetchSalesCategoryDayAggs({ tenantId, storeIds, from: prodRange.from, to: prodRange.to, brand: null }),
        fetchSalesProductDayAggs({ tenantId, storeIds, from: prodRange.from, to: prodRange.to }),
        fetchSalesProductCostDayAggs({ tenantId, storeIds, from: prodRange.from, to: prodRange.to }),
        fetchSalesCoverage(tenantId, storeIds),
        fetchProductCatalogDescriptions(),
      ]);
      if (gen !== reloadGen.current) return;
      setAggs({ dayAggs, hourAggs, prevHourAggs, categoryDayAggs, productDayAggs, productCostDayAggs, catalogDescriptions });
      setCoverageFrom(cov.from ? deIso(cov.from) : null);
    } catch (e) {
      if (gen !== reloadGen.current) return;
      console.error("Products reload:", e);
    }
  }, [escopo, session.tenantId]);

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => {
    const onSynced = () => void reload();
    window.addEventListener(SALES_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SALES_SYNCED_EVENT, onSynced);
  }, [reload]);

  const view = useMemo(
    () => buildProductsView(escopo, aggs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escopo, aggs, storesTick],
  );

  const dateRange = useMemo(() => dateRangeFromPeriod(escopo.periodo), [escopo.periodo]);
  const periodoAtual = resolvePeriod(escopo.periodo, calendarTodayIso());
  const monthFill = useMonthFill();
  function onDateChange(r: DateRange, meta?: DateRangeChangeMeta) {
    mudar(applyPeriodDateChange(escopo, r, meta));
  }

  // A métrica escolhe QUAIS 5 entram (sempre os maiores); a direção só reordena os 5.
  // "Produto" (nome) reordena o Top 5 por faturamento.
  const topProdutos = useMemo(() => {
    const metrica = (p: ProductItemRow) =>
      topProdSort === "itens" ? p.itens : topProdSort === "margem" ? (p.margemPct ?? -Infinity) : p.faturamento;
    const top5 = [...view.produtos].sort((a, b) => metrica(b) - metrica(a) || b.faturamento - a.faturamento).slice(0, 5);
    if (topProdSort === "nome") {
      const dir = topProdDir === "asc" ? 1 : -1;
      return top5.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") * dir);
    }
    return topProdDir === "asc" ? top5.reverse() : top5;
  }, [view.produtos, topProdSort, topProdDir]);

  function toggleTopProdSort(key: TopProdSort) {
    if (topProdSort === key) {
      setTopProdDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTopProdSort(key);
      setTopProdDir(key === "nome" ? "asc" : "desc");
    }
  }

  // Mesma regra do Top produtos: a métrica escolhe as 5 linhas; a direção só reordena.
  const topLinhas = useMemo(() => {
    const metrica = (l: ProductLineRow) =>
      topLinhaSort === "itens" ? l.itens : topLinhaSort === "margem" ? (l.margemPct ?? -Infinity) : l.faturamento;
    const top5 = [...view.linhas].sort((a, b) => metrica(b) - metrica(a) || b.faturamento - a.faturamento).slice(0, 5);
    if (topLinhaSort === "nome") {
      const dir = topLinhaDir === "asc" ? 1 : -1;
      return top5.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") * dir);
    }
    return topLinhaDir === "asc" ? top5.reverse() : top5;
  }, [view.linhas, topLinhaSort, topLinhaDir]);

  function toggleTopLinhaSort(key: TopProdSort) {
    if (topLinhaSort === key) {
      setTopLinhaDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTopLinhaSort(key);
      setTopLinhaDir(key === "nome" ? "asc" : "desc");
    }
  }

  const linhasTabela = useMemo(() => {
    let lista = view.produtos;
    const q = busca.trim().toLowerCase();
    if (q) lista = lista.filter((p) => p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      if (sortKey === "nome") return a.nome.localeCompare(b.nome, "pt-BR") * dir;
      const va = a[sortKey];
      const vb = b[sortKey];
      // Sem dado ("—") sempre no fim, nas duas direções.
      if (va == null && vb == null) return b.faturamento - a.faturamento;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir;
    });
  }, [view.produtos, busca, sortKey, sortDir]);

  const totalTabela = useMemo(() => {
    const faturamento = linhasTabela.reduce((s, p) => s + p.faturamento, 0);
    const itens = linhasTabela.reduce((s, p) => s + p.itens, 0);
    const completo = linhasTabela.length > 0 && linhasTabela.every((p) => p.cmv != null);
    const cmv = completo ? linhasTabela.reduce((s, p) => s + (p.cmv ?? 0), 0) : null;
    const lucro = completo ? linhasTabela.reduce((s, p) => s + (p.lucro ?? 0), 0) : null;
    return {
      faturamento,
      itens,
      precoMedio: itens > 0 ? faturamento / itens : 0,
      cmv,
      lucro,
      margemPct: lucro != null && faturamento > 0 ? (lucro / faturamento) * 100 : null,
      participacaoPct: linhasTabela.reduce((s, p) => s + p.participacaoPct, 0),
    };
  }, [linhasTabela]);

  const pageSize = isMobile ? PAGE_SIZE_MOBILE : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(linhasTabela.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = linhasTabela.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [busca, sortKey, sortDir, escopo, isMobile]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "nome" ? "asc" : "desc");
    }
  }

  function exportCsv() {
    const header = ["Código", "Produto", "Faturamento", "Itens vendidos", "Preço médio", "CMV", "Lucro bruto", "Margem %", "Participação %", "Variação %"];
    const dec = (v: number | null, casas = 2) => (v == null ? "" : v.toFixed(casas).replace(".", ","));
    const rows = linhasTabela.map((p) => [
      csvCell(p.codigo),
      csvCell(p.nome),
      dec(p.faturamento),
      String(p.itens),
      dec(p.precoMedio),
      dec(p.cmv),
      dec(p.lucro),
      dec(p.margemPct, 1),
      dec(p.participacaoPct, 1),
      dec(p.variacaoPct, 1),
    ]);
    const csv = [header.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "produtos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalCategorias = view.categorias.reduce((s, c) => s + c.faturamento, 0);
  const tipVariacao = `Faturamento do produto ${tipRelacao(view.vsVariacao).replace(/^Em/, "em").replace(/\.$/, "")}.`;
  const tipCmvProduto = view.temCustoProduto
    ? "Custo das mercadorias vendidas e lucro bruto de cada produto no período. “—” indica que falta o custo de algum dia com venda do produto."
    : "O CMV por produto não está disponível para este período.";

  return (
    <div className="flex flex-col p-4 sm:p-6">
      <PageHeader
        crumbs={[{ label: "Dashboard", to: "/dashboard/visao-geral" }, { label: "Produtos" }]}
        title="Produtos"
        subtitle="Desempenho, margem e composição do mix de produtos."
        actions={
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              <DateRangePicker
                value={dateRange}
                onChange={onDateChange}
                displayLabel={periodDisplayLabel(escopo.periodo)}
                activePresetId={periodActivePresetId(escopo.periodo)}
                size="sm"
                minDate={pickerMinDate(coverageFrom, monthFill)}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.print()}
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
            <LastUpdated />
          </div>
        }
      />

      <InitialSyncNotice />
      <MonthFillNotice fill={monthFill} inicio={periodoAtual.inicio} fim={periodoAtual.fim} />
      {!loading && (
        <ProductsWithoutCostNotice
          produtos={view.produtosSemCusto}
          storeIds={escopo.filialIds}
          from={periodoAtual.inicio}
          to={periodoAtual.fim}
        />
      )}

      {loading ? (
        <ProductsSkeleton />
      ) : (
      <>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {view.kpis.map((kpi, i) => (
          <KpiCard key={kpi.label} kpi={kpi} Icon={KPI_ICONS[i] ?? IconFat} colorIdx={i} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padding="lg" className="flex flex-col">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Faturamento por categoria</CardTitle>
              {view.categorias.length > 0 && (
                <p className="mt-1.5 font-mono text-2xl font-extrabold text-t0">{brlCent(totalCategorias)}</p>
              )}
            </div>
            {view.categorias.length > 0 && <BadgeVsAnterior delta={view.deltaCategorias} />}
          </div>
          {view.categorias.length === 0 ? (
            <EmptyBlock />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[420px]">
                <BarChart
                  data={view.categorias.map((c) => ({ label: c.nome, value: c.faturamento }))}
                  height={220}
                  formatValue={brlCent}
                />
              </div>
            </div>
          )}
        </Card>

        <Card padding="lg" className="flex flex-col">
          <div className="mb-1 flex items-center gap-1.5">
            <CardTitle>Curva ABC por categoria</CardTitle>
            <TipHelp label="Classifica as categorias pela participação acumulada no faturamento: A até 80%, B até 95% e C no restante." />
          </div>
          {view.curvaAbcCategorias.itens.length === 0 ? (
            <EmptyBlock />
          ) : (
            (() => {
              const classes = view.curvaAbcCategorias.resumo.filter((r) => r.faturamento > 0);
              const total = classes.reduce((s, r) => s + r.faturamento, 0) || 1;
              return (
                <div className="flex flex-1 flex-col justify-center px-1 pb-1 pt-3">
                  <div className="mx-auto my-2">
                    <DonutChart
                      segments={classes.map((r) => ({
                        label: `Classe ${r.classe}`,
                        value: r.faturamento,
                        color: CORES_ABC[r.classe],
                      }))}
                      centerLabel="Total"
                      centerValue={brlCent(total)}
                    />
                  </div>
                  <div className="mt-2 flex flex-col gap-3">
                    {classes.map((r) => {
                      const pct = Math.round((r.faturamento / total) * 100);
                      const nomes = view.curvaAbcCategorias.itens.filter((i) => i.classe === r.classe).map((i) => i.nome);
                      return (
                        <div key={r.classe} className="flex items-start gap-2.5">
                          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CORES_ABC[r.classe] }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[12.5px] font-semibold text-t1">Classe {r.classe}</span>
                              <span className="ml-auto shrink-0 font-mono text-[12.5px] font-bold text-t0">{brlCent(r.faturamento)}</span>
                              <span className="min-w-[32px] shrink-0 text-right text-[11.5px] font-semibold text-t2">{pct}%</span>
                            </div>
                            <p className="mt-0.5 text-[11.5px] leading-snug text-t2">{nomes.join(" · ")}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-1.5">
              <CardTitle>Top linhas de produto</CardTitle>
              <TipHelp label="Soma a mesma fragrância em todos os tipos (desodorante colônia, body splash, body cream, roll-on…). Ex.: Obsessed, Obsessed Deluxe e Obsessed Intense entram na linha OBSESSED." />
            </div>
            <Badge variant="accent">Top 5</Badge>
          </CardHeader>
          {topLinhas.length === 0 ? (
            <EmptyBlock />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-t2">
                  <th className="px-1 pb-3 text-left font-bold">#</th>
                  <ThSort label="Linha" active={topLinhaSort === "nome"} dir={topLinhaDir} onClick={() => toggleTopLinhaSort("nome")} align="left" className="px-1 pb-3" />
                  <ThSort label="Itens vendidos" active={topLinhaSort === "itens"} dir={topLinhaDir} onClick={() => toggleTopLinhaSort("itens")} className="px-1 pb-3" />
                  <ThSort label="Faturamento" active={topLinhaSort === "faturamento"} dir={topLinhaDir} onClick={() => toggleTopLinhaSort("faturamento")} className="px-1 pb-3" />
                  <ThSort label="Margem" active={topLinhaSort === "margem"} dir={topLinhaDir} onClick={() => toggleTopLinhaSort("margem")} className="px-1 pb-3" />
                </tr>
              </thead>
              <tbody>
                {topLinhas.map((l, idx) => (
                  <tr key={l.nome} className="border-b border-line last:border-b-0">
                    <td className="px-1 py-3 text-center text-[13px] font-extrabold text-t2">{idx + 1}</td>
                    <td className="px-1 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <AvatarIniciais nome={l.nome} idx={idx} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-t0">{l.nome}</p>
                          <Tooltip label={l.tipos.join(" · ")}>
                            <p className="truncate text-[11px] text-t2">
                              {l.produtos} produto{l.produtos === 1 ? "" : "s"} · {l.tipos.length} tipo{l.tipos.length === 1 ? "" : "s"}
                            </p>
                          </Tooltip>
                        </div>
                      </div>
                    </td>
                    <td className="px-1 py-3 text-right font-mono text-[13px] font-bold text-t0">{num(l.itens)}</td>
                    <td className="px-1 py-3 text-right font-mono text-[13px] font-bold text-t0">{brlCent(l.faturamento)}</td>
                    <td className={cn("px-1 py-3 text-right font-mono text-[13px] font-bold", l.margemPct == null ? "text-t2" : "text-ok")}>
                      {pctFmt(l.margemPct, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          {topLinhas.length > 0 && view.semLinhaFaturamento > 0 && (
            <p className="mt-3 text-[11.5px] text-t2">
              Fora das linhas: {brlCent(view.semLinhaFaturamento)} em skincare, cabelo, maquiagem, suplementos e kits.
            </p>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Top produtos</CardTitle>
            <Badge variant="accent">Top 5</Badge>
          </CardHeader>
          {topProdutos.length === 0 ? (
            <EmptyBlock />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-t2">
                  <th className="px-1 pb-3 text-left font-bold">#</th>
                  <ThSort label="Produto" active={topProdSort === "nome"} dir={topProdDir} onClick={() => toggleTopProdSort("nome")} align="left" className="px-1 pb-3" />
                  <ThSort label="Itens vendidos" active={topProdSort === "itens"} dir={topProdDir} onClick={() => toggleTopProdSort("itens")} className="px-1 pb-3" />
                  <ThSort label="Faturamento" active={topProdSort === "faturamento"} dir={topProdDir} onClick={() => toggleTopProdSort("faturamento")} className="px-1 pb-3" />
                  <ThSort label="Margem" active={topProdSort === "margem"} dir={topProdDir} onClick={() => toggleTopProdSort("margem")} className="px-1 pb-3" />
                </tr>
              </thead>
              <tbody>
                {topProdutos.map((p, idx) => (
                  <tr key={p.codigo || p.nome} className="border-b border-line last:border-b-0">
                    <td className="px-1 py-3 text-center text-[13px] font-extrabold text-t2">{idx + 1}</td>
                    <td className="px-1 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <AvatarIniciais nome={p.nome} idx={idx} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-t0">{p.nome}</p>
                          {p.codigo && <p className="text-[11px] text-t2">{p.codigo}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-1 py-3 text-right font-mono text-[13px] font-bold text-t0">{num(p.itens)}</td>
                    <td className="px-1 py-3 text-right font-mono text-[13px] font-bold text-t0">{brlCent(p.faturamento)}</td>
                    <td className={cn("px-1 py-3 text-right font-mono text-[13px] font-bold", p.margemPct == null ? "text-t2" : "text-ok")}>
                      {pctFmt(p.margemPct, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      </div>

      {/* Desempenho por produto — tabela flat + Total + cards mobile */}
      <Card className="mt-4" padding="none">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5">
            <CardTitle>Desempenho por produto</CardTitle>
            <TipHelp label={tipCmvProduto} />
          </div>
          {view.produtos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Buscar produto ou código…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={cn(filtroInputClass, "sm:w-56")}
            />
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={linhasTabela.length === 0}>
              Exportar CSV
            </Button>
          </div>
          )}
        </div>

        {/* Desktop */}
        <div className="hidden overflow-x-auto p-4 md:block">
          {linhasTabela.length === 0 ? (
            view.produtos.length === 0 ? (
              <EmptyBlock />
            ) : (
              <EmptyBlock
                icon="🔍"
                title="Nenhum produto encontrado"
                description="Tente buscar por outro nome ou código."
                action={
                  <Button variant="outline" size="sm" onClick={() => setBusca("")}>
                    Limpar busca
                  </Button>
                }
              />
            )
          ) : (
            <table className="w-full min-w-[1000px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b-2 border-line">
                  <ThSort label="Produto" active={sortKey === "nome"} dir={sortDir} onClick={() => toggleSort("nome")} align="left" />
                  <ThSort label="Faturamento" active={sortKey === "faturamento"} dir={sortDir} onClick={() => toggleSort("faturamento")} />
                  <ThSort label="Itens vendidos" active={sortKey === "itens"} dir={sortDir} onClick={() => toggleSort("itens")} />
                  <ThSort label="Preço médio" active={sortKey === "precoMedio"} dir={sortDir} onClick={() => toggleSort("precoMedio")} />
                  <ThSort label="CMV" active={sortKey === "cmv"} dir={sortDir} onClick={() => toggleSort("cmv")} />
                  <ThSort label="Lucro bruto" active={sortKey === "lucro"} dir={sortDir} onClick={() => toggleSort("lucro")} />
                  <ThSort label="Margem" active={sortKey === "margemPct"} dir={sortDir} onClick={() => toggleSort("margemPct")} />
                  <ThSort label="Participação" active={sortKey === "participacaoPct"} dir={sortDir} onClick={() => toggleSort("participacaoPct")} />
                  <ThSort label="Variação" active={sortKey === "variacaoPct"} dir={sortDir} onClick={() => toggleSort("variacaoPct")} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => (
                  <tr key={p.codigo || p.nome} className="border-b border-line hover:bg-bg-3">
                    <td className="px-3 py-2.5">
                      <p className="text-[13px] font-bold text-t0">{p.nome}</p>
                      {p.codigo && <p className="text-[11px] text-t2">{p.codigo}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-t0">{brlCent(p.faturamento)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-t1">{num(p.itens)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-t1">{brlCent(p.precoMedio)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-t1">{moneyOrDash(p.cmv)}</td>
                    <td className={cn("px-3 py-2.5 text-right font-extrabold tabular-nums", p.lucro == null ? "text-t2" : "text-ok")}>{moneyOrDash(p.lucro)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-t1">{pctFmt(p.margemPct)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-t1">{pctFmt(p.participacaoPct)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <Tooltip label={tipVariacao}>
                        <span>
                          <Variacao v={p.variacaoPct} />
                        </span>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-bg-inset">
                  <td className="px-3 py-3 text-[13.5px] font-extrabold text-t0">
                    <span className="inline-flex items-center gap-1">
                      Total do filtro
                      <TipHelp label="Soma todos os produtos do filtro, inclusive os que não aparecem nesta página." />
                    </span>
                    <span className="ml-2 text-[11px] font-semibold text-t2">
                      ({num(linhasTabela.length)} produto{linhasTabela.length === 1 ? "" : "s"})
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-[14px] font-extrabold tabular-nums text-t0">{brlCent(totalTabela.faturamento)}</td>
                  <td className="px-3 py-3 text-right text-[13.5px] font-extrabold tabular-nums text-t0">{num(totalTabela.itens)}</td>
                  <td className="px-3 py-3 text-right text-[13.5px] font-bold tabular-nums text-t1">{brlCent(totalTabela.precoMedio)}</td>
                  <td className="px-3 py-3 text-right text-[13.5px] font-bold tabular-nums text-t1">{moneyOrDash(totalTabela.cmv)}</td>
                  <td className={cn("px-3 py-3 text-right text-[14px] font-extrabold tabular-nums", totalTabela.lucro == null ? "text-t2" : "text-ok")}>
                    {moneyOrDash(totalTabela.lucro)}
                  </td>
                  <td className="px-3 py-3 text-right text-[13.5px] font-extrabold tabular-nums text-t0">{pctFmt(totalTabela.margemPct)}</td>
                  <td className="px-3 py-3 text-right text-[13.5px] font-bold tabular-nums text-t1">{pctFmt(totalTabela.participacaoPct)}</td>
                  <td className="px-3 py-3" />
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile — card por produto */}
        <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
          {pageRows.length === 0 ? (
            view.produtos.length === 0 ? (
              <EmptyBlock />
            ) : (
              <EmptyBlock
                icon="🔍"
                title="Nenhum produto encontrado"
                description="Tente buscar por outro nome ou código."
                action={
                  <Button variant="outline" size="sm" onClick={() => setBusca("")}>
                    Limpar busca
                  </Button>
                }
              />
            )
          ) : (
            pageRows.map((p) => (
              <div key={p.codigo || p.nome} className="rounded-xl border border-line bg-bg-inset p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-t0">{p.nome}</p>
                    {p.codigo && <p className="mt-0.5 text-[11px] font-semibold text-t2">{p.codigo}</p>}
                  </div>
                  <span className="shrink-0 text-xs">
                    <Variacao v={p.variacaoPct} />
                  </span>
                </div>
                <GradeMetricas m={p} className="mt-2.5 border-t border-line pt-2.5" />
              </div>
            ))
          )}
          {linhasTabela.length > 0 && (
            <div className="rounded-xl border border-line bg-bg-3 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-t2">
                Total do filtro · {num(linhasTabela.length)} produto{linhasTabela.length === 1 ? "" : "s"}
              </p>
              <GradeMetricas m={totalTabela} className="mt-2" destaque />
            </div>
          )}
        </div>

        {linhasTabela.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
            <span className="text-[12.5px] text-t2">
              Mostrando {pageRows.length} de {num(linhasTabela.length)} produtos
            </span>
            <Pagination page={pageSafe} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </Card>
      </>
      )}
    </div>
  );
}

function KpiCard({ kpi, Icon, colorIdx = 0 }: { kpi: ProductsKpi; Icon: () => React.JSX.Element; colorIdx?: number }) {
  const c = KPI_COLORS[colorIdx % KPI_COLORS.length];
  return (
    <StatCard
      label={kpi.label}
      value={kpi.valor}
      icon={<Icon />}
      iconColor={c.iconColor}
      iconBg={c.iconBg}
      delta={kpi.delta}
      sub={kpi.sub}
      tooltip={kpi.tooltip}
    />
  );
}

function csvCell(v: string): string {
  if (/[";\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

type MetricasLinha = Pick<ProductItemRow, "faturamento" | "itens" | "precoMedio" | "cmv" | "lucro" | "margemPct" | "participacaoPct">;

function GradeMetricas({ m, className, destaque = false }: { m: MetricasLinha; className?: string; destaque?: boolean }) {
  const val = destaque ? "font-extrabold tabular-nums text-t0" : "font-semibold tabular-nums text-t0";
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Faturamento", value: <span className={val}>{brlCent(m.faturamento)}</span> },
    { label: "Itens vendidos", value: <span className={val}>{num(m.itens)}</span> },
    { label: "Preço médio", value: <span className={val}>{brlCent(m.precoMedio)}</span> },
    { label: "CMV", value: <span className={val}>{moneyOrDash(m.cmv)}</span> },
    { label: "Lucro bruto", value: <span className={cn(val, m.lucro != null && "text-ok")}>{moneyOrDash(m.lucro)}</span> },
    { label: "Margem", value: <span className={val}>{pctFmt(m.margemPct)}</span> },
    { label: "Participação", value: <span className={val}>{pctFmt(m.participacaoPct)}</span> },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]", className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-2">
          <span className="text-t2">{r.label}</span>
          {r.value}
        </div>
      ))}
    </div>
  );
}
