import type { RouteObject } from "react-router-dom";
import { lazyPage } from "@/lib/lazyPage";
import { paths } from "@/router/paths";
import { RequireRole } from "@/session/RequireSession";

const StockProductsPage = lazyPage(() => import("./StockProductsPage"), "StockProductsPage");

/** Estoque — Gestor e Gerente. */
export const stockRoutes: RouteObject[] = [
  {
    element: <RequireRole roles={["OWNER", "MANAGER", "ADMIN_GLOBAL"]} />,
    children: [{ path: paths.stock.products, element: <StockProductsPage /> }],
  },
];
