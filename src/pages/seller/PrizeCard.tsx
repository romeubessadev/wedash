import { Badge, Card } from "@/components/ui";
import { GoalLevelsBar } from "@/components/wedash/GoalLevelsBar";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { brlCent } from "@/data/wedash/engine/format";
import { dataCurta } from "@/lib/format";
import type { SellerHomeStore } from "@/data/wedash/engine/sellerHome";

type Goal = NonNullable<SellerHomeStore["goal"]>;

/** Premiação do vendedor numa loja: até agora, nível, barra, falta, ao chegar e projeção. */
export function PrizeCard({ store }: { store: SellerHomeStore }) {
  const goal = store.goal;
  return (
    <Card className="flex flex-col">
      <h2 className="text-[15px] font-bold text-t0">{store.storeName}</h2>
      {!goal ? (
        <EmptyBlock icon="🎯" title="Meta não configurada" description="Quando a meta da loja for cadastrada, ela aparece aqui." />
      ) : !goal.me ? (
        <p className="py-6 text-center text-[13.5px] text-t1">
          Você ainda não está em nenhum grupo desta meta. Fale com a gerência da loja.
        </p>
      ) : (
        <PrizeBody goal={goal} me={goal.me} />
      )}
    </Card>
  );
}

function PrizeBody({ goal, me }: { goal: Goal; me: NonNullable<Goal["me"]> }) {
  const nivel = me.nivelNumero != null && me.nivel ? `N${me.nivelNumero} · ${me.nivel}` : null;
  const proximo = me.proximo ? `N${me.proximo.numero} · ${me.proximo.nome}` : null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-t2">Sua premiação até agora</p>
          <p className="font-mono text-[26px] font-extrabold text-t0">{brlCent(me.premiacao + me.bonus)}</p>
        </div>
        {nivel && <Badge variant="accent">{nivel}</Badge>}
      </div>
      <div className="overflow-x-auto">
        <GoalLevelsBar pct={me.atingimentoPct} marcos={me.marcos} completo />
      </div>
      {proximo ? (
        <div className="flex flex-col gap-1 text-[13px] text-t1">
          <p>Faltam {brlCent(me.proximo!.falta)} para {proximo}</p>
          {goal.nextLevelGain != null && <p>Ao chegar: +{brlCent(goal.nextLevelGain)} de premiação</p>}
        </div>
      ) : (
        <p className="text-[13px] font-semibold text-ok">Você chegou ao último nível da meta.</p>
      )}
      {goal.projectedPrize != null && (
        <p className="text-[12.5px] text-t2">
          Se mantiver o ritmo: {brlCent(goal.projectedPrize)} até {dataCurta(goal.endsOn)} (estimativa)
        </p>
      )}
    </div>
  );
}
