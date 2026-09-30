import { Avatar, Badge, CardTitle, EmptyState, ProgressBar } from "@/components/ui";
import { DonutChart } from "@/components/charts";
import { brlK, num } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { RankingRow, StoreRankingRow } from "@/data/wedash/live";
import type { SellerRow } from "@/data/wedash/teamViews";
/** Medalhas do leaderboard Vela (SalesDashboard / CRM) — anel, troféu e rótulos. */
const MEDALHA = {
  1: { cor: "#f7b84e", glow: "0 0 32px rgba(247,184,78,0.4)" },
  2: { cor: "#c7cdd6", glow: "none" },
  3: { cor: "#d99a5c", glow: "none" },
} as const;

const PODIO_ALTURA: Record<1 | 2 | 3, string> = {
  1: "h-44 sm:h-48",
  2: "h-36 sm:h-40",
  3: "h-28 sm:h-32",
};

/** Ordem visual do pódio: 2º | 1º | 3º */
const PODIO_ORDEM = [1, 0, 2] as const;

const MEDALHA_EMOJI: Record<1 | 2 | 3, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function MedalhaBadge({ pos, apagada = false }: { pos: 1 | 2 | 3; apagada?: boolean }) {
  return (
    <span
      className={cn(
        "absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg-2 bg-bg-2 text-[20px] leading-none",
        apagada && "opacity-40 grayscale",
      )}
      aria-hidden
    >
      {MEDALHA_EMOJI[pos]}
    </span>
  );
}

