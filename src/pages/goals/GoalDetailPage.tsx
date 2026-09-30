import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Breadcrumbs, Button, Card } from "@/components/ui";
import { GoalDetailSkeleton } from "@/components/wedash/LoadingSkeletons";
import { calendarTodayIso } from "@/data/wedash/clock";
import { buildGoalCardView, GOAL_STATUS_LABEL, goalStatus } from "@/data/wedash/goalView";
import { fetchGoal, fetchGoalTeam, type GoalRecord, type GoalTeamMember } from "@/data/wedash/goalsRepo";
import { fetchSalesDayAggs, fetchSalesSellerDayAggs } from "@/data/wedash/salesRepo";
import type { SalesDayAgg, SalesSellerDayAgg } from "@/data/wedash/salesTypes";
import { storesForSession } from "@/data/wedash/stores";
import { dataCompleta } from "@/lib/format";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { SALES_SYNCED_EVENT } from "@/pages/dashboard/useForceRefresh";
import { CardMeta } from "@/pages/team/blocos";
import { Icon, icons } from "@/pages/users/Icons";
import { paths } from "@/router/paths";
import { useActiveSession } from "@/session/SessionProvider";

type Loaded = { goal: GoalRecord | null; dayAggs: SalesDayAgg[]; sellerAggs: SalesSellerDayAgg[]; team: GoalTeamMember[] };

/** Gestão > Metas > detalhe — desempenho da meta (faixa da loja + escada por pessoa). */
export default function GoalDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const session = useActiveSession();
  const today = calendarTodayIso();
  const [data, setData] = useState<Loaded | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const onSync = () => setReload((n) => n + 1);
    window.addEventListener(SALES_SYNCED_EVENT, onSync);
    return () => window.removeEventListener(SALES_SYNCED_EVENT, onSync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const goal = await fetchGoal(session.tenantId, id);
      let dayAggs: SalesDayAgg[] = [];
      let sellerAggs: SalesSellerDayAgg[] = [];
      let team: GoalTeamMember[] = [];
      if (goal) {
        const to = goal.endsOn < today ? goal.endsOn : today;
        const query = { tenantId: session.tenantId, storeIds: [goal.storeId], from: goal.startsOn, to };
        [dayAggs, sellerAggs, team] = await Promise.all([
          goal.startsOn <= to ? fetchSalesDayAggs({ ...query, brand: "ALL" }) : Promise.resolve([]),
          goal.startsOn <= to ? fetchSalesSellerDayAggs(query) : Promise.resolve([]),
          fetchGoalTeam(session.tenantId, [goal.storeId]),
        ]);
      }
      if (!cancelled) setData({ goal, dayAggs, sellerAggs, team });
    })();
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, id, today, reload]);

  const showSkeleton = useMinSkeleton(data === null);
  const goal = data?.goal ?? null;
  const loja = useMemo(() => (goal ? storesForSession(session.stores).find((s) => s.id === goal.storeId) : undefined), [goal, session.stores]);

  const card = useMemo(() => {
    if (!data?.goal) return null;
    return buildGoalCardView({
      goal: data.goal,
      lojaNome: loja?.fantasia ?? "Loja",
      dayAggs: data.dayAggs,
      sellerDayAggs: data.sellerAggs,
      team: data.team,
      today,
    });
  }, [data, loja, today]);

  const status = goal ? goalStatus(goal, today) : null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" icon={<Icon d={icons.arrowLeft} size={14} />} onClick={() => navigate(paths.goals)}>
          Voltar
        </Button>
        <Breadcrumbs items={[{ label: "Gestão" }, { label: "Metas", to: paths.goals }, { label: goal?.name ?? "Detalhe" }]} />
      </div>

      {showSkeleton ? (
        <GoalDetailSkeleton />
      ) : !goal || !card ? (
        <Card className="flex min-h-[280px] flex-col">
          <EmptyBlock
            icon="🔍"
            title="Meta não encontrada"
            description="A meta pode ter sido excluída ou não pertence às suas lojas."
            action={
              <Button size="sm" variant="outline" onClick={() => navigate(paths.goals)}>
                Ver metas
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-extrabold tracking-tight text-t0">{goal.name}</h1>
                {status && <Badge variant={status === "active" ? "success" : status === "upcoming" ? "info" : "neutral"}>{GOAL_STATUS_LABEL[status]}</Badge>}
              </div>
              <p className="mt-1 text-[13px] text-t2">
                {dataCompleta(goal.startsOn)} a {dataCompleta(goal.endsOn)}
                {loja ? ` · ${loja.fantasia}` : ""}
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate(paths.goalEdit(goal.id))}>
              Editar meta
            </Button>
          </div>
          <CardMeta card={card} metaAtiva hojeIso={today} />
        </>
      )}
    </div>
  );
}
