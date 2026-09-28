import { StoreCardsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { CostFieldsCard, type CostField } from "./costFields";
import { StoreCardsPage, useScopedStores } from "./shared";

/** Aluguel % vale para a loja toda: grava igual nas duas marcas. */
const RENT_FIELDS: CostField[] = [
  {
    key: "rentMin",
    label: "Aluguel mínimo",
    hint: "Valor mensal.",
    unit: "R$",
    get: (c) => c.rentMin,
    set: (c, v) => ({ ...c, rentMin: v }),
  },
  {
    key: "rentPct",
    label: "Aluguel percentual",
    hint: "Percentual sobre o faturamento total.",
    unit: "%",
    get: (c) => c.rentWepinkPct ?? c.rentWpinkPct,
    set: (c, v) => ({ ...c, rentWepinkPct: v, rentWpinkPct: v }),
  },
];

/** Configurações da operação > Aluguel — mínimo mensal e percentual do faturamento. */
export function RentPage() {
  const { lojas, loading, refresh } = useScopedStores();
  return (
    <StoreCardsPage
      section="Configurações da operação"
      title="Aluguel"
      subtitle="A WeDash considera o maior valor entre o aluguel mínimo e o percentual sobre o faturamento."
      loading={loading}
      skeleton={(n) => <StoreCardsSkeleton count={n} fields={2} />}
      lojas={lojas}
    >
      {(loja) => <CostFieldsCard loja={loja} fields={RENT_FIELDS} onSaved={refresh} />}
    </StoreCardsPage>
  );
}

export default RentPage;
