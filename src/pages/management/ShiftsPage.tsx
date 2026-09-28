import { useEffect, useState } from "react";
import { Button, Card, EmptyState, Input, useToast } from "@/components/ui";
import { StoreCardsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { deleteStoreShift, fetchStoreShifts, saveStoreShift, type Store, type StoreShift } from "@/data/wedash/stores";
import { Icon, icons } from "@/pages/users/Icons";
import { titleName } from "@/lib/format";
import { FormActions, StoreCardHeader, StoreCardsPage, TimeSelect, nextHalfHour, useScopedStores } from "@/pages/operation/shared";

/** Linha editável; `id` ausente = turno novo ainda não salvo. */
type ShiftDraft = { key: string; id?: string; name: string; start: string; end: string };

const toDraft = (s: StoreShift): ShiftDraft => ({ key: s.id, id: s.id, name: s.name, start: s.start, end: s.end });
const toShift = (d: ShiftDraft): StoreShift => ({ id: d.id ?? "", name: titleName(d.name), start: d.start, end: d.end });

/** Gestão > Turnos — turnos de cada loja. O turno de cada pessoa fica em Colaboradores. */
export function ShiftsPage() {
  const { session, lojas, loading } = useScopedStores();
  return (
    <StoreCardsPage
      section="Gestão"
      title="Turnos"
      subtitle="Turnos de cada loja. O turno de cada pessoa é definido em Colaboradores."
      loading={loading}
      skeleton={<StoreCardsSkeleton rows={2} />}
      lojas={lojas}
    >
      {(loja) => <ShiftsCard tenantId={session.tenantId} loja={loja} />}
    </StoreCardsPage>
  );
}

function ShiftsCard({ tenantId, loja }: { tenantId: string; loja: Store }) {
  const { show } = useToast();
  const [saved, setSaved] = useState<StoreShift[]>([]);
  const [shifts, setShifts] = useState<ShiftDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(shifts.map(toShift)) !== JSON.stringify(saved);

  useEffect(() => {
    let cancelled = false;
    void fetchStoreShifts(tenantId, loja.id).then((list) => {
      if (cancelled) return;
      setSaved(list);
      setShifts(list.map(toDraft));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, loja.id]);

  function add() {
    const start = shifts[shifts.length - 1]?.end ?? "09:00";
    setShifts([...shifts, { key: crypto.randomUUID(), name: "", start, end: nextHalfHour(start) }]);
  }

  function change(key: string, patch: Partial<ShiftDraft>) {
    setShifts(shifts.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  async function save() {
    const nomes = new Set<string>();
    for (const s of shifts) {
      const nome = s.name.trim();
      if (!nome) return show("Dê um nome para cada turno.", "danger");
      if (nomes.has(nome.toLowerCase())) return show(`Turno "${nome}" repetido.`, "danger");
      nomes.add(nome.toLowerCase());
      if (s.start >= s.end) return show(`${nome}: início deve ser antes do fim.`, "danger");
    }
    setSaving(true);
    let error: string | null = null;
    const keep = new Set(shifts.map((s) => s.id).filter(Boolean));
    for (const old of saved) {
      if (error || keep.has(old.id)) continue;
      const r = await deleteStoreShift(old.id);
      if (!r.ok) error = r.error;
    }
    for (const s of shifts) {
      if (error) break;
      const antes = saved.find((x) => x.id === s.id);
      if (antes && JSON.stringify(antes) === JSON.stringify(toShift(s))) continue;
      const r = await saveStoreShift({ tenantId, storeId: loja.id, shift: toShift(s) });
      if (!r.ok) error = r.error;
    }
    const list = await fetchStoreShifts(tenantId, loja.id);
    setSaved(list);
    setShifts(list.map(toDraft));
    setSaving(false);
    if (error) show(`Não foi possível salvar: ${error}`, "danger");
    else show("Alterações salvas.", "success");
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
        {!loaded ? null : shifts.length === 0 ? (
          <EmptyState
            framed={false}
            className="py-4!"
            icon="🕒"
            title="Nenhum turno cadastrado"
            description="Crie os turnos da loja para definir o turno de cada pessoa da equipe."
            action={
              <Button type="button" size="sm" icon={<Icon d={icons.plus} size={14} />} onClick={add}>
                Adicionar turno
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {shifts.map((s) => (
              <div key={s.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
                <Input
                  className="h-9! min-w-0 flex-1 basis-full sm:basis-auto"
                  placeholder="Nome (ex.: Manhã)"
                  value={s.name}
                  onChange={(e) => change(s.key, { name: e.target.value })}
                  aria-label="Nome do turno"
                />
                <TimeSelect value={s.start} onChange={(v) => change(s.key, { start: v })} />
                <span className="text-t2">–</span>
                <TimeSelect value={s.end} onChange={(v) => change(s.key, { end: v })} />
                <button
                  type="button"
                  onClick={() => setShifts(shifts.filter((x) => x.key !== s.key))}
                  aria-label={`Excluir turno ${s.name || ""}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-t2 hover:bg-bg-3 hover:text-bad"
                >
                  <Icon d={icons.trash} size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {shifts.length > 0 && (
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-acc hover:underline"
          >
            <Icon d={icons.plus} size={14} />
            Adicionar turno
          </button>
        )}
        {(shifts.length > 0 || dirty) && <FormActions dirty={dirty} saving={saving} onReset={() => setShifts(saved.map(toDraft))} />}
      </form>
    </Card>
  );
}

export default ShiftsPage;
