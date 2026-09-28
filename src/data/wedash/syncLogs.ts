/**
 * Configurações > Logs — erros/avisos gravados pelo worker Millennium em `sync_log`.
 * RLS: só OWNER / MANAGER / ADMIN_GLOBAL leem. Retenção 120 dias (worker limpa).
 */
import { getSupabase } from "@/lib/supabase";

export type SyncLogLevel = "ERROR" | "WARN";

export type SyncLogEntry = {
  id: string;
  createdAt: string;
  level: SyncLogLevel;
  source: string;
  jobId: string | null;
  jobKind: string | null;
  storeId: string | null;
  storeLabel: string | null;
  day: string | null;
  message: string;
  count: number;
  days: string[];
  detail: Record<string, unknown> | null;
};

/** Origem (etapa do sync) → rótulo na UI. */
export const SYNC_LOG_SOURCE_LABEL: Record<string, string> = {
  job: "Sincronização",
  login: "Acesso ao Millennium",
  vendas: "Vendas",
  margem: "Marca · WEPINK/WPINK",
  cmv: "CMV",
  detalhe_movimento: "Detalhe da venda",
  categorias: "Categorias",
  catalogo: "Catálogo de produtos",
  top_produtos: "Top produtos",
  cupom: "Produtos por venda",
  custo_produto: "CMV por produto",
  mapa_produtos: "Mapeamento de produtos",
  gerador: "Gerador da loja",
  eventos: "Eventos de venda",
  vendedoras: "Equipe de vendas",
  millennium_ocupado: "Millennium ocupado",
};

export const SYNC_JOB_KIND_LABEL: Record<string, string> = {
  SEED: "Carga inicial",
  FORCE: "Atualização manual",
  FORCE_LIGHT: "Atualização manual",
  LIGHT: "Atualização automática",
  HISTORY: "Histórico",
  CLOSE: "Fechamento do dia",
  RANGE: "Período",
  BACKFILL: "Reprocessamento",
};

export function syncLogSourceLabel(source: string): string {
  return SYNC_LOG_SOURCE_LABEL[source] ?? source;
}

const SYNC_LOG_SUMMARY: Record<string, string> = {
  job: "Sincronização interrompida",
  vendas: "Vendas não carregadas",
  margem: "Faturamento por marca não carregado",
  cmv: "CMV não carregado",
  detalhe_movimento: "Vendas por hora incompletas",
  categorias: "Categorias não carregadas",
  catalogo: "Produtos novos sem categoria",
  top_produtos: "Top produtos não carregado",
  cupom: "Top produtos e faturamento por marca incompletos",
  custo_produto: "CMV por produto não salvo",
  mapa_produtos: "Mapeamento de produtos incompleto",
  gerador: "Loja sem gerador no Millennium",
  eventos: "Eventos de venda não carregados",
  vendedoras: "Equipe de vendas não sincronizada",
  millennium_ocupado: "Millennium lento · sincronização mais demorada",
};

/** Frase curta para a lista; a mensagem técnica fica no detalhe. */
export function syncLogSummary(e: Pick<SyncLogEntry, "source" | "message">): string {
  if (e.source === "login") {
    return /senha|password|inv[aá]lid/i.test(e.message)
      ? "Senha do Millennium inválida"
      : "Não foi possível acessar o Millennium";
  }
  return SYNC_LOG_SUMMARY[e.source] ?? syncLogSourceLabel(e.source);
}

export type SyncLogQuery = {
  tenantId: string;
  from?: Date | null;
  to?: Date | null;
  level?: SyncLogLevel | null;
  storeId?: string | null;
  source?: string | null;
  limit?: number;
};

type Row = {
  id: string;
  created_at: string;
  level: SyncLogLevel;
  source: string;
  job_id: string | null;
  job_kind: string | null;
  store_id: string | null;
  store_label: string | null;
  day: string | null;
  message: string;
  detail: Record<string, unknown> | null;
};

export async function fetchSyncLogs(q: SyncLogQuery): Promise<SyncLogEntry[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let req = sb
    .from("sync_log")
    .select("id, created_at, level, source, job_id, job_kind, store_id, store_label, day, message, detail")
    .eq("tenant_id", q.tenantId)
    .order("created_at", { ascending: false })
    .limit(q.limit ?? 500);
  if (q.from) req = req.gte("created_at", q.from.toISOString());
  if (q.to) req = req.lt("created_at", q.to.toISOString());
  if (q.level) req = req.eq("level", q.level);
  if (q.storeId) req = req.eq("store_id", q.storeId);
  if (q.source) req = req.eq("source", q.source);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => {
    const detail = r.detail ?? null;
    const days = Array.isArray(detail?.days) ? (detail.days as string[]) : r.day ? [r.day] : [];
    return {
      id: r.id,
      createdAt: r.created_at,
      level: r.level,
      source: r.source,
      jobId: r.job_id,
      jobKind: r.job_kind,
      storeId: r.store_id,
      storeLabel: r.store_label,
      day: r.day,
      message: r.message,
      count: Number(detail?.count ?? 1) || 1,
      days,
      detail,
    };
  });
}
