import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, DataTable, Modal, type DataTableColumn, type SortDir } from "@/components/ui";
import type { StatusVariant } from "@/lib/status";
import { Tooltip } from "@/components/ui/Tooltip";
import { StockProductsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { MobileSortBar } from "@/components/wedash/MobileSortBar";
import { stockStatus, type StockProductRow, type StockStatus } from "@/data/wedash/stockProducts";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
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
type SortKey = "nome" | "estoque" | "vendidos";

const STATUS_BADGE: Record<StockStatus, { label: string; variant: StatusVariant }> = {
  negativo: { label: "Estoque negativo", variant: "danger" },
  transferir: { label: "Transferir", variant: "warning" },
  falta: { label: "Em falta", variant: "danger" },
  ok: { label: "Ok", variant: "success" },
};

function statusTip(r: StockProductRow, status: StockStatus, variasLojas: boolean): string {
  const loja = (nome: string) => (variasLojas ? `${nome}: ` : "");
  if (status === "negativo")
    return r.lojas
      .filter((l) => l.estoque < 0)
      .map((l) => `${loja(l.store.fantasia)}saldo ${qty(l.estoque)} no Millennium. Confira as entradas e saídas.`)
      .join(" · ");
  if (status === "transferir")
    return r.lojas.flatMap((l) => l.transferencias.map((t) => `${loja(l.store.fantasia)}${transferText(t)}`)).join(" · ");
  if (status === "falta")
    return r.lojas
      .filter((l) => l.estoque <= 0 && l.vendidos30d > 0)
      .map((l) => `${loja(l.store.fantasia)}sem saldo e ${qty(l.vendidos30d)} vendidos nos últimos 30 dias.`)
      .join(" · ");
  return "Saldo positivo em todos os locais.";
}

export function InventoryPage() {
  const { lojas, storeKey, view, loading, syncing, atualizadoTexto } = useStockData({ prices: false });
  const [busca, setBusca] = useState("");
  const [statusSel, setStatus] = useState<StatusFiltro>("todos");
  const [categoria, setCategoria] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [detalhe, setDetalhe] = useState<string | null>(null);
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
      const va = sortKey === "estoque" ? a.r.estoque : a.r.itensVendidos30d;
      const vb = sortKey === "estoque" ? b.r.estoque : b.r.itensVendidos30d;
      return (va - vb) * dir || a.r.nome.localeCompare(b.r.nome, "pt-BR");
    });
    return out;
  }, [comStatus, busca, status, categoria, sortKey, sortDir]);

  useEffect(() => setPage(1), [busca, status, categoria, sortKey, sortDir, storeKey]);

  const locais = useMemo(() => {
    const nomes = view ? stockLocations(view.rows) : [];
    return nomes.length > 1 ? nomes : [];
  }, [view]);

  const totalPages = Math.max(1, Math.ceil(linhas.length / TABLE_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = printing ? linhas : linhas.slice((pageSafe - 1) * TABLE_PAGE_SIZE, pageSafe * TABLE_PAGE_SIZE);

  type Linha = (typeof linhas)[number];
  const columns: DataTableColumn<Linha>[] = [
    { key: "produto", header: "Produto", render: ({ r }) => <ProductCell r={r} /> },
    ...locais.map<DataTableColumn<Linha>>((nome) => ({
      key: `local:${nome}`,
      header: nome,
      align: "right",
      render: ({ r }) => {
        const v = localQty(r, nome);
        return <span className={cn("tabular-nums", v < 0 ? "font-semibold text-bad" : v === 0 ? "text-t2" : "text-t1")}>{qty(v)}</span>;
      },
    })),
    {
      key: "estoque",
      header: locais.length > 0 ? "Total" : "Estoque",
      align: "right",
      render: ({ r }) => <span className={cn("font-extrabold tabular-nums", r.estoque < 0 ? "text-bad" : "text-t0")}>{qty(r.estoque)}</span>,
    },
    {
      key: "vendidos",
      header: "Vendidos (30 dias)",
      align: "right",
      render: ({ r }) => <span className={cn("tabular-nums", r.itensVendidos30d === 0 ? "text-t2" : "text-t1")}>{qty(r.itensVendidos30d)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: ({ r, status: s }) => (
        <Tooltip label={statusTip(r, s, variasLojas)}>
          <span>
            <Badge variant={STATUS_BADGE[s].variant}>{s === "transferir" ? `Transferir ${qty(r.transferir)}` : STATUS_BADGE[s].label}</Badge>
          </span>
        </Tooltip>
      ),
    },
  ];

  const produtoDetalhe = detalhe ? (view?.rows.find((r) => r.codigo === detalhe) ?? null) : null;
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
                { key: "vendidos", label: "Vendidos" },
              ]}
              sortKey={sortKey}
              sortDir={sortDir}
              onChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
            />
          )}

          <DataTable
            columns={columns}
            data={pageRows}
            rowKey={({ r }) => r.codigo}
            onRowClick={({ r }) => setDetalhe(r.codigo)}
            empty={
              <div className="flex rounded-[var(--radius-vela-lg)] border border-line bg-bg-2 p-4">
                {view.rows.length === 0 ? (
                  <EmptyBlock icon="📦" title="Sem estoque" description={syncing ? "Buscando o estoque no Millennium…" : "Nenhum produto com saldo nas lojas selecionadas."} />
                ) : (
                  <EmptyBlock icon="🔍" title="Nenhum produto encontrado" description="Tente buscar por outro nome ou código." />
                )}
              </div>
            }
          />
          {linhas.length > 0 && <TableFooter shown={pageRows.length} total={linhas.length} page={pageSafe} totalPages={totalPages} onPage={setPage} />}
        </>
      )}

      {produtoDetalhe && <InventoryDetailModal row={produtoDetalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}

export default InventoryPage;

function InventoryDetailModal({ row, onClose }: { row: StockProductRow; onClose: () => void }) {
  const varias = row.lojas.length > 1;
  return (
    <Modal open onClose={onClose} title={row.nome} size="lg">
      <p className="-mt-1 text-[12px] text-t2">
        {row.codigo}
        {row.categoria && ` · ${row.categoria}`} · Estoque {qty(row.estoque)} · Vendidos nos últimos 30 dias {num(row.itensVendidos30d)}
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {row.lojas
          .filter((l) => l.locais.length > 0 || l.estoque !== 0 || l.vendidos30d > 0)
          .map((l) => (
          <div key={l.store.id} className="flex flex-col gap-2">
            <div className="rounded-[var(--radius-vela-sm)] bg-bg-inset px-3 py-2.5 text-[12.5px]">
              {varias && <p className="mb-1 font-semibold uppercase text-t0">{l.store.fantasia}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {l.locais.map((x) => (
                  <span key={x.nome} className="text-t1">
                    {x.nome} <span className={cn("font-bold tabular-nums", x.qtd < 0 ? "text-bad" : "text-t0")}>{qty(x.qtd)}</span>
                  </span>
                ))}
                <span className="text-t2">
                  Total <span className={cn("font-bold tabular-nums", l.estoque < 0 ? "text-bad" : "text-t0")}>{qty(l.estoque)}</span>
                </span>
                <span className="text-t2">
                  Vendidos (30 dias) <span className="font-bold tabular-nums text-t0">{qty(l.vendidos30d)}</span>
                </span>
              </div>
            </div>
            {l.transferencias.map((t) => (
              <Alert key={t.para} variant="warning" title={transferText(t)}>
                O {t.para} está com saldo negativo e o produto está no {t.de.join(" / ")}.
              </Alert>
            ))}
            {l.estoque <= 0 && l.vendidos30d > 0 && (
              <Alert variant="danger" title="Produto em falta">
                Vendeu {qty(l.vendidos30d)} nos últimos 30 dias e está sem saldo{varias ? " nesta loja" : ""}.
              </Alert>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
