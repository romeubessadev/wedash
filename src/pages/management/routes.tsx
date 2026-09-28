import type { RouteObject } from "react-router-dom";
import { lazyPage } from "@/lib/lazyPage";
import { paths } from "@/router/paths";
import { RequireRole } from "@/session/RequireSession";
import { ComingSoon } from "@/pages/coming-soon/ComingSoon";
import { SectionHeader } from "@/pages/operation/shared";

const ShiftsPage = lazyPage(() => import("./ShiftsPage"), "ShiftsPage");
const StaffPage = lazyPage(() => import("./StaffPage"), "StaffPage");

/** Gestão — Gestor e Gerente (Metas fica em `paths.goals`). */
export const managementRoutes: RouteObject[] = [
  {
    element: <RequireRole roles={["OWNER", "MANAGER", "ADMIN_GLOBAL"]} />,
    children: [
      { path: paths.management.shifts, element: <ShiftsPage /> },
      { path: paths.management.staff, element: <StaffPage /> },
      {
        path: paths.management.challenges,
        element: (
          <ComingSoon
            header={<SectionHeader section="Gestão" title="Desafios" subtitle="Crie objetivos para engajar a equipe e acompanhar resultados." />}
            titulo="Desafios"
            fase="Crie objetivos para engajar a equipe e acompanhar resultados."
            icone="🔥"
            aviso="Desafios estarão disponíveis em breve"
            descricao="Em breve, você poderá criar desafios de vendas, produtos, P.A., ticket médio e outros indicadores da equipe."
            tituloLista="O que estará disponível"
            itens={[
              "Definição do período",
              "Meta por pessoa",
              "Participantes",
              "Critério do desafio",
              "Valor da premiação",
              "Acompanhamento do progresso",
            ]}
          />
        ),
      },
    ],
  },
];
