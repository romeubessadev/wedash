import { somenteDigitos } from "./cpf";

/** 67999998888 → (67) 99999-8888 (parcial enquanto digita; 10 dígitos = fixo). */
export function mascararTelefone(v: string): string {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const corte = d.length === 11 ? 5 : 4;
  if (resto.length <= corte) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Celular BR: DDD válido (11–99) + 9 dígitos começando por 9. */
export function celularValido(v: string): boolean {
  const d = somenteDigitos(v);
  return /^[1-9][1-9]9\d{8}$/.test(d);
}
