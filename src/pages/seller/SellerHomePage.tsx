import { useCallback, useEffect, useState } from "react";
import { Button, PageHeader } from "@/components/ui";
import { OverviewSkeleton } from "@/components/wedash/LoadingSkeletons";
import { fetchSellerHome } from "@/data/wedash/sellerHomeRepo";
import type { SellerHomePayload } from "@/data/wedash/engine/sellerHome";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { SALES_SYNCED_EVENT } from "@/pages/dashboard/useForceRefresh";
import { useSession } from "@/session/SessionProvider";
import { NumbersCard } from "./NumbersCard";
import { PrizeCard } from "./PrizeCard";
import { RankingCard } from "./RankingCard";

/** Tela Início do vendedor: premiação, números e ranking, sem controles de gestor. */
export function SellerHomePage() {
  const { session } = useSession();
  const [home, setHome] = useState<SellerHomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const showSkeleton = useMinSkeleton(loading);

  const load = useCallback(() => {
    setFailed(false);
    void fetchSellerHome().then((data) => {
      setHome(data);
      setFailed(data == null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onSynced = () => load();
    window.addEventListener(SALES_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SALES_SYNCED_EVENT, onSynced);
  }, [load]);

  const firstName = (session?.name ?? "").split(" ")[0]?.toLocaleUpperCase("pt-BR") ?? "";
  const lastSync = home?.stores.map((s) => s.lastSyncAt).filter(Boolean).sort().at(-1) ?? null;
  const hora = lastSync ? new Date(lastSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Bem-vindo(a) de volta, ${firstName} 👋`}
        subtitle={hora ? `Vendas atualizadas às ${hora}` : "Vendas de hoje ainda não atualizadas"}
      />
      {showSkeleton ? (
        <OverviewSkeleton />
      ) : failed || !home ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-[13.5px] text-t1">Não foi possível carregar seus dados. Tente novamente.</p>
          <Button type="button" onClick={load}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {home.stores.map((s) => (
            <PrizeCard key={s.storeId} store={s} />
          ))}
          <NumbersCard days={home.myDays} period={home.numbersPeriod} today={home.today} />
          {home.stores.map((s) => (
            <RankingCard key={s.storeId} store={s} />
          ))}
        </>
      )}
    </div>
  );
}

export default SellerHomePage;
