import { StoreCardsSkeleton } from "@/components/wedash/LoadingSkeletons";
import type { Store } from "@/data/wedash/stores";
import { CostFieldsCard, pctField, type CostField } from "./costFields";
import { StoreCardsPage, useScopedStores } from "./shared";

/** WPINK só aparece para loja que vende a marca. */
function franchiseFields(loja: Store): CostField[] {
  const hint = "Sobre o faturamento da marca";
  return [
    pctField("royaltiesWepinkPct", "Royalties WEPINK", hint),
    pctField("marketingWepinkPct", "Taxa de marketing WEPINK", hint),
    ...(loja.temWpink
      ? [pctField("royaltiesWpinkPct", "Royalties WPINK", hint), pctField("marketingWpinkPct", "Taxa de marketing WPINK", hint)]
      : []),
  ];
}

/** Configurações da operação > Franquia — royalties e taxa de marketing por marca. */
export function FranchisePage() {
  const { lojas, loading, refresh } = useScopedStores();
  return (
    <StoreCardsPage
      section="Configurações da operação"
      title="Franquia"
      subtitle="Royalties e taxa de marketing pagos à franqueadora"
      loading={loading}
      skeleton={<StoreCardsSkeleton fields={2} />}
      lojas={lojas}
    >
      {(loja) => <CostFieldsCard loja={loja} fields={franchiseFields(loja)} onSaved={refresh} />}
    </StoreCardsPage>
  );
}

export default FranchisePage;
