import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { padTopoEBase } from "@/lib/safeArea";
import { cn } from "@/lib/cn";
import { SENHA_MIN, dicaForcaSenha, senhaTemEspecial } from "@/lib/password";
import { Checkbox, FormField, Input } from "@/components/ui";
import { AuthGlow, BrandMark } from "@/pages/auth/authKit";
import { PRODUCT_NAME } from "@/data/wedash/tenant";
import { mascararCpf } from "@/lib/cpf";

/**
 * Complementos das telas de acesso.
 * Labels/inputs = FormField + Input do Vela (`FormElementsPage`).
 */
export { AuthGlow } from "@/pages/auth/authKit";
export { Checkbox, FormField, Input };

/** Escala tipográfica unificada com o Login. */
export const acessoTitulo = "mb-2 text-[26px] font-extrabold tracking-tight text-t0";
export const acessoSubtitulo = "mb-6 text-sm leading-relaxed text-t1";
export const acessoBotao =
  "h-[46px] w-full rounded-xl bg-acc text-sm font-bold text-white transition-colors hover:bg-acc-2 disabled:opacity-60";
export const acessoLink = "text-[13px] font-bold text-acc";
export const acessoRodape = "text-[13px] text-t2";

/** Moldura das telas de acesso, no mesmo formato de ForgotPassword/ResetPassword do template. */
export function AcessoPagina({ children, rodape, largura = 420, marca = true }: { children: ReactNode; rodape?: ReactNode; largura?: number; marca?: boolean }) {
  return (
    <div
      className="tela-cheia pad-topo pad-base relative flex w-full items-center justify-center overflow-hidden bg-bg-0 px-4"
      style={padTopoEBase("2.5rem", "2.5rem")}
    >
      <AuthGlow />
      <div className="relative w-full" style={{ maxWidth: largura }}>
        {marca && (
          <div className="mb-6 flex flex-col items-center gap-3">
            <BrandMark size={56} />
            <p className="text-[17px] font-extrabold tracking-tight text-t0">
              {PRODUCT_NAME}
              <span className="text-acc">.</span>
            </p>
          </div>
        )}
        <div className="rounded-[22px] border border-line bg-bg-2 p-7 sm:p-9" style={{ boxShadow: "0 20px 60px -20px rgba(0,0,0,.6)" }}>
          {children}
        </div>
        {rodape && <div className="mt-5">{rodape}</div>}
      </div>
    </div>
  );
}

const inputErro = "!border-2 !border-bad bg-bad-soft";

const olhoBtn =
  "absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-t2 hover:bg-bg-3 hover:text-t0";

function BotaoRevelarSenha({ mostrar, onToggle }: { mostrar: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"} className={olhoBtn}>
      {mostrar ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

/**
 * Ao aceitar a sugestão, o Chrome deixa o valor inteiro selecionado, às vezes
 * depois do evento de input. Só reage a mudança que não veio do teclado
 * (preenchimento do navegador não tem inputType de digitação/colagem).
 */
function useSoltarSelecaoDoAutofill() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let mudouEm = -Infinity;
    const timers: number[] = [];
    const soltar = () => {
      const fim = el.value.length;
      if (fim > 0 && document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === fim) {
        el.setSelectionRange(fim, fim);
      }
    };
    const aoMudar = (e: Event) => {
      const tipo = (e as InputEvent).inputType;
      if (tipo && tipo !== "insertReplacementText") return;
      mudouEm = performance.now();
      requestAnimationFrame(soltar);
      timers.push(window.setTimeout(soltar, 60), window.setTimeout(soltar, 250));
    };
    const aoSelecionar = () => {
      if (performance.now() - mudouEm < 1500) soltar();
    };
    el.addEventListener("input", aoMudar);
    el.addEventListener("select", aoSelecionar);
    return () => {
      el.removeEventListener("input", aoMudar);
      el.removeEventListener("select", aoSelecionar);
      timers.forEach(clearTimeout);
    };
  }, []);
  return ref;
}

