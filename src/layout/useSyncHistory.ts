import { useCallback, useEffect, useState } from "react";
import { fetchSyncHistory, type SyncHistoryItem } from "@/data/wedash/syncHistory";
import { SALES_SYNCED_EVENT } from "@/pages/dashboard/useForceRefresh";

const POLL_MS = 60_000;
/** Tudo que terminou até esse instante conta como lido (1º uso e versão antiga "abrir = ler"). */
const readBeforeKey = (tenantId: string) => `wedash.notif.seen.${tenantId}`;
const readIdsKey = (tenantId: string) => `wedash.notif.read.${tenantId}`;

function loadReadBefore(tenantId: string): number {
  const raw = localStorage.getItem(readBeforeKey(tenantId));
  if (raw != null) return Number(raw) || 0;
  const now = Date.now();
  localStorage.setItem(readBeforeKey(tenantId), String(now));
  return now;
}

function loadReadIds(tenantId: string): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(readIdsKey(tenantId)) ?? "[]");
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export type SyncNotification = SyncHistoryItem & { read: boolean };

/**
 * Histórico de sincronizações para o sino de Notificações.
 * A lista fica (últimas 20); cada item nasce não lido e vira lido ao ser clicado.
 * Recarrega a cada 60s, quando uma sincronização termina e ao voltar para o app (PWA).
 */
export function useSyncHistory(tenantId: string) {
  const [items, setItems] = useState<SyncHistoryItem[]>([]);
  const [readBefore, setReadBefore] = useState<number>(() => loadReadBefore(tenantId));
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds(tenantId));

  const load = useCallback(async () => {
    setItems(await fetchSyncHistory(tenantId));
  }, [tenantId]);

  useEffect(() => {
    setReadBefore(loadReadBefore(tenantId));
    setReadIds(loadReadIds(tenantId));
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    const onSynced = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener(SALES_SYNCED_EVENT, onSynced);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(SALES_SYNCED_EVENT, onSynced);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tenantId, load]);

  const markRead = useCallback(
    (id: string) => {
      setReadIds((prev) => {
        if (prev.has(id)) return prev;
        // Guarda só os ids que ainda estão na lista (não cresce para sempre).
        const visiveis = new Set(items.map((i) => i.id));
        const next = new Set([...prev].filter((x) => visiveis.has(x)));
        next.add(id);
        localStorage.setItem(readIdsKey(tenantId), JSON.stringify([...next]));
        return next;
      });
    },
    [tenantId, items],
  );

  const notifications: SyncNotification[] = items.map((i) => ({
    ...i,
    read: i.at.getTime() <= readBefore || readIds.has(i.id),
  }));

  return {
    items: notifications,
    unread: notifications.some((n) => !n.read),
    markRead,
  };
}