/** Pódio top 3 — aba Ranking (ouro / prata / bronze; degrau na cor primária). */
export function BlocoRanking({
  ranking,
  formatValor = brlK,
  onSelect,
}: {
  ranking: RankingRow[];
  formatValor?: (v: number) => string;
  onSelect?: (row: RankingRow) => void;
}) {
  if (ranking.length === 0) {
    return (
      <EmptyState
        title="Nenhuma venda no mês"
        description="Lance vendas para ver o ranking ao vivo da competência."
      />
    );
  }

  const top3 = ranking.slice(0, 3);

  return (
    <div className="flex items-end justify-center gap-2.5 pt-3 sm:gap-6">
      {PODIO_ORDEM.map((i) => {
        const pos = (i + 1) as 1 | 2 | 3;
        const medal = MEDALHA[pos];
        const isOuro = pos === 1;
        const l = top3[i];
        if (!l) {
          return (
            <div
              key={`vazio-${pos}`}
              className={cn("flex flex-col items-center text-center", isOuro ? "w-[34%] max-w-[168px]" : "w-[30%] max-w-[148px]")}
            >
              <div className="relative mb-2.5">
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-full border-2 border-dashed border-line text-t3",
                    isOuro ? "h-20 w-20" : "h-16 w-16",
                  )}
                >
                  —
                </span>
                <MedalhaBadge pos={pos} apagada />
              </div>
              <p className="text-[13px] font-bold text-t2 sm:text-[14px]">Sem {pos}º colocado</p>
              <p className="mt-0.5 text-[11px] font-semibold text-t3">Nenhuma venda</p>
              <p className="mt-0.5 font-mono text-[13px] font-extrabold text-t3 sm:text-[14px]">—</p>
              <div
                className={cn("mt-3 flex w-full items-end justify-center rounded-t-2xl", PODIO_ALTURA[pos])}
                style={{ background: "color-mix(in srgb, var(--acc) 16%, transparent)" }}
              >
                <span className="pb-3 text-[24px] font-extrabold leading-none text-t3 sm:text-[28px]">{pos}º</span>
              </div>
            </div>
          );
        }
        return (
          <div
            key={l.colaboradorId}
            {...(onSelect
              ? {
                  role: "button",
                  tabIndex: 0,
                  onClick: () => onSelect(l),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(l);
                    }
                  },
                }
              : {})}
            className={cn(
              "flex flex-col items-center text-center",
              isOuro ? "w-[34%] max-w-[168px]" : "w-[30%] max-w-[148px]",
              onSelect && "cursor-pointer rounded-2xl transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-acc",
            )}
          >
            <div className="relative mb-2.5">
              <span
                className="relative inline-flex rounded-full"
                style={{
                  boxShadow: `0 0 0 3px ${medal.cor}${isOuro ? `, ${medal.glow}` : ""}`,
                }}
              >
                <Avatar size={isOuro ? "2xl" : "xl"} name={l.nome} />
              </span>
              <MedalhaBadge pos={pos} />
            </div>

            <p className="truncate text-[13px] font-bold text-t0 sm:text-[14px]">{l.nome.split(" ")[0]}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-t2">{num(l.vendas)} vendas</p>
            <p className="mt-0.5 font-mono text-[13px] font-extrabold sm:text-[14px]" style={{ color: medal.cor }}>
              {formatValor(l.faturamento)}
            </p>

            <div
              className={cn(
                "mt-3 flex w-full items-end justify-center rounded-t-2xl",
                PODIO_ALTURA[pos],
              )}
              style={{
                background: "color-mix(in srgb, var(--acc) 48%, transparent)",
                boxShadow: isOuro ? "0 8px 28px color-mix(in srgb, var(--acc) 35%, transparent)" : undefined,
              }}
            >
              <span
                className="pb-3 text-[24px] font-extrabold leading-none sm:text-[28px]"
                style={{ color: medal.cor }}
              >
                {pos}º
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CORES_LOJAS = ["var(--acc)", "var(--info)", "var(--ok)", "var(--warn)", "var(--bad)"];

/** Donut + lista por loja — mesmo card da Visão Geral. */
export function BlocoRankingLojas({ lojas }: { lojas: StoreRankingRow[] }) {
  const total = lojas.reduce((s, l) => s + l.valor, 0) || 1;
  return (
    <>
      <div className="mb-1 flex shrink-0 items-center justify-between">
        <CardTitle>Ranking de lojas</CardTitle>
        {lojas.length > 0 && <Badge variant="accent">Rede {brlK(total)}</Badge>}
      </div>
      {lojas.length === 0 ? (
        <span className="py-6 text-center text-[12px] text-t2">Sem dados para este mês.</span>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
          <div className="flex flex-col items-center justify-center">
            <DonutChart
              segments={lojas.map((l, i) => ({
                label: l.nome,
                value: l.valor,
                color: CORES_LOJAS[i % CORES_LOJAS.length],
              }))}
              size={148}
              thickness={20}
              centerLabel="Total"
              centerValue={brlK(total)}
            />
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {lojas.map((loja, idx) => {
              const pctMeta = loja.pctMeta != null ? Math.round(loja.pctMeta) : 0;
              const cor = CORES_LOJAS[idx % CORES_LOJAS.length];
              return (
                <div key={loja.id} className="rounded-xl bg-bg-inset p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[13px] font-bold text-t0">
                      <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: cor }} />
                      {loja.nome}
                    </span>
                    <span className="font-mono text-[13px] font-extrabold text-t0">{brlK(loja.valor)}</span>
                  </div>
                  <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-bg-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pctMeta)}%`, background: cor }} />
                  </div>
                  <span className="text-[11px] font-semibold text-t2">{pctMeta}% da meta</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/** Lista completa — mesmo padrão do Top Vendedoras (Visão Geral). */
export function BlocoRankingGeral({
  ranking,
  vendedoras,
}: {
  ranking: RankingRow[];
  vendedoras?: SellerRow[] | null;
}) {
  if (ranking.length === 0) {
    return (
      <EmptyState
        title="Nenhuma venda registrada neste mês."
        description="O ranking aparecerá após o registro das primeiras vendas."
      />
    );
  }

  const metaPorId = new Map((vendedoras ?? []).map((v) => [v.colaboradorId, v]));

  return (
    <div className="flex flex-col gap-4">
      {ranking.map((l) => {
        const medal = l.posicao <= 3 ? MEDALHA[l.posicao as 1 | 2 | 3] : null;
        const eq = metaPorId.get(l.colaboradorId);
        const pct = eq?.atingimentoPct ?? 0;
        const ticket = eq?.ticketValor ?? (l.vendas > 0 ? l.faturamento / l.vendas : 0);
        const barra = Math.min(100, pct);
        return (
          <div key={l.colaboradorId} className="flex items-center gap-3">
            <span
              className="w-5 text-center text-sm font-extrabold"
              style={{ color: medal?.cor ?? "var(--t1)" }}
            >
              {l.posicao}
            </span>
            <Avatar name={l.nome} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-bold text-t0">{l.nome}</span>
                <span className="shrink-0 font-mono text-[13px] font-extrabold text-ok">{brlK(l.faturamento)}</span>
              </div>
              <ProgressBar value={barra} height={5} />
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-t2">
                <span>{num(l.vendas)} vendas</span>
                {ticket > 0 && (
                  <>
                    <span>·</span>
                    <span>Ticket médio {brlK(ticket)}</span>
                  </>
                )}
                {eq && eq.metaIndividualValor > 0 && (
                  <>
                    <span>·</span>
                    <span className={pct >= 100 ? "font-semibold text-ok" : ""}>
                      {Math.round(pct)}% da meta
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
