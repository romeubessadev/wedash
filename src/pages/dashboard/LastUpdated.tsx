import { useCallback, useEffect, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { fetchSyncWatermark } from "@/data/wedash/salesRepo";
import { useActiveSession } from "@/session/SessionProvider";
import { SALES_SYNCED_EVENT } from "./useForceRefresh";

/** Horário da última busca das vendas de hoje (Atualizar manual/automático, carga do onboarding). */
export function lastUpdatedLabel(at: Date, now: Date = new Date()): string {
  const hora = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (at.toDateString() === now.toDateString()) return `Vendas de hoje atualizadas às ${hora}`;
  return `Vendas de hoje ainda não atualizadas · última atualização em ${dia(at)} às ${hora}`;
}

const TIP_LAST_UPDATED =
  "Horário da última busca das vendas de hoje no Millennium. O fechamento de dias anteriores, feito de madrugada, não altera este horário.";

/** Linha abaixo dos filtros das telas: quando os dados do ERP foram atualizados pela última vez (sem sync ainda = nada). */
export function LastUpdated() {
  const session = useActiveSession();
  const [at, setAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      setAt(await fetchSyncWatermark(session.tenantId));
    } catch (e) {
      console.warn("LastUpdated:", e);
    }
  }, [session.tenantId]);

  useEffect(() => {
    void load();
    const onSynced = () => void load();
    window.addEventListener(SALES_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SALES_SYNCED_EVENT, onSynced);
  }, [load]);

  if (!at) return null;
  return (
    <Tooltip label={TIP_LAST_UPDATED}>
      <span className="cursor-help text-[11.5px] text-t2">{lastUpdatedLabel(at)}</span>
    </Tooltip>
  );
}
