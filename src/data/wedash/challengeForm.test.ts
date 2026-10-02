import { describe, expect, it } from "vitest";
import {
  challengeFormToInput,
  challengeToForm,
  emptyChallengeForm,
  managerAvailable,
  validateChallengeForm,
  type ChallengeForm,
} from "./challengeForm";
import type { ChallengeRecord } from "./challengesRepo";

const d = (iso: string) => {
  const [a, m, dia] = iso.split("-").map(Number);
  return new Date(a, m - 1, dia);
};

const valid = (over: Partial<ChallengeForm> = {}): ChallengeForm => ({
  ...emptyChallengeForm("s1"),
  name: "Body Splash — quem vender mais",
  startsOn: d("2026-10-05"),
  endsOn: d("2026-10-11"),
  products: [{ code: "BS1", name: "BODY SPLASH 1" }],
  prizes: [{ kind: "MONEY", amount: "100,00", label: "" }],
  ...over,
});

describe("emptyChallengeForm", () => {
  it("novo desafio começa em Produtos · Disputa, mínimo de 10 vendas e 1 prêmio em R$ vazio", () => {
    const f = emptyChallengeForm("s1");
    expect(f).toMatchObject({ storeId: "s1", metric: "PRODUCTS", mode: "CONTEST", minSales: "10", managerOn: false });
    expect(f.prizes).toEqual([{ kind: "MONEY", amount: "", label: "" }]);
  });
});

describe("validateChallengeForm", () => {
  it("formulário válido não tem erro", () => {
    expect(validateChallengeForm(valid())).toEqual({});
  });

  it("obrigatórios: nome, datas e loja", () => {
    const e = validateChallengeForm(valid({ name: "  ", startsOn: null, endsOn: null, storeId: "" }));
    expect(e).toMatchObject({ name: "Campo obrigatório.", startsOn: "Campo obrigatório.", endsOn: "Campo obrigatório.", storeId: "Campo obrigatório." });
  });

  it("nome com mais de 80 caracteres", () => {
    expect(validateChallengeForm(valid({ name: "x".repeat(81) })).name).toBe("Use até 80 caracteres.");
  });

  it("data de fim antes do início (mesmo dia pode)", () => {
    expect(validateChallengeForm(valid({ endsOn: d("2026-10-04") })).endsOn).toBe("A data de fim precisa ser depois da data de início.");
    expect(validateChallengeForm(valid({ endsOn: d("2026-10-05") })).endsOn).toBeUndefined();
  });

  it("Produtos exige ao menos 1 produto; Categorias, ao menos 1 categoria", () => {
    expect(validateChallengeForm(valid({ products: [] })).products).toBe("Escolha ao menos 1 produto.");
    const cat = validateChallengeForm(valid({ metric: "CATEGORIES", products: [], categories: [] }));
    expect(cat.categories).toBe("Escolha ao menos 1 categoria.");
    expect(cat.products).toBeUndefined();
  });

  it("P.A. e ticket exigem mínimo de vendas inteiro ≥ 1", () => {
    expect(validateChallengeForm(valid({ metric: "PA", products: [], minSales: "" })).minSales).toBe("Campo obrigatório.");
    expect(validateChallengeForm(valid({ metric: "TICKET", products: [], minSales: "0" })).minSales).toBe(
      "Informe um número inteiro a partir de 1.",
    );
    expect(validateChallengeForm(valid({ metric: "PA", products: [], minSales: "2,5" })).minSales).toBe(
      "Informe um número inteiro a partir de 1.",
    );
    expect(validateChallengeForm(valid({ metric: "PA", products: [], minSales: "10" })).minSales).toBeUndefined();
  });

  it("Mínimo exige alvo válido pela métrica", () => {
    expect(validateChallengeForm(valid({ mode: "MINIMUM", target: "" })).target).toBe("Campo obrigatório.");
    expect(validateChallengeForm(valid({ mode: "MINIMUM", target: "2,5" })).target).toBe("Informe um número inteiro de itens maior que 0.");
    expect(validateChallengeForm(valid({ mode: "MINIMUM", target: "15" })).target).toBeUndefined();
    expect(validateChallengeForm(valid({ mode: "MINIMUM", metric: "PA", products: [], target: "0" })).target).toBe(
      "Informe um valor maior que 0.",
    );
    expect(validateChallengeForm(valid({ mode: "MINIMUM", metric: "PA", products: [], target: "1,9" })).target).toBeUndefined();
    expect(validateChallengeForm(valid({ mode: "MINIMUM", metric: "TICKET", products: [], target: "" })).target).toBe(
      "Campo obrigatório.",
    );
  });

  it("piso da Disputa é opcional, mas se preenchido precisa ser válido", () => {
    expect(validateChallengeForm(valid({ target: "" })).target).toBeUndefined();
    expect(validateChallengeForm(valid({ target: "abc" })).target).toBe("Informe um número inteiro de itens maior que 0.");
  });

  it("prêmio: R$ > 0 ou descrição de 1 a 60 caracteres; vazio = obrigatório", () => {
    expect(validateChallengeForm(valid({ prizes: [{ kind: "MONEY", amount: "", label: "" }] })).prizes).toEqual({ 0: "Campo obrigatório." });
    expect(validateChallengeForm(valid({ prizes: [{ kind: "MONEY", amount: "0,00", label: "" }] })).prizes).toEqual({
      0: "Informe um valor maior que 0.",
    });
    expect(validateChallengeForm(valid({ prizes: [{ kind: "ITEM", amount: "", label: "   " }] })).prizes).toEqual({ 0: "Campo obrigatório." });
    expect(validateChallengeForm(valid({ prizes: [{ kind: "ITEM", amount: "", label: "x".repeat(61) }] })).prizes).toEqual({
      0: "Use até 60 caracteres.",
    });
    expect(validateChallengeForm(valid({ prizes: [{ kind: "ITEM", amount: "", label: "Combo KFC" }] })).prizes).toBeUndefined();
  });

  it("2º e 3º lugar adicionados precisam de prêmio", () => {
    const e = validateChallengeForm(
      valid({
        prizes: [
          { kind: "MONEY", amount: "100,00", label: "" },
          { kind: "ITEM", amount: "", label: "Combo KFC" },
          { kind: "MONEY", amount: "", label: "" },
        ],
      }),
    );
    expect(e.prizes).toEqual({ 2: "Campo obrigatório." });
  });

  it("gerência ligada exige prêmio; Disputa sem piso desliga a gerência (sem erro)", () => {
    const vazio = { kind: "MONEY" as const, amount: "", label: "" };
    expect(validateChallengeForm(valid({ mode: "MINIMUM", target: "10", managerOn: true, managerPrize: vazio })).managerPrize).toBe(
      "Campo obrigatório.",
    );
    expect(validateChallengeForm(valid({ target: "", managerOn: true, managerPrize: vazio })).managerPrize).toBeUndefined();
    expect(managerAvailable(valid({ target: "" }))).toBe(false);
    expect(managerAvailable(valid({ target: "5" }))).toBe(true);
    expect(managerAvailable(valid({ mode: "MINIMUM", target: "" }))).toBe(true);
  });
});

