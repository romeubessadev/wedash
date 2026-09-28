import type { RouteObject } from "react-router-dom";
import { lazyPage } from "@/lib/lazyPage";
import { paths } from "@/router/paths";
import { RequireRole } from "@/session/RequireSession";
import { ComingSoon } from "@/pages/coming-soon/ComingSoon";

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
            titulo="Desafios"
            fase="Fase 2 · em construção"
            descricao="Objetivos pontuais em quantidade, produto, faturamento, P.A. ou ticket médio. Prêmio em reais; meta nunca em reais (exceto ticket/faturamento)."
            itens={[
              "Nome, tipo, critério, meta por pessoa, prêmio, período e participantes",
              "Produtos por categoria, não SKU a SKU",
              "Aviso de quantos já estão ativos ao criar",
              "Candidatos: compra bloqueada com estoque, cobertura alta com ticket acima da média",
            ]}
          />
        ),
      },
    ],
  },
];
