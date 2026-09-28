import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WizardSteps } from "@/components/ui";
import { BrandMark } from "@/pages/auth/authKit";
import { paths } from "@/router/paths";
import { PRODUCT_NAME } from "@/data/wedash/tenant";
import { storeIdsFromErp } from "@/data/wedash/stores";
import type { StoreErp } from "@/data/wedash/erp";
import { padTopoEBase } from "@/lib/safeArea";
import { getSupabase } from "@/lib/supabase";
import { useSession, useActiveSession } from "@/session/SessionProvider";
import { saveOnboardingStep, saveMembershipStores, persistErpCredentialAndStores } from "@/session/authApi";
import { clearAwaitingInitialSync, markAwaitingInitialSync } from "@/session/awaitingInitialSync";
import { waitForSeedJob, type SeedWaitResult } from "@/data/wedash/salesRepo";
import { Step2Credentials } from "./Step2Credentials";
import { ONBOARDING_STEPS } from "./steps";
import { gravarRascunho, limparRascunho, lerRascunho, lerSenhaErp, rascunhoVazio, type RascunhoOnboarding } from "./draft";

/** Etapa do ERP no indicador e em `membership.onboarding_step` (1 = senha, antes do /onboarding). */
const ETAPA_ERP = 2;

const bullets = ["Conexão e relatórios testados antes de continuar", "Lojas do usuário adicionadas automaticamente", "Senha protegida no servidor"];

function mensagemErroSync(r: Exclude<SeedWaitResult, { ok: true }>): string {
  const t = (r.error ?? "").toLowerCase();
  if (["ultrapassado", "já está conectado", "ja esta conectado", "máximo", "maximo", "busy"].some((k) => t.includes(k))) {
    return "Este usuário já está logado no Millennium em outro lugar. Saia do ERP nessa outra sessão e toque em Tentar novamente.";
  }
  if (r.reason === "stuck") {
    return "A sincronização demorou para começar. Tente novamente; se continuar, fale com o suporte.";
  }
  return "Não foi possível buscar as vendas de hoje no Millennium. Tente novamente.";
}

