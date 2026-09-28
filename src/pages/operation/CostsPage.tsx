import { useState } from "react";
import { Card, Input, useToast } from "@/components/ui";
import { StoreCardsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { saveStoreCostItems, type Store, type StoreCostItem, type StoreCostKind } from "@/data/wedash/stores";
import { Icon, icons } from "@/pages/users/Icons";
import { FormActions, NumberInput, SAVE_ERROR_MSG, StoreCardHeader, StoreCardsPage, numText, parseNum, useScopedStores } from "./shared";

const SECTIONS: { kind: StoreCostKind; title: string; hint: string; unit: "%" | "R$"; placeholder: string; empty: string }[] = [
  { kind: "FIXED", title: "Custos fixos", hint: "Valor mensal", unit: "R$", placeholder: "Nome do custo (ex.: Energia)", empty: "Nenhum custo fixo cadastrado." },
  {
    kind: "VARIABLE",
    title: "Custos variáveis",
    hint: "Percentual sobre o faturamento",
    unit: "%",
    placeholder: "Nome do custo (ex.: Taxa do cartão)",
    empty: "Nenhum custo variável cadastrado.",
  },
  { kind: "OTHER", title: "Outras despesas", hint: "Valor mensal", unit: "R$", placeholder: "Nome da despesa (ex.: Contador)", empty: "Nenhuma outra despesa cadastrada." },
];

/** Linha editável; `id` ausente = item novo ainda não salvo. */
type Draft = { key: string; id?: string; kind: StoreCostKind; name: string; value: string };

function toDrafts(items: StoreCostItem[]): Draft[] {
  return items.map((i) => ({
    key: i.id ?? crypto.randomUUID(),
    id: i.id,
    kind: i.kind,
    name: i.name,
    value: i.kind === "VARIABLE" ? numText(i.pct) : numText(i.amount, "R$"),
  }));
}

const snapshot = (ds: Draft[]) => JSON.stringify(ds.map(({ id, kind, name, value }) => ({ id, kind, name: name.trim(), value: value.trim() })));

/** Configurações da operação > Custos — custos fixos, variáveis e outras despesas de cada loja. */
export function CostsPage() {
  const { session, lojas, loading, refresh } = useScopedStores();
  return (
    <StoreCardsPage
      section="Configurações da operação"
      title="Custos"
      subtitle="Configure os custos fixos, variáveis e outras despesas de cada loja."
      loading={loading}
      skeleton={<StoreCardsSkeleton rows={3} />}
      lojas={lojas}
    >
      {(loja) => <CostsCard tenantId={session.tenantId} loja={loja} onSaved={refresh} />}
    </StoreCardsPage>
  );
}

function CostsCard({ tenantId, loja, onSaved }: { tenantId: string; loja: Store; onSaved: () => void }) {
  const { show } = useToast();
  const [saved, setSaved] = useState<Draft[]>(() => toDrafts(loja.custoItens ?? []));
  const [drafts, setDrafts] = useState<Draft[]>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = snapshot(drafts) !== snapshot(saved);

  const change = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const add = (kind: StoreCostKind) => setDrafts((ds) => [...ds, { key: crypto.randomUUID(), kind, name: "", value: "" }]);
  const remove = (key: string) => setDrafts((ds) => ds.filter((d) => d.key !== key));

  async function save() {
    const items: StoreCostItem[] = [];
    for (const s of SECTIONS) {
      for (const d of drafts.filter((x) => x.kind === s.kind)) {
        const name = d.name.trim();
        if (!name) return show(`${s.title}: dê um nome para cada item.`, "danger");
        const v = parseNum(d.value);
        if (v == null || Number.isNaN(v) || v < 0 || (s.unit === "%" && v > 100)) {
          return show(
            s.unit === "%" ? `${name}: informe um percentual entre 0 e 100. Ex.: 2,5.` : `${name}: informe um valor mensal válido em R$. Ex.: 800,00.`,
            "danger",
          );
        }
        items.push({ id: d.id, kind: s.kind, name, amount: s.unit === "R$" ? v : null, pct: s.unit === "%" ? v : null });
      }
    }
    setSaving(true);
    const r = await saveStoreCostItems(tenantId, loja.id, items);
    setSaving(false);
    if (!r.ok) return show(SAVE_ERROR_MSG, "danger");
    const next = toDrafts(r.items);
    setSaved(next);
    setDrafts(next);
    onSaved();
    show("Alterações salvas.", "success");
  }

  return (
    <Card>
      <StoreCardHeader loja={loja} />
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {SECTIONS.map((s) => {
          const rows = drafts.filter((d) => d.kind === s.kind);
          return (
            <section key={s.kind} className="flex flex-col gap-2.5 border-t border-line pt-5 first:border-t-0 first:pt-0">
              <div>
                <h3 className="text-[13px] font-bold text-t0">{s.title}</h3>
                <p className="mt-0.5 text-[12px] text-t2">{s.hint}</p>
              </div>
              {rows.length === 0 && <p className="text-[12.5px] text-t2">{s.empty}</p>}
              {rows.map((d) => (
                <div key={d.key} className="flex items-center gap-2 sm:gap-3">
                  <Input
                    className="h-9! min-w-0 flex-1"
                    placeholder={s.placeholder}
                    value={d.name}
                    onChange={(e) => change(d.key, { name: e.target.value })}
                    aria-label={`Nome · ${s.title}`}
                  />
                  <NumberInput
                    compact
                    className="w-[120px] shrink-0 sm:w-[150px]"
                    unit={s.unit}
                    value={d.value}
                    onChange={(v) => change(d.key, { value: v })}
                    aria-label={`Valor · ${d.name || s.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => remove(d.key)}
                    aria-label="Excluir item"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-t2 hover:bg-bg-3 hover:text-bad"
                  >
                    <Icon d={icons.trash} size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => add(s.kind)}
                className="flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-acc hover:underline"
              >
                <Icon d={icons.plus} size={14} />
                Adicionar
              </button>
            </section>
          );
        })}
        <FormActions dirty={dirty} saving={saving} onReset={() => setDrafts(saved)} />
      </form>
    </Card>
  );
}

export default CostsPage;
