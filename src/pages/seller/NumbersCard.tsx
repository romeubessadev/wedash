import { useState } from "react";
import { Card, Segmented, StatCard } from "@/components/ui";
import { brlCent, num } from "@/data/wedash/engine/format";
import { sellerNumbers, type NumbersMode } from "@/data/wedash/sellerNumbers";
import type { SellerDay } from "@/data/wedash/engine/sellerHome";

/** Seus números: Hoje | Mês, com faturamento, vendas, ticket e P.A. só do vendedor. */
export function NumbersCard({
  days,
  period,
  today,
}: {
  days: SellerDay[];
  period: { from: string; to: string };
  today: string;
}) {
  const [mode, setMode] = useState<NumbersMode>("mes");
  const n = sellerNumbers(days, period, today, mode);
  const pa = n.pa.value == null ? "—" : num(n.pa.value, 2);
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-t0">Seus números</h2>
        <Segmented
          options={[
            { value: "hoje", label: "Hoje" },
            { value: "mes", label: "Mês" },
          ]}
          value={mode}
          onChange={(v) => v && setMode(v)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Faturamento" value={brlCent(n.faturamento.value ?? 0)} icon={<span>💰</span>} delta={n.faturamento.delta} />
        <StatCard label="Nº de vendas" value={num(n.vendas.value ?? 0, 0)} icon={<span>🧾</span>} delta={n.vendas.delta} />
        <StatCard label="Ticket médio" value={brlCent(n.ticket.value ?? 0)} icon={<span>🏷️</span>} delta={n.ticket.delta} />
        <StatCard label="P.A." value={pa} icon={<span>📦</span>} delta={n.pa.delta} tooltip={n.pa.value == null ? "O P.A. não está disponível para este período." : undefined} />
      </div>
    </Card>
  );
}
