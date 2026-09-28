import { StoreCardsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { CostFieldsCard, type CostField } from "./costFields";
import { StoreCardsPage, useScopedStores } from "./shared";

/** Aluguel % vale para a loja toda: grava igual nas duas marcas. */
const RENT_FIELDS: CostField[] = [
  {
    key: "rentMin",
    label: "Aluguel",
    hint: "Valor mensal.",
    unit: "R$",
    get: (c) => c.rentMin,
    set: (c, v) => ({ ...c, rentMin: v }),
  },
  {
    key: "rentPct",
    label: "Aluguel percentual",
    hint: "Sobre o faturamento total. Vazio se a loja não paga percentual (ex.: loja de rua).",
    unit: "%",
    get: (c) => c.rentWepinkPct ?? c.rentWpinkPct,
    set: (c, v) => ({ ...c, rentWepinkPct: v, rentWpinkPct: v }),
  },
];

/** Configurações > Aluguel — aluguel mensal e percentual do faturamento (paga-se o que passar do aluguel). */
export function RentPage() {
  const { lojas, loading, refresh } = useScopedStores();
  return (
    <StoreCardsPage
      section="Configurações"
      title="Aluguel"
      subtitle="Quando o percentual sobre o faturamento passa do aluguel, a diferença entra como aluguel extra. Ex.: aluguel de R$ 10.000 e 10% sobre R$ 120.000 vendidos = R$ 2.000 a mais."
      loading={loading}
      skeleton={(n) => <StoreCardsSkeleton count={n} fields={2} />}
      lojas={lojas}
    >
      {(loja) => <CostFieldsCard loja={loja} fields={RENT_FIELDS} onSaved={refresh} />}
    </StoreCardsPage>
  );
}

export default RentPage;
