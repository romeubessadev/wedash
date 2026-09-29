import type { ReactNode } from "react";
import { Avatar, Button, Pagination } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import type { StockProductRow, StockTransfer } from "@/data/wedash/stockProducts";
import { brlCent, num } from "@/lib/format";

export const TipHelp = ({ label }: { label: string }) => (
  <Tooltip label={label}>
    <span className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full bg-bg-inset text-[10px] font-semibold text-t2 transition-colors hover:text-t1 print:hidden">
      ?
    </span>
  </Tooltip>
);

export const money = (v: number | null) => (v == null ? "—" : brlCent(v));
export const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);
export const pctRate = (v: number) => `${num(v, v % 1 === 0 ? 0 : 2)}%`;
export const qty = (v: number) => num(v, v % 1 === 0 ? 0 : 3);

export function transferText(t: StockTransfer): string {
  const origem = t.de.length === 1 ? `do ${t.de[0]}` : `de ${t.de.join(" / ")}`;
  return `Transferir ${qty(t.qtd)} ${origem} para o ${t.para}`;
}

/** Saldo do produto num local de estoque, somando as lojas do filtro. */
export function localQty(r: StockProductRow, nome: string): number {
  return r.lojas.reduce((s, l) => s + (l.locais.find((x) => x.nome === nome)?.qtd ?? 0), 0);
}

/** Locais de estoque com saldo em algum produto (Estoque, Quiosque, depois os demais em ordem alfabética). */
export function stockLocations(rows: StockProductRow[]): string[] {
  const nomes = new Set<string>();
  for (const r of rows) for (const l of r.lojas) for (const x of l.locais) nomes.add(x.nome);
  const ordem = (n: string) => (n === "Estoque" ? 0 : n === "Quiosque" ? 1 : 2);
  return [...nomes].sort((a, b) => ordem(a) - ordem(b) || a.localeCompare(b, "pt-BR"));
}

export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" size="md" onClick={onClick}>
      Exportar
    </Button>
  );
}

/** "Mostrando X de Y produtos" + paginação, abaixo da tabela (padrão Data Tables). */
export function TableFooter({ shown, total, page, totalPages, onPage }: { shown: number; total: number; page: number; totalPages: number; onPage: (p: number) => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <span className="text-[12.5px] text-t2">
        Mostrando {shown} de {num(total)} produtos
      </span>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={onPage} />}
    </div>
  );
}

/** Nome do produto + código · categoria, primeira coluna das tabelas. */
export function ProductCell({ r, extra }: { r: StockProductRow; extra?: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-[320px] items-center gap-2.5">
      <Avatar name={r.nome} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-bold text-t0">{r.nome}</p>
        <p className="truncate text-[11.5px] text-t2">
          {r.codigo}
          {r.categoria && ` · ${r.categoria}`}
        </p>
        {extra}
      </div>
    </div>
  );
}

export function UpdatedLine({ text, tip }: { text: string; tip: string }) {
  if (!text) return null;
  return (
    <Tooltip label={tip}>
      <span className="cursor-help text-[11.5px] text-t2">{text}</span>
    </Tooltip>
  );
}

/** Filtros do cabeçalho no padrão da Visão geral: um abaixo do outro no celular, em linha no desktop, e o horário embaixo. */
export function HeaderFilters({ children, updated }: { children: ReactNode; updated?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">{children}</div>
      {updated}
    </div>
  );
}