/** E-mail — FormField + Input (Vela). */
export function CampoEmail({
  label = "E-mail",
  value,
  onChange,
  erro,
  className,
  ...props
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  erro?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const ref = useSoltarSelecaoDoAutofill();
  return (
    <FormField label={label} error={erro ?? undefined}>
      <Input
        {...props}
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete={props.autoComplete ?? "username"}
        placeholder={props.placeholder ?? "seu@email.com"}
        className={cn(erro && inputErro, className)}
      />
    </FormField>
  );
}

/** CPF com máscara — FormField + Input (Vela). */
export function CampoCpf({
  label = "CPF",
  value,
  onChange,
  erro,
  className,
  ...props
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  erro?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <FormField label={label} error={erro ?? undefined}>
      <Input
        {...props}
        value={value}
        onChange={(e) => onChange(mascararCpf(e.target.value))}
        inputMode="numeric"
        autoComplete={props.autoComplete ?? "username"}
        placeholder={props.placeholder ?? "000.000.000-00"}
        className={cn("font-mono tracking-wide", erro && inputErro, className)}
      />
    </FormField>
  );
}

/** Senha com revelar — FormField + Input (Vela). */
export function CampoSenha({
  label = "Senha",
  value,
  onChange,
  placeholder = "Digite sua senha",
  autoComplete = "current-password",
  erro,
  className,
  ...props
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  erro?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <FormField label={label} error={erro ?? undefined}>
      <div className="relative">
        <Input
          {...props}
          type={mostrar ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={cn("pr-12", erro && inputErro, className)}
        />
        <BotaoRevelarSenha mostrar={mostrar} onToggle={() => setMostrar((m) => !m)} />
      </div>
    </FormField>
  );
}

export type NomePessoa = { nome: string; sobrenome: string };

export function nomePessoaValido(n: NomePessoa): boolean {
  return n.nome.trim().length >= 2 && n.sobrenome.trim().length >= 2;
}

/** Nome · Sobrenome do "Crie seu acesso" (sempre em branco: o convite só traz o e-mail). */
export function CamposNome({
  valor,
  onChange,
  autoFocus,
}: {
  valor: NomePessoa;
  onChange: (patch: Partial<NomePessoa>) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Nome">
        <Input
          value={valor.nome}
          onChange={(e) => onChange({ nome: e.target.value })}
          placeholder="Seu nome"
          autoComplete="given-name"
          autoFocus={autoFocus}
          maxLength={40}
        />
      </FormField>
      <FormField label="Sobrenome">
        <Input
          value={valor.sobrenome}
          onChange={(e) => onChange({ sobrenome: e.target.value })}
          placeholder="Seu sobrenome"
          autoComplete="family-name"
          maxLength={60}
        />
      </FormField>
    </div>
  );
}

/** Aviso neutro dentro do card. */
export function AvisoCard({ tom = "info", children }: { tom?: "info" | "ok" | "bad" | "warn"; children: ReactNode }) {
  const cores = {
    info: "border-info/30 bg-info-soft",
    ok: "border-ok/30 bg-ok-soft",
    bad: "border-bad/30 bg-bad-soft",
    warn: "border-warn/30 bg-warn-soft",
  };
  return <div className={cn("rounded-xl border px-3.5 py-3 text-sm leading-relaxed text-t0", cores[tom])}>{children}</div>;
}

/** Ícone redondo no topo do card, como em ForgotPassword/ResetPassword do template. */
export function IconeCard({ tom = "acc", centralizado = false, children }: { tom?: "acc" | "ok" | "bad" | "warn" | "info"; centralizado?: boolean; children: ReactNode }) {
  const bg = { acc: "bg-acc-soft", ok: "bg-ok-soft", bad: "bg-bad-soft", warn: "bg-warn-soft", info: "bg-info-soft" }[tom];
  const cor = { acc: "var(--acc)", ok: "var(--ok)", bad: "var(--bad)", warn: "var(--warn)", info: "var(--info)" }[tom];
  return (
    <div className={cn("mb-5 flex h-16 w-16 items-center justify-center rounded-[18px]", bg, centralizado && "mx-auto")} style={{ color: cor }}>
      {children}
    </div>
  );
}

/** Medidor de força da senha (barras Vela). */
export function ForcaSenha({ senha }: { senha: string }) {
  const n = senha.length;
  const temEspecial = senhaTemEspecial(senha);
  const nivel = n === 0 ? 0 : n < SENHA_MIN ? 1 : !temEspecial ? 2 : n < 12 ? 3 : 4;
  const cor = nivel <= 1 ? "bg-bad" : nivel === 2 ? "bg-warn" : "bg-ok";
  return (
    <div>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-[5px] flex-1 rounded-sm", i <= nivel ? cor : "bg-bg-inset")} />
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] text-t2">{dicaForcaSenha(senha)}</p>
    </div>
  );
}
