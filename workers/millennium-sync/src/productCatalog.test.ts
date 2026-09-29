import { describe, expect, it } from "vitest";
import { parseProductTypes, parseTypeProducts, type CatalogProduct } from "./millenniumCatalog.ts";
import { dedupeCatalogProducts, ensureProductCatalog, type CatalogDeps } from "./productCatalog.ts";

function fakeDeps(
  opts: {
    catalog?: number[];
    claim?: boolean;
    misses?: number[];
    tables?: number;
    storeTable?: number | null;
    priced?: string[];
    costMisses?: string[];
  } = {},
) {
  const catalog = new Set(opts.catalog ?? []);
  const misses = new Set(opts.misses ?? []);
  const covered = new Set([...(opts.priced ?? []), ...(opts.costMisses ?? [])]);
  const calls = {
    claim: 0,
    types: 0,
    products: 0,
    prices: [] as number[],
    release: [] as boolean[],
    recorded: [] as number[],
    costRecorded: [] as string[],
  };
  const byType: Record<number, CatalogProduct[]> = {
    13: [{ erpProductId: 1, code: "PERF-1", description: "PERFUME 1", typeId: 13 }],
    14: [{ erpProductId: 2, code: "BS-2", description: "BODY SPLASH 2", typeId: 14 }],
  };
  const deps: CatalogDeps = {
    countCatalog: async () => catalog.size,
    knownProductIds: async (ids) => new Set(ids.filter((id) => catalog.has(id) || misses.has(id))),
    lookupProducts: async () => new Map(),
    claimRefresh: async () => {
      calls.claim += 1;
      return opts.claim ?? true;
    },
    releaseRefresh: async (_o, ok) => {
      calls.release.push(ok);
    },
    upsertTypes: async () => {},
    upsertProducts: async (ps) => ps.forEach((p) => catalog.add(p.erpProductId)),
    recordMisses: async (items) => items.forEach((i) => calls.recorded.push(i.erpProductId)),
    fetchTypes: async () => {
      calls.types += 1;
      return [
        { typeId: 13, description: "PERFUMARIA" },
        { typeId: 14, description: "BODY SPLASH" },
      ];
    },
    fetchProductsOfType: async (_s, typeId) => {
      calls.products += 1;
      return byType[typeId] ?? [];
    },
    countCostTables: async () => opts.tables ?? 2,
    storeCostTable: async () => (opts.storeTable === undefined ? 20104 : opts.storeTable),
    coveredCostCodes: async (_t, codes) => new Set(codes.filter((c) => covered.has(c))),
    recordCostMisses: async (_t, codes) => void calls.costRecorded.push(...codes),
    fetchCostTables: async () => [
      { tableId: 1, code: "000", description: "CUSTO" },
      { tableId: 20104, code: "104", description: "CENTRO OESTE" },
    ],
    fetchCostTablePrices: async (_s, id) => {
      calls.prices.push(id);
      return new Map(id === 20104 ? [["420", 5447]] : []);
    },
    saveCostTables: async () => {},
    saveCostTablePrices: async () => {},
  };
  return { deps, calls };
}

const seen = (...ids: number[]) => ids.map((id) => ({ erpProductId: id, code: `C${id}` }));

