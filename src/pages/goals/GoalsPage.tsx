import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AvatarGroup, Badge, Button, Card, DateRangePicker, Modal, ProgressBar, progressTextClass, useToast } from "@/components/ui";
import type { DateRange, DateRangeChangeMeta } from "@/components/ui/DateRangePicker";
import { GoalCardsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { calendarTodayIso } from "@/data/wedash/clock";
import { resolvePeriod } from "@/data/wedash/dashboard";
import { buildGoalSummary, GOAL_STATUS_LABEL, goalTeamNames, type GoalStatus, type GoalSummary } from "@/data/wedash/goalView";
import { deleteGoal, fetchGoalTeam, fetchGoals, type GoalRecord, type GoalTeamMember } from "@/data/wedash/goalsRepo";
import { fetchSalesDayAggs } from "@/data/wedash/salesRepo";
import type { SalesDayAgg } from "@/data/wedash/salesTypes";
import type { Store } from "@/data/wedash/stores";
import { brlCent, dataCompleta, fimDoMes, num, paraIso, rotuloDias, deIso } from "@/lib/format";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { applyPeriodDateChange, dateRangeFromPeriod, periodActivePresetId, periodDisplayLabel } from "@/pages/dashboard/periodPicker";
import { SALES_SYNCED_EVENT } from "@/pages/dashboard/useForceRefresh";
import { useScope } from "@/pages/dashboard/useScope";
import { TargetIcon } from "@/pages/dashboards/icons";
import { SectionHeader, useScopedStores } from "@/pages/operation/shared";
import { Icon, icons } from "@/pages/users/Icons";
import { paths } from "@/router/paths";

const STATUS_ORDER: Record<GoalStatus, number> = { active: 0, upcoming: 1, ended: 2 };
const STATUS_VARIANT: Record<GoalStatus, "success" | "info" | "neutral"> = { active: "success", upcoming: "info", ended: "neutral" };

type Loaded = { goals: GoalRecord[]; dayAggs: SalesDayAgg[]; team: GoalTeamMember[] };

/** Metas podem ser cadastradas para frente: o calendário vai até o fim do mês daqui a 12 meses. */
function maxPickerDate(today: string): Date {
  const d = deIso(today);
  return deIso(fimDoMes(paraIso(new Date(d.getFullYear(), d.getMonth() + 12, 1))));
}

/** Gestão > Metas — 1 card por meta (loja do StorePicker × período do filtro). */
export default function GoalsPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const { session, lojas, loading: lojasLoading } = useScopedStores();
  const { escopo, mudar } = useScope();
  const today = calendarTodayIso();
  const periodo = resolvePeriod(escopo.periodo, today);
  const storeIds = useMemo(() => lojas.map((l) => l.id), [lojas]);
  const storeKey = storeIds.join(",");

  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [confirmar, setConfirmar] = useState<GoalRecord | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    const onSync = () => setReload((n) => n + 1);
    window.addEventListener(SALES_SYNCED_EVENT, onSync);
    return () => window.removeEventListener(SALES_SYNCED_EVENT, onSync);
  }, []);

  useEffect(() => {
    if (lojasLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const goals = await fetchGoals({ tenantId: session.tenantId, storeIds, from: periodo.inicio, to: periodo.fim });
      let dayAggs: SalesDayAgg[] = [];
      let team: GoalTeamMember[] = [];
      if (goals.length > 0) {
        const goalStores = [...new Set(goals.map((g) => g.storeId))];
        const from = goals.reduce((m, g) => (g.startsOn < m ? g.startsOn : m), goals[0].startsOn);
        const lastEnd = goals.reduce((m, g) => (g.endsOn > m ? g.endsOn : m), goals[0].endsOn);
        const to = lastEnd < today ? lastEnd : today;
        [dayAggs, team] = await Promise.all([
          from <= to
            ? fetchSalesDayAggs({ tenantId: session.tenantId, storeIds: goalStores, from, to, brand: "ALL" })
            : Promise.resolve([]),
          fetchGoalTeam(session.tenantId, goalStores),
        ]);
      }
      if (!cancelled) {
        setData({ goals, dayAggs, team });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, storeKey, periodo.inicio, periodo.fim, lojasLoading, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const showSkeleton = useMinSkeleton(loading || lojasLoading);

  const cards = useMemo(() => {
    if (!data) return [];
    const byId = new Map(lojas.map((l) => [l.id, l]));
    return data.goals
      .map((g) => ({
        summary: buildGoalSummary(g, data.dayAggs, today),
        loja: byId.get(g.storeId),
        equipe: goalTeamNames(g.storeId, data.team),
      }))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.summary.status] - STATUS_ORDER[b.summary.status] ||
          b.summary.goal.startsOn.localeCompare(a.summary.goal.startsOn) ||
          (a.loja?.fantasia ?? "").localeCompare(b.loja?.fantasia ?? "", "pt-BR"),
      );
  }, [data, lojas, today]);

  const dateRange = useMemo(() => dateRangeFromPeriod(escopo.periodo), [escopo.periodo]);
  function onDateChange(r: DateRange, meta?: DateRangeChangeMeta) {
    mudar(applyPeriodDateChange(escopo, r, meta));
  }

  async function excluir() {
    if (!confirmar) return;
    setExcluindo(true);
    const res = await deleteGoal(session.tenantId, confirmar.id);
    setExcluindo(false);
    if (!res.ok) {
      show("Não foi possível excluir a meta. Tente novamente.", "danger");
      return;
    }
    setConfirmar(null);
    show("Meta excluída.", "success");
    setReload((n) => n + 1);
  }

  return (
    <div>
      <SectionHeader
        section="Gestão"
        title="Metas"
        subtitle="Gerencie metas mensais, níveis de premiação e distribuição individual."
        actions={
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <DateRangePicker
              value={dateRange}
              onChange={onDateChange}
              displayLabel={periodDisplayLabel(escopo.periodo)}
              activePresetId={periodActivePresetId(escopo.periodo)}
              maxDate={maxPickerDate(today)}
            />
            <Button icon={<Icon d={icons.plus} size={14} />} onClick={() => navigate(paths.goalNew)}>
              Nova meta
            </Button>
          </div>
        }
      />

      <div className="mt-6">
        {showSkeleton ? (
          <GoalCardsSkeleton count={3} />
        ) : cards.length === 0 ? (
          <Card className="flex min-h-[280px] flex-col">
            <EmptyBlock
              icon="🎯"
              title="Nenhuma meta no período"
              description="Cadastre a meta da loja para acompanhar o atingimento e a premiação da equipe."
              action={
                <Button size="sm" onClick={() => navigate(paths.goalNew)}>
                  Criar meta
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ summary, loja, equipe }) => (
              <GoalCard
                key={summary.goal.id}
                summary={summary}
                loja={loja}
                mostraLoja={lojas.length > 1}
                equipe={equipe}
                onDetail={() => navigate(paths.goalDetail(summary.goal.id))}
                onEdit={() => navigate(paths.goalEdit(summary.goal.id))}
                onDelete={() => setConfirmar(summary.goal)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={confirmar !== null}
        onClose={() => !excluindo && setConfirmar(null)}
        title="Excluir meta?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmar(null)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void excluir()} disabled={excluindo}>
              {excluindo ? "Excluindo…" : "Excluir meta"}
            </Button>
          </>
        }
      >
        {confirmar && (
          <p className="text-[13px] leading-relaxed text-t1">
            A meta <span className="font-bold text-t0">{confirmar.name}</span> ({dataCompleta(confirmar.startsOn)} a {dataCompleta(confirmar.endsOn)}) será
            excluída. Essa ação não pode ser desfeita.
          </p>
        )}
      </Modal>
    </div>
  );
}

function GoalCard({
  summary,
  loja,
  mostraLoja,
  equipe,
  onDetail,
  onEdit,
  onDelete,
}: {
  summary: GoalSummary;
  loja: Store | undefined;
  mostraLoja: boolean;
  equipe: string[];
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { goal: g, status, realizado, pct, projetadoPct, diasRestantes, nivelAtual } = summary;
  const periodo = `${dataCompleta(g.startsOn)} a ${dataCompleta(g.endsOn)}`;
  const rodape =
    status === "active"
      ? [projetadoPct != null ? `Projeção: ${num(projetadoPct, 0)}%` : null, `${diasRestantes === 1 ? "falta" : "faltam"} ${rotuloDias(diasRestantes)}`]
          .filter(Boolean)
          .join(" · ")
      : status === "upcoming"
        ? `Começa em ${dataCompleta(g.startsOn)}`
        : nivelAtual
          ? `Fechou no nível ${nivelAtual}`
          : "Fechou sem atingir nível";

  return (
    <Card className="flex flex-col">
      <div className="mb-3.5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-acc-soft text-acc">
          <TargetIcon size={20} />
        </span>
        <button type="button" onClick={onDetail} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[15px] font-bold text-t0">{g.name}</p>
          <p className="mt-0.5 truncate text-xs text-t2">
            {periodo}
            {mostraLoja && loja ? ` · ${loja.fantasia}` : ""}
          </p>
        </button>
        <Badge variant={STATUS_VARIANT[status]} className="shrink-0 self-start">
          {GOAL_STATUS_LABEL[status]}
        </Badge>
      </div>

      <p className="text-[10.5px] font-bold uppercase tracking-wide text-t2">Meta da loja</p>
      <p className="mt-0.5 font-mono text-[17px] font-extrabold text-t0">{brlCent(g.target)}</p>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="text-[12px] text-t1">
          {status === "upcoming" ? (
            "Ainda não começou"
          ) : (
            <>
              <span className="font-mono font-bold text-t0">{brlCent(realizado)}</span> realizado
            </>
          )}
        </p>
        {status !== "upcoming" && <p className={`font-mono text-[14px] font-extrabold ${progressTextClass(pct)}`}>{num(pct, 1)}%</p>}
      </div>
      <div className="mt-1.5">
        <ProgressBar value={status === "upcoming" ? 0 : pct} height={6} />
      </div>
      <p className="mt-1.5 text-[11.5px] text-t2">{rodape}</p>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        <Badge variant="neutral">{g.tierMode === "INDIVIDUAL" ? "Individual" : "Grupo"}</Badge>
        <Badge variant="neutral">
          {g.tiers.length} {g.tiers.length === 1 ? "nível" : "níveis"}
        </Badge>
        <Badge variant="neutral">{equipe.length} na equipe</Badge>
      </div>

      <div className="flex-1" />
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
        {equipe.length > 0 ? <AvatarGroup names={equipe} max={3} /> : <span className="text-xs text-t2">Sem equipe</span>}
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Excluir meta" icon={<Icon d={icons.trash} size={14} />} />
          <Button variant="outline" size="sm" onClick={onEdit}>
            Editar
          </Button>
          <Button variant="outline" size="sm" onClick={onDetail}>
            Ver detalhe
          </Button>
        </div>
      </div>
    </Card>
  );
}
