import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Timeline,
  type TimelineEvent,
  useToast,
} from "@/components/ui";
import { TimelineSkeleton } from "@/components/wedash/LoadingSkeletons";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { useActiveSession } from "@/session/SessionProvider";import { hydrateSessionStores, storesForSession } from "@/data/wedash/stores";
import {
  SYNC_JOB_KIND_LABEL,
  fetchSyncLogs,
  syncLogSourceLabel,
  syncLogSummary,
  type SyncLogEntry,
  type SyncLogLevel,
} from "@/data/wedash/syncLogs";
function fmtAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return fmtWhen(iso);
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function LevelBadge({ level }: { level: SyncLogLevel }) {
  return level === "ERROR" ? <Badge variant="danger">Erro</Badge> : <Badge variant="warning">Aviso</Badge>;
}

/**
 * Configurações > Logs — erros e avisos da sincronização com o Millennium.
 * Leitura só para OWNER / MANAGER (RLS); retenção de 120 dias.
 */
export function SyncLogsPage() {
  const session = useActiveSession();
  const canView = session.role === "OWNER" || session.role === "MANAGER" || session.role === "ADMIN_GLOBAL";

  const [catalogTick, setCatalogTick] = useState(0);
  const lojas = useMemo(() => storesForSession(session.stores), [session.stores, catalogTick]);
  useEffect(() => {
    let cancelled = false;
    if (session.stores.length > 0) {
      void hydrateSessionStores(session.tenantId, session.stores).then(() => {
        if (!cancelled) setCatalogTick((n) => n + 1);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, session.stores]);

  const [nivel, setNivel] = useState<SyncLogLevel | "">("");
  const [busca, setBusca] = useState("");
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useMinSkeleton(loading);
  const [error, setError] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<SyncLogEntry | null>(null);
  const { show } = useToast();

  const carregar = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      setLogs(await fetchSyncLogs({ tenantId: session.tenantId, level: nivel || null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [canView, session.tenantId, nivel]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const lojaNome = useCallback(
    (e: SyncLogEntry) => {
      if (!e.storeId && !e.storeLabel) return "Todas";
      const loja = lojas.find((s) => s.id === e.storeId);
      return loja ? loja.fantasia : e.storeLabel ?? "—";
    },
    [lojas],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((e) =>
      [syncLogSummary(e), e.message, syncLogSourceLabel(e.source), lojaNome(e)].some((t) =>
        t.toLowerCase().includes(q),
      ),
    );
  }, [logs, busca, lojaNome]);

  const events: TimelineEvent[] = filtrados.map((e) => {
    const erro = e.level === "ERROR";
    return {
      id: e.id,
      title: (
        <button type="button" onClick={() => setDetalhe(e)} className="group block w-full text-left">
          <strong className="font-bold group-hover:text-acc">{syncLogSummary(e)}</strong>{" "}
          <span className="line-clamp-2 font-normal text-t1">{e.message}</span>
        </button>
      ),
      time: `${fmtAgo(e.createdAt)} · ${lojaNome(e)}`,
      color: erro ? "var(--bad)" : "var(--warn)",
      icon: <span className="text-[13px]">{erro ? "⛔" : "⚠️"}</span>,
    };
  });

  if (!canView) {
    return <p className="text-sm text-t2">Só o dono ou o gerente da rede pode ver os logs.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2.5 sm:ml-auto sm:w-fit sm:gap-2">
        <Input
          placeholder="Buscar nos logs…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="sm:h-[38px]!"
        />
        <Select
          value={nivel}
          onChange={(e) => setNivel(e.target.value as SyncLogLevel | "")}
          className="sm:h-[38px]!"
        >
          <option value="">Todos os eventos</option>
          <option value="ERROR">Erros</option>
          <option value="WARN">Avisos</option>
        </Select>
      </div>

      <Card padding="lg">
        {error ? (
          <span className="block py-6 text-center text-[12px] text-bad">Não foi possível carregar os logs: {error}</span>
        ) : showSkeleton ? (
          <TimelineSkeleton rows={5} />
        ) : events.length === 0 ? (
          busca.trim() || nivel ? (
            <EmptyState
              framed={false}
              icon="🔍"
              title="Nenhum resultado"
              description="Tente outra busca ou mude o tipo de evento."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBusca("");
                    setNivel("");
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              framed={false}
              icon="✅"
              title="Tudo certo"
              description="Nenhum erro ou aviso na sincronização."
            />
          )
        ) : (
          <Timeline events={events} />
        )}
      </Card>

      <Modal
        open={detalhe != null}
        onClose={() => setDetalhe(null)}
        title="Detalhe do log"
        footer={
          <>
            <Button variant="outline" onClick={() => setDetalhe(null)}>
              Fechar
            </Button>
            {detalhe && (
              <Button
                onClick={() => {
                  void navigator.clipboard
                    .writeText(logParaSuporte(detalhe, lojaNome(detalhe)))
                    .then(() => show("Detalhes copiados.", "success"))
                    .catch(() => show("Não foi possível copiar.", "danger"));
                }}
              >
                Copiar detalhes
              </Button>
            )}
          </>
        }
      >
        {detalhe && <LogDetail entry={detalhe} loja={lojaNome(detalhe)} />}
      </Modal>
    </div>
  );
}

/** Bloco de texto para colar em chamado / conversa de suporte. */
const DETAIL_KEYS_INTERNAS = new Set(["count", "days", "worker", "stack", "test", "erpUser"]);

function erpUserOf(e: SyncLogEntry): string | null {
  return typeof e.detail?.erpUser === "string" ? e.detail.erpUser : null;
}

function workerInfo(e: SyncLogEntry): { version?: string; startedAt?: string } | null {
  const w = e.detail?.worker;
  return w && typeof w === "object" ? (w as { version?: string; startedAt?: string }) : null;
}

function stackOf(e: SyncLogEntry): string | null {
  return typeof e.detail?.stack === "string" ? e.detail.stack : null;
}

function logParaSuporte(e: SyncLogEntry, loja: string): string {
  const w = workerInfo(e);
  const stack = stackOf(e);
  return [
    `[WeDash sync_log] ${e.level} · ${e.source} · ${syncLogSummary(e)}`,
    `log_id: ${e.id}`,
    `quando: ${e.createdAt}`,
    `job: ${e.jobKind ?? "—"} (${e.jobId ?? "sem job_id"})`,
    `usuário ERP: ${erpUserOf(e) ?? "—"}`,
    `loja: ${loja} (store_id ${e.storeId ?? "—"}, código ${e.storeLabel ?? "—"})`,
    `dias: ${e.days.join(", ") || "—"}`,
    `ocorrências: ${e.count}`,
    `worker: ${w?.version ?? "—"} (iniciado ${w?.startedAt ?? "—"})`,
    `mensagem: ${e.message}`,
    `detail: ${JSON.stringify(Object.fromEntries(Object.entries(e.detail ?? {}).filter(([k]) => k !== "stack" && k !== "worker" && k !== "erpUser")))}`,
    ...(stack ? ["stack:", stack] : []),
  ].join("\n");
}

function LogDetail({ entry, loja }: { entry: SyncLogEntry; loja: string }) {
  const extra = Object.entries(entry.detail ?? {}).filter(([k]) => !DETAIL_KEYS_INTERNAS.has(k));
  const w = workerInfo(entry);
  const stack = stackOf(entry);
  return (
    <div className="space-y-2.5 text-[13px]">
      <p className="pb-1 text-[14px] font-semibold text-t0">{syncLogSummary(entry)}</p>
      <DetailRow label="Quando" value={fmtWhen(entry.createdAt)} />
      <DetailRow label="Nível" value={<LevelBadge level={entry.level} />} />
      <DetailRow label="Origem" value={`${syncLogSourceLabel(entry.source)} (${entry.source})`} />
      {entry.jobKind && (
        <DetailRow label="Sincronização" value={SYNC_JOB_KIND_LABEL[entry.jobKind] ?? entry.jobKind} />
      )}
      {entry.jobId && <DetailRow label="Job" value={<span className="font-mono text-xs">{entry.jobId}</span>} />}
      {erpUserOf(entry) && <DetailRow label="Usuário ERP" value={erpUserOf(entry)} />}
      <DetailRow label="Loja" value={loja} />
      {entry.days.length > 0 && (
        <DetailRow
          label={entry.days.length > 1 ? "Dias" : "Dia"}
          value={entry.days.map(fmtDay).join(", ")}
        />
      )}
      {entry.count > 1 && <DetailRow label="Ocorrências" value={`${entry.count} vezes nesta sincronização`} />}
      {extra.map(([k, v]) => (
        <DetailRow key={k} label={k} value={typeof v === "string" ? v : JSON.stringify(v)} />
      ))}
      {w?.version && (
        <DetailRow label="Versão do worker" value={<span className="font-mono text-xs">{w.version}</span>} />
      )}
      <div className="pt-2">
        <span className="mb-1.5 block text-t2">Mensagem</span>
        <pre className={PRE}>{entry.message}</pre>
      </div>
      {stack && (
        <div className="pt-1">
          <span className="mb-1.5 block text-t2">Rastro do código</span>
          <pre className={PRE}>{stack}</pre>
        </div>
      )}
    </div>
  );
}

const PRE =
  "max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-vela-md)] border border-line bg-bg-2 p-3 font-mono text-xs text-t0";

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-t2">{label}</span>
      <span className="text-right text-t0">{value}</span>
    </div>
  );
}
