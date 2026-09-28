import { StoreCardsSkeleton } from "@/components/wedash/LoadingSkeletons";
import type { Store } from "@/data/wedash/stores";
import { CostFieldsCard, pctField, type CostField } from "./costFields";
import { StoreCardsPage, useScopedStores } from "./shared";

/** WPINK só aparece para loja que vende a marca. */
function franchiseFields(loja: Store): CostField[] {
  const wepink = "Percentual sobre o faturamento WEPINK.";
  const wpink = "Percentual sobre o faturamento WPINK.";
  return [
    pctField("royaltiesWepinkPct", "Royalties WEPINK", wepink),
    pctField("marketingWepinkPct", "Taxa de marketing WEPINK", wepink),
    ...(loja.temWpink
      ? [pctField("royaltiesWpinkPct", "Royalties WPINK", wpink), pctField("marketingWpinkPct", "Taxa de marketing WPINK", wpink)]
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
      subtitle="Configure royalties e taxa de marketing pagos à franqueadora."
      loading={loading}
      skeleton={(n) => <StoreCardsSkeleton count={n} fields={2} />}
      lojas={lojas}
    >
      {(loja) => <CostFieldsCard loja={loja} fields={franchiseFields(loja)} onSaved={refresh} />}
    </StoreCardsPage>
  );
}

export default FranchisePage;
