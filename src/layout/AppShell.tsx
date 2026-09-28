import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { padBase } from "@/lib/safeArea";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { PageLoader } from "./PageLoader";
import { ChatIA } from "@/components/wedash/AiChat";
import { useActiveSession } from "@/session/SessionProvider";
import { touchLastSeen } from "@/session/authApi";

/** O banco só grava 1x a cada 5 min; aqui só evita chamadas à toa. */
const LAST_SEEN_INTERVAL_MS = 5 * 60_000;

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const session = useActiveSession();

  // html/body com height 100% + overflow-x hidden fazem o <body> rolar (não a janela nem o <main>):
  // zera todos para a tela nova abrir no topo.
  useLayoutEffect(() => {
    setMobileNavOpen(false);
    for (const el of [mainRef.current, document.body, document.documentElement]) {
      if (el) el.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const touch = () => {
      if (document.visibilityState === "visible") void touchLastSeen();
    };
    touch();
    const timer = window.setInterval(touch, LAST_SEEN_INTERVAL_MS);
    document.addEventListener("visibilitychange", touch);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", touch);
    };
  }, []);

  const temChat = session.role === "OWNER" || session.role === "MANAGER";

  return (
    <div className="tela-cheia flex w-full overflow-x-hidden bg-bg-0 text-t0">
      <Sidebar collapsed={collapsed} />
      <MobileDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} onOpenPalette={() => setPaletteOpen(true)} />
        <main ref={mainRef} className="pad-base flex-1 overflow-x-hidden overflow-y-auto px-3.5 pt-5 sm:px-6 sm:pt-6" style={padBase("6rem")}>
          <Suspense fallback={<PageLoader />}>
            <div key={location.pathname} className="vela-page-enter">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {temChat && <ChatIA />}
    </div>
  );
}
