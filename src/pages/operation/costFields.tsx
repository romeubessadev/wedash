import { useState, type ReactNode } from "react";
import { Card, useToast } from "@/components/ui";
import { EMPTY_STORE_COSTS, updateStoreCosts, type Store, type StoreCosts } from "@/data/wedash/stores";
import { FormActions, NumberField, StoreCardHeader, numText, parseNum } from "./shared";

/** Campo de custo da loja: lê e grava um pedaço de `store.custos`. */
export type CostField = {
  key: string;
  label: string;
  hint?: string;
  unit: "%" | "R$";
  get: (c: StoreCosts) => number | null;
  set: (c: StoreCosts, v: number | null) => StoreCosts;
};

export const pctField = (key: keyof StoreCosts, label: string, hint?: string): CostField => ({
  key,
  label,
  hint,
  unit: "%",
  get: (c) => c[key],
  set: (c, v) => ({ ...c, [key]: v }),
});

function toText(fields: CostField[], c: StoreCosts): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, numText(f.get(c), f.unit)]));
}

/** Estado de edição dos campos de uma loja (texto, alterado, validação e gravação). */
export function useCostFields(loja: Store, fields: CostField[]) {
  const [saved, setSaved] = useState(() => toText(fields, loja.custos ?? EMPTY_STORE_COSTS));
  const [txt, setTxt] = useState(saved);
  const dirty = fields.some((f) => txt[f.key] !== saved[f.key]);

  /** null = algum campo inválido (% fora de 0–100 ou R$ negativo). */
  function merged(): StoreCosts | null {
    let c = loja.custos ?? EMPTY_STORE_COSTS;
    for (const f of fields) {
      const v = parseNum(txt[f.key] ?? "");
      if (Number.isNaN(v) || (v != null && (v < 0 || (f.unit === "%" && v > 100)))) return null;
      c = f.set(c, v);
    }
    return c;
  }

  return {
    txt,
    dirty,
    setField: (key: string, v: string) => setTxt((p) => ({ ...p, [key]: v })),
    reset: () => setTxt(saved),
    merged,
    markSaved: (c: StoreCosts) => {
      const next = toText(fields, c);
      setSaved(next);
      setTxt(next);
    },
  };
}

export const INVALID_COSTS_MSG = "Confira os valores: percentuais entre 0 e 100 (ex.: 5 ou 2,5) e valores em R$ sem sinal negativo.";

/** Card da loja com campos de custo e Resetar/Salvar próprios. */
export function CostFieldsCard({
  loja,
  fields,
  footer,
  onSaved,
}: {
  loja: Store;
  fields: CostField[];
  footer?: ReactNode;
  onSaved: () => void;
}) {
  const { show } = useToast();
  const form = useCostFields(loja, fields);
  const [saving, setSaving] = useState(false);

  async function save() {
    const custos = form.merged();
    if (!custos) return show(INVALID_COSTS_MSG, "danger");
    setSaving(true);
    const r = await updateStoreCosts(loja.id, custos);
    setSaving(false);
    if (!r.ok) return show(`Não foi possível salvar: ${r.error}`, "danger");
    form.markSaved(custos);
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
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
        {footer}
        <FormActions dirty={form.dirty} saving={saving} onReset={form.reset} />
      </form>
    </Card>
  );
}
