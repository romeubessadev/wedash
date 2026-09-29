import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, DataTable, type DataTableColumn, type SortDir } from "@/components/ui";
import type { StatusVariant } from "@/lib/status";
import { StockProductsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { MobileSortBar } from "@/components/wedash/MobileSortBar";
import { stockStatus, type StockProductRow, type StockStatus } from "@/data/wedash/stockProducts";
import { cn } from "@/lib/cn";
import { usePrintMode } from "@/lib/printMode";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { TABLE_PAGE_SIZE } from "@/lib/usePagedRows";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { ReportHeader, useExportPdf } from "@/pages/dashboard/ReportHeader";
import { SectionHeader } from "@/pages/operation/shared";
import { HeaderFilter, HeaderSearch } from "@/pages/dashboard/HeaderFilter";
import {
  ExportButton,
  ProductCell,
  TableFooter,
  UpdatedLine,
  HeaderFilters,
  localQty,
  qty,
  stockLocations,
  transferText,
} from "./shared";
import { useStockData } from "./useStockData";

type StatusFiltro = "todos" | Exclude<StockStatus, "ok">;
type SortKey = "nome" | "estoque";

const STATUS_BADGE: Record<StockStatus, { label: string; variant: StatusVariant }> = {
  negativo: { label: "Estoque negativo", variant: "danger" },
  transferir: { label: "Transferir", variant: "warning" },
  falta: { label: "Em falta", variant: "danger" },
  ok: { label: "Ok", variant: "success" },
};

/** O que fazer com o produto, uma linha por loja (vai abaixo do status, na própria linha da tabela). */
function statusLines(r: StockProductRow, status: StockStatus, variasLojas: boolean): string[] {
  const loja = (nome: string) => (variasLojas ? `${nome}: ` : "");
  if (status === "negativo")
    return r.lojas
      .filter((l) => l.estoque < 0)
      .map((l) => `${loja(l.store.fantasia)}saldo ${qty(l.estoque)} no Millennium. Confira as entradas e saídas.`);
  if (status === "transferir")
    return r.lojas.flatMap((l) => l.transferencias.map((t) => `${loja(l.store.fantasia)}${transferText(t)}`));
  if (status === "falta")
    return r.lojas
      .filter((l) => l.estoque <= 0 && l.vendidos30d > 0)
      .map((l) => `${loja(l.store.fantasia)}sem saldo, mas vendeu nos últimos 30 dias.`);
  return [];
}

export function InventoryPage() {
  const { lojas, storeKey, view, loading, syncing, atualizadoTexto } = useStockData({ prices: false });
  const [busca, setBusca] = useState("");
  const [statusSel, setStatus] = useState<StatusFiltro>("todos");
  const [categoria, setCategoria] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const printing = usePrintMode();
  const showSkeleton = useMinSkeleton(loading);
  const exportar = useExportPdf("Estoque", null, { periodo: false });
  const variasLojas = lojas.length > 1;

  const comStatus = useMemo(() => (view?.rows ?? []).map((r) => ({ r, status: stockStatus(r) })), [view]);
  const contagem = (s: StockStatus) => comStatus.filter((x) => x.status === s).length;
  const nNegativo = contagem("negativo");
  const nTransferir = contagem("transferir");
  const nFalta = contagem("falta");
  const statusOpcoes: Array<{ value: StatusFiltro; label: string }> = [
    { value: "todos", label: "Todos os status" },
    ...(nNegativo > 0 ? [{ value: "negativo" as const, label: `Estoque negativo (${nNegativo})` }] : []),
    ...(nTransferir > 0 ? [{ value: "transferir" as const, label: `Transferir (${nTransferir})` }] : []),
    ...(nFalta > 0 ? [{ value: "falta" as const, label: `Em falta (${nFalta})` }] : []),
  ];
  const status = statusOpcoes.some((o) => o.value === statusSel) ? statusSel : "todos";
  const categorias = view?.categorias ?? [];

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const out = comStatus.filter(
      ({ r, status: s }) =>
        (status === "todos" || s === status) &&
        (!categoria || r.categoria === categoria) &&
        (!q || r.nome.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q)),
    );
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      if (sortKey === "nome") return a.r.nome.localeCompare(b.r.nome, "pt-BR") * dir;
      return (a.r.estoque - b.r.estoque) * dir || a.r.nome.localeCompare(b.r.nome, "pt-BR");
    });
    return out;
  }, [comStatus, busca, status, categoria, sortKey, sortDir]);

  useEffect(() => setPage(1), [busca, status, categoria, sortKey, sortDir, storeKey]);

  const locais = useMemo(() => (view ? stockLocations(view.rows) : []), [view]);
  const mostraTotal = locais.length !== 1;

  const totalPages = Math.max(1, Math.ceil(linhas.length / TABLE_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = printing ? linhas : linhas.slice((pageSafe - 1) * TABLE_PAGE_SIZE, pageSafe * TABLE_PAGE_SIZE);

  type Linha = (typeof linhas)[number];
  const columns: DataTableColumn<Linha>[] = [
    {
      key: "produto",
      header: "Produto",
      render: ({ r }) => <ProductCell r={r} />,
    },
    ...locais.map<DataTableColumn<Linha>>((nome) => ({
      key: `local:${nome}`,
      header: nome,
      align: "right",
      render: ({ r }) => <LocalQty v={localQty(r, nome)} />,
    })),
    ...(mostraTotal
      ? [
          {
            key: "estoque",
            header: locais.length > 0 ? "Total" : "Estoque",
            align: "right",
            render: ({ r }: Linha) => <TotalQty v={r.estoque} />,
          } satisfies DataTableColumn<Linha>,
        ]
      : []),
    {
      key: "status",
      header: "Status",
      render: ({ r, status: s }) => (
        <div className="min-w-[200px] max-w-[280px]">
          <StatusBadge r={r} status={s} />
          <StatusText lines={statusLines(r, s, variasLojas)} />
        </div>
      ),
    },
  ];

  const statusLabel = statusOpcoes.find((o) => o.value === status)?.label ?? "Todos os status";

  return (
    <div className="flex flex-col p-4 sm:p-6 print:p-0">
      <ReportHeader
        periodo={false}
        atualizado={atualizadoTexto}
        filtros={[
          ...(status !== "todos" ? [{ label: "Status", valor: statusLabel }] : []),
          ...(categoria ? [{ label: "Categoria", valor: categoria }] : []),
        ]}
      />
      <SectionHeader
        section="Estoque"
        title="Estoque"
        subtitle="Veja o saldo de cada produto por local, o que transferir e o que está em falta."
        actions={
          <HeaderFilters
            updated={<UpdatedLine text={atualizadoTexto} tip="Estoque buscado no Millennium ao abrir a tela (a cada 30 minutos) e no botão Atualizar do topo." />}
          >
            <HeaderSearch value={busca} onChange={setBusca} />
            <HeaderFilter label="Status" value={status} onChange={setStatus} options={statusOpcoes} />
            {categorias.length > 1 && (
              <HeaderFilter
                label="Categoria"
                value={categoria}
                onChange={setCategoria}
                options={[{ value: "", label: "Todas as categorias" }, ...categorias.map((c) => ({ value: c, label: c }))]}
              />
            )}
            <ExportButton onClick={exportar} />
          </HeaderFilters>
        }
        notices={
          !showSkeleton && view && (nTransferir > 0 || nNegativo > 0) ? (
            <>
              {nTransferir > 0 && (
                <Alert
                  variant="warning"
                  title={
                    nTransferir === 1
                      ? "1 produto precisa de transferência entre locais de estoque."
                      : `${nTransferir} produtos precisam de transferência entre locais de estoque.`
                  }
                >
                  Um local está com saldo negativo e outro local da loja tem o produto.
                </Alert>
              )}
              {nNegativo > 0 && (
                <Alert
                  variant="warning"
                  title={nNegativo === 1 ? "1 produto está com estoque negativo no Millennium." : `${nNegativo} produtos estão com estoque negativo no Millennium.`}
                >
                  Confira as entradas e saídas desses produtos na loja.
                </Alert>
              )}
            </>
          ) : undefined
        }
      />

      {showSkeleton || !view ? (
        <StockProductsSkeleton />
      ) : (
        <>
          {linhas.length > 1 && (
            <MobileSortBar
              always
              className="mb-3"
              options={[
                { key: "nome", label: "Produto", text: true },
                { key: "estoque", label: "Estoque" },
              ]}
              sortKey={sortKey}
              sortDir={sortDir}
              onChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
            />
          )}

          {linhas.length === 0 ? (
            <div className="flex rounded-[var(--radius-vela-lg)] border border-line bg-bg-2 p-4">
              {view.rows.length === 0 ? (
                <EmptyBlock icon="📦" title="Sem estoque" description={syncing ? "Buscando o estoque no Millennium…" : "Nenhum produto com saldo nas lojas selecionadas."} />
              ) : (
                <EmptyBlock icon="🔍" title="Nenhum produto encontrado" description="Tente buscar por outro nome ou código." />
              )}
            </div>
          ) : (
            <DataTable columns={columns} data={pageRows} rowKey={({ r }) => r.codigo} />
          )}
          {linhas.length > 0 && <TableFooter shown={pageRows.length} total={linhas.length} page={pageSafe} totalPages={totalPages} onPage={setPage} />}
        </>
      )}
    </div>
  );
}

export default InventoryPage;

function StatusBadge({ r, status }: { r: StockProductRow; status: StockStatus }) {
  return <Badge variant={STATUS_BADGE[status].variant}>{status === "transferir" ? `Transferir ${qty(r.transferir)}` : STATUS_BADGE[status].label}</Badge>;
}

function StatusText({ lines }: { lines: string[] }) {
  return lines.map((t) => (
    <p key={t} className="mt-1 whitespace-normal text-[11.5px] leading-snug text-t2">
      {t}
    </p>
  ));
}

function LocalQty({ v }: { v: number }) {
  return <span className={cn("whitespace-nowrap font-mono text-[13px] tabular-nums", v < 0 ? "font-bold text-bad" : v === 0 ? "text-t2" : "text-t1")}>{qty(v)}</span>;
}

function TotalQty({ v }: { v: number }) {
  return <span className={cn("whitespace-nowrap font-mono text-[13px] font-bold tabular-nums", v < 0 ? "text-bad" : "text-t0")}>{qty(v)}</span>;
}
