import { Outlet, useLocation } from "react-router-dom";
import { PageHeader, TabNav } from "@/components/ui";
import { paths } from "@/router/paths";
import { useActiveSession } from "@/session/SessionProvider";
import { isGestor } from "@/layout/nav-wedash";

/** Mesma ordem do menu do avatar. */
const TABS = [
  { label: "Integrações", to: paths.settings.erp },
  { label: "Usuários", to: paths.settings.users },
  { label: "Logs", to: paths.settings.logs },
];

const META: Record<string, { title: string; subtitle: string }> = {
  [paths.settings.stores]: {
    title: "Lojas",
    subtitle: "Configure o funcionamento de cada loja.",
  },
  [paths.settings.erp]: {
    title: "Integrações",
    subtitle: "Gerencie a conexão da WeDash com o Millennium.",
  },
  [paths.settings.users]: {
    title: "Usuários",
    subtitle: "Gerencie os gestores e gerentes que acessam a WeDash.",
  },
  [paths.settings.logs]: {
    title: "Logs",
    subtitle: "Acompanhe erros e avisos da sincronização com o Millennium.",
  },
};

/**
 * Shell de Administração (menu do avatar) — mesmo padrão Vela (TabNav).
 * Abas só para o Gestor nas telas Integrações · Usuários · Logs; Lojas (só por URL por enquanto) fica sem abas.
 */
export function WedashSettingsLayout() {
  const { pathname } = useLocation();
  const session = useActiveSession();
  const meta = META[pathname] ?? META[paths.settings.stores]!;
  const tabs = isGestor(session.role) && TABS.some((t) => t.to === pathname) ? TABS : [];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Administração" }, { label: meta.title }]}
        title={meta.title}
        subtitle={meta.subtitle}
      />
      {tabs.length > 0 && <TabNav items={tabs} />}
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
