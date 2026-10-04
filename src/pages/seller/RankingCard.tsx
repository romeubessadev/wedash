import { Avatar, Card } from "@/components/ui";
import { BlocoRanking } from "@/pages/live/blocos";
import { num } from "@/data/wedash/engine/format";
import type { RankingRow } from "@/data/wedash/live";
import type { SellerHomeStore } from "@/data/wedash/engine/sellerHome";

const pct = (v: number) => `${num(v, 1)}%`;

/** Ranking da loja por % da meta: pódio dos 3 primeiros e lista do resto, sem R$. */
export function RankingCard({ store }: { store: SellerHomeStore }) {
  const ranking = store.goal?.ranking ?? [];
  if (ranking.length === 0) return null;
  const me = ranking.find((r) => r.me);
  const podium: RankingRow[] = ranking.slice(0, 3).map((r) => ({
    posicao: r.position,
    colaboradorId: r.me ? "me" : `p${r.position}`,
    nome: r.me ? "VOCÊ" : r.name,
    vendas: 0,
    faturamento: r.pct,
  }));
  const rest = ranking.slice(3);
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold text-t0">Ranking · {store.storeName}</h2>
        {me && <span className="text-[12.5px] font-semibold text-t2">Você: {me.position}º de {ranking.length}</span>}
      </div>
      {store.goal?.gapPp != null && store.goal.abovePosition != null && (
        <p className="mb-2 text-[12.5px] text-t1">
          Faltam {num(store.goal.gapPp, 1)} p.p. para o {store.goal.abovePosition}º lugar
        </p>
      )}
      <BlocoRanking ranking={podium} formatValor={pct} />
      {rest.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {rest.map((r) => (
            <li key={`${r.position}-${r.name}`} className="flex items-center gap-3 py-2">
              <span className="w-7 text-right font-mono text-[13px] font-bold text-t2">{r.position}º</span>
              <Avatar name={r.me ? "Você" : r.name} size="sm" />
              <span className={`min-w-0 flex-1 truncate text-[13.5px] ${r.me ? "font-extrabold text-acc" : "font-semibold text-t0"}`}>
                {r.me ? "VOCÊ" : r.name}
              </span>
              <span className="text-[12px] text-t2">{r.level ?? "—"}</span>
              <span className="w-14 text-right font-mono text-[13px] font-bold text-t0">{pct(r.pct)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
