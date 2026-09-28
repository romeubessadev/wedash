import type { WizardStep } from "@/components/ui/WizardSteps";

/**
 * Etapas do primeiro acesso do Gestor. 1 = Senha (/create-password, troca da senha temporária);
 * 2 = ERP e 3 = Lojas (/onboarding — `onboarding_step` no banco; 1 é legado da antiga etapa Empresa → ERP).
 */
export const ONBOARDING_STEPS: WizardStep[] = [
  { num: 1, label: "Senha" },
  { num: 2, label: "ERP" },
  { num: 3, label: "Lojas" },
];