describe("ensureProductCatalog", () => {
  it("todos conhecidos → não chama o ERP", async () => {
    const { deps, calls } = fakeDeps({ catalog: [1, 2] });
    const r = await ensureProductCatalog(deps, { session: "s", seen: seen(1, 2), guard: { attempted: false }, owner: "w" });
    expect(r.status).toBe("ok");
    expect(calls.claim).toBe(0);
  });

  it("catálogo vazio → recarrega tudo (tipos, 1 por tipo, tabelas, 1 por tabela)", async () => {
    const { deps, calls } = fakeDeps();
    const r = await ensureProductCatalog(deps, { session: "s", seen: [], guard: { attempted: false }, owner: "w" });
    expect(r).toMatchObject({ status: "refreshed", types: 2, products: 2, tables: 2, prices: 1, calls: 6 });
    expect(calls.prices).toEqual([1, 20104]);
    expect(calls.release).toEqual([true]);
  });

  it("com loja → 1 chamada a mais para o cadastro (data/múltipla/bloqueio); falha não derruba a recarga", async () => {
    const { deps } = fakeDeps();
    const saved: string[] = [];
    deps.fetchRegistry = async (_s, storeId) => [{ code: `P${storeId}`, registeredAt: "2024-06-05", purchaseMultiple: 12, purchaseBlocked: false }];
    deps.saveRegistry = async (items) => (saved.push(...items.map((i) => i.code)), items.length);
    const ok = await ensureProductCatalog(deps, { session: "s", seen: [], guard: { attempted: false }, owner: "w", millenniumStoreId: 8 });
    expect(ok).toMatchObject({ status: "refreshed", calls: 7, registry: 1 });
    expect(saved).toEqual(["P8"]);

    const { deps: d2, calls: c2 } = fakeDeps();
    d2.fetchRegistry = async () => {
      throw new Error("ESTOQUEEMCOMPRA → 500");
    };
    d2.saveRegistry = async () => 0;
    const r = await ensureProductCatalog(d2, { session: "s", seen: [], guard: { attempted: false }, owner: "w", millenniumStoreId: 8 });
    expect(r).toMatchObject({ status: "refreshed", registry: null, registryError: "ESTOQUEEMCOMPRA → 500" });
    expect(c2.release).toEqual([true]);
  });

  it("tabelas de custo vazias → recarrega mesmo com o catálogo completo", async () => {
    const { deps, calls } = fakeDeps({ catalog: [1, 2], tables: 0 });
    const r = await ensureProductCatalog(deps, { session: "s", seen: seen(1), guard: { attempted: false }, owner: "w" });
    expect(r.status).toBe("refreshed");
    expect(calls.prices).toEqual([1, 20104]);
  });

  it("custo 0 com preço na tabela da loja → não chama o ERP", async () => {
    const { deps, calls } = fakeDeps({ catalog: [1], priced: ["420"] });
    const r = await ensureProductCatalog(deps, {
      session: "s",
      seen: [],
      zeroCost: { storeId: "s1", codes: ["420"] },
      guard: { attempted: false },
      owner: "w",
    });
    expect(r.status).toBe("ok");
    expect(calls.claim).toBe(0);
  });

  it("custo 0 sem preço na tabela → recarrega; o que segue sem preço vira miss", async () => {
    const { deps, calls } = fakeDeps({ catalog: [1] });
    const r = await ensureProductCatalog(deps, {
      session: "s",
      seen: [],
      zeroCost: { storeId: "s1", codes: ["420", "504"] },
      guard: { attempted: false },
      owner: "w",
    });
    expect(r).toMatchObject({ status: "refreshed", costMissing: 2, stillCostMissing: 1 });
    expect(calls.costRecorded).toEqual(["504"]);
  });

  it("custo 0 com miss recente ou loja sem tabela → não recarrega", async () => {
    const miss = fakeDeps({ catalog: [1], costMisses: ["504"] });
    const noTable = fakeDeps({ catalog: [1], storeTable: null });
    for (const { deps, calls } of [miss, noTable]) {
      const r = await ensureProductCatalog(deps, {
        session: "s",
        seen: [],
        zeroCost: { storeId: "s1", codes: ["504"] },
        guard: { attempted: false },
        owner: "w",
      });
      expect(r.status).toBe("ok");
      expect(calls.claim).toBe(0);
    }
  });

  it("produto desconhecido que não veio na recarga vira miss (não recarrega de novo por 24h)", async () => {
    const { deps, calls } = fakeDeps({ catalog: [1] });
    const r = await ensureProductCatalog(deps, { session: "s", seen: seen(1, 99), guard: { attempted: false }, owner: "w" });
    expect(r).toMatchObject({ status: "refreshed", unknown: 1, stillUnknown: 1 });
    expect(calls.recorded).toEqual([99]);
  });

  it("miss recente conta como conhecido", async () => {
    const { deps, calls } = fakeDeps({ catalog: [1], misses: [99] });
    const r = await ensureProductCatalog(deps, { session: "s", seen: seen(99), guard: { attempted: false }, owner: "w" });
    expect(r.status).toBe("ok");
    expect(calls.claim).toBe(0);
  });

  it("máx. 1 recarga por job", async () => {
    const { deps, calls } = fakeDeps({ catalog: [1] });
    const guard = { attempted: false };
    await ensureProductCatalog(deps, { session: "s", seen: seen(98), guard, owner: "w" });
    const r = await ensureProductCatalog(deps, { session: "s", seen: seen(97), guard, owner: "w" });
    expect(r).toMatchObject({ status: "skipped", reason: "job" });
    expect(calls.types).toBe(1);
  });

  it("outro worker recarregando (ou recarga há < 15 min) → pula sem chamar o ERP", async () => {
    const { deps, calls } = fakeDeps({ catalog: [1], claim: false });
    const r = await ensureProductCatalog(deps, { session: "s", seen: seen(50), guard: { attempted: false }, owner: "w" });
    expect(r).toMatchObject({ status: "skipped", reason: "busy" });
    expect(calls.types).toBe(0);
  });

  it("falha no ERP libera o lease sem gravar refreshed_at", async () => {
    const { deps, calls } = fakeDeps({ catalog: [1] });
    deps.fetchProductsOfType = async () => {
      throw new Error("lookup produto.produto.produto → 401");
    };
    await expect(
      ensureProductCatalog(deps, { session: "s", seen: seen(50), guard: { attempted: false }, owner: "w" }),
    ).rejects.toThrow("401");
    expect(calls.release).toEqual([false]);
  });
});

describe("dedupeCatalogProducts", () => {
  it("mesmo id com código novo fica só com o último código", () => {
    const out = dedupeCatalogProducts([
      { erpProductId: 1, code: "A", description: "", typeId: 13 },
      { erpProductId: 1, code: "B", description: "", typeId: 13 },
      { erpProductId: 2, code: "C", description: "", typeId: 14 },
    ]);
    expect(out.map((p) => p.code).sort()).toEqual(["B", "C"]);
  });
});

describe("parse dos lookups", () => {
  it("tipos e produtos de um tipo", () => {
    expect(
      parseProductTypes({ value: [{ PRODUTO_TIPO_TIPO: 14, PRODUTO_TIPO_DESCRICAO: "BODY SPLASH" }, { PRODUTO_TIPO_TIPO: null }] }),
    ).toEqual([{ typeId: 14, description: "BODY SPLASH" }]);
    expect(
      parseTypeProducts(
        {
          value: [
            { PRODUTO_PRODUTO_PRODUTO: 304, PRODUTO_PRODUTO_COD_PRODUTO: "BSPPAR-ATH-001", PRODUTO_PRODUTO_DESCRICAO1: "BODY SPLASH PERFECT PEAR" },
            { PRODUTO_PRODUTO_PRODUTO: 305, PRODUTO_PRODUTO_COD_PRODUTO: "" },
          ],
        },
        14,
      ),
    ).toEqual([{ erpProductId: 304, code: "BSPPAR-ATH-001", description: "BODY SPLASH PERFECT PEAR", typeId: 14 }]);
  });
});
