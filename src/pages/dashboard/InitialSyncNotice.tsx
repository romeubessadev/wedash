import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useInitialSync } from "@/pages/dashboard/useInitialSync";

/**
 * Aviso logo abaixo dos filtros enquanto as vendas de hoje chegam depois de conectar o Millennium
 * (o onboarding abre o board zerado). Some sozinho ao terminar; falha oferece "Tentar novamente".
 */
export function InitialSyncNotice() {
  const { sync, retry, retrying } = useInitialSync();
  if (!sync) return null;

  const falhou = sync.phase === "failed";
  const titulo =
    sync.phase === "running"
      ? "Buscando as vendas de hoje no Millennium"
      : sync.phase === "stuck"
        ? "A busca das vendas de hoje ainda não começou"
        : "Não foi possível buscar as vendas de hoje";
  const texto =
    sync.phase === "running"
      ? "Leva alguns segundos. Os números aparecem sozinhos."
      : sync.phase === "stuck"
        ? "O sincronizador está demorando para responder. Se continuar assim, fale com o suporte."
        : sync.busy
          ? "Este usuário do Millennium está logado em outro lugar. Saia do ERP nessa outra sessão e tente de novo."
          : "O Millennium não respondeu como esperado. Tente de novo em instantes.";

  return (
    <div
      className={cn(
        "mt-4 flex items-center gap-3.5 rounded-[var(--radius-vela-md)] border px-3.5 py-3 text-[12.5px] leading-relaxed text-t0",
        sync.phase === "running" && "border-acc/30 bg-acc-soft",
        sync.phase === "stuck" && "border-warn/30 bg-warn-soft",
        falhou && "border-bad/30 bg-bad-soft",
      )}
    >
      {sync.phase === "running" && (
        <span className="shrink-0">
          <Spinner size={20} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{titulo}</p>
        <p className="text-t1">{texto}</p>
      </div>
      {falhou && (
        <Button size="sm" variant="outline" className="shrink-0" disabled={retrying} onClick={() => void retry()}>
          {retrying ? "Aguarde…" : "Tentar novamente"}
        </Button>
      )}
    </div>
  );
}
