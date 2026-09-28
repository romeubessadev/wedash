import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AvatarGroup, Badge, Card } from "@/components/ui";
import { CardGridSkeleton } from "@/components/wedash/LoadingSkeletons";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { useActiveSession } from "@/session/SessionProvider";
import {
  fetchStoreSellers,
  isActiveSalesPerson,
  hydrateSessionStores,
  storesForSession,
  type StoreSeller,
} from "@/data/wedash/stores";
import { StoreIcon } from "@/pages/dashboards/icons";
import { paths } from "@/router/paths";

/**
 * Configurações > Lojas — cards por loja (padrão Teams do Vela, versão enxuta).
 * Clique abre a página de detalhe (funcionamento + custos).
 */
export function StoresSettingsPage() {
  const session = useActiveSession();
  const navigate = useNavigate();
  const [catalogTick, setCatalogTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useMinSkeleton(loading);
  const [sellers, setSellers] = useState<Map<string, StoreSeller[]>>(new Map());

  const lojas = useMemo(
    () => storesForSession(session.stores),
    [session.stores, catalogTick], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (session.stores.length > 0) {
        await hydrateSessionStores(session.tenantId, session.stores);
        if (!cancelled) setCatalogTick((n) => n + 1);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, session.stores]);

  useEffect(() => {
    let cancelled = false;
    void fetchStoreSellers(session.tenantId, session.stores).then((m) => {
      if (!cancelled) setSellers(m);
    });
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, session.stores]);

  if (showSkeleton) {
    return <CardGridSkeleton count={3} />;
  }

  if (lojas.length === 0) {
    return <span className="block py-6 text-center text-[12px] text-t2">Nenhuma loja no seu escopo.</span>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {lojas.map((s) => {
        const equipe = (sellers.get(s.id) ?? []).filter(isActiveSalesPerson);
        const abrir = () => navigate(paths.settings.storeDetail(s.id));
        return (
          <Card
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={abrir}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                abrir();
              }
            }}
            className="cursor-pointer transition-colors hover:border-acc"
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[13px] bg-acc-soft text-acc">
                <StoreIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-t0">{s.fantasia}</p>
                <p className="mt-0.5 truncate text-xs text-t2">{s.cnpj || "—"}</p>
              </div>
              <Badge variant="accent" className="shrink-0 self-start">
                Filial {s.codFilial}
              </Badge>
            </div>
            <div className="flex min-h-8 items-center justify-between gap-3">
              {equipe.length > 0 ? (
                <AvatarGroup names={equipe.map((v) => v.name)} max={4} />
              ) : (
                <span className="text-xs text-t2">Ninguém ativo na equipe</span>
              )}
              <span className="shrink-0 text-xs font-semibold text-t2">{equipe.length} na equipe</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default StoresSettingsPage;
