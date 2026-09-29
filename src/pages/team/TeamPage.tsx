import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { paths } from "@/router/paths";
import { Button, Card, CardHeader, CardTitle, DateRangePicker, Dropdown, PageHeader, Pagination, StatCard, Tabs, ThSort, type SortDir } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { DonutChart } from "@/components/charts";
import { useScope } from "@/pages/dashboard/useScope";
import {
  buildTeamDashboardView,
  productsFetchRange,
  resolvePeriod,
  TEAM_SEM_TURNO,
  type TeamAggInput,
  type TeamMemberRow,
} from "@/data/wedash/dashboard";
import { fetchSalesCoverage, fetchSalesDayAggs, fetchSalesSellerDayAggs, fetchSellerShifts } from "@/data/wedash/salesRepo";
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
import { TeamSkeleton } from "@/components/wedash/LoadingSkeletons";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { FlameIcon, TargetIcon, TrophyIcon } from "@/pages/dashboards/icons";
import { BlocoRanking } from "@/pages/live/blocos";
import type { RankingRow } from "@/data/wedash/live";
import { TABLE_PAGE_SIZE } from "@/lib/usePagedRows";
import { brlCent, deIso, num, tipRelacao } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { DateRange, DateRangeChangeMeta } from "@/components/ui/DateRangePicker";
import {
  applyPeriodDateChange,
  dateRangeFromPeriod,
  periodActivePresetId,
  periodDisplayLabel,
} from "@/pages/dashboard/periodPicker";

const IconFat = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IconVendas = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);
const IconTicket = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2M13 17v2M13 11v2" />
  </svg>
);
const IconItens = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const KPI_ICONS = [IconFat, IconVendas, IconTicket, IconItens];

const KPI_COLORS = [
  { iconColor: "var(--acc)", iconBg: "var(--acc-soft)" },
  { iconColor: "var(--ok)", iconBg: "var(--ok-soft)" },
  { iconColor: "var(--info)", iconBg: "rgba(59,130,246,0.12)" },
  { iconColor: "var(--warn)", iconBg: "rgba(245,158,11,0.12)" },
];

const CORES_TURNO = ["var(--acc)", "var(--info)", "var(--ok)", "var(--warn)", "var(--bad)"];
/** Fatia neutra (sem turno / fora da equipe) — não compete com as demais. */
const COR_NEUTRA = "color-mix(in srgb, var(--t2) 40%, transparent)";
const CORES_RANK = ["var(--ok)", "var(--info)", "var(--warn)", "var(--acc)", "var(--bad)"];

const PODE_CONFIGURAR_LOJA = new Set(["OWNER", "MANAGER", "ADMIN_GLOBAL"]);

type SortKey = "nome" | "faturamento" | "vendas" | "ticketMedio" | "pa" | "participacaoPct" | "variacaoPct";

const TipHelp = ({ label }: { label: string }) => (
  <Tooltip label={label}>
    <span className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full bg-bg-inset text-[10px] font-semibold text-t2 hover:text-t1 transition-colors">
      ?
    </span>
  </Tooltip>
);

const filtroInputClass =
  "h-8 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3 text-xs font-semibold text-t0 transition-colors hover:border-acc focus:border-acc focus:outline-none";

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

const pctFmt = (v: number | null, casas = 1) => (v == null ? "—" : `${num(v, casas)}%`);
const paFmt = (v: number | null) => (v == null ? "—" : num(v, 2));

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

/** "a semana passada, até o mesmo dia" → "semana passada" (rótulo curto do card do celular). */
function vsCurto(vs: string): string {
  return vs.split(",")[0]!.replace(/^(os|o|as|a) /, "");
}

/** "Manhã · 09:00–15:00" → nome + horário. */
function partesTurno(turno?: string): { nome: string; horario?: string } {
  if (!turno) return { nome: TEAM_SEM_TURNO };
  const [nome, horario] = turno.split(" · ");
  return { nome: nome ?? turno, horario };
}

