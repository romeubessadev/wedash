import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Badge, Card, CardHeader, CardTitle, StatCard, DateRangePicker, PageHeader, Button, Modal, Pagination, ProgressBar, ThSort, type SortDir } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { TABLE_PAGE_SIZE } from "@/lib/usePagedRows";
import { AreaLineChart, BarChart, DonutChart } from "@/components/charts";
import { useScope } from "@/pages/dashboard/useScope";
import {
  buildAbcClassDetail,
  buildCategoryDetail,
  buildProductDetail,
  buildProductLineDetail,
  buildProductsView,
  financeFetchRange,
  productsFetchRange,
  resolvePeriod,
  type AbcCategory,
  type AbcClass,
  type ProductDetail,
  type ProductDetailCategory,
  type ProductDetailItem,
  type ProductItemRow,
  type ProductLineRow,
  type ProductsAggInput,
  type ProductsKpi,
} from "@/data/wedash/dashboard";
import {
  fetchProductCatalogDescriptions,
  fetchProductCatalogTypes,
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
import { ReportHeader, useExportPdf } from "@/pages/dashboard/ReportHeader";
import { usePrintMode } from "@/lib/printMode";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { ProductsWithoutCostNotice } from "@/pages/dashboard/ProductsWithoutCostNotice";
import { ProductsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
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

type Selecao =
  | { tipo: "produto"; row: ProductItemRow }
  | { tipo: "linha"; row: ProductLineRow }
  | { tipo: "categoria"; row: AbcCategory }
  | { tipo: "classe"; classe: AbcClass };

type SortKey = "nome" | "faturamento" | "itens" | "lucro" | "margemPct" | "variacaoPct";
type TopProdSort = "nome" | "itens" | "faturamento" | "margem";

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
const corLucro = (v: number | null) => (v == null ? "text-t2" : v < 0 ? "text-bad" : "text-ok");

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
  const showSkeleton = useMinSkeleton(loading);
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("faturamento");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [topProdSort, setTopProdSort] = useState<TopProdSort>("faturamento");
  const [topProdDir, setTopProdDir] = useState<SortDir>("desc");
  const [topLinhaSort, setTopLinhaSort] = useState<TopProdSort>("faturamento");
  const [topLinhaDir, setTopLinhaDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  // Pilha do detalhe: classe → categoria → produto / linha → produto; "Voltar" desempilha.
  const [pilha, setPilha] = useState<Selecao[]>([]);
  const detalhe = pilha.at(-1) ?? null;
  const abrir = (s: Selecao) => setPilha([s]);
  const empilhar = (s: Selecao) => setPilha((p) => [...p, s]);
  const printing = usePrintMode();
  const exportar = useExportPdf("Produtos");
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
      const [dayAggs, hourAggs, prevHourAggs, categoryDayAggs, productDayAggs, productCostDayAggs, cov, catalogDescriptions, catalogTypes] = await Promise.all([
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
        fetchProductCatalogTypes(),
      ]);
      if (gen !== reloadGen.current) return;
      setAggs({ dayAggs, hourAggs, prevHourAggs, categoryDayAggs, productDayAggs, productCostDayAggs, catalogDescriptions, catalogTypes });
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
    const lucro = completo ? linhasTabela.reduce((s, p) => s + (p.lucro ?? 0), 0) : null;
    const fatCmp = linhasTabela.reduce((s, p) => s + p.faturamentoCmp, 0);
    const fatAnt = linhasTabela.reduce((s, p) => s + p.faturamentoAnt, 0);
    return {
      faturamento,
      itens,
      lucro,
      variacaoPct: fatCmp > 0 && fatAnt > 0 ? ((fatCmp - fatAnt) / fatAnt) * 100 : null,
      margemPct: lucro != null && faturamento > 0 ? (lucro / faturamento) * 100 : null,
    };
  }, [linhasTabela]);

  const pageSize = TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(linhasTabela.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = printing ? linhasTabela : linhasTabela.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [busca, sortKey, sortDir, escopo]);

  useEffect(() => {
    setPilha([]);
  }, [escopo]);

  const detalheView = useMemo(() => {
    if (!detalhe) return null;
    switch (detalhe.tipo) {
      case "linha":
        return buildProductLineDetail(escopo, aggs, detalhe.row);
      case "categoria":
        return buildCategoryDetail(escopo, aggs, detalhe.row);
      case "classe":
        return buildAbcClassDetail(escopo, aggs, view, detalhe.classe);
      default:
        return buildProductDetail(escopo, aggs, detalhe.row);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalhe, escopo, aggs, view, storesTick]);

  const nomeSelecao = (s: Selecao) => (s.tipo === "classe" ? `Classe ${s.classe}` : s.row.nome);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "nome" ? "asc" : "desc");
    }
  }

  const totalCategorias = view.categorias.reduce((s, c) => s + c.faturamento, 0);
  const tipVariacao = `Faturamento do produto ${tipRelacao(view.vsVariacao).replace(/^Em/, "em").replace(/\.$/, "")}.`;
  const tipVariacaoTotal = `Faturamento somado dos produtos do filtro ${tipRelacao(view.vsVariacao).replace(/^Em/, "em").replace(/\.$/, "")}. Cada produto pesa pelo quanto vende.`;
  const tipCmvProduto = view.temCustoProduto
    ? "Mostra o faturamento, CMV, lucro bruto e margem de cada produto no período.\n\nQuando aparecer “—”, não há custo suficiente para calcular o indicador corretamente."
    : "O CMV por produto não está disponível para este período.";

  return (
    <div className="flex flex-col p-4 sm:p-6 print:p-0">
      <ReportHeader />
      <PageHeader
        crumbs={[{ label: "Dashboard", to: "/dashboard/visao-geral" }, { label: "Produtos" }]}
        title="Produtos"
        subtitle="Acompanhe desempenho, margem e composição do mix de produtos."
        actions={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <DateRangePicker
                value={dateRange}
                onChange={onDateChange}
                displayLabel={periodDisplayLabel(escopo.periodo)}
                activePresetId={periodActivePresetId(escopo.periodo)}
                minDate={pickerMinDate(coverageFrom, monthFill)}
              />
              <Button variant="secondary" onClick={exportar}>
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

      {showSkeleton ? (
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
            <TipHelp label={"Classifica as categorias pela participação acumulada no faturamento:\nClasse A: até 80%\nClasse B: de 80% a 95%\nClasse C: restante"} />
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
                  <div className="mt-2 flex flex-col gap-1">
                    {classes.map((r) => {
                      const pct = Math.round((r.faturamento / total) * 100);
                      const nomes = view.curvaAbcCategorias.itens.filter((i) => i.classe === r.classe).map((i) => i.nome);
                      return (
                        <button
                          key={r.classe}
                          type="button"
                          onClick={() => abrir({ tipo: "classe", classe: r.classe })}
                          className="-mx-2 flex items-start gap-2.5 rounded-[var(--radius-vela-sm)] px-2 py-1.5 text-left transition-colors hover:bg-bg-3"
                        >
                          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CORES_ABC[r.classe] }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[12.5px] font-semibold text-t1">Classe {r.classe}</span>
                              <span className="ml-auto shrink-0 font-mono text-[12.5px] font-bold text-t0">{brlCent(r.faturamento)}</span>
                              <span className="min-w-[32px] shrink-0 text-right text-[11.5px] font-semibold text-t2">{pct}%</span>
                            </div>
                            <p className="mt-0.5 text-[11.5px] leading-snug text-t2">{nomes.join(" · ")}</p>
                          </div>
                        </button>
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
              <TipHelp label={"Agrupa produtos da mesma linha, mesmo quando existem em diferentes tipos, como colônia, body splash, body cream ou roll-on.\n\nExemplo: Obsessed, Obsessed Deluxe e Obsessed Intense pertencem à linha OBSESSED."} />
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
                  <tr
                    key={l.nome}
                    tabIndex={0}
                    onClick={() => abrir({ tipo: "linha", row: l })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        abrir({ tipo: "linha", row: l });
                      }
                    }}
                    className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-bg-3 focus-visible:bg-bg-3 focus-visible:outline-none"
                  >
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
                      {pctFmt(l.margemPct)}
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
                  <tr
                    key={p.chave}
                    tabIndex={0}
                    onClick={() => abrir({ tipo: "produto", row: p })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        abrir({ tipo: "produto", row: p });
                      }
                    }}
                    className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-bg-3 focus-visible:bg-bg-3 focus-visible:outline-none"
                  >
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
                      {pctFmt(p.margemPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      </div>

      {/* Desempenho por produto — mesma lista do Top produtos; clique abre o detalhe */}
      <Card className="mt-4 flex flex-col">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5">
            <CardTitle>Desempenho por produto</CardTitle>
            <TipHelp label={tipCmvProduto} />
          </div>
          {view.produtos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <input
              type="search"
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={cn(filtroInputClass, "sm:w-56")}
            />
          </div>
          )}
        </div>

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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-t2">
                  <th className="px-1 pb-3 text-left font-bold">#</th>
                  <ThSort label="Produto" active={sortKey === "nome"} dir={sortDir} onClick={() => toggleSort("nome")} align="left" className="px-1 pb-3" />
                  <ThSort label="Itens vendidos" active={sortKey === "itens"} dir={sortDir} onClick={() => toggleSort("itens")} className="px-1 pb-3" />
                  <ThSort label="Faturamento" active={sortKey === "faturamento"} dir={sortDir} onClick={() => toggleSort("faturamento")} className="px-1 pb-3" />
                  <ThSort label="Lucro bruto" active={sortKey === "lucro"} dir={sortDir} onClick={() => toggleSort("lucro")} className="px-1 pb-3" />
                  <ThSort label="Margem" active={sortKey === "margemPct"} dir={sortDir} onClick={() => toggleSort("margemPct")} className="px-1 pb-3" />
                  <ThSort label="Variação" active={sortKey === "variacaoPct"} dir={sortDir} onClick={() => toggleSort("variacaoPct")} className="px-1 pb-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p, i) => {
                  const idx = printing ? i : (pageSafe - 1) * pageSize + i;
                  return (
                    <tr
                      key={p.chave}
                      tabIndex={0}
                      onClick={() => abrir({ tipo: "produto", row: p })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          abrir({ tipo: "produto", row: p });
                        }
                      }}
                      className="cursor-pointer border-b border-line transition-colors hover:bg-bg-3 focus-visible:bg-bg-3 focus-visible:outline-none"
                    >
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
                      <td className={cn("px-1 py-3 text-right font-mono text-[13px] font-bold", corLucro(p.lucro))}>{moneyOrDash(p.lucro)}</td>
                      <td className={cn("px-1 py-3 text-right font-mono text-[13px] font-bold", p.margemPct == null ? "text-t2" : "text-ok")}>
                        {pctFmt(p.margemPct)}
                      </td>
                      <td className="px-1 py-3 text-right font-mono text-[13px]">
                        <Tooltip label={tipVariacao}>
                          <span>
                            <Variacao v={p.variacaoPct} />
                          </span>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-bg-inset">
                  <td />
                  <td className="px-1 py-3 text-[13px] font-extrabold text-t0">
                    <span className="inline-flex items-center gap-1">
                      Total do filtro
                      <TipHelp label="Soma todos os produtos encontrados no filtro, inclusive os que não aparecem nesta página." />
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-t2">
                      {num(linhasTabela.length)} produto{linhasTabela.length === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="px-1 py-3 text-right font-mono text-[13px] font-extrabold text-t0">{num(totalTabela.itens)}</td>
                  <td className="px-1 py-3 text-right font-mono text-[13px] font-extrabold text-t0">{brlCent(totalTabela.faturamento)}</td>
                  <td className={cn("px-1 py-3 text-right font-mono text-[13px] font-extrabold", corLucro(totalTabela.lucro))}>
                    {moneyOrDash(totalTabela.lucro)}
                  </td>
                  <td className={cn("px-1 py-3 text-right font-mono text-[13px] font-extrabold", totalTabela.margemPct == null ? "text-t2" : "text-ok")}>
                    {pctFmt(totalTabela.margemPct)}
                  </td>
                  <td className="px-1 py-3 text-right font-mono text-[13px] font-extrabold">
                    <Tooltip label={tipVariacaoTotal}>
                      <span>
                        <Variacao v={totalTabela.variacaoPct} />
                      </span>
                    </Tooltip>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {linhasTabela.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <span className="text-[12.5px] text-t2">
              Mostrando {pageRows.length} de {num(linhasTabela.length)} produtos
            </span>
            {totalPages > 1 && <Pagination page={pageSafe} totalPages={totalPages} onChange={setPage} />}
          </div>
        )}
      </Card>
      </>
      )}

      <ProductDetailModal
        detalhe={detalheView}
        periodo={periodoAtual.rotulo}
        onClose={() => setPilha([])}
        onProduto={(chave) => {
          const row = view.produtos.find((p) => p.chave === chave);
          if (row) empilhar({ tipo: "produto", row });
        }}
        onCategoria={(id) => {
          const row = view.curvaAbcCategorias.itens.find((c) => c.categoriaId === id);
          if (row) empilhar({ tipo: "categoria", row });
        }}
        voltarPara={pilha.length > 1 ? nomeSelecao(pilha[pilha.length - 2]) : undefined}
        onVoltar={() => setPilha((p) => p.slice(0, -1))}
      />
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

function MetricaDetalhe({
  label,
  valor,
  delta,
  destaque,
  tip,
}: {
  label: string;
  valor: string;
  delta?: { value: string; positive: boolean; vs?: string; anterior?: string };
  destaque?: boolean;
  tip?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-bg-inset p-3">
      <p className="flex items-center gap-1 text-[11.5px] font-semibold text-t2">
        {label}
        {tip && <TipHelp label={tip} />}
      </p>
      <p className={cn("mt-1 font-mono text-[15px] font-extrabold tabular-nums", valor === "—" ? "text-t2" : destaque ? "text-ok" : "text-t0")}>
        {valor}
      </p>
      {delta && (
        <div className="mt-1.5">
          <BadgeVsAnterior delta={delta} />
        </div>
      )}
    </div>
  );
}

/** Mesmo padrão da tabela Top produtos (# · Produto · Itens · Faturamento · Margem); clique abre o produto. */
function ProdutosDoGrupo({ produtos, onProduto }: { produtos: ProductDetailItem[]; onProduto: (chave: string) => void }) {
  const [sort, setSort] = useState<TopProdSort>("faturamento");
  const [dir, setDir] = useState<SortDir>("desc");
  const linhas = useMemo(() => {
    const d = dir === "asc" ? 1 : -1;
    return [...produtos].sort((a, b) => {
      if (sort === "nome") return a.nome.localeCompare(b.nome, "pt-BR") * d;
      const va = sort === "itens" ? a.itens : sort === "margem" ? a.margemPct : a.faturamento;
      const vb = sort === "itens" ? b.itens : sort === "margem" ? b.margemPct : b.faturamento;
      if (va == null && vb == null) return b.faturamento - a.faturamento;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * d || b.faturamento - a.faturamento;
    });
  }, [produtos, sort, dir]);
  const alternar = (k: TopProdSort) => {
    if (sort === k) setDir((x) => (x === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(k === "nome" ? "asc" : "desc");
    }
  };
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wide text-t2">
            <th className="px-1 pb-3 text-left font-bold">#</th>
            <ThSort label="Produto" active={sort === "nome"} dir={dir} onClick={() => alternar("nome")} align="left" className="px-1 pb-3" />
            <ThSort label="Itens vendidos" active={sort === "itens"} dir={dir} onClick={() => alternar("itens")} className="px-1 pb-3" />
            <ThSort label="Faturamento" active={sort === "faturamento"} dir={dir} onClick={() => alternar("faturamento")} className="px-1 pb-3" />
            <ThSort label="Margem" active={sort === "margem"} dir={dir} onClick={() => alternar("margem")} className="px-1 pb-3" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((p, idx) => (
            <tr
              key={p.chave}
              tabIndex={0}
              onClick={() => onProduto(p.chave)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onProduto(p.chave);
                }
              }}
              className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-bg-3 focus-visible:bg-bg-3 focus-visible:outline-none"
            >
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
                {pctFmt(p.margemPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Categorias de uma classe da Curva ABC — padrão da tabela Top produtos; clique abre a categoria. */
function CategoriasDaClasse({
  categorias,
  onCategoria,
}: {
  categorias: ProductDetailCategory[];
  onCategoria: (categoriaId: number) => void;
}) {
  const [sort, setSort] = useState<TopProdSort>("faturamento");
  const [dir, setDir] = useState<SortDir>("desc");
  const linhas = useMemo(() => {
    const d = dir === "asc" ? 1 : -1;
    return [...categorias].sort((a, b) => {
      if (sort === "nome") return a.nome.localeCompare(b.nome, "pt-BR") * d;
      const va = sort === "itens" ? a.itens : sort === "margem" ? a.margemPct : a.faturamento;
      const vb = sort === "itens" ? b.itens : sort === "margem" ? b.margemPct : b.faturamento;
      if (va == null && vb == null) return b.faturamento - a.faturamento;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * d || b.faturamento - a.faturamento;
    });
  }, [categorias, sort, dir]);
  const alternar = (k: TopProdSort) => {
    if (sort === k) setDir((x) => (x === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(k === "nome" ? "asc" : "desc");
    }
  };
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wide text-t2">
            <th className="px-1 pb-3 text-left font-bold">#</th>
            <ThSort label="Categoria" active={sort === "nome"} dir={dir} onClick={() => alternar("nome")} align="left" className="px-1 pb-3" />
            <ThSort label="Itens vendidos" active={sort === "itens"} dir={dir} onClick={() => alternar("itens")} className="px-1 pb-3" />
            <ThSort label="Faturamento" active={sort === "faturamento"} dir={dir} onClick={() => alternar("faturamento")} className="px-1 pb-3" />
            <ThSort label="Margem" active={sort === "margem"} dir={dir} onClick={() => alternar("margem")} className="px-1 pb-3" />
            <th className="px-1 pb-3 text-right font-bold">
              <span className="inline-flex items-center gap-1">
                Participação
                <TipHelp label="Fatia da categoria no faturamento de todas as categorias e, abaixo, o acumulado que define a classe (A até 80%, B até 95%)." />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c, idx) => (
            <tr
              key={c.categoriaId}
              tabIndex={0}
              onClick={() => onCategoria(c.categoriaId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCategoria(c.categoriaId);
                }
              }}
              className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-bg-3 focus-visible:bg-bg-3 focus-visible:outline-none"
            >
              <td className="px-1 py-3 text-center text-[13px] font-extrabold text-t2">{idx + 1}</td>
              <td className="px-1 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <AvatarIniciais nome={c.nome} idx={idx} />
                  <p className="truncate text-[13px] font-bold text-t0">{c.nome}</p>
                </div>
              </td>
              <td className="px-1 py-3 text-right font-mono text-[13px] font-bold text-t0">{num(c.itens)}</td>
              <td className="px-1 py-3 text-right font-mono text-[13px] font-bold text-t0">{brlCent(c.faturamento)}</td>
              <td className={cn("px-1 py-3 text-right font-mono text-[13px] font-bold", c.margemPct == null ? "text-t2" : "text-ok")}>
                {pctFmt(c.margemPct)}
              </td>
              <td className="px-1 py-3 text-right">
                <p className="font-mono text-[13px] font-bold text-t0">{pctFmt(c.pct)}</p>
                <p className="text-[11px] text-t2">acum. {pctFmt(c.pctAcumulado)}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductDetailModal({
  detalhe,
  periodo,
  onClose,
  onProduto,
  onCategoria,
  voltarPara,
  onVoltar,
}: {
  detalhe: ProductDetail | null;
  periodo: string;
  onClose: () => void;
  onProduto: (chave: string) => void;
  onCategoria: (categoriaId: number) => void;
  /** Nome do detalhe anterior (aberto a partir dele). */
  voltarPara?: string;
  onVoltar: () => void;
}) {
  const cmp = detalhe?.comparativo;
  const tipo = detalhe?.tipo ?? "produto";
  const artigo = { produto: "do produto", linha: "da linha", categoria: "da categoria", classe: "da classe" }[tipo];
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  const subtitulo = !detalhe
    ? ""
    : tipo === "linha"
      ? ["Linha de produto", plural(detalhe.produtos.length, "produto"), periodo].join(" · ")
      : tipo === "categoria"
        ? ["Categoria", detalhe.classe ? `Classe ${detalhe.classe}` : "", plural(detalhe.produtos.length, "produto"), periodo]
            .filter(Boolean)
            .join(" · ")
        : tipo === "classe"
          ? ["Curva ABC", plural(detalhe.categorias.length, "categoria"), periodo].join(" · ")
          : [detalhe.codigo, periodo].filter(Boolean).join(" · ");
  return (
    <Modal open={detalhe != null} onClose={onClose} title={detalhe?.nome} size="lg">
      {detalhe && (
        <div className="flex flex-col gap-5">
          <div className="-mt-1">
            {voltarPara && (
              <button type="button" onClick={onVoltar} className="mb-1.5 text-[12px] font-semibold text-acc hover:underline">
                ← Voltar para {voltarPara}
              </button>
            )}
            <p className="text-[12px] font-semibold text-t2">{subtitulo}</p>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <MetricaDetalhe label="Faturamento" valor={brlCent(detalhe.faturamento)} delta={cmp?.faturamento} />
              <MetricaDetalhe label="Itens vendidos" valor={num(detalhe.itens)} delta={cmp?.itens} />
              <MetricaDetalhe label="Preço médio" valor={brlCent(detalhe.precoMedio)} />
              <MetricaDetalhe
                label="Participação"
                valor={pctFmt(detalhe.participacaoPct)}
                tip={`Fatia ${artigo} no faturamento de todos os produtos do período.`}
              />
              <MetricaDetalhe label="CMV" valor={moneyOrDash(detalhe.cmv)} />
              <MetricaDetalhe label="Lucro bruto" valor={moneyOrDash(detalhe.lucro)} destaque />
              <MetricaDetalhe label="Margem" valor={pctFmt(detalhe.margemPct)} delta={cmp?.margem} />
            </div>
            <p className="mt-2.5 text-[11.5px] text-t2">
              {cmp
                ? `Variação ${tipRelacao(cmp.vs).replace(/^Em/, "em")}`
                : `Sem vendas ${artigo} no período anterior para comparar.`}
              {detalhe.cmv == null &&
                (tipo === "produto"
                  ? " CMV, lucro e margem ficam em “—” quando algum dia com venda não tem custo."
                  : ` CMV, lucro e margem ficam em “—” quando algum produto ${artigo} está sem custo.`)}
            </p>
          </div>

          {detalhe.serie && (
            <section>
              <h4 className="mb-2 text-[13px] font-bold text-t0">
                Faturamento {detalhe.serieGranularidade === "mes" ? "por mês" : "por dia"}
              </h4>
              <AreaLineChart
                data={detalhe.serie.map((d) => d.faturamento)}
                labels={detalhe.serie.map((d) => d.label)}
                formatValue={brlCent}
                height={200}
                showAxisLabels
              />
            </section>
          )}

          {(tipo === "linha" || tipo === "categoria") && detalhe.produtos.length > 0 && (
            <section>
              <h4 className="text-[13px] font-bold text-t0">Produtos {artigo}</h4>
              {detalhe.tipos.length > 0 && <p className="mt-0.5 text-[11.5px] text-t2">{detalhe.tipos.join(" · ")}</p>}
              <ProdutosDoGrupo key={`${tipo}-${detalhe.chave}`} produtos={detalhe.produtos} onProduto={onProduto} />
            </section>
          )}

          {tipo === "classe" && detalhe.categorias.length > 0 && (
            <section>
              <h4 className="text-[13px] font-bold text-t0">Categorias da classe</h4>
              <CategoriasDaClasse key={detalhe.chave} categorias={detalhe.categorias} onCategoria={onCategoria} />
            </section>
          )}

          {detalhe.lojas.length > 0 && (
            <section>
              <h4 className="mb-3 text-[13px] font-bold text-t0">Vendas por loja</h4>
              <div className="flex flex-col gap-3">
                {detalhe.lojas.map((l) => (
                  <div key={l.filialId}>
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-t1">{l.nome}</span>
                      <span className="shrink-0 text-[11.5px] text-t2">
                        {num(l.itens)} ite{l.itens === 1 ? "m" : "ns"}
                      </span>
                      <span className="shrink-0 font-mono text-[12.5px] font-bold text-t0">{brlCent(l.faturamento)}</span>
                      <span className="min-w-[40px] shrink-0 text-right text-[11.5px] font-semibold text-t2">{pctFmt(l.pct, 0)}</span>
                    </div>
                    <ProgressBar value={l.pct} color="var(--acc)" height={6} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
