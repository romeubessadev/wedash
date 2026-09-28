import { useCallback, useEffect, useState } from "react";
import { fetchSyncWatermark } from "@/data/wedash/salesRepo";
import { useActiveSession } from "@/session/SessionProvider";
import { SALES_SYNCED_EVENT } from "./useForceRefresh";

/** "Última atualização às HH:MM" (ou "em DD/MM às HH:MM" se não foi hoje). */
export function lastUpdatedLabel(at: Date, now: Date = new Date()): string {
  const hora = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (at.toDateString() === now.toDateString()) return `Última atualização às ${hora}`;
  return `Última atualização em ${dia(at)} às ${hora}`;
}

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
  return <span className="text-[11.5px] text-t2">{lastUpdatedLabel(at)}</span>;
}
