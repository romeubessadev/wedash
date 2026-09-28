import { useState } from "react";
import { Card, FormField, Segmented, useToast } from "@/components/ui";
import { StoreCardsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { updateStoreCosts, type PointType, type Store } from "@/data/wedash/stores";
import { INVALID_COSTS_MSG, useCostFields, type CostField } from "./costFields";
import { FormActions, NumberField, SAVE_ERROR_MSG, StoreCardHeader, StoreCardsPage, useScopedStores } from "./shared";

const RENT_MIN: CostField = {
  key: "rentMin",
  label: "Aluguel",
  hint: "Valor mensal.",
  unit: "R$",
  get: (c) => c.rentMin,
  set: (c, v) => ({ ...c, rentMin: v }),
};

/** Aluguel % vale para a loja toda: grava igual nas duas marcas. */
const RENT_PCT: CostField = {
  key: "rentPct",
  label: "Aluguel percentual",
  hint: "Sobre o faturamento total.",
  unit: "%",
  get: (c) => c.rentWepinkPct ?? c.rentWpinkPct,
  set: (c, v) => ({ ...c, rentWepinkPct: v, rentWpinkPct: v }),
};

const RENT_FIELDS = [RENT_MIN, RENT_PCT];

const POINT_OPTIONS: { value: PointType; label: string }[] = [
  { value: "SHOPPING", label: "Shopping" },
  { value: "RUA", label: "Rua" },
];

/** Configurações > Aluguel — aluguel mensal e, em shopping, percentual do faturamento (paga-se o que passar do aluguel). */
export function RentPage() {
  const { lojas, loading, refresh } = useScopedStores();
  return (
    <StoreCardsPage
      section="Configurações"
      title="Aluguel"
      subtitle="Em shopping, quando o percentual sobre o faturamento passa do aluguel, a diferença entra como aluguel extra. Ex.: aluguel de R$ 10.000 e 10% sobre R$ 120.000 vendidos = R$ 2.000 a mais."
      loading={loading}
      skeleton={(n) => <StoreCardsSkeleton count={n} fields={2} />}
      lojas={lojas}
    >
      {(loja) => <RentCard loja={loja} onSaved={refresh} />}
    </StoreCardsPage>
  );
}

function RentCard({ loja, onSaved }: { loja: Store; onSaved: () => void }) {
  const { show } = useToast();
  const form = useCostFields(loja, RENT_FIELDS);
  const [savedPoint, setSavedPoint] = useState<PointType>(loja.pointType);
  const [point, setPoint] = useState<PointType>(savedPoint);
  const [saving, setSaving] = useState(false);
  const rua = point === "RUA";
  const fields = rua ? [RENT_MIN] : RENT_FIELDS;

  async function save() {
    const merged = form.merged();
    if (!merged) return show(INVALID_COSTS_MSG, "danger");
    const custos = rua ? RENT_PCT.set(merged, null) : merged;
    setSaving(true);
    const r = await updateStoreCosts(loja.id, custos, point);
    setSaving(false);
    if (!r.ok) return show(SAVE_ERROR_MSG, "danger");
    form.markSaved(custos);
    setSavedPoint(point);
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
        <FormField label="Tipo de loja" hint={rua ? "Loja de rua paga só o aluguel." : "Loja em shopping paga o aluguel e, se passar dele, o percentual."}>
          <Segmented options={POINT_OPTIONS} value={point} onChange={(v) => v && setPoint(v)} />
        </FormField>
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
        <FormActions
          dirty={form.dirty || point !== savedPoint}
          saving={saving}
          onReset={() => {
            form.reset();
            setPoint(savedPoint);
          }}
        />
      </form>
    </Card>
  );
}

export default RentPage;
