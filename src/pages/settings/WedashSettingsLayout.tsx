import { Outlet, useLocation } from "react-router-dom";
import { PageHeader, TabNav } from "@/components/ui";
import { paths } from "@/router/paths";
import { useActiveSession } from "@/session/SessionProvider";
import { isGestor } from "@/layout/nav-wedash";

const TABS = [
  { label: "Lojas", to: paths.settings.stores },
  { label: "Usuários", to: paths.settings.users, gestor: true },
  { label: "Integrações", to: paths.settings.erp, gestor: true },
  { label: "Logs", to: paths.settings.logs, gestor: true },
];

const META: Record<string, { title: string; subtitle: string }> = {
  [paths.settings.stores]: {
    title: "Lojas",
    subtitle: "Funcionamento de cada loja",
  },
  [paths.settings.users]: {
    title: "Usuários",
    subtitle: "Quem acessa o WeDash: gestores e gerentes",
  },
  [paths.settings.erp]: {
    title: "Integrações",
    subtitle: "Conexões com sistemas externos",
  },
  [paths.settings.logs]: {
    title: "Logs",
    subtitle: "Erros e avisos da sincronização com o Millennium",
  },
};

/**
 * Shell de Administração (menu do avatar) — mesmo padrão Vela (TabNav).
 * Gerente vê só Lojas (sem abas).
 */
export function WedashSettingsLayout() {
  const { pathname } = useLocation();
  const session = useActiveSession();
  const gestor = isGestor(session.role);
  const meta = META[pathname] ?? META[paths.settings.stores]!;
  const tabs = TABS.filter((t) => gestor || !t.gestor);

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Administração" }, { label: meta.title }]}
        title={meta.title}
        subtitle={meta.subtitle}
      />
      {tabs.length > 1 && <TabNav items={tabs.map(({ label, to }) => ({ label, to }))} />}
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
