import { useEffect, useState } from "react";
import { Button, Card, FormField, Select, useToast } from "@/components/ui";
import { StoreCardsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { fetchCostTables, updateStoreCosts, updateStoreCostTable, type CostTable, type Store } from "@/data/wedash/stores";
import { syncProductsNow } from "@/data/wedash/productCatalog";
import { INVALID_COSTS_MSG, pctField, useCostFields, type CostField } from "./costFields";
import { FormActions, NumberField, RefreshIcon, SAVE_ERROR_MSG, StoreCardHeader, StoreCardsPage, useScopedStores } from "./shared";

const TAX_FIELDS: CostField[] = [
  pctField("icmsPct", "ICMS", "Percentual sobre o faturamento."),
  pctField("icmsStPct", "ICMS ST", "Percentual sobre o custo dos produtos (CMV)."),
];

/** Configurações da operação > Produtos e impostos — tabela de custo do Millennium, ICMS e ICMS ST. */
export function ProductsTaxesPage() {
  const { show } = useToast();
  const { lojas, loading, refresh } = useScopedStores();
  const [tables, setTables] = useState<CostTable[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchCostTables().then((list) => {
      if (!cancelled) setTables(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function atualizarTabelas() {
    setSyncing(true);
    const r = await syncProductsNow({ scope: "tables" });
    if (r.ok) setTables(await fetchCostTables());
    setSyncing(false);
    if (!r.ok) return show(r.message, "danger");
    show("Tabelas de custo atualizadas.", "success");
  }

  return (
    <StoreCardsPage
      section="Configurações da operação"
      title="Produtos e impostos"
      subtitle="Configure a tabela de custo dos produtos e os impostos de cada loja."
      actions={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void atualizarTabelas()}
          disabled={syncing}
          title="Busca no Millennium as tabelas de custo disponíveis."
          icon={syncing ? undefined : <RefreshIcon />}
        >
          {syncing ? "Atualizando…" : "Atualizar tabelas"}
        </Button>
      }
      loading={loading}
      skeleton={(n) => <StoreCardsSkeleton count={n} fields={3} />}
      lojas={lojas}
    >
      {(loja) => <ProductsTaxesCard loja={loja} tables={tables} onSaved={refresh} />}
    </StoreCardsPage>
  );
}

function ProductsTaxesCard({ loja, tables, onSaved }: { loja: Store; tables: CostTable[]; onSaved: () => void }) {
  const { show } = useToast();
  const form = useCostFields(loja, TAX_FIELDS);
  const [savedTable, setSavedTable] = useState<number | null>(loja.costTableId ?? null);
  const [table, setTable] = useState<number | null>(savedTable);
  const [saving, setSaving] = useState(false);
  const tableDirty = table !== savedTable;

  /** Tabela nova busca os preços no Millennium antes; falhou = nada é gravado. */
  async function save() {
    const custos = form.merged();
    if (!custos) return show(INVALID_COSTS_MSG, "danger");
    setSaving(true);
    if (tableDirty && table != null) {
      const prices = await syncProductsNow({ scope: "table", tableId: table });
      if (!prices.ok) {
        setSaving(false);
        return show(prices.message, "danger");
      }
    }
    if (form.dirty) {
      const r = await updateStoreCosts(loja.id, custos);
      if (!r.ok) {
        setSaving(false);
        return show(SAVE_ERROR_MSG, "danger");
      }
      form.markSaved(custos);
    }
    if (tableDirty) {
      const r = await updateStoreCostTable(loja.id, table);
      if (!r.ok) {
        setSaving(false);
        return show(SAVE_ERROR_MSG, "danger");
      }
      setSavedTable(table);
    }
    setSaving(false);
    onSaved();
    show("Alterações salvas.", "success");
  }

  return (
    <Card>
      <StoreCardHeader loja={loja} />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormField
          label="Tabela de custo dos produtos"
          hint="Usada quando um produto vendido chega do Millennium sem custo. A WeDash seleciona automaticamente a tabela mais próxima dos custos da loja."
        >
          <Select
            value={table == null ? "" : String(table)}
            disabled={tables.length === 0 && table == null}
            onChange={(e) => setTable(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{tables.length === 0 ? "Aguardando sincronização" : "Nenhuma"}</option>
            {table != null && !tables.some((t) => t.id === table) && <option value={String(table)}>Tabela {table}</option>}
            {tables.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.code} · {t.description}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TAX_FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              hint={f.hint}
              unit={f.unit}
              value={form.txt[f.key] ?? ""}
              onChange={(v) => form.setField(f.key, v)}
            />
          ))}
        </div>
        <FormActions
          dirty={form.dirty || tableDirty}
          saving={saving}
          onReset={() => {
            form.reset();
            setTable(savedTable);
          }}
        />
      </form>
    </Card>
  );
}

export default ProductsTaxesPage;