describe("challengeFormToInput / challengeToForm", () => {
  it("converte o formulário (Disputa de produtos com piso e gerência)", () => {
    const input = challengeFormToInput(
      valid({
        name: "  Body Splash  ",
        target: "5",
        minSales: "10",
        categories: [{ typeId: 14, name: "BODY SPLASH" }],
        prizes: [
          { kind: "MONEY", amount: "1.234,50", label: "" },
          { kind: "ITEM", amount: "", label: " Combo KFC " },
        ],
        managerOn: true,
        managerPrize: { kind: "ITEM", amount: "", label: "Spa" },
      }),
    );
    expect(input).toEqual({
      storeId: "s1",
      name: "Body Splash",
      startsOn: "2026-10-05",
      endsOn: "2026-10-11",
      metric: "PRODUCTS",
      mode: "CONTEST",
      products: [{ code: "BS1", name: "BODY SPLASH 1" }],
      categories: [],
      target: 5,
      minSales: null,
      prizes: [
        { kind: "MONEY", amount: 1234.5 },
        { kind: "ITEM", label: "Combo KFC" },
      ],
      managerPrize: { kind: "ITEM", label: "Spa" },
    });
  });

  it("Mínimo grava só 1 prêmio; gerência indisponível vira null; ticket com R$", () => {
    const input = challengeFormToInput(
      valid({
        metric: "TICKET",
        mode: "MINIMUM",
        products: [],
        target: "120,00",
        minSales: "10",
        prizes: [
          { kind: "MONEY", amount: "50,00", label: "" },
          { kind: "MONEY", amount: "30,00", label: "" },
        ],
      }),
    );
    expect(input).toMatchObject({ target: 120, minSales: 10, prizes: [{ kind: "MONEY", amount: 50 }], managerPrize: null, products: [] });
    expect(challengeFormToInput(valid({ target: "", managerOn: true, managerPrize: { kind: "MONEY", amount: "10,00", label: "" } })).managerPrize).toBeNull();
  });

  it("ida e volta: registro → formulário → input", () => {
    const rec: ChallengeRecord = {
      id: "c1",
      storeId: "s1",
      name: "P.A. da semana",
      startsOn: "2026-10-05",
      endsOn: "2026-10-11",
      metric: "PA",
      mode: "MINIMUM",
      products: [],
      categories: [],
      target: 1.9,
      minSales: 10,
      prizes: [{ kind: "MONEY", amount: 50 }],
      managerPrize: { kind: "ITEM", label: "Spa" },
    };
    const form = challengeToForm(rec);
    expect(form.target).toBe("1,9");
    expect(form.prizes[0].amount).toBe("50,00");
    expect(form.managerOn).toBe(true);
    const { id: _id, ...rest } = rec;
    expect(challengeFormToInput(form)).toEqual(rest);
  });
});
