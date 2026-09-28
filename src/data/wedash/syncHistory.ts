import { getSupabase } from "@/lib/supabase";

/** Linha de `sync_job` que interessa ao histórico do sino de Notificações. */
export type SyncJobRow = {
  id: string;
  kind: string;
  status: string;
  payload: {
    auto?: boolean;
    from?: string;
    to?: string;
    fillUntil?: string;
    progressDay?: string;
    deep?: boolean;
    deepDone?: boolean;
    since?: string;
  } | null;
  finished_at: string | null;
  error?: string | null;
};

export type SyncHistoryItem = { id: string; at: Date; text: string; ok: boolean };

const KINDS = ["FORCE", "FORCE_LIGHT", "SEED", "CLOSE"];

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Mensagem curta por sincronização. Falha de rodada automática e do fechamento/carga fica de fora
 * (não é ação do gestor; o detalhe está em Configurações > Logs).
 */
export function syncHistoryItem(row: SyncJobRow): SyncHistoryItem | null {
  if (!row.finished_at || !KINDS.includes(row.kind)) return null;
  const ok = row.status === "SUCCEEDED";
  if (row.status !== "SUCCEEDED" && row.status !== "FAILED") return null;
  // Concluído com anotação = pulado sem ir ao ERP (ex.: worker com SYNC_ONBOARDING=off).
  if (ok && row.error) return null;
  const p = row.payload ?? {};
  let text: string;
  if (row.kind === "CLOSE") {
    if (!ok || p.deep) return null;
    if (p.deepDone) {
      const since = p.since?.slice(0, 10);
      text = since
        ? `Histórico de vendas completo (desde ${since.slice(5, 7)}/${since.slice(0, 4)})`
        : "Histórico de vendas completo";
      return { id: row.id, at: new Date(row.finished_at), text, ok };
    }
    const to = p.to?.slice(0, 10);
    const from = (p.progressDay ?? p.from)?.slice(0, 10);
    if (!to) return null;
    text = p.fillUntil
      ? from && from !== to
        ? `Histórico de vendas carregado (${ddmm(from)} a ${ddmm(to)})`
        : `Histórico de vendas carregado (${ddmm(to)})`
      : `Vendas do dia ${ddmm(to)} fechadas`;
  } else {
    if (!ok && p.auto) return null;
    text = ok ? "Vendas atualizadas" : "Não foi possível atualizar as vendas";
  }
  return { id: row.id, at: new Date(row.finished_at), text, ok };
}

export async function fetchSyncHistory(tenantId: string, limit = 20): Promise<SyncHistoryItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("sync_job")
    .select("id, kind, status, payload, finished_at, error")
    .eq("tenant_id", tenantId)
    .in("kind", KINDS)
    .in("status", ["SUCCEEDED", "FAILED"])
    .not("finished_at", "is", null)
    .is("payload->>deep", null)
    .order("finished_at", { ascending: false })
    .limit(limit * 2);
  if (error) {
    console.warn("fetchSyncHistory:", error.message);
    return [];
  }
  return ((data ?? []) as SyncJobRow[])
    .map(syncHistoryItem)
    .filter((i): i is SyncHistoryItem => i != null)
    .slice(0, limit);
}
