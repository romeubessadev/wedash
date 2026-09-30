import { useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Button, Card, DataTable, EmptyState, Segmented, Select, Skeleton, useToast, type DataTableColumn } from "@/components/ui";
import { SegmentedSkeleton, StoreCardsSkeleton, TeamTableSkeleton } from "@/components/wedash/LoadingSkeletons";
import {
  fetchStoreSellers,
  fetchStoreShifts,
  isActiveSalesPerson,
  setSellerShift,
  syncStoreSellersNow,
  type Store,
  type StoreSeller,
  type StoreShift,
} from "@/data/wedash/stores";
import { shiftName } from "@/lib/format";
import { RefreshIcon, StoreCardHeader, StoreCardsPage, useScopedStores } from "@/pages/operation/shared";

/** Gestão > Colaboradores — equipe de vendas de cada loja (Millennium) e o grupo de cada pessoa. */
export function StaffPage() {
  const { session, lojas, loading } = useScopedStores();
  return (
    <StoreCardsPage
      section="Gestão"
      title="Colaboradores"
      subtitle="Colaboradores de cada loja, sincronizados com o Millennium."
      loading={loading}
      skeleton={(n) => <StoreCardsSkeleton count={n} team wide />}
      lojas={lojas}
      wide
    >
      {(loja) => <StaffCard tenantId={session.tenantId} loja={loja} />}
    </StoreCardsPage>
  );
}

function StaffCard({ tenantId, loja }: { tenantId: string; loja: Store }) {
  const { show } = useToast();
  const [equipe, setEquipe] = useState<StoreSeller[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [shifts, setShifts] = useState<StoreShift[]>([]);
  const [shiftOf, setShiftOf] = useState<Record<string, string | null>>({});
  const [tab, setTab] = useState<"ativos" | "desligados">("ativos");

  useEffect(() => {
    let cancelled = false;
    void fetchStoreSellers(tenantId, [loja.id])
      .then((m) => {
        if (!cancelled) {
          setEquipe(m.get(loja.id) ?? []);
          setShiftOf({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, loja.id, tick]);

  useEffect(() => {
    let cancelled = false;
    void fetchStoreShifts(tenantId, loja.id).then((list) => {
      if (!cancelled) setShifts(list);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, loja.id]);

  const ativos = useMemo(() => equipe.filter(isActiveSalesPerson), [equipe]);
  const desligados = useMemo(() => equipe.filter((s) => !s.active), [equipe]);
  const rows = tab === "ativos" ? ativos : desligados;

  async function atualizar() {
    setSyncing(true);
    const r = await syncStoreSellersNow(loja.id);
    setSyncing(false);
    if (!r.ok) return show(r.message, "danger");
    setTick((n) => n + 1);
    show("Colaboradores atualizados.", "success");
  }

  async function changeShift(sellerId: string, shiftId: string | null) {
    const antes = shiftOf[sellerId];
    setShiftOf((m) => ({ ...m, [sellerId]: shiftId }));
    const r = await setSellerShift(sellerId, shiftId);
    if (r.ok) return;
    setShiftOf((m) => {
      const next = { ...m };
      if (antes === undefined) delete next[sellerId];
      else next[sellerId] = antes;
      return next;
    });
    show("Não foi possível alterar o grupo. Tente novamente.", "danger");
  }

  const columns = useMemo<DataTableColumn<StoreSeller>[]>(
    () => [
      ...SELLER_COLUMNS,
      {
        key: "shift",
        header: "Grupo",
        render: (v) => {
          const atual = v.id in shiftOf ? shiftOf[v.id] : v.shiftId;
          return (
            <Select
              className="h-9! min-w-[150px]"
              value={atual ?? ""}
              disabled={shifts.length === 0}
              onChange={(e) => void changeShift(v.id, e.target.value || null)}
              aria-label={`Grupo de ${v.name}`}
            >
              <option value="">{shifts.length === 0 ? "Cadastre um grupo" : "Sem grupo"}</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {shiftName(s.name)} · {s.start}–{s.end}
                </option>
              ))}
            </Select>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shifts, shiftOf],
  );

  const semEquipe = loaded && equipe.length === 0;
  const refreshButton = (variant: "primary" | "secondary") => (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={() => void atualizar()}
      disabled={syncing}
      title="Busca no Millennium os colaboradores desta loja."
      icon={syncing ? undefined : <RefreshIcon />}
    >
      {syncing ? "Atualizando…" : "Atualizar"}
    </Button>
  );

  return (
    <Card padding="none">
      <StoreCardHeader
        className="mb-0 px-5 pt-5 pb-4"
        loja={loja}
        action={
          !loaded ? (
            <Skeleton className="h-8 w-24 shrink-0 rounded-[var(--radius-vela-sm)]" />
          ) : semEquipe ? undefined : (
            refreshButton("secondary")
          )
        }
      />
      {!loaded ? (
        <div className="px-5 pb-4">
          <SegmentedSkeleton widths={["w-24", "w-32"]} />
        </div>
      ) : !semEquipe && (
        <div className="px-5 pb-4">
          <Segmented
            options={[
              { value: "ativos", label: `Ativos (${ativos.length})` },
              { value: "desligados", label: `Desligados (${desligados.length})` },
            ]}
            value={tab}
            onChange={(v) => v && setTab(v)}
          />
        </div>
      )}
      {!loaded ? (
        <TeamTableSkeleton withShift={tab === "ativos"} />
      ) : rows.length === 0 ? (
        <EmptyState
          framed={false}
          className="pt-4!"
          icon="👥"
          title={semEquipe || tab === "ativos" ? "Nenhum colaborador ativo" : "Nenhum colaborador desligado"}
          description={
            semEquipe || tab === "ativos"
              ? "Os colaboradores vêm do Millennium. Use Atualizar para buscar os colaboradores desta loja."
              : "Colaboradores desativados no Millennium aparecem aqui."
          }
          action={semEquipe ? refreshButton("primary") : undefined}
        />
      ) : (
        <DataTable
          className="rounded-none! border-x-0! border-b-0! bg-transparent!"
          columns={tab === "ativos" ? columns : SELLER_COLUMNS}
          data={rows}
          rowKey={(v) => v.id}
          paginate="pessoas"
        />
      )}
    </Card>
  );
}

const SELLER_COLUMNS: DataTableColumn<StoreSeller>[] = [
  {
    key: "seller",
    header: "Nome",
    render: (v) => (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={v.name} />
        <span className="truncate text-[13.5px] font-bold text-t0">{v.name}</span>
      </div>
    ),
  },
  {
    key: "code",
    header: "Código no Millennium",
    render: (v) => <span className="tabular-nums text-t1">{v.code || "—"}</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (v) => (v.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="neutral">Desligado</Badge>),
  },
];

export default StaffPage;
