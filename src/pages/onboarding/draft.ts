import type { StoreErp } from "@/data/wedash/erp";

/** Rascunho do onboarding — sobrevive a F5 (localStorage). Senha do ERP só em sessionStorage. */

export type RascunhoOnboarding = {
  /** 2 = ERP, 3 = Lojas (a etapa 1, "Seu acesso", acontece antes do onboarding). */
  etapa: number;
  erp: {
    usuario: string;
    dedicada: boolean;
    aceite: boolean;
  };
  stores?: StoreErp[];
};

const PREFIXO = "wedash-onboarding:";
const PREFIXO_SENHA = "wedash-onboarding-senha:";

function chave(membershipId: string) {
  return `${PREFIXO}${membershipId}`;
}

function chaveSenha(membershipId: string) {
  return `${PREFIXO_SENHA}${membershipId}`;
}

export function rascunhoVazio(etapa = 2): RascunhoOnboarding {
  return {
    etapa,
    erp: { usuario: "", dedicada: false, aceite: false },
  };
}

export function lerRascunho(membershipId: string): RascunhoOnboarding | null {
  try {
    const raw = window.localStorage.getItem(chave(membershipId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RascunhoOnboarding;
    if (!parsed || typeof parsed.etapa !== "number") return null;
    return {
      ...rascunhoVazio(),
      erp: {
        usuario: parsed.erp?.usuario ?? "",
        dedicada: parsed.erp?.dedicada ?? false,
        aceite: parsed.erp?.aceite ?? false,
      },
      stores: parsed.stores,
      etapa: Math.min(3, Math.max(2, parsed.etapa)),
    };
  } catch {
    return null;
  }
}

export function gravarRascunho(membershipId: string, r: RascunhoOnboarding) {
  try {
    window.localStorage.setItem(chave(membershipId), JSON.stringify(r));
  } catch {
    /* quota / privado */
  }
}

export function limparRascunho(membershipId: string) {
  try {
    window.localStorage.removeItem(chave(membershipId));
    window.sessionStorage.removeItem(chaveSenha(membershipId));
  } catch {
    /* ignore */
  }
}

/** Senha do ERP: só sessionStorage (sobrevive F5 na mesma aba; some ao fechar a aba). */
export function lerSenhaErp(membershipId: string): string {
  try {
    return window.sessionStorage.getItem(chaveSenha(membershipId)) ?? "";
  } catch {
    return "";
  }
}

export function gravarSenhaErp(membershipId: string, senha: string) {
  try {
    if (senha) window.sessionStorage.setItem(chaveSenha(membershipId), senha);
    else window.sessionStorage.removeItem(chaveSenha(membershipId));
  } catch {
    /* ignore */
  }
}
