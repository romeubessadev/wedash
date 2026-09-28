import { Navigate, type RouteObject } from "react-router-dom";
import { lazyPage } from "@/lib/lazyPage";
import { paths } from "@/router/paths";
import { RequireRole } from "@/session/RequireSession";

const LivePage = lazyPage(() => import("./LivePage"), "default");
const SharePage = lazyPage(() => import("./SharePage"), "default");
const TvPage = lazyPage(() => import("./TvPage"), "default");

/** Ao vivo fora do ar: vai virar a Visão geral da equipe de vendas. Para religar, trocar `aoVivoRoutes` por estas rotas. */
export const liveScreenRoutes: RouteObject[] = [
  {
    element: <RequireRole roles={["OWNER", "MANAGER", "ADMIN_GLOBAL"]} />,
    children: [
      { path: paths.live.root, element: <LivePage /> },
      { path: paths.live.share, element: <SharePage /> },
      { path: paths.live.tv, element: <TvPage /> },
    ],
  },
];

const toOverview = <Navigate to={paths.overview} replace />;

export const aoVivoRoutes: RouteObject[] = [
  paths.live.root,
  paths.live.share,
  paths.live.tv,
  paths.legacy.live.root,
  paths.legacy.live.share,
  paths.legacy.live.tv,
].map((path) => ({ path, element: toOverview }));