/** Onboarding — shell RegisterSplit: form à esquerda, hero à direita. Única etapa = Integração ERP. */
export function Onboarding() {
  const session = useActiveSession();
  const { update, signOut } = useSession();
  const navigate = useNavigate();
  const membershipId = session.membershipId;

  const [draft, setDraft] = useState<RascunhoOnboarding>(() => lerRascunho(membershipId) ?? rascunhoVazio());
  const [sincronizando, setSincronizando] = useState(false);
  const [erroSync, setErroSync] = useState<string | null>(null);
  const entrarAposSync = useRef<(() => void) | null>(null);

  useEffect(() => {
    gravarRascunho(membershipId, draft);
  }, [draft, membershipId]);

  // Legado (1 = antiga Empresa, 3 = antiga Lojas) → ERP.
  useEffect(() => {
    if (session.onboardingStep === null || session.onboardingStep === ETAPA_ERP) return;
    update({ onboardingStep: ETAPA_ERP });
    void saveOnboardingStep(membershipId, ETAPA_ERP);
  }, [session.onboardingStep, update, membershipId]);

  /** Pede o Atualizar de hoje (SEED) e espera terminar; o resto do mês carrega depois, por trás. */
  async function sincronizarHoje() {
    setSincronizando(true);
    setErroSync(null);
    const sb = getSupabase();
    const pedir = async () => {
      const since = new Date().toISOString();
      try {
        const { error } = await sb!.functions.invoke("erp-sync-enqueue", { body: { action: "seed" } });
        if (error) console.warn("erp-sync-enqueue seed:", error.message);
      } catch (e) {
        console.warn("erp-sync-enqueue seed:", e);
      }
      return waitForSeedJob(session.tenantId, since);
    };
    if (!sb) {
      entrarAposSync.current?.();
      return;
    }
    let r = await pedir();
    if (!r.ok && r.reason === "cancelled") r = await pedir();
    if (r.ok) {
      entrarAposSync.current?.();
      return;
    }
    setSincronizando(false);
    setErroSync(mensagemErroSync(r));
  }

  /** Grava credencial + todas as lojas do usuário (token do teste — worker reusa sem novo login) e sincroniza hoje. */
  async function concluir(stores: StoreErp[], millenniumSession: string | undefined) {
    setSincronizando(true);
    setErroSync(null);
    const password = lerSenhaErp(membershipId);
    let ids = storeIdsFromErp(stores);
    let semSync = false;
    if (draft.erp.usuario && password) {
      const persisted = await persistErpCredentialAndStores({
        tenantId: session.tenantId,
        membershipId,
        username: draft.erp.usuario.trim(),
        password,
        dedicated: draft.erp.dedicada,
        stores,
        millenniumSession,
      });
      if (persisted.ok) {
        ids = persisted.storeIds;
      } else {
        console.warn("persistErpCredentialAndStores:", persisted.error);
        await saveMembershipStores(membershipId, ids);
        semSync = true;
      }
    } else {
      await saveMembershipStores(membershipId, ids);
      semSync = true;
    }

    const entrar = () => {
      clearAwaitingInitialSync();
      limparRascunho(membershipId);
      update({ onboardingStep: null, stores: ids });
      navigate(`${paths.overview}?periodo=hoje`, { replace: true });
    };

    // Onboarding fecha no banco ANTES do SEED (o worker cancela jobs com onboarding aberto).
    // A sessão local só muda no fim — a tela fica no ERP com o botão "Sincronizando…".
    // F5 no meio: a flag leva para /sincronizando, que continua esperando.
    markAwaitingInitialSync();
    await saveOnboardingStep(membershipId, null);
    if (semSync) {
      entrar();
      return;
    }
    entrarAposSync.current = entrar;
    await sincronizarHoje();
  }

  function sairOnboarding() {
    limparRascunho(membershipId);
    signOut();
    navigate(paths.access.login);
  }

  return (
    <div className="grid min-h-screen w-full bg-bg-0 lg:grid-cols-2">
      <div
        className="pad-topo pad-base flex flex-col px-6 pb-10 sm:px-14 lg:overflow-y-auto"
        style={padTopoEBase("2.5rem", "2.5rem")}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size={34} />
            <span className="text-[16px] font-extrabold text-t0">{PRODUCT_NAME}</span>
          </div>
          <button
            type="button"
            onClick={sairOnboarding}
            className="min-h-11 min-w-11 px-2 text-xs font-semibold text-t2 hover:text-t0"
          >
            Sair
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-4">
          <WizardSteps steps={ONBOARDING_STEPS} current={ETAPA_ERP} />
          <Step2Credentials
            membershipId={membershipId}
            inicial={draft.erp}
            onErpChange={(erp) => setDraft((d) => ({ ...d, erp }))}
            onConcluir={(r) => void concluir(r.stores, r.session)}
            sincronizando={sincronizando}
            erroSync={erroSync}
            onTentarSync={() => void sincronizarHoje()}
          />
        </div>
      </div>

      <div
        className="relative hidden flex-col justify-center overflow-hidden p-12 lg:flex"
        style={{ background: "linear-gradient(150deg,#0f2d54,#1b1650 55%,#14103a)" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(70% 60% at 25% 80%,rgba(86,168,255,.35),transparent 60%)" }}
        />
        <div className="relative">
          <h2 className="mb-6 text-[26px] font-extrabold leading-[1.3] tracking-tight text-white">
            Dados do Millennium,
            <br />
            direto na WeDash.
          </h2>
          <p className="mb-6 max-w-[380px] text-[15px] leading-relaxed text-white/70">
            A conexão mantém vendas, custos, estoque e cadastros sincronizados automaticamente.
          </p>
          <div className="flex flex-col gap-4">
            {bullets.map((b) => (
              <div key={b} className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px]" style={{ background: "rgba(255,255,255,.12)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-white/90">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
