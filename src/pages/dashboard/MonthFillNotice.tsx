import { RadialProgress } from "@/components/ui";
import { calendarTodayIso } from "@/data/wedash/clock";
import { monthFillProgress, type MonthFill } from "@/data/wedash/salesRepo";

/** Período [inicio, fim] inclui dias que a carga do mês ainda não trouxe. */
export function monthFillTouches(fill: MonthFill | null, inicio: string, fim: string): boolean {
  return Boolean(fill && inicio <= fill.currentDay && fim >= fill.fillUntil);
}

/** Durante a carga do histórico o calendário libera desde o dia mais antigo da carga (o aviso explica o parcial). */
export function pickerMinDate(coverageFrom: Date | null, fill: MonthFill | null): Date | null {
  if (!fill) return coverageFrom;
  const [y, m, d] = fill.fillUntil.split("-").map(Number);
  const fillStart = new Date(y, m - 1, d);
  return coverageFrom && coverageFrom < fillStart ? coverageFrom : fillStart;
}

/**
 * Alerta com anel de progresso (cor primária) enquanto a carga do histórico (pós-onboarding) roda — some sozinho ao terminar.
 * Se o período da tela inclui dias ainda não carregados, avisa que os totais estão parciais.
 */
export function MonthFillNotice({ fill, inicio, fim }: { fill: MonthFill | null; inicio: string; fim: string }) {
  if (!fill) return null;
  const { done, total } = monthFillProgress(fill, calendarTodayIso());
  const pct = Math.round((done / total) * 100);
  const parcial = monthFillTouches(fill, inicio, fim);
  return (
    <div className="mt-4 flex items-center gap-3.5 rounded-[var(--radius-vela-md)] border border-acc/30 bg-acc-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-t0">
      <span className="shrink-0">
        <RadialProgress value={pct} size={44} stroke={4} color="var(--acc)" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">
          Carregando histórico de vendas · <span className="tabular-nums">{pct}%</span>
        </p>
        <p className="text-t1">
          {parcial
            ? "Os dados deste período ainda são parciais e serão atualizados automaticamente conforme o histórico for carregado."
            : "Os dados anteriores serão adicionados automaticamente. Você pode continuar usando o painel normalmente."}
        </p>
      </div>
    </div>
  );
}
