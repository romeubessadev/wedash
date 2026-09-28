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
import {
  saveOnboardingStep,
  saveMembershipStores,
  persistErpCredentialAndStores,
} from "@/session/authApi";
import { clearAwaitingInitialSync, markAwaitingInitialSync } from "@/session/awaitingInitialSync";
import { waitForSeedJob, type SeedWaitResult } from "@/data/wedash/salesRepo";
import { Step2Credentials } from "./Step2Credentials";
import { Step3Stores } from "./Step3Stores";
import {
  gravarRascunho,
  limparRascunho,
  lerRascunho,
  lerSenhaErp,
  rascunhoVazio,
  type RascunhoOnboarding,
} from "./draft";

/**
 * Etapa 1 = "Seu acesso" (dados pessoais + senha), feita antes em /change-password — aparece sempre concluída.
 * `onboarding_step` no banco: 2 = ERP, 3 = Lojas (1 é legado da antiga etapa Empresa → vai para ERP).
 */
const PRIMEIRA_ETAPA = 2;
const ULTIMA_ETAPA = 3;

const etapas = [
  { num: 1, label: "Seu acesso" },
  { num: 2, label: "ERP" },
  { num: 3, label: "Lojas" },
];

const heroPorEtapa: Record<number, { titulo: React.ReactNode; texto: string; bullets: string[] }> = {
  2: {
    titulo: (
      <>
        Dados do Millennium,
        <br />
        direto na WeDash.
      </>
    ),
    texto: "A conexão mantém vendas, custos, estoque e cadastros sincronizados automaticamente.",
    bullets: ["Sincronização automática dos dados", "Senha protegida no servidor", "Conexão testada antes de continuar"],
  },
  3: {
    titulo: (
      <>
        Confirme
        <br />
        suas lojas
      </>
    ),
    texto: "São as lojas que o seu usuário enxerga no Millennium.",
    bullets: ["Lista vinda do Millennium", "Confirme para entrar no painel", "Equipe você sincroniza depois"],
  },
};

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

function etapaInicial(sessaoEtapa: number | null, draft: RascunhoOnboarding | null): number {
  const daSessao = sessaoEtapa ?? PRIMEIRA_ETAPA;
  const doDraft = draft?.etapa ?? PRIMEIRA_ETAPA;
  return Math.min(ULTIMA_ETAPA, Math.max(PRIMEIRA_ETAPA, daSessao, doDraft));
}

/** Onboarding — shell RegisterSplit: form à esquerda, hero à direita. */
export function Onboarding() {
  const session = useActiveSession();
  const { update, signOut } = useSession();
  const navigate = useNavigate();
  const membershipId = session.membershipId;

  const [draft, setDraft] = useState<RascunhoOnboarding>(() => {
    const salvo = lerRascunho(membershipId);
    if (salvo) return salvo;
    return rascunhoVazio(etapaInicial(session.onboardingStep, null));
  });

  const [erpSession, setErpSession] = useState<string | undefined>();
  const [atual, setAtual] = useState(() => etapaInicial(session.onboardingStep, draft));
  const [concluindo, setConcluindo] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erroSync, setErroSync] = useState<string | null>(null);
  const entrarAposSync = useRef<(() => void) | null>(null);

  const hero = heroPorEtapa[atual] ?? heroPorEtapa[PRIMEIRA_ETAPA];

  useEffect(() => {
    gravarRascunho(membershipId, { ...draft, etapa: atual });
  }, [atual, draft, membershipId]);

  // Espelha progresso local → sessão. Não reabre se já concluiu (null).
  useEffect(() => {
    if (concluindo || session.onboardingStep === null) return;
    if (session.onboardingStep !== atual) {
      update({ onboardingStep: atual });
      void saveOnboardingStep(membershipId, atual);
    }
  }, [atual, update, concluindo, session.onboardingStep, membershipId]);

  function patchDraft(patch: Partial<RascunhoOnboarding>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

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

  async function irPara(etapa: number | null, filiaisConfirmadas?: StoreErp[]) {
    if (etapa === null) {
      setConcluindo(true);
      const confirmed = filiaisConfirmadas ?? draft.stores ?? [];
      const password = lerSenhaErp(membershipId);
      let ids = storeIdsFromErp(confirmed);
      let semSync = false;
      if (draft.erp.usuario && password && confirmed.length > 0) {
        const persisted = await persistErpCredentialAndStores({
          tenantId: session.tenantId,
          membershipId,
          username: draft.erp.usuario,
          password,
          dedicated: draft.erp.dedicada,
          stores: confirmed,
          // Token do Step2 — worker reusa sem novo login (evita busy no Millennium).
          millenniumSession: erpSession,
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
        update({
          onboardingStep: null,
          stores: ids,
        });
        navigate(`${paths.overview}?periodo=hoje`, { replace: true });
      };

      // Onboarding fecha no banco ANTES do SEED (o worker cancela jobs com onboarding aberto).
      // A sessão local só muda no fim — a tela fica na etapa 3 com o botão "Sincronizando…".
      // F5 no meio: a flag leva para /sincronizando, que continua esperando.
      markAwaitingInitialSync();
      await saveOnboardingStep(membershipId, null);
      if (semSync) {
        entrar();
        return;
      }
      entrarAposSync.current = entrar;
      await sincronizarHoje();
      return;
    }
    setAtual(etapa);
    patchDraft({ etapa });
    window.scrollTo({ top: 0 });
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
          <WizardSteps steps={etapas} current={atual} />

          {atual === 2 && (
            <Step2Credentials
              membershipId={membershipId}
              inicial={draft.erp}
              onErpChange={(erp) => patchDraft({ erp })}
              onConcluir={(r) => {
                void (async () => {
                  setErpSession(r.session);
                  patchDraft({ stores: r.stores });
                  const password = lerSenhaErp(membershipId);
                  const username = draft.erp.usuario.trim();
                  if (username && password && r.session) {
                    const persisted = await persistErpCredentialAndStores({
                      tenantId: session.tenantId,
                      membershipId,
                      username,
                      password,
                      dedicated: draft.erp.dedicada,
                      stores: [],
                      millenniumSession: r.session,
                    });
                    if (!persisted.ok) {
                      console.warn("persist ERP Step2:", persisted.error);
                    }
                  }
                  void irPara(3);
                })();
              }}
            />
          )}
          {atual === 3 && (
            <Step3Stores
              session={erpSession}
              filiaisPre={draft.stores}
              sincronizando={sincronizando}
              erroSync={erroSync}
              onTentarSync={() => void sincronizarHoje()}
              onConcluir={(confirmadas) => {
                // Confirma lojas + Atualizar de hoje (SEED); não faz logout Millennium.
                void irPara(null, confirmadas).finally(() => setErpSession(undefined));
              }}
              onVoltar={() => {
                // Voltar: libera sessão em memória; Edge logout no Step3.
                setErpSession(undefined);
                void irPara(2);
              }}
            />
          )}
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
          <h2 className="mb-6 text-[26px] font-extrabold leading-[1.3] tracking-tight text-white">{hero.titulo}</h2>
          <p className="mb-6 max-w-[380px] text-[15px] leading-relaxed text-white/70">{hero.texto}</p>
          <div className="flex flex-col gap-4">
            {hero.bullets.map((b) => (
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
