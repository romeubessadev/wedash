import type { RouteObject } from "react-router-dom";
import { lazyPage } from "@/lib/lazyPage";
import { paths } from "@/router/paths";
import { RequireRole } from "@/session/RequireSession";

const ShiftsPage = lazyPage(() => import("./ShiftsPage"), "ShiftsPage");
const StaffPage = lazyPage(() => import("./StaffPage"), "StaffPage");
const ChallengesPage = lazyPage(() => import("./ChallengesPage"), "ChallengesPage");

/** Gestão — Gestor e Gerente (Metas fica em `paths.goals`). */
export const managementRoutes: RouteObject[] = [
  {
    element: <RequireRole roles={["OWNER", "MANAGER", "ADMIN_GLOBAL"]} />,
    children: [
      { path: paths.management.shifts, element: <ShiftsPage /> },
      { path: paths.management.staff, element: <StaffPage /> },
      { path: paths.management.challenges, element: <ChallengesPage /> },
    ],
  },
];
