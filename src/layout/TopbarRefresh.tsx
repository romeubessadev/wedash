import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fetchSyncWatermark } from "@/data/wedash/salesRepo";
import { formatForceCooldownLabel } from "@/data/wedash/syncUi";
import { AUTO_REFRESH_MIN, nextAutoRefreshAt } from "@/data/wedash/autoRefresh";
import {
  fetchErpIntegrationStatus,
  fetchLastAutoRefreshAt,
  fetchStoresSyncState,
  type ErpIntegrationStatus,
  type StoreSyncState,
} from "@/data/wedash/erp";
import { useActiveSession } from "@/session/SessionProvider";
import { SALES_SYNCED_EVENT, useForceRefresh } from "@/pages/dashboard/useForceRefresh";
const WATERMARK_POLL_MS = 60_000;

/**
 * Atualizar global (Topbar, todas as telas): FORCE de hoje na loja do StorePicker.
 * Ao terminar dispara `SALES_SYNCED_EVENT` — a tela aberta recarrega os próprios dados.
 * Rodada automática que terminou (watermark avançou no poll) dispara o mesmo evento.
 */
export function TopbarRefresh({ storeIds }: { storeIds: string[] }) {
  const session = useActiveSession();
  const { show } = useToast();
  const [erp, setErp] = useState<ErpIntegrationStatus | null>(null);
  const [lojas, setLojas] = useState<StoreSyncState[]>([]);
  const [lastAutoAt, setLastAutoAt] = useState<Date | null>(null);
  const lastWatermark = useRef<number | null>(null);

  const loadWatermark = useCallback(
    async (notifyIfNewer: boolean) => {
      try {
        const [wm, st, sync, lastAuto] = await Promise.all([
          fetchSyncWatermark(session.tenantId),
          fetchErpIntegrationStatus(session.tenantId),
          fetchStoresSyncState(session.tenantId),
          fetchLastAutoRefreshAt(session.tenantId),
        ]);
        const prev = lastWatermark.current;
        lastWatermark.current = wm?.getTime() ?? null;
        setErp(st);
        setLojas(sync);
        setLastAutoAt(lastAuto);
        if (notifyIfNewer && prev != null && wm && wm.getTime() > prev) {
          window.dispatchEvent(new Event(SALES_SYNCED_EVENT));
        }
      } catch (e) {
        console.warn("TopbarRefresh watermark:", e);
      }
    },
    [session.tenantId],
  );

  useEffect(() => {
    void loadWatermark(false);
    const id = window.setInterval(() => void loadWatermark(true), WATERMARK_POLL_MS);
    // PWA em segundo plano congela o intervalo: ao voltar, confere na hora se houve rodada nova.
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadWatermark(true);
    };
    const onOnline = () => void loadWatermark(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [loadWatermark]);

  const reload = useCallback(async () => {
    await loadWatermark(false);
    window.dispatchEvent(new Event(SALES_SYNCED_EVENT));
  }, [loadWatermark]);

  const disconnected = erp != null && (erp.status !== "VALID" || erp.syncPaused);
  const { canForce, refreshing, forceError, forceCooldownSec, forcarAtualizacao } = useForceRefresh({
    storeIds,
    reload,
    disconnected,
  });

  useEffect(() => {
    if (forceError) show(forceError, "danger");
  }, [forceError, show]);

  const autoOn = erp != null && !disconnected && erp.autoRefreshEnabled;
  const escopo = storeIds.length > 0 ? lojas.filter((l) => storeIds.includes(l.id)) : lojas;
  const proxima = autoOn
    ? nextAutoRefreshAt({
        stores: escopo,
        now: new Date(),
        intervalMin: AUTO_REFRESH_MIN,
        lastAutoAt,
      })
    : null;
  if (!canForce) return null;

  const proximaLabel = proxima
    ? `Próxima atualização às ${proxima.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`
    : null;

  const ariaLabel = refreshing
    ? "Buscando os dados de hoje no Millennium…"
    : forceCooldownSec != null
      ? `Próxima atualização em ${formatForceCooldownLabel(forceCooldownSec)}`
      : storeIds.length === 1
        ? "Atualizar os dados de hoje da loja selecionada"
        : "Atualizar os dados de hoje de todas as lojas";

  const button = (
    <button
      type="button"
      onClick={() => void forcarAtualizacao()}
      disabled={refreshing || forceCooldownSec != null}
      aria-label={ariaLabel}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-line text-t1 hover:bg-bg-3 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0", refreshing && "animate-spin text-acc")}
      >
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    </button>
  );

  if (!proximaLabel || refreshing) return button;
  return (
    <Tooltip label={proximaLabel} side="bottom">
      {button}
    </Tooltip>
  );
}
