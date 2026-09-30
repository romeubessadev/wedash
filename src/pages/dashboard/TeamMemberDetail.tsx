import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui";
import { AreaLineChart } from "@/components/charts";
import {
  buildTeamMemberDetail,
  productsFetchRange,
  resolvePeriod,
  TEAM_SEM_TURNO,
  type Scope,
  type TeamAggInput,
  type TeamMemberDetail,
} from "@/data/wedash/dashboard";
import { fetchSalesDayAggs, fetchSalesSellerDayAggs, fetchSellerShifts } from "@/data/wedash/salesRepo";
import { calendarTodayIso } from "@/data/wedash/clock";
import { SALES_SYNCED_EVENT } from "@/pages/dashboard/useForceRefresh";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { DetalheSkeleton, MetricaDetalhe, pctFmt } from "@/pages/dashboard/ProductDetail";
import { brlCent, num, tipRelacao } from "@/lib/format";

/** Tudo o que a tela Equipe lê — também usado pelo detalhe aberto da Visão geral. */
export async function fetchTeamAggInput(tenantId: string, escopo: Scope): Promise<TeamAggInput> {
  const periodo = resolvePeriod(escopo.periodo, calendarTodayIso());
  const range = productsFetchRange(escopo);
  const storeIds = escopo.filialIds;
  const [dayAggs, sellerDayAggs, sellerShifts] = await Promise.all([
    fetchSalesDayAggs({ tenantId, storeIds, from: periodo.inicio, to: periodo.fim, brand: null }),
    fetchSalesSellerDayAggs({ tenantId, storeIds, from: range.from, to: range.to }),
    fetchSellerShifts(tenantId),
  ]);
  return { dayAggs, sellerDayAggs, sellerShifts };
}

type Selecao = { key: string; nome: string };

/**
 * Detalhe de uma pessoa da equipe.
 * Com `data` usa os dados da tela; sem `data` busca os dados da Equipe só ao abrir.
 * `turno` = filtro de turno da tela (participação relativa ao turno, igual à tabela).
 */
export function useTeamMemberDetail({
  escopo,
  data,
  tenantId,
  turno,
}: {
  escopo: Scope;
  data?: TeamAggInput;
  tenantId?: string;
  turno?: string | null;
}): { abrir: (key: string, nome: string) => void; modal: ReactNode } {
  const [sel, setSel] = useState<Selecao | null>(null);
  const abrir = useCallback((key: string, nome: string) => setSel({ key, nome }), []);

  useEffect(() => {
    setSel(null);
  }, [escopo]);

  const [storesTick, setStoresTick] = useState(0);
  useEffect(() => {
    const onStores = () => setStoresTick((n) => n + 1);
    window.addEventListener("wedash:stores", onStores);
    return () => window.removeEventListener("wedash:stores", onStores);
  }, []);

  const lazy = useLazyTeamData(escopo, tenantId, !data && sel != null);
  const fonte = data ?? lazy;

  const detalhe = useMemo(
    () => (sel && fonte ? buildTeamMemberDetail(escopo, fonte, sel.key, { turno }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel, fonte, escopo, turno, storesTick],
  );

  const modal = (
    <TeamMemberDetailModal
      open={sel != null}
      loading={sel != null && !fonte}
      titulo={sel?.nome}
      detalhe={detalhe}
      turnoFiltro={turno ?? null}
      periodo={resolvePeriod(escopo.periodo, calendarTodayIso()).rotulo}
      onClose={() => setSel(null)}
    />
  );
  return { abrir, modal };
}

/** Busca os dados da Equipe na 1ª abertura; mantém até mudar o filtro ou chegar venda nova. */
function useLazyTeamData(escopo: Scope, tenantId: string | undefined, enabled: boolean): TeamAggInput | null {
  const [data, setData] = useState<TeamAggInput | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    gen.current++;
    setData(null);
  }, [escopo, tenantId]);

  useEffect(() => {
    const onSynced = () => {
      gen.current++;
      setData(null);
    };
    window.addEventListener(SALES_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SALES_SYNCED_EVENT, onSynced);
  }, []);

  useEffect(() => {
    if (!enabled || !tenantId || data) return;
    const g = ++gen.current;
    fetchTeamAggInput(tenantId, escopo)
      .then((d) => {
        if (g === gen.current) setData(d);
      })
      .catch((e) => {
        console.error("Team member detail load:", e);
        if (g === gen.current) setData({ dayAggs: [] });
      });
  }, [enabled, tenantId, data, escopo]);

  return data;
}

function TeamMemberDetailModal({
  open,
  loading,
  titulo,
  detalhe,
  turnoFiltro,
  periodo,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  titulo?: string;
  detalhe: TeamMemberDetail | null;
  turnoFiltro: string | null;
  periodo: string;
  onClose: () => void;
}) {
  const cmp = detalhe?.comparativo;
  const turno = detalhe?.turno ?? TEAM_SEM_TURNO;
  const subtitulo = detalhe
    ? [detalhe.lojas.length === 1 ? detalhe.lojas[0] : detalhe.lojas.length > 1 ? `${detalhe.lojas.length} lojas` : "", turno, periodo]
        .filter(Boolean)
        .join(" · ")
    : "";
  const base = turnoFiltro ? `do grupo ${turnoFiltro}` : "da equipe";
  return (
    <Modal open={open} onClose={onClose} title={detalhe?.nome ?? titulo} size="lg">
      {loading ? (
        <DetalheSkeleton />
      ) : !detalhe ? (
        <div className="flex min-h-[220px] flex-col">
          <EmptyBlock />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="-mt-1 text-[12px] font-semibold text-t2">{subtitulo}</p>

          <div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <MetricaDetalhe label="Faturamento" valor={brlCent(detalhe.faturamento)} delta={cmp?.faturamento} />
              <MetricaDetalhe label="Nº de vendas" valor={num(detalhe.vendas)} delta={cmp?.vendas} />
              <MetricaDetalhe label="Ticket médio" valor={brlCent(detalhe.ticketMedio)} delta={cmp?.ticket} />
              <MetricaDetalhe
                label="P.A."
                valor={detalhe.pa == null ? "—" : num(detalhe.pa, 2)}
                delta={cmp?.pa}
                tip="Média de itens por venda."
              />
              <MetricaDetalhe label="Itens vendidos" valor={detalhe.pa == null ? "—" : num(detalhe.itens)} />
              <MetricaDetalhe
                label="Participação"
                valor={pctFmt(detalhe.participacaoPct)}
                tip={`Fatia da pessoa no faturamento ${base} no período.`}
              />
            </div>
            <p className="mt-2.5 text-[11.5px] text-t2">
              {cmp
                ? `Variação ${tipRelacao(cmp.vs).replace(/^Em/, "em")}`
                : "Sem vendas no período anterior para comparar."}
              {detalhe.pa == null && " P.A. e itens ficam em “—” quando algum dia com venda não tem os itens gravados."}
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
        </div>
      )}
    </Modal>
  );
}