/** Loja principal (+N) — só com mais de 1 loja no escopo. */
function rotuloLojas(lojas: string[]): string | null {
  if (lojas.length === 0) return null;
  return lojas.length > 1 ? `${lojas[0]} · +${lojas.length - 1}` : lojas[0]!;
}

/**
 * Dashboard > Equipe: desempenho individual da equipe de vendas no período.
 * Metas, escada de premiação e desafios entram quando esses módulos existirem.
 */
export function TeamPage() {
  const session = useActiveSession();
  const navigate = useNavigate();
  const { escopo, mudar } = useScope();
  const [aggs, setAggs] = useState<TeamAggInput>({ dayAggs: [] });
  const [coverageFrom, setCoverageFrom] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useMinSkeleton(loading);
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("faturamento");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [turnoSel, setTurnoSel] = useState<string | null>(null);
  const printing = usePrintMode();
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
    const range = productsFetchRange(escopo);
    const storeIds = escopo.filialIds;
    const tenantId = session.tenantId;
    try {
      const [dayAggs, sellerDayAggs, sellerShifts, cov] = await Promise.all([
        fetchSalesDayAggs({ tenantId, storeIds, from: periodo.inicio, to: periodo.fim, brand: null }),
        fetchSalesSellerDayAggs({ tenantId, storeIds, from: range.from, to: range.to }),
        fetchSellerShifts(tenantId),
        fetchSalesCoverage(tenantId, storeIds),
      ]);
      if (gen !== reloadGen.current) return;
      setAggs({ dayAggs, sellerDayAggs, sellerShifts });
      setCoverageFrom(cov.from ? deIso(cov.from) : null);
    } catch (e) {
      if (gen !== reloadGen.current) return;
      console.error("Team reload:", e);
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
    () => buildTeamDashboardView(escopo, aggs, { turno: turnoSel }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escopo, aggs, storesTick, turnoSel],
  );

  const dateRange = useMemo(() => dateRangeFromPeriod(escopo.periodo), [escopo.periodo]);
  const periodoAtual = resolvePeriod(escopo.periodo, calendarTodayIso());
  const monthFill = useMonthFill();
  function onDateChange(r: DateRange, meta?: DateRangeChangeMeta) {
    mudar(applyPeriodDateChange(escopo, r, meta));
  }

  const linhasTabela = useMemo(() => {
    let lista = view.pessoas;
    const q = busca.trim().toLowerCase();
    if (q) lista = lista.filter((p) => p.nome.toLowerCase().includes(q));
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
  }, [view.pessoas, busca, sortKey, sortDir]);

  const totalTabela = useMemo(() => {
    const faturamento = linhasTabela.reduce((s, p) => s + p.faturamento, 0);
    const vendas = linhasTabela.reduce((s, p) => s + p.vendas, 0);
    const itens = linhasTabela.reduce((s, p) => s + p.itens, 0);
    const completo = linhasTabela.every((p) => p.pa != null || p.vendas === 0);
    return {
      faturamento,
      vendas,
      ticketMedio: vendas > 0 ? faturamento / vendas : 0,
      pa: completo && vendas > 0 ? itens / vendas : null,
      participacaoPct: linhasTabela.reduce((s, p) => s + p.participacaoPct, 0),
    };
  }, [linhasTabela]);

  const pageSize = TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(linhasTabela.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = printing ? linhasTabela : linhasTabela.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [busca, sortKey, sortDir, escopo, turnoSel]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "nome" ? "asc" : "desc");
    }
  }

  const exportar = useExportPdf("Equipe", view.turnoFiltro);
  const tipVariacao = `Faturamento ${tipRelacao(view.vsVariacao).replace(/^Em/, "em").replace(/\.$/, "")}.`;
  const temVendasEquipe = view.pessoas.length > 0;
  const podeConfigurar = PODE_CONFIGURAR_LOJA.has(session.role);
  const rankPorKey = new Map(view.pessoas.map((p, i) => [p.key, i]));
  const podio: RankingRow[] = view.pessoas.slice(0, 3).map((p, i) => ({
    posicao: i + 1,
    colaboradorId: p.key,
    nome: p.nome,
    vendas: p.vendas,
    faturamento: p.faturamento,
  }));

  return (
    <div className="flex flex-col p-4 sm:p-6 print:p-0">
      <ReportHeader filtros={view.turnosDisponiveis.length > 0 ? [{ label: "Turno", valor: view.turnoFiltro ?? "Todos os turnos" }] : []} />
      <PageHeader
        crumbs={[{ label: "Dashboard", to: "/dashboard/visao-geral" }, { label: "Equipe" }]}
        title="Equipe"
        subtitle="Acompanhe o desempenho da equipe de vendas."
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
              {view.turnosDisponiveis.length > 0 && (
                <Dropdown
                  align="right"
                  trigger={<FiltroTurnoTrigger rotulo={view.turnoFiltro ?? "Todos os turnos"} />}
                  items={[
                    { label: "Todos os turnos", active: view.turnoFiltro == null, onClick: () => setTurnoSel(null) },
                    ...view.turnosDisponiveis.map((t) => ({
                      label: t,
                      active: view.turnoFiltro === t,
                      onClick: () => setTurnoSel(t),
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
            <LastUpdated />
          </div>
        }
      />

      <InitialSyncNotice />
      <MonthFillNotice fill={monthFill} inicio={periodoAtual.inicio} fim={periodoAtual.fim} />

      {showSkeleton ? (
        <TeamSkeleton />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {view.kpis.map((kpi, i) => {
              const c = KPI_COLORS[i % KPI_COLORS.length]!;
              const Icon = KPI_ICONS[i] ?? IconFat;
              return (
                <StatCard
                  key={kpi.label}
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
            })}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Faturamento por turno */}
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-1.5">
                  <CardTitle>Faturamento por turno</CardTitle>
                  <TipHelp label="Mostra a participação de cada turno no faturamento da equipe." />
                </div>
              </CardHeader>
              {!temVendasEquipe ? (
                <EmptyBlock />
              ) : !view.turnosConfigurados ? (
                <EmptyBlock
                  icon="🕒"
                  title="Turnos não configurados"
                  description="Cadastre os turnos das lojas e vincule a equipe para comparar o desempenho por turno."
                  action={
                    podeConfigurar ? (
                      <Button size="sm" onClick={() => navigate(paths.management.shifts)}>
                        Configurar turnos
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                (() => {
                  const total = view.turnos.reduce((s, t) => s + t.faturamento, 0) || 1;
                  let corIdx = 0;
                  const cores = view.turnos.map((t) => (t.nome === TEAM_SEM_TURNO ? COR_NEUTRA : CORES_TURNO[corIdx++ % CORES_TURNO.length]!));
                  return (
                    <div className="flex flex-1 flex-col justify-center px-4 pb-4">
                      <div className="mx-auto my-2">
                        <DonutChart
                          segments={view.turnos.map((t, i) => ({ label: partesTurno(t.nome === TEAM_SEM_TURNO ? undefined : t.nome).nome, value: t.faturamento, color: cores[i]! }))}
                          centerLabel="Total"
                          centerValue={brlCent(total)}
                        />
                      </div>
                      <div className="mt-2 flex flex-col gap-2.5">
                        {view.turnos.map((t, i) => {
                          const pct = Math.round((t.faturamento / total) * 100);
                          const pt = partesTurno(t.nome === TEAM_SEM_TURNO ? undefined : t.nome);
                          return (
                            <div key={t.nome} className="flex items-start gap-2.5">
                              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cores[i] }} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                  <span className="min-w-0 truncate text-[12.5px] font-semibold text-t1">{pt.nome}</span>
                                  <span className="ml-auto shrink-0 font-mono text-[12.5px] font-bold text-t0">{brlCent(t.faturamento)}</span>
                                  <span className="min-w-[32px] shrink-0 text-right text-[11.5px] font-semibold text-t2">{pct}%</span>
                                </div>
                                <p className="mt-0.5 text-[11.5px] text-t2">
                                  {pt.horario ? `${pt.horario} · ` : ""}
                                  {t.pessoas} {t.pessoas === 1 ? "pessoa" : "pessoas"}
                                </p>
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

            {/* Composição do faturamento */}
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-1.5">
                  <CardTitle>Composição do faturamento</CardTitle>
                  <TipHelp label="Mostra quanto do faturamento foi atribuído à equipe e quanto veio de vendas sem vendedor identificado ou realizadas pela gerência." />
                </div>
              </CardHeader>
              {view.composicao.total <= 0 ? (
                <EmptyBlock />
              ) : (
                (() => {
                  const { equipe, fora, total, turno } = view.composicao;
                  const fatias = (
                    turno != null && view.turnoFiltro
                      ? [
                          { nome: view.turnoFiltro, valor: turno, cor: "var(--acc)" },
                          { nome: "Demais da equipe", valor: Math.max(0, equipe - turno), cor: "var(--info)" },
                          { nome: "Sem vendedor ou gerência", valor: fora, cor: COR_NEUTRA },
                        ]
                      : [
                          { nome: "Equipe de vendas", valor: equipe, cor: "var(--acc)" },
                          { nome: "Sem vendedor ou gerência", valor: fora, cor: COR_NEUTRA },
                        ]
                  ).filter((f) => f.valor > 0);
                  return (
                    <div className="flex flex-1 flex-col justify-center px-4 pb-4">
                      <div className="mx-auto my-2">
                        <DonutChart
                          segments={fatias.map((f) => ({ label: f.nome, value: f.valor, color: f.cor }))}
                          centerLabel="Total"
                          centerValue={brlCent(total)}
                        />
                      </div>
                      <div className="mt-2 flex flex-col gap-2">
                        {fatias.map((f) => (
                          <div key={f.nome} className="flex items-center gap-2.5">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: f.cor }} />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-t1">{f.nome}</span>
                            <span className="shrink-0 font-mono text-[12.5px] font-bold text-t0">{brlCent(f.valor)}</span>
                            <span className="min-w-[32px] shrink-0 text-right text-[11.5px] font-semibold text-t2">
                              {Math.round((f.valor / total) * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              )}
            </Card>
          </div>

          {/* Desempenho da equipe — abas Ranking · Desafios · Metas (mesmo card do Ao vivo) */}
          <Card className="mt-4 min-w-0 overflow-hidden" padding="lg">
            <div className="mb-4 flex items-center gap-1.5">
              <CardTitle>Desempenho da equipe</CardTitle>
              <TipHelp label={"Acompanhe ranking, desafios e metas individuais no período.\n\nVendas sem vendedor identificado ou realizadas pela gerência não entram no ranking."} />
            </div>
            {printing ? (
              !temVendasEquipe ? <EmptyBlock /> : abaRanking()
            ) : (
            <Tabs
              variant="accent"
              defaultKey="ranking"
              items={[
                {
                  key: "ranking",
                  label: "Ranking",
                  icon: <TrophyIcon size={14} />,
                  content: !temVendasEquipe ? <EmptyBlock /> : abaRanking(),
                },
                {
                  key: "desafios",
                  label: "Desafios",
                  icon: <FlameIcon size={14} />,
                  content: (
                    <EmptyBlock
                      icon="🔥"
                      title="Desafio não configurado"
                      description="Crie um desafio para engajar a equipe e acompanhar o progresso de cada pessoa."
                      action={
                        <Button size="sm" onClick={() => navigate(paths.management.challenges)}>
                          Criar desafio
                        </Button>
                      }
                    />
                  ),
                },
                {
                  key: "metas",
                  label: "Metas",
                  icon: <TargetIcon size={14} />,
                  content: (
                    <EmptyBlock
                      icon="🎯"
                      title="Meta não configurada"
                      description="Cadastre a meta do mês para acompanhar o atingimento de cada pessoa da equipe."
                      action={
                        <Button size="sm" onClick={() => navigate(paths.goals)}>
                          Criar meta
                        </Button>
                      }
                    />
                  ),
                },
              ]}
            />
            )}
          </Card>
        </>
      )}
    </div>
  );

  function abaRanking() {
    return (
      <div className="flex flex-col">
        <BlocoRanking ranking={podio} formatValor={brlCent} />

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-end print:hidden">
          <input
            type="search"
            placeholder="Buscar por nome…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={cn(filtroInputClass, "sm:w-56")}
          />
        </div>

        {/* Desktop */}
        <div className="mt-3 hidden overflow-x-auto md:block">
          {linhasTabela.length === 0 ? (
            <SemResultado temDados={temVendasEquipe} onLimpar={() => setBusca("")} />
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b-2 border-line">
                  <th className="px-3 pb-3 text-left text-[11px] font-bold uppercase tracking-wide text-t2">#</th>
                  <ThSort label="Nome" active={sortKey === "nome"} dir={sortDir} onClick={() => toggleSort("nome")} align="left" />
                  <th className="px-3 pb-3 text-left text-[11px] font-bold uppercase tracking-wide text-t2">Turno</th>
                  <ThSort label="Faturamento" active={sortKey === "faturamento"} dir={sortDir} onClick={() => toggleSort("faturamento")} />
                  <ThSort label="Nº de vendas" active={sortKey === "vendas"} dir={sortDir} onClick={() => toggleSort("vendas")} />
                  <ThSort label="Ticket médio" active={sortKey === "ticketMedio"} dir={sortDir} onClick={() => toggleSort("ticketMedio")} />
                  <ThSort label="P.A." active={sortKey === "pa"} dir={sortDir} onClick={() => toggleSort("pa")} />
                  <ThSort label="Participação" active={sortKey === "participacaoPct"} dir={sortDir} onClick={() => toggleSort("participacaoPct")} />
                  <ThSort label="Variação" active={sortKey === "variacaoPct"} dir={sortDir} onClick={() => toggleSort("variacaoPct")} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const rank = rankPorKey.get(p.key) ?? 0;
                  const turno = partesTurno(p.turno);
                  const loja = view.multiLoja ? rotuloLojas(p.lojas) : null;
                  return (
                    <tr key={p.key} className="border-b border-line hover:bg-bg-3">
                      <td className="px-3 py-2.5 text-center text-[13px] font-extrabold text-t2">{rank + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <AvatarIniciais nome={p.nome} idx={rank} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-t0">{p.nome}</p>
                            {loja &&
                              (p.lojas.length > 1 ? (
                                <Tooltip label={p.lojas.slice(1).join(" · ")}>
                                  <p className="truncate text-[11px] text-t2">{loja}</p>
                                </Tooltip>
                              ) : (
                                <p className="truncate text-[11px] text-t2">{loja}</p>
                              ))}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className={cn("text-[12.5px] font-semibold", p.turno ? "text-t1" : "text-t2")}>{turno.nome}</p>
                        {turno.horario && <p className="text-[11px] text-t2">{turno.horario}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-t0">{brlCent(p.faturamento)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-t1">{num(p.vendas)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-t1">{brlCent(p.ticketMedio)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-t1">{paFmt(p.pa)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-t1">{pctFmt(p.participacaoPct)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <Tooltip label={tipVariacao}>
                          <span>
                            <Variacao v={p.variacaoPct} />
                          </span>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-line bg-bg-inset">
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-[13.5px] font-extrabold text-t0" colSpan={2}>
                    <span className="inline-flex items-center gap-1">
                      Total do filtro
                      <TipHelp label="Soma todas as pessoas encontradas no filtro, inclusive as que não aparecem nesta página." />
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-t2">
                      {num(linhasTabela.length)} {linhasTabela.length === 1 ? "pessoa" : "pessoas"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-[14px] font-extrabold tabular-nums text-t0">{brlCent(totalTabela.faturamento)}</td>
                  <td className="px-3 py-3 text-right text-[13.5px] font-extrabold tabular-nums text-t0">{num(totalTabela.vendas)}</td>
                  <td className="px-3 py-3 text-right text-[13.5px] font-bold tabular-nums text-t1">{brlCent(totalTabela.ticketMedio)}</td>
                  <td className="px-3 py-3 text-right text-[13.5px] font-bold tabular-nums text-t1">{paFmt(totalTabela.pa)}</td>
                  <td className="px-3 py-3 text-right text-[13.5px] font-bold tabular-nums text-t1">{pctFmt(totalTabela.participacaoPct)}</td>
                  <td className="px-3 py-3" />
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile — card por pessoa */}
        <div className="mt-3 flex flex-col gap-2.5 md:hidden">
          {pageRows.length === 0 ? (
            <SemResultado temDados={temVendasEquipe} onLimpar={() => setBusca("")} />
          ) : (
            pageRows.map((p) => {
              const rank = rankPorKey.get(p.key) ?? 0;
              const turno = partesTurno(p.turno);
              const loja = view.multiLoja ? rotuloLojas(p.lojas) : null;
              return (
                <div key={p.key} className="rounded-xl border border-line bg-bg-inset p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AvatarIniciais nome={p.nome} idx={rank} />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-bold text-t0">
                          {rank + 1}. {p.nome}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-t2">
                          {[loja, turno.horario ? `${turno.nome} · ${turno.horario}` : turno.nome].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    {p.variacaoPct != null && (
                      <Tooltip label={tipVariacao}>
                        <div className="shrink-0 text-right">
                          <span className="text-xs">
                            <Variacao v={p.variacaoPct} />
                          </span>
                          <p className="text-[10.5px] text-t2">vs {vsCurto(view.vsVariacao)}</p>
                        </div>
                      </Tooltip>
                    )}
                  </div>
                  <GradeMetricas m={p} className="mt-2.5 border-t border-line pt-2.5" />
                </div>
              );
            })
          )}
          {linhasTabela.length > 0 && (
            <div className="rounded-xl border border-line bg-bg-3 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-t2">Total do filtro</p>
              <p className="mt-0.5 text-[11px] font-semibold text-t2">
                {num(linhasTabela.length)} {linhasTabela.length === 1 ? "pessoa" : "pessoas"}
              </p>
              <GradeMetricas m={totalTabela} className="mt-2" destaque />
            </div>
          )}
        </div>

        {linhasTabela.length > 0 && totalPages > 1 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5 print:hidden">
            <span className="text-[12.5px] text-t2">
              Mostrando {pageRows.length} de {num(linhasTabela.length)} pessoas
            </span>
            <Pagination page={pageSafe} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    );
  }
}

/** Mesmo desenho do gatilho do DateRangePicker (sm). */
function FiltroTurnoTrigger({ rotulo }: { rotulo: string }) {
  return (
    <button
      type="button"
      className="flex h-8 min-w-0 items-center gap-2 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3 text-left transition-colors hover:border-acc"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-t0">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span className="min-w-0 truncate text-xs font-semibold text-t0">{rotulo}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-t2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function SemResultado({ temDados, onLimpar }: { temDados: boolean; onLimpar: () => void }) {
  if (!temDados) return <EmptyBlock />;
  return (
    <EmptyBlock
      icon="🔍"
      title="Nenhuma pessoa encontrada"
      description="Tente buscar por outro nome."
      action={
        <Button variant="outline" size="sm" onClick={onLimpar}>
          Limpar busca
        </Button>
      }
    />
  );
}

type MetricasLinha = Pick<TeamMemberRow, "faturamento" | "vendas" | "ticketMedio" | "pa" | "participacaoPct">;

function GradeMetricas({ m, className, destaque = false }: { m: MetricasLinha; className?: string; destaque?: boolean }) {
  const val = destaque ? "font-extrabold tabular-nums text-t0" : "font-semibold tabular-nums text-t0";
  const rows: { label: string; value: string }[] = [
    { label: "Faturamento", value: brlCent(m.faturamento) },
    { label: "Nº de vendas", value: num(m.vendas) },
    { label: "Ticket médio", value: brlCent(m.ticketMedio) },
    { label: "P.A.", value: paFmt(m.pa) },
    { label: "Participação", value: pctFmt(m.participacaoPct) },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]", className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-2">
          <span className="text-t2">{r.label}</span>
          <span className={val}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
