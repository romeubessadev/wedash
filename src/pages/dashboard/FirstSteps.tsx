import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardTitle, ProgressBar, useToast } from "@/components/ui";
import {
  buildFirstSteps,
  completeFirstSteps,
  fetchFirstStepsData,
  fetchFirstStepsDone,
  type FirstStep,
  type FirstStepsData,
} from "@/data/wedash/firstSteps";
import { storesForSession } from "@/data/wedash/stores";
import { isGestor } from "@/layout/nav-wedash";
import { cn } from "@/lib/cn";
import { paths } from "@/router/paths";
import { useActiveSession } from "@/session/SessionProvider";

/** loading = ainda não sabe; hidden = concluído ou não é Gestor; visible = mostra o card. */
export type FirstStepsStatus = "loading" | "hidden" | "visible";

/**
 * Primeiros passos da empresa (só Gestor). Os passos se marcam sozinhos pelos dados já salvos;
 * ao chegar a 100% grava no banco e o card não volta mais.
 */
export function useFirstSteps() {
  const session = useActiveSession();
  const { show } = useToast();
  const gestor = isGestor(session.role);
  const [doneFlag, setDoneFlag] = useState<boolean | null>(null);
  const [data, setData] = useState<FirstStepsData | null>(null);
  const [storesTick, setStoresTick] = useState(0);
  const completing = useRef(false);

  useEffect(() => {
    if (!gestor) return;
    let cancelled = false;
    void fetchFirstStepsDone(session.tenantId).then((d) => {
      if (!cancelled) setDoneFlag(d);
    });
    return () => {
      cancelled = true;
    };
  }, [gestor, session.tenantId]);

  const stores = useMemo(
    () => storesForSession(session.stores),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.stores, storesTick],
  );
  const storesKey = stores.map((s) => s.id).join(",");

  const reload = useCallback(async () => {
    const d = await fetchFirstStepsData(session.tenantId, storesKey ? storesKey.split(",") : []);
    setData(d);
  }, [session.tenantId, storesKey]);

  useEffect(() => {
    if (!gestor || doneFlag !== false) return;
    void reload();
    const onStores = () => setStoresTick((n) => n + 1);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("wedash:stores", onStores);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("wedash:stores", onStores);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [gestor, doneFlag, reload]);

  const steps = useMemo(() => (data ? buildFirstSteps({ stores, ...data }) : []), [stores, data]);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = steps.length > 0 && doneCount === steps.length;

  useEffect(() => {
    if (!allDone || doneFlag !== false || completing.current) return;
    completing.current = true;
    void completeFirstSteps(session.tenantId).then((ok) => {
      completing.current = false;
      if (!ok) return;
      setDoneFlag(true);
      show("Primeiros passos concluídos.", "success");
    });
  }, [allDone, doneFlag, session.tenantId, show]);

  const status: FirstStepsStatus = !gestor || doneFlag === true || allDone ? "hidden" : data == null ? "loading" : "visible";
  return { status, steps, doneCount, tenantId: session.tenantId };
}

function stepAction(step: FirstStep): { label: string; to: string } | null {
  switch (step.id) {
    case "hours":
      return { label: "Configurar funcionamento", to: paths.operation.store };
    case "groups":
      return step.needsGroups
        ? { label: "Criar grupos", to: paths.management.shifts }
        : { label: "Vincular vendedores", to: paths.management.staff };
    case "franchise":
      return { label: "Configurar franquia", to: paths.operation.franchise };
    case "rent":
      return { label: "Configurar aluguel", to: paths.operation.rent };
    case "taxes":
      return { label: "Configurar impostos", to: paths.operation.productsTaxes };
    case "goal":
      return { label: "Criar meta", to: paths.goalNew };
    case "challenge":
      return { label: "Criar desafio", to: paths.management.challengeNew };
    default:
      return null;
  }
}

const collapsedKey = (tenantId: string) => `wedash.firstSteps.collapsed:${tenantId}`;

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export function FirstStepsCard({ steps, doneCount, tenantId }: { steps: FirstStep[]; doneCount: number; tenantId: string }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(collapsedKey(tenantId)) === "1");
  const pct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
  const nextId = steps.find((s) => !s.done)?.id;

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem(collapsedKey(tenantId), c ? "0" : "1");
      return !c;
    });
  }

  return (
    <Card className="mt-4 print:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <CardTitle>Primeiros passos</CardTitle>
          <p className="mt-0.5 text-[12px] text-t2">
            Configure a WeDash para ver custos, margens, metas e premiação corretos.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="text-[12px] font-semibold text-t1">
            {doneCount} de {steps.length} concluídos
          </span>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("shrink-0 text-t2 transition-transform", !collapsed && "rotate-180")}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar value={pct} color="var(--acc)" height={6} />
        </div>
        <span className="font-mono text-[13px] font-extrabold text-t0">{pct}%</span>
      </div>

      {!collapsed && (
        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2 animate-vela-fade">
          {steps.map((step, idx) => {
            const action = step.done ? null : stepAction(step);
            const proximo = step.id === nextId;
            return (
              <div
                key={step.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-line px-4 py-3 sm:flex-row sm:items-center",
                  proximo && "border-l-[3px] border-l-acc",
                  step.done && "opacity-60",
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                      step.done ? "border-ok bg-ok text-white" : proximo ? "border-acc text-acc" : "border-line-2 text-t2",
                    )}
                  >
                    {step.done ? <CheckIcon /> : idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={cn("text-[13.5px] font-semibold", step.done ? "text-t2 line-through" : "text-t0")}>
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-t2">{step.description}</p>
                    {step.detail && <p className="mt-1 text-[11.5px] font-semibold text-warn">{step.detail}</p>}
                  </div>
                </div>
                {action && (
                  <Button
                    size="sm"
                    variant={proximo ? "primary" : "secondary"}
                    className="shrink-0 self-start sm:self-center"
                    onClick={() => navigate(action.to)}
                  >
                    {action.label}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
