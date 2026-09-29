import { Navigate, type RouteObject } from "react-router-dom";
import { lazyPage } from "@/lib/lazyPage";
import { paths } from "@/router/paths";
import { RequireRole } from "@/session/RequireSession";

const InventoryPage = lazyPage(() => import("./InventoryPage"), "InventoryPage");
const SaleTablesPage = lazyPage(() => import("./SaleTablesPage"), "SaleTablesPage");

/** Estoque — Gestor e Gerente. */
export const stockRoutes: RouteObject[] = [
  {
    element: <RequireRole roles={["OWNER", "MANAGER", "ADMIN_GLOBAL"]} />,
    children: [
      { path: paths.stock.inventory, element: <InventoryPage /> },
      { path: paths.stock.saleTables, element: <SaleTablesPage /> },
      { path: paths.stock.products, element: <Navigate to={paths.stock.inventory} replace /> },
    ],
  },
];
