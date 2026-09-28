import type { RouteObject } from "react-router-dom";
import { lazyPage } from "@/lib/lazyPage";
import { paths } from "@/router/paths";
import { RequireRole } from "@/session/RequireSession";
import { GESTOR_ROLES } from "@/layout/nav-wedash";

const CostsPage = lazyPage(() => import("./CostsPage"), "CostsPage");
const FranchisePage = lazyPage(() => import("./FranchisePage"), "FranchisePage");
const RentPage = lazyPage(() => import("./RentPage"), "RentPage");
const ProductsTaxesPage = lazyPage(() => import("./ProductsTaxesPage"), "ProductsTaxesPage");

/** Configurações da operação — só Gestor (custos alimentam o Financeiro). */
export const operationRoutes: RouteObject[] = [
  {
    element: <RequireRole roles={GESTOR_ROLES} />,
    children: [
      { path: paths.operation.costs, element: <CostsPage /> },
      { path: paths.operation.franchise, element: <FranchisePage /> },
      { path: paths.operation.rent, element: <RentPage /> },
      { path: paths.operation.productsTaxes, element: <ProductsTaxesPage /> },
    ],
  },
];
