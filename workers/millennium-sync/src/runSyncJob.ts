import { aggregatePaymentDay, aggregateSales, aggregateSellerDay } from "../../../src/data/wedash/salesAggregate.ts";
import type { SalesDayAgg, SalesHourAgg } from "../../../src/data/wedash/salesTypes.ts";
import type { SaleRow } from "../../../src/data/wedash/salesTypes.ts";
import {
  couponBrandFromLines,
  couponKey,
  saleRowsFromCouponBrand,
  uniqueBrandSplitHeaders,
  type BrandSplitHeader,
  type CouponBrand,
} from "./brandSplitFromDetalhe.ts";
import type { DetMovLine } from "./millenniumDetMov.ts";
import { ensureProductCatalog, type CatalogDeps, type CatalogGuard, type SeenProduct } from "./productCatalog.ts";
import { detectStoreCostTable, type CostTableDetectDeps } from "./costTableSync.ts";
import type {
  ProductBrandCatalog,
  ProductBrandMap,
} from "./millenniumProductDivision.ts";
import { millenniumBaseUrl } from "./millenniumAuth.ts";
import {
  applyBrandDayCounts,
  applyAllCountsToWepinkDays,
  type BrandReportDayRow,
} from "./millenniumBrandReport.ts";
import {
  brandDayAggsFromMargemLines,
  cmvCentsFromMargemLines,
  productCostDayAggsFromMargemLines,
  type MargemLine,
} from "./millenniumMargem.ts";
import {
  closedMonthRange,
  isHistoryRangeDay,
  margemLinesFromItems,
  unitCostsFromMargem,
  type ClosedMonthItem,
} from "./closedMonth.ts";
import {
  couponBrandFromReportLines,
  couponSellers,
  detMovToCouponLines,
  groupCouponLines,
  productDayAggsFromCouponLines,
  type CouponReportLine,
  type CouponSeller,
} from "./millenniumCouponReport.ts";
import type {
  SalesPaymentDayAgg,
  SalesProductDayAgg,
  SalesProductCostDayAgg,
  SalesSellerDayAgg,
} from "../../../src/data/wedash/salesTypes.ts";
import { onboardingHistoryUntil, SYNC_OFF_NOTE, syncOnboardingOff } from "./syncConfig.ts";
import { formatElapsed, nowMs, StepTimings } from "./syncTiming.ts";
import {
  brDay,
  brlCents,
  detail,
  logJobEnd,
  logJobHeader,
  logRangeDay,
  logRangeEnd,
  logRangeHeader,
  logStoreEnd,
  logStoreStart,
} from "./jobLog.ts";
import {
  beginSyncLog,
  endSyncLog,
  setSyncLogErpUser,
  syncLog,
  syncLogIssueCount,
  type SyncLogRow,
} from "./syncLog.ts";
import { listaFingerprint, type ListaMemo } from "./listaFingerprint.ts";
import { createSellerLinker, type LinkerStore, type SellerLinkerDeps } from "./sellerLinker.ts";
import { AUTO_SESSION_MARK, localClock, parseStoreHours, pendingDays, storePhase } from "./autoRefresh.ts";
import {
  partitionRowsByFilial,
  type FetchSalesListaParams,
  type SaleRowWithFilial,
} from "./millenniumSales.ts";

type ListaWindowArgs = {
  tenantId: string;
  storeId: string;
  timeZone: string;
  from: string;
  to: string;
  rows: SaleRow[];
  now: Date;
  /** Resolve gerador/nome → código da vendedora (sincroniza a loja se aparecer vendedora nova). */
  linkSellers?: (rows: SalesSellerDayAgg[]) => Promise<SalesSellerDayAgg[]>;
};

/** Grava formas de pagamento (+ ranking da equipe, salvo `skipSellers`) da janela Lista (replace no range). */
async function persistListaDerivedDayAggs(
  deps: Pick<SyncJobDeps, "replacePaymentDayAggs" | "replaceSellerDayAggs">,
  args: ListaWindowArgs & { skipSellers?: boolean },
): Promise<void> {
  const pay = aggregatePaymentDay(args.rows, {
    tenantId: args.tenantId,
    timeZone: args.timeZone,
    now: args.now,
    dayFrom: args.from,
    dayTo: args.to,
  });
  await deps.replacePaymentDayAggs({
    tenantId: args.tenantId,
    storeId: args.storeId,
    from: args.from,
    to: args.to,
    rows: pay,
  });
  if (!args.skipSellers) await persistSellerDayAggs(deps, args);
}

/** Cupom que veio no relatório de cupom → vendedora pelo gerador, com o nome atual do ERP. */
export function withCouponSeller(row: SaleRow, sellers: Map<string, CouponSeller>): SaleRow {
  const x = row as Partial<SaleRowWithFilial>;
  if (x.millenniumOpCode == null || !x.nf) return row;
  const tipo = (x.tipoOperacao ?? "S").trim() || "S";
  const seller = sellers.get(couponKey({ millenniumOpCode: x.millenniumOpCode, nf: x.nf, tipoOperacao: tipo }));
  if (!seller) return row;
  return { ...row, sellerGeradorId: seller.geradorId, sellerName: seller.name || row.sellerName };
}

/** Ranking da equipe da janela Lista (replace no range). */
async function persistSellerDayAggs(
  deps: Pick<SyncJobDeps, "replaceSellerDayAggs">,
  args: ListaWindowArgs & { sellersByCoupon?: Map<string, CouponSeller> | null },
): Promise<void> {
  const byCoupon = args.sellersByCoupon;
  const rows = byCoupon ? args.rows.map((r) => withCouponSeller(r, byCoupon)) : args.rows;
  const byName = aggregateSellerDay(rows, {
    tenantId: args.tenantId,
    timeZone: args.timeZone,
    now: args.now,
    dayFrom: args.from,
    dayTo: args.to,
  });
  const sellers = args.linkSellers ? await args.linkSellers(byName) : byName;
  await deps.replaceSellerDayAggs({
    tenantId: args.tenantId,
    storeId: args.storeId,
    from: args.from,
    to: args.to,
    rows: sellers,
  });
}
import {
  forgetMillenniumSession,
  logoutRememberedSessions,
  rememberMillenniumSession,
} from "./sessionStore.ts";

/** Etapas do resumo de tempo por loja (ordem = ordem de execução). */
const STEP = {
  gerador: "Mapa filial → gerador",
  mapaProdutos: "Mapa produto → marca",
  lista: "Vendas (VENDAS.Lista)",
  vendedoras: "Equipe (FUNCIONARIOS lista + consultas)",
  margem: "Marca/CMV (RELATORIOMARGEM)",
  cupom: "Produtos por cupom {52DE7BBC}",
  detMov: "Detalhe do movimento (DetMov · venda sem vendedora)",
  catalogo: "Catálogo de produtos (lookups tipo/produto)",
  cmv: "CMV (RELATORIOMARGEM)",
} as const;

function timed<T>(timings: StepTimings | undefined, step: string, fn: () => Promise<T>): Promise<T> {
  return timings ? timings.time(step, fn) : fn();
}

/** Quantas ConsultaDetMov em paralelo (1 sessão). Default 5. */
export function detMovConcurrency(pending: number): number {
  const raw = Number(process.env.DET_MOV_CONCURRENCY ?? "5");
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.max(1, Math.min(Math.floor(raw), Math.max(1, pending)));
}

/**
 * Grava WEPINK/WPINK:
 * - Receita/dia = RELATORIOMARGEM · COD WP* → WPINK (TOTALVENDA; bate com TOTAL VENDA POR DIA).
 * - CMV do mesmo fetch (evita 2ª ida à margem nos dias da janela).
 * - Contagens (vendas/itens) e horas por marca, quando há WPINK = relatório de cupom {52DE7BBC}
 *   (hora da Lista); cupom fora do relatório (venda sem vendedora) = ConsultaDetMov com cache.
 *   Loja só WEPINK copia as contagens do ALL.
 * Soft-fail — ALL da Lista já está gravado.
 */
async function upsertBrandSplit(
  deps: SyncJobDeps,
  args: {
    session: string;
    tenantId: string;
    store: SyncStore;
    from: string;
    to: string;
    rows: SaleRowWithFilial[];
    productMap: ProductBrandMap;
    geradorMap: Map<string, number>;
    geradorIdsWithWpink: Set<number>;
    /** DetMov só para vendas a partir deste dia (1 chamada por cupom). */
    detMovFrom?: string;
    /** DetMov em paralelo (default DET_MOV_CONCURRENCY; carga inicial = 1). */
    detMovConcurrency?: number;
    /** Itens do relatório de cupom {52DE7BBC} (esperado só depois da margem); null = tudo pelo DetMov. */
    couponLines?: CouponReportLine[] | null | Promise<CouponReportLine[] | null>;
    /** Recebe os itens de cada DetMov feito (top produtos reaproveita sem nova chamada). */
    detMovLines?: Map<string, DetMovLine[]>;
    timings?: StepTimings;
  },
): Promise<{ cmvDaysDone: string[]; detMovCoupons: number; wpinkCents: number }> {
  const days = eachIsoDay(args.from, args.to);
  let detMovCoupons = 0;
  detail(
    `  [${args.store.code}] → marca · margem WP* · ${days.length} dia(s)…`,
  );
  let dayAggs: SalesDayAgg[] = [];
  const cmvPatches: Array<{
    tenantId: string;
    storeId: string;
    day: string;
    cmvCents: number;
  }> = [];
  const productCosts: SalesProductCostDayAgg[] = [];
  const tMargem = nowMs();
  let margemOk = 0;
  let margemFail = 0;
  const storeRows = args.rows.filter((r) => r.storeId === args.store.id);

  for (const day of days) {
    try {
      const lines =
        (await closedMonthMargem(deps, {
          session: args.session,
          tenantId: args.tenantId,
          store: args.store,
          day,
          storeRows,
          couponLines: args.couponLines,
          detMovLines: args.detMovLines,
          timings: args.timings,
        })) ??
        (await timed(args.timings, STEP.margem, () =>
          deps.fetchRelatorioMargem({
            session: args.session,
            millenniumStoreId: args.store.millenniumStoreId,
            from: day,
            to: day,
          }),
        ));
      productCosts.push(...productCostDayAggsFromMargemLines(lines, { tenantId: args.tenantId, storeId: args.store.id, day }));
      dayAggs.push(
        ...brandDayAggsFromMargemLines(lines, {
          tenantId: args.tenantId,
          storeId: args.store.id,
          day,
        }),
      );
      cmvPatches.push({
        tenantId: args.tenantId,
        storeId: args.store.id,
        day,
        cmvCents: cmvCentsFromMargemLines(lines),
      });
      margemOk += 1;
    } catch (e) {
      margemFail += 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (isSessionDeadError(msg)) throw e;
      console.warn(`  ⚠ [${args.store.code}] marca/CMV ${day}: ${msg}`);
      syncLog("WARN", "margem", `Marca/CMV (RELATORIOMARGEM) falhou: ${msg}`, { store: args.store, day });
    }
  }
  detail(
    `  [${args.store.code}] marca · margem ok · ${dayAggs.length} dia×marca · ${margemOk}ok/${margemFail}fail · ${formatElapsed(tMargem)}`,
  );
  await saveProductCosts(deps, {
    session: args.session,
    tenantId: args.tenantId,
    store: args.store,
    days: cmvPatches.map((p) => p.day),
    rows: productCosts,
  });

  const geradorId = args.geradorMap.get(args.store.code);
  const margemHasWpink = dayAggs.some((d) => d.brand === "WPINK");
  const hasWpink =
    (geradorId != null && args.geradorIdsWithWpink.has(geradorId)) || margemHasWpink;

  // 2a) Loja sem WPINK: counts do ALL (Lista) → WEPINK
  if (!hasWpink && dayAggs.length > 0 && storeRows.length > 0) {
    const listaAgg = aggregateSales(
      storeRows.map((r) => ({ ...r, brand: "ALL" as const })),
      {
        tenantId: args.tenantId,
        timeZone: args.store.timezone,
        now: deps.now(),
        dayFrom: args.from,
        dayTo: args.to,
      },
    );
    dayAggs = applyAllCountsToWepinkDays(dayAggs, listaAgg.days);
  }

  // 2b) Loja com WPINK: horas + counts por marca (receita continua a da margem).
  // Cupom com vendedora → relatório de cupom; sem vendedora (ou relatório falhou) → DetMov com cache.
  if (hasWpink) {
    const detMovFrom = args.detMovFrom;
    const headers = uniqueBrandSplitHeaders(
      detMovFrom
        ? storeRows.filter((r) => ymdInTz(r.occurredAt, args.store.timezone) >= detMovFrom)
        : storeRows,
    );
    if (headers.length > 0) {
      const cached = new Map<string, CouponBrand>();
      const couponLines = await args.couponLines;
      const byReport = couponLines ? groupCouponLines(couponLines) : null;
      if (byReport) {
        for (const header of headers) {
          const lines = byReport.get(couponKey(header));
          if (!lines) continue;
          const coupon = couponBrandFromReportLines(header, lines, ymdInTz(header.occurredAt, args.store.timezone));
          cached.set(coupon.couponKey, coupon);
        }
      }
      const fromReport = cached.size;
      for (const header of headers) {
        const key = couponKey(header);
        const known = cached.has(key) ? undefined : args.detMovLines?.get(key);
        if (known) {
          cached.set(key, couponBrandFromLines(header, known, args.productMap, ymdInTz(header.occurredAt, args.store.timezone)));
        }
      }
      if (cached.size < headers.length) {
        try {
          const rows = await deps.listCouponBrands({
            tenantId: args.tenantId,
            storeId: args.store.id,
            from: detMovFrom && detMovFrom > args.from ? detMovFrom : args.from,
            to: args.to,
          });
          for (const r of rows) {
            if (cached.has(r.couponKey)) continue;
            cached.set(r.couponKey, r);
            if (r.items && r.items.length > 0) args.detMovLines?.set(r.couponKey, r.items);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`  ⚠ [${args.store.code}] cache de cupons indisponível (busca todos): ${msg}`);
        }
      }
      const missing = headers.filter((h) => !cached.has(couponKey(h)));
      detMovCoupons = missing.length;
      detail(
        `  [${args.store.code}] → marca · ${headers.length} cupom(ns) · ${fromReport} pelo relatório de cupom · ${headers.length - fromReport - missing.length} no cache · ${missing.length} no detalhe (DetMov)…`,
      );
      try {
        const tDet = nowMs();
        const concurrency = args.detMovConcurrency ?? detMovConcurrency(missing.length);
        const fetched: CouponBrand[] = [];
        let ok = 0;
        let fail = 0;
        await mapPool(missing, concurrency, async (header) => {
          try {
            const lines = await timed(args.timings, STEP.detMov, () =>
              deps.fetchConsultaDetMov({
                session: args.session,
                codOperacao: header.millenniumOpCode,
                nf: header.nf,
                tipoOperacao: header.tipoOperacao,
              }),
            );
            // Detalhe vazio pode ser falha momentânea do ERP — não congela no cache.
            if (lines.length > 0) {
              args.detMovLines?.set(couponKey(header), lines);
              const coupon = couponBrandFromLines(
                header,
                lines,
                args.productMap,
                ymdInTz(header.occurredAt, args.store.timezone),
              );
              fetched.push(coupon);
              cached.set(coupon.couponKey, coupon);
            }
            ok += 1;
          } catch (e) {
            fail += 1;
            const msg = e instanceof Error ? e.message : String(e);
            if (isSessionDeadError(msg)) throw e;
            console.warn(
              `  ⚠ [${args.store.code}] DetMov ${header.millenniumOpCode}/${header.nf}: ${msg}`,
            );
            syncLog("WARN", "detalhe_movimento", `Detalhe do movimento de uma venda falhou: ${msg}`, {
              store: args.store,
              detail: { nf: header.nf },
            });
          }
        });
        if (fetched.length > 0) {
          try {
            await deps.upsertCouponBrands({
              tenantId: args.tenantId,
              storeId: args.store.id,
              rows: fetched,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`  ⚠ [${args.store.code}] cache de cupons não gravou: ${msg}`);
          }
        }
        // Só cupons que estão na Lista agora (cancelado some da soma).
        const brandRows: SaleRow[] = [];
        for (const header of headers) {
          const coupon = cached.get(couponKey(header));
          if (coupon) brandRows.push(...saleRowsFromCouponBrand(header, coupon));
        }
        if (brandRows.length === 0) {
          detail(
            `  [${args.store.code}] DetMov · 0 linhas · ${ok}ok/${fail}fail · ${formatElapsed(tDet)}`,
          );
        } else {
          const agg = aggregateSales(brandRows, {
            tenantId: args.tenantId,
            timeZone: args.store.timezone,
            now: deps.now(),
            dayFrom: args.from,
            dayTo: args.to,
          });
          const brandedDays = agg.days.filter(
            (d) => d.brand === "WEPINK" || d.brand === "WPINK",
          );
          const brandedHours = agg.hours.filter(
            (h) => h.brand === "WEPINK" || h.brand === "WPINK",
          );
          if (dayAggs.length > 0) {
            dayAggs = applyBrandDayCounts(dayAggs, brandedDays);
          } else {
            // Margem caiu — usa receita+counts do DetMov como fallback
            dayAggs = brandedDays;
          }
          if (brandedHours.length > 0) await deps.upsertHourAggs(brandedHours);
          detail(
            `  [${args.store.code}] marca ok · ${brandedDays.length} dia×marca · ${brandedHours.length} hora · DetMov ${ok}ok/${fail}fail · ${formatElapsed(tDet)}`,
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isSessionDeadError(msg)) throw e;
        console.warn(`  ⚠ [${args.store.code}] DetMov falhou (margem ok): ${msg}`);
        syncLog("WARN", "detalhe_movimento", `Detalhe do movimento falhou (horas/contagens por marca): ${msg}`, {
          store: args.store,
        });
      }
    }
  } else if (!hasWpink) {
    detail(
      `  [${args.store.code}] sem WPINK no cadastro — counts WEPINK ← ALL`,
    );
  }

  if (dayAggs.length > 0) {
    await deps.upsertDayAggs(dayAggs);
    detail(
      `  [${args.store.code}] brand days ${args.from}→${args.to} · ${dayAggs.length} dia×marca`,
    );
  }
  if (cmvPatches.length > 0) {
    await deps.patchDayCmv(cmvPatches);
  }
  if (margemHasWpink) {
    await deps.setStoresHasWpink([{ storeId: args.store.id, hasWpink: true }]);
  }
  return {
    cmvDaysDone: cmvPatches.map((p) => p.day),
    detMovCoupons,
    wpinkCents: dayAggs.reduce((a, d) => a + (d.brand === "WPINK" ? d.revenueCents : 0), 0),
  };
}

function eachIsoDay(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

/**
 * CMV por produto (mesmo fetch da margem). Soft-fail: o CMV do dia já foi gravado.
 * Depois: produto vendido com custo 0 sem preço na tabela da loja → recarga de produtos;
 * loja ainda sem tabela → escolha automática (só banco).
 */
async function saveProductCosts(
  deps: SyncJobDeps,
  args: { session: string; tenantId: string; store: SyncStore; days: string[]; rows: SalesProductCostDayAgg[] },
): Promise<void> {
  if (args.days.length === 0) return;
  try {
    await deps.replaceProductCostDayAggs({
      tenantId: args.tenantId,
      storeId: args.store.id,
      days: args.days,
      rows: args.rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    console.warn(`  ⚠ [${args.store.code}] CMV por produto não gravou: ${msg}`);
    syncLog("WARN", "custo_produto", `CMV por produto não gravou: ${msg}`, { store: args.store });
    return;
  }
  const zeroCodes = args.rows.filter((r) => r.cmvCents === 0 && r.itemCount > 0).map((r) => r.productCode);
  if (zeroCodes.length > 0) {
    await ensureCatalogFor(deps, {
      session: args.session,
      seen: [],
      zeroCost: { storeId: args.store.id, codes: zeroCodes },
      guard: { attempted: false },
      store: args.store,
    });
  }
  if (!deps.costTable) return;
  try {
    const pick = await detectStoreCostTable(deps.costTable, args.store.id);
    if (pick) {
      console.log(`  [${args.store.code}] tabela de custo escolhida: ${pick.tableId} (${pick.matches} de ${pick.compared} produtos com o mesmo custo)`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  ⚠ [${args.store.code}] tabela de custo: ${msg}`);
  }
}

/** CMV via RELATORIOMARGEM — 1 chamada por dia (imposto% = 0). Soft-fail. */
async function syncCmvForRange(
  deps: SyncJobDeps,
  args: {
    session: string;
    tenantId: string;
    store: SyncStore;
    from: string;
    to: string;
    /** Se passado, só estes dias (pula intermediários). */
    days?: string[];
    timings?: StepTimings;
  },
): Promise<void> {
  const days = args.days ?? eachIsoDay(args.from, args.to);
  if (days.length === 0) {
    detail(`  [${args.store.code}] → CMV · skip (sem buraco)`);
    return;
  }
  detail(`  [${args.store.code}] → CMV · ${days.length} dia(s)…`);
  const tCmv = nowMs();
  const patches: Array<{ tenantId: string; storeId: string; day: string; cmvCents: number }> = [];
  const productCosts: SalesProductCostDayAgg[] = [];
  let ok = 0;
  let fail = 0;
  for (const day of days) {
    const tDay = nowMs();
    try {
      const lines = await timed(args.timings, STEP.cmv, () =>
        deps.fetchRelatorioMargem({
          session: args.session,
          millenniumStoreId: args.store.millenniumStoreId,
          from: day,
          to: day,
        }),
      );
      patches.push({
        tenantId: args.tenantId,
        storeId: args.store.id,
        day,
        cmvCents: cmvCentsFromMargemLines(lines),
      });
      productCosts.push(...productCostDayAggsFromMargemLines(lines, { tenantId: args.tenantId, storeId: args.store.id, day }));
      ok += 1;
      if (days.length > 1) {
        detail(`  [${args.store.code}] CMV ${day} · ${formatElapsed(tDay)}`);
      }
    } catch (e) {
      fail += 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (isSessionDeadError(msg)) throw e;
      console.warn(`  ⚠ [${args.store.code}] CMV ${day} (${formatElapsed(tDay)}): ${msg}`);
      syncLog("WARN", "cmv", `CMV (RELATORIOMARGEM) falhou: ${msg}`, { store: args.store, day });
    }
  }
  if (patches.length > 0) await deps.patchDayCmv(patches);
  await saveProductCosts(deps, {
    session: args.session,
    tenantId: args.tenantId,
    store: args.store,
    days: patches.map((p) => p.day),
    rows: productCosts,
  });
  detail(
    `  [${args.store.code}] CMV ok · ${ok} dia(s) · ${fail} fail · ${formatElapsed(tCmv)}`,
  );
}

type CouponFetch = { lines: CouponReportLine[]; okWindows: Array<{ from: string; to: string }> };

/**
 * Relatório de cupom {52DE7BBC} — 1 chamada por janela (Atualizar = 1 por loja).
 * Soft-fail: janela que falha fica de fora (marca cai no DetMov, equipe no nome da Lista); todas falharam = null.
 */
async function fetchCouponLinesForWindows(
  deps: SyncJobDeps,
  args: {
    session: string;
    store: SyncStore;
    geradorId: number;
    windows: Array<{ from: string; to: string }>;
    timings?: StepTimings;
  },
): Promise<CouponFetch | null> {
  const out: CouponFetch = { lines: [], okWindows: [] };
  for (const w of args.windows) {
    const t = nowMs();
    try {
      const month =
        deps.closedMonth?.covers(w.from) && deps.closedMonth.covers(w.to)
          ? await deps.closedMonth.couponLines({
              session: args.session,
              store: args.store,
              geradorId: args.geradorId,
              timings: args.timings,
            })
          : null;
      const lines = month
        ? month.filter((l) => l.day != null && l.day >= w.from && l.day <= w.to)
        : await timed(args.timings, STEP.cupom, () =>
            deps.fetchCouponReport({ session: args.session, geradorId: args.geradorId, from: w.from, to: w.to }),
          );
      out.lines.push(...lines);
      out.okWindows.push(w);
      detail(`  [${args.store.code}] cupom ${w.from}→${w.to} · ${lines.length} item(ns) · ${formatElapsed(t)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isSessionDeadError(msg)) throw e;
      console.warn(`  ⚠ [${args.store.code}] cupom ${w.from}→${w.to}: ${msg}`);
      syncLog("WARN", "cupom", `Produtos por cupom {52DE7BBC} falhou: ${msg}`, {
        store: args.store,
        day: w.from === w.to ? w.from : null,
      });
    }
  }
  return out.okWindows.length > 0 ? out : null;
}

/** Produtos (catálogo + tabelas de custo): recarrega se aparecer produto desconhecido ou sem custo (soft-fail; 401 derruba o job). */
async function ensureCatalogFor(
  deps: SyncJobDeps,
  args: {
    session: string;
    seen: SeenProduct[];
    zeroCost?: { storeId: string; codes: string[] };
    guard: CatalogGuard;
    store: SyncStore;
    timings?: StepTimings;
  },
): Promise<void> {
  if (!deps.catalog) return;
  const t = nowMs();
  try {
    const r = await ensureProductCatalog(deps.catalog, {
      session: args.session,
      seen: args.seen,
      zeroCost: args.zeroCost,
      guard: args.guard,
      owner: `worker-${process.pid}`,
    });
    if (r.status === "refreshed") {
      args.timings?.add(STEP.catalogo, nowMs() - t, r.calls);
      console.log(
        `  [${args.store.code}] produtos recarregados | ${r.products} produtos | ${r.tables} tabelas de custo (${r.prices} precos) | ${r.calls} chamadas ao ERP | ${formatElapsed(t)}` +
          (r.unknown > 0 ? ` | ${r.unknown} novo(s), ${r.stillUnknown} sem cadastro` : "") +
          (r.costMissing > 0 ? ` | ${r.costMissing} sem custo, ${r.stillCostMissing} seguem sem preco na tabela` : ""),
      );
    } else if (r.status === "skipped") {
      detail(`  [${args.store.code}] catálogo · ${r.unknown} produto(s) novo(s) · recarga ${r.reason === "job" ? "já feita neste job" : "em andamento ou recente"}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isSessionDeadError(msg)) throw e;
    console.warn(`  ⚠ [${args.store.code}] catálogo de produtos: ${msg}`);
    syncLog("WARN", "catalogo", `Catálogo de produtos (tipo/categoria) falhou: ${msg}`, { store: args.store });
  }
}

const MAX_TOP_PRODUCT_DETMOV = 10;

/**
 * Itens dos cupons da Lista que não vieram no relatório de cupom (venda sem vendedora):
 * reaproveita o DetMov já feito na marca; senão 1 ConsultaDetMov por cupom.
 */
async function detMovItemsForMissingCoupons(
  deps: SyncJobDeps,
  args: {
    session: string;
    tenantId: string;
    store: SyncStore;
    missing: BrandSplitHeader[];
    detMovLines?: Map<string, DetMovLine[]>;
    timings?: StepTimings;
  },
): Promise<Map<string, DetMovLine[]>> {
  const out = new Map<string, DetMovLine[]>();
  let pending: BrandSplitHeader[] = [];
  for (const h of args.missing) {
    const known = args.detMovLines?.get(couponKey(h));
    if (known) out.set(couponKey(h), known);
    else pending.push(h);
  }
  const dayOf = (h: BrandSplitHeader) => ymdInTz(h.occurredAt, args.store.timezone);
  if (pending.length > 0) {
    const days = pending.map(dayOf).sort();
    try {
      const cachedRows = await deps.listCouponBrands({
        tenantId: args.tenantId,
        storeId: args.store.id,
        from: days[0]!,
        to: days[days.length - 1]!,
      });
      const withItems = new Map(cachedRows.filter((r) => r.items && r.items.length > 0).map((r) => [r.couponKey, r.items!]));
      pending = pending.filter((h) => {
        const items = withItems.get(couponKey(h));
        if (items) out.set(couponKey(h), items);
        return !items;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  ⚠ [${args.store.code}] cache de cupons indisponível (top produtos): ${msg}`);
    }
  }
  const toFetch = pending;
  // Normal = 0–2 vendas sem vendedora por dia. Muitas = relatório incompleto: não troca por N chamadas.
  if (toFetch.length > MAX_TOP_PRODUCT_DETMOV) {
    console.warn(`  ⚠ [${args.store.code}] top produtos: ${toFetch.length} cupons fora do relatório de cupom (pula o detalhe)`);
    syncLog("WARN", "cupom", `Top produtos: ${toFetch.length} vendas da Lista não vieram no relatório de cupom`, {
      store: args.store,
    });
    return out;
  }
  const fetched: CouponBrand[] = [];
  await mapPool(toFetch, detMovConcurrency(toFetch.length), async (header) => {
    try {
      const lines = await timed(args.timings, STEP.detMov, () =>
        deps.fetchConsultaDetMov({
          session: args.session,
          codOperacao: header.millenniumOpCode,
          nf: header.nf,
          tipoOperacao: header.tipoOperacao,
        }),
      );
      if (lines.length > 0) {
        out.set(couponKey(header), lines);
        fetched.push(couponBrandFromLines(header, lines, new Map(), dayOf(header)));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isSessionDeadError(msg)) throw e;
      console.warn(`  ⚠ [${args.store.code}] DetMov (top produtos) ${header.millenniumOpCode}/${header.nf}: ${msg}`);
      syncLog("WARN", "detalhe_movimento", `Detalhe do movimento de uma venda falhou: ${msg}`, {
        store: args.store,
        detail: { nf: header.nf },
      });
    }
  });
  if (fetched.length > 0) {
    await deps.upsertCouponBrands({ tenantId: args.tenantId, storeId: args.store.id, rows: fetched }).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  ⚠ [${args.store.code}] cache de cupons não gravou (top produtos): ${msg}`);
    });
  }
  return out;
}

export type ClosedMonthSource = {
  from: string;
  to: string;
  covers: (day: string) => boolean;
  /** Relatório de cupom do período inteiro (1 chamada por loja). null = falhou → segue dia a dia. */
  couponLines: (args: {
    session: string;
    store: SyncStore;
    geradorId: number;
    timings?: StepTimings;
  }) => Promise<CouponReportLine[] | null>;
  /** Custo unitário do período (margem 1× por loja). null = falhou → margem dia a dia. */
  unitCosts: (args: { session: string; store: SyncStore; timings?: StepTimings }) => Promise<Map<string, number> | null>;
  /** COD_PRODUTO de um produto visto no relatório de cupom do período (qualquer loja / dia). */
  codeOf: (productId: number) => string | undefined;
  /** VENDAS.Lista do período inteiro (1 chamada por loja). null = falhou → Lista dia a dia. */
  listaRows: (args: {
    session: string;
    store: SyncStore;
    eventoIds: number[];
    timings?: StepTimings;
  }) => Promise<ListaRows | null>;
};

type ListaRows = Awaited<ReturnType<SyncJobDeps["fetchSalesLista"]>>;

function createClosedMonthSource(deps: SyncJobDeps, from: string, to: string): ClosedMonthSource {
  const listas = new Map<string, Promise<ListaRows | null>>();
  const coupons = new Map<string, Promise<CouponReportLine[] | null>>();
  const costs = new Map<string, Promise<Map<string, number> | null>>();
  const codeById = new Map<number, string>();
  const once = <T>(
    memo: Map<string, Promise<T | null>>,
    key: string,
    load: () => Promise<T>,
    onFail: (msg: string) => void,
  ): Promise<T | null> => {
    const hit = memo.get(key);
    if (hit) return hit;
    const p = load().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (isSessionDeadError(msg)) {
        memo.delete(key);
        throw e;
      }
      onFail(msg);
      return null;
    });
    memo.set(key, p);
    return p;
  };
  return {
    from,
    to,
    covers: (day) => day >= from && day <= to,
    couponLines: ({ session, store, geradorId, timings }) =>
      once(
        coupons,
        store.id,
        async () => {
          const lines = await timed(timings, STEP.cupom, () => deps.fetchCouponReport({ session, geradorId, from, to }));
          for (const l of lines) if (l.productCode) codeById.set(l.productId, l.productCode);
          return lines;
        },
        (msg) => {
          console.warn(`  ⚠ [${store.code}] cupom do mês ${from}→${to}: ${msg} — segue dia a dia`);
          syncLog("WARN", "cupom", `Produtos por cupom do mês falhou (segue dia a dia): ${msg}`, { store });
        },
      ),
    unitCosts: ({ session, store, timings }) =>
      once(
        costs,
        store.id,
        async () =>
          unitCostsFromMargem(
            await timed(timings, STEP.margem, () =>
              deps.fetchRelatorioMargem({ session, millenniumStoreId: store.millenniumStoreId, from, to }),
            ),
          ),
        (msg) => {
          console.warn(`  ⚠ [${store.code}] margem do mês ${from}→${to}: ${msg} — segue dia a dia`);
          syncLog("WARN", "margem", `Marca/CMV do mês falhou (segue dia a dia): ${msg}`, { store });
        },
      ),
    codeOf: (productId) => codeById.get(productId),
    listaRows: ({ session, store, eventoIds, timings }) =>
      once(
        listas,
        store.id,
        () =>
          timed(timings, STEP.lista, () =>
            deps.fetchSalesLista({
              session,
              storeId: store.id,
              millenniumStoreId: store.millenniumStoreId,
              from,
              to,
              eventoIds,
            }),
          ),
        (msg) => {
          console.warn(`  ⚠ [${store.code}] Lista do mês ${from}→${to}: ${msg} — segue dia a dia`);
          syncLog("WARN", "vendas", `Vendas do mês falhou (segue dia a dia): ${msg}`, { store });
        },
      ),
  };
}

/**
 * Margem de 1 dia da carga em período sem chamar o ERP: itens do relatório de cupom do dia + itens das
 * vendas sem vendedora (DetMov / cache) × custo unitário do período. null = usa a margem do dia.
 */
async function closedMonthMargem(
  deps: SyncJobDeps,
  args: {
    session: string;
    tenantId: string;
    store: SyncStore;
    day: string;
    storeRows: SaleRowWithFilial[];
    couponLines?: CouponReportLine[] | null | Promise<CouponReportLine[] | null>;
    detMovLines?: Map<string, DetMovLine[]>;
    timings?: StepTimings;
  },
): Promise<MargemLine[] | null> {
  const month = deps.closedMonth;
  if (!month?.covers(args.day)) return null;
  const report = await args.couponLines;
  if (!report) return null;
  const unit = await month.unitCosts({ session: args.session, store: args.store, timings: args.timings });
  if (!unit) return null;

  const dayLines = report.filter((l) => l.day === args.day);
  const reportKeys = new Set(report.map((l) => l.couponKey));
  const missing = uniqueBrandSplitHeaders(
    args.storeRows.filter((r) => ymdInTz(r.occurredAt, args.store.timezone) === args.day),
  ).filter((h) => !reportKeys.has(couponKey(h)));
  const detMov = await detMovItemsForMissingCoupons(deps, {
    session: args.session,
    tenantId: args.tenantId,
    store: args.store,
    missing,
    detMovLines: args.detMovLines,
    timings: args.timings,
  });
  if (detMov.size < missing.length) return null;

  const items: ClosedMonthItem[] = dayLines.map((l) => ({ code: l.productCode, qty: l.qty, revenueCents: l.revenueCents }));
  if (detMov.size > 0) {
    const codeById = new Map(report.map((l) => [l.productId, l.productCode]));
    for (const l of [...detMov.values()].flat()) {
      const code = codeById.get(l.productId) ?? month.codeOf(l.productId);
      if (code) codeById.set(l.productId, code);
    }
    const unknown = [...detMov.values()].flat().map((l) => l.productId).filter((id) => !codeById.has(id));
    if (unknown.length > 0 && deps.catalog) {
      const catalog = await deps.catalog.lookupProducts(unknown).catch(() => new Map<number, { code: string }>());
      for (const [id, entry] of catalog) codeById.set(id, entry.code);
    }
    for (const [key, lines] of detMov) {
      args.detMovLines?.set(key, lines);
      for (const l of lines) {
        if (l.qty === 0 && l.revenueCents === 0) continue;
        items.push({ code: codeById.get(l.productId) ?? "", qty: l.qty, revenueCents: l.revenueCents });
      }
    }
  }
  const lines = margemLinesFromItems(items, unit);
  if (!lines) detail(`  [${args.store.code}] período ${args.day}: produto sem custo no período — margem do dia`);
  return lines;
}

/** Top produtos das janelas que o relatório de cupom trouxe (só cupons da Lista; sem vendedora = DetMov). */
async function saveCouponProducts(
  deps: SyncJobDeps,
  args: {
    session: string;
    tenantId: string;
    store: SyncStore;
    coupon: CouponFetch;
    listaRows: SaleRowWithFilial[];
    catalogGuard: CatalogGuard;
    detMovLines?: Map<string, DetMovLine[]>;
    timings?: StepTimings;
  },
): Promise<void> {
  const dayByCoupon = new Map<string, string>();
  const byCoupon = groupCouponLines(args.coupon.lines);
  const inOkWindow = (day: string) => args.coupon.okWindows.some((w) => day >= w.from && day <= w.to);
  const missing: BrandSplitHeader[] = [];
  for (const h of uniqueBrandSplitHeaders(args.listaRows)) {
    const day = ymdInTz(h.occurredAt, args.store.timezone);
    dayByCoupon.set(couponKey(h), day);
    if (!byCoupon.has(couponKey(h)) && inOkWindow(day)) missing.push(h);
  }
  const detMov = await detMovItemsForMissingCoupons(deps, {
    session: args.session,
    tenantId: args.tenantId,
    store: args.store,
    missing,
    detMovLines: args.detMovLines,
    timings: args.timings,
  });
  const seen: SeenProduct[] = args.coupon.lines.map((l) => ({ erpProductId: l.productId, code: l.productCode }));
  for (const lines of detMov.values()) for (const l of lines) seen.push({ erpProductId: l.productId, code: "" });
  await ensureCatalogFor(deps, { session: args.session, seen, guard: args.catalogGuard, store: args.store, timings: args.timings });
  if (detMov.size > 0) {
    const ids = [...detMov.values()].flat().map((l) => l.productId);
    const catalog = deps.catalog ? await deps.catalog.lookupProducts(ids).catch(() => new Map()) : new Map();
    for (const [key, lines] of detMov) {
      byCoupon.set(key, detMovToCouponLines(key, lines, catalog));
    }
  }
  const rows = productDayAggsFromCouponLines(byCoupon, {
    tenantId: args.tenantId,
    storeId: args.store.id,
    dayOf: (key) => dayByCoupon.get(key) ?? null,
  });
  for (const w of args.coupon.okWindows) {
    await deps.replaceProductDayAggs({
      tenantId: args.tenantId,
      storeId: args.store.id,
      from: w.from,
      to: w.to,
      rows: rows.filter((r) => r.day >= w.from && r.day <= w.to),
    });
  }
  detail(
    `  [${args.store.code}] top produtos · ${rows.length} dia×produto${detMov.size > 0 ? ` · ${detMov.size} cupom(ns) sem vendedora pelo detalhe` : ""}`,
  );
}

/** Top produtos sem Lista (só buracos de dias já sincronizados): relatório de cupom dia a dia. */
async function syncCouponProductsForDays(
  deps: SyncJobDeps,
  args: {
    session: string;
    tenantId: string;
    store: SyncStore;
    geradorId: number;
    days: string[];
    catalogGuard: CatalogGuard;
    timings?: StepTimings;
  },
): Promise<void> {
  for (const day of args.days) {
    const fetched = await fetchCouponLinesForWindows(deps, {
      session: args.session,
      store: args.store,
      geradorId: args.geradorId,
      windows: [{ from: day, to: day }],
      timings: args.timings,
    });
    if (!fetched) continue;
    await ensureCatalogFor(deps, {
      session: args.session,
      seen: fetched.lines.map((l) => ({ erpProductId: l.productId, code: l.productCode })),
      guard: args.catalogGuard,
      store: args.store,
      timings: args.timings,
    });
    await deps.replaceProductDayAggs({
      tenantId: args.tenantId,
      storeId: args.store.id,
      from: day,
      to: day,
      rows: productDayAggsFromCouponLines(groupCouponLines(fetched.lines), {
        tenantId: args.tenantId,
        storeId: args.store.id,
        dayOf: () => day,
      }),
    });
  }
}

/**
 * SEED = hoje (onboarding) + carga do histórico por trás (SYNC_ONBOARDING). HISTORY/RANGE = só manual. FORCE = Atualizar.
 * CLOSE = fechamento noturno: mesmo fluxo do FORCE para os dias `payload.from → to` (ontem; + anteontem se a noite anterior falhou).
 */
export type SyncJobKind =
  | "BACKFILL"
  | "SEED"
  | "LIGHT"
  | "FORCE_LIGHT"
  | "FORCE"
  | "RANGE"
  | "HISTORY"
  | "CLOSE";

/** Hora local (fuso da 1ª loja) a partir da qual o fechamento de ontem é enfileirado (`.env CLOSE_HOUR`). */
export function closeHour(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CLOSE_HOUR ?? "3");
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 3;
}

/** Horas a partir de CLOSE_HOUR em que o fechamento pode entrar na fila (fora disso espera a próxima noite). */
export const CLOSE_WINDOW_HOURS = 6;

/** Hora local dentro da janela do fechamento (ex.: 3h → 3:00–8:59). */
export function isCloseWindow(localHour: number, startHour: number): boolean {
  return (localHour - startHour + 24) % 24 < CLOSE_WINDOW_HOURS;
}

/** Fechamento noturno ligado (default). `CLOSE_HOUR=off` desliga. */
export function dailyCloseEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CLOSE_HOUR?.trim().toLowerCase() !== "off";
}

/** Hora local (0–23) de `date` no fuso. */
export function hourInTz(date: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date);
  return Number(h) % 24;
}

/** Instante que corresponde a `isoDay` 23:59:30 no fuso (relógio do fechamento). */
export function endOfDayInTz(isoDay: string, timeZone: string): Date {
  const guess = Date.parse(`${isoDay}T23:59:30.000Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(guess - (localAsUtc - guess));
}

/**
 * Dias que o fechamento cobre: sempre ontem; anteontem também quando a noite anterior
 * não fechou (worker parado / falha). Nunca mais que 2 dias. Primeira noite da integração = só ontem.
 */
export function closeWindow(todayIso: string, previousClosed: boolean): { from: string; to: string } {
  const to = addDaysIso(todayIso, -1);
  return { from: previousClosed ? to : addDaysIso(todayIso, -2), to };
}

/** Limite do HISTORY manual (`scripts/history-months.ts`), em meses antes do atual. */
export const HISTORY_CAP_MONTHS = 24;

export type SyncJobPayload = {
  /** Inclusive ISO day YYYY-MM-DD (store TZ calendar). */
  from?: string;
  to?: string;
  /** When set and non-empty, only these store UUIDs are synced. */
  storeIds?: string[];
  /**
   * CLOSE da carga do mês (pós-onboarding): 1 dia por job; ao terminar enfileira o dia anterior
   * até chegar neste dia (dia 1 do mês).
   */
  fillUntil?: string;
  /** Rodada da atualização automática (Configurações > Integrações). */
  auto?: boolean;
  /** Rodada automática anterior pulou por sessão caída → esta pode fazer login com a senha salva. */
  relogin?: boolean;
  /** Lojas no fechamento + 30 min: rodada ok fecha o dia delas. */
  closeStoreIds?: string[];
  /** Lojas que fecham o dia nesta rodada: sempre completas (não pula relatórios com Lista igual). */
  fullStoreIds?: string[];
  /**
   * Carga funda do histórico (madrugada, até a inauguração / 24 meses): 1 mês por job, sem encadear
   * (o agendador enfileira o próximo mês) e sem barra de progresso na tela.
   */
  deep?: boolean;
};

export type SyncJob = {
  id: string;
  tenantId: string;
  credentialId: string;
  kind: SyncJobKind;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  payload: SyncJobPayload;
  /** Tipo gravado nos Logs quando difere de `kind` (dias do CLOSE rodam como FORCE). */
  logKind?: SyncJobKind;
  /** Título no log do terminal (ex.: "Carga do mês"); padrão = pelo tipo. */
  logTitle?: string;
  /** Rodada automática: sessão caída / ERP fora do ar não vira erro em Logs nem `last_error`. */
  quietFailures?: boolean;
  /** Dia da carga em período: sem blocos no terminal (quem chama imprime 1 linha); erro continua aparecendo. */
  compactLog?: boolean;
};

export type SyncCredential = {
  id: string;
  tenantId: string;
  username: string;
  password: string;
  status: "VALID" | "INVALID" | "NOT_CONFIGURED";
};

export type SyncStore = {
  id: string;
  millenniumStoreId: number;
  /** COD_FILIAL display e.g. "00010" — used to resolve S-{n} EVENTO. */
  code: string;
  timezone: string;
  /** DATA_INAUGURACAO — chão do backfill (null = só teto 24m). */
  openedAt?: string | null;
  /** true = loja já teve WPINK no sync; false = só cosmético; undefined = ainda não sabemos. */
  hasWpink?: boolean | null;
  /** Nome fantasia (só log). */
  name?: string | null;
  /** Gerador da filial salvo no banco (filtro dos relatórios); null = ainda não buscado. */
  geradorId?: number | null;
  /** `store.hours` cru (Configurações > Lojas). */
  hours?: unknown;
  /** Último dia fechado (`store.last_closed_day`); null = ainda sem base. */
  lastClosedDay?: string | null;
};

export type LoginResult =
  | { ok: true; session: string }
  | { ok: false; reason: "busy" | "password" | "other"; raw: string };

export type SyncJobDeps = {
  hasRunningForCredential: (credentialId: string) => Promise<boolean>;
  markJobRunning: (jobId: string) => Promise<void>;
  markJobFinished: (args: {
    jobId: string;
    status: "SUCCEEDED" | "FAILED";
    error?: string;
  }) => Promise<void>;
  loadCredential: (credentialId: string) => Promise<SyncCredential>;
  /** Erros/avisos do job → `sync_log` (Configurações > Logs). Best-effort. */
  insertSyncLogs?: (rows: SyncLogRow[]) => Promise<void>;
  listStores: (tenantId: string) => Promise<SyncStore[]>;
  /** Days already in sales_day_agg for this store (any brand). */
  listExistingDays: (args: {
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
  }) => Promise<string[]>;
  /** Dias com CMV preenchido (brand=ALL, cmv_cents not null). */
  listDaysWithCmv: (args: {
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
  }) => Promise<string[]>;
  /** Dias que já têm sales_product_day_agg. */
  listDaysWithProduct: (args: {
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
  }) => Promise<string[]>;
  /**
   * Dias com forma de pagamento “completa”:
   * tem linha em sales_payment_day_agg OU day_agg ALL com revenue 0.
   */
  listDaysPaymentComplete: (args: {
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
  }) => Promise<string[]>;
  /** Earliest day in sales_day_agg for store (any brand). */
  earliestSalesDay: (args: { tenantId: string; storeId: string }) => Promise<string | null>;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: (session: string) => Promise<void>;
  /** EVENTO whitelist ids for this store's COD_FILIAL (from cache or EVENTOS.ListaTodos). */
  resolveEventoIds: (
    session: string,
    tenantId: string,
    codFilial: string,
  ) => Promise<number[]>;
  fetchSalesLista: (params: FetchSalesListaParams) => Promise<SaleRowWithFilial[] | SaleRow[]>;
  /** Lookup COD_FILIAL → FILIAL_GERADOR_GERADOR (wtsreports). */
  fetchFilialGeradorMap: (session: string) => Promise<Map<string, number>>;
  /** Mapa PRODUTO → WEPINK|WPINK (report + LISTAR; 1× por job, união das lojas). */
  fetchProductBrandMap: (params: {
    session: string;
    geradorIds: number[];
    stores?: Array<{ millenniumStoreId: number; geradorId: number }>;
    from?: string;
    to?: string;
    /** Uma chamada por vez (carga inicial). */
    sequential?: boolean;
  }) => Promise<ProductBrandCatalog>;
  /** Relatório oficial faturamento por marca (dia) — CATALOG 70F9DE61. */
  fetchBrandRevenueReport: (params: {
    session: string;
    geradorIds: number[];
    from: string;
    to: string;
  }) => Promise<BrandReportDayRow[]>;
  /** Itens da venda (ConsultaDetMov). */
  fetchConsultaDetMov: (params: {
    session: string;
    codOperacao: number;
    nf: string;
    tipoOperacao?: string;
  }) => Promise<DetMovLine[]>;
  /** Cupons já detalhados (cache do ConsultaDetMov) no intervalo de dias. */
  listCouponBrands: (args: {
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
  }) => Promise<CouponBrand[]>;
  upsertCouponBrands: (args: {
    tenantId: string;
    storeId: string;
    rows: CouponBrand[];
  }) => Promise<void>;
  /** RELATORIOMARGEM — CMV do período (chamar por dia). */
  fetchRelatorioMargem: (params: {
    session: string;
    millenniumStoreId: number;
    from: string;
    to: string;
  }) => Promise<import("./millenniumMargem.ts").MargemLine[]>;
  /** Catálogo de produtos da rede (tipo = categoria). Sem ele, produto novo fica INDEFINIDO. */
  catalog?: CatalogDeps;
  costTable?: CostTableDetectDeps;
  /** {52DE7BBC} Produtos por cupom e vendedor — linhas cupom × produto (sem cancelados). */
  fetchCouponReport: (params: {
    session: string;
    geradorId: number;
    from: string;
    to: string;
  }) => Promise<CouponReportLine[]>;
  upsertDayAggs: (rows: SalesDayAgg[]) => Promise<void>;
  /** Patch só cmv_cents em brand=ALL (não zera receita no upsert). */
  patchDayCmv: (
    rows: Array<{ tenantId: string; storeId: string; day: string; cmvCents: number }>,
  ) => Promise<void>;
  /**
   * Substitui Top produtos no intervalo [from,to] da loja
   * (relatório de cupom {52DE7BBC} — delete + upsert).
   */
  replaceProductDayAggs: (args: {
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
    rows: SalesProductDayAgg[];
  }) => Promise<void>;
  /** Substitui o CMV por produto (RELATORIOMARGEM) nos dias informados da loja. */
  replaceProductCostDayAggs: (args: {
    tenantId: string;
    storeId: string;
    days: string[];
    rows: SalesProductCostDayAgg[];
  }) => Promise<void>;
  /**
   * Substitui formas de pagamento no intervalo [from,to] da loja
   * (delete + upsert — evita CONDICAO órfã após FORCE).
   */
  replacePaymentDayAggs: (args: {
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
    rows: SalesPaymentDayAgg[];
  }) => Promise<void>;
  /**
   * Substitui ranking de vendedoras no intervalo [from,to] da loja
   * (VENDEDOR_MILLENNIUM da Lista — delete + upsert).
   */
  replaceSellerDayAggs: (args: {
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
    rows: SalesSellerDayAgg[];
  }) => Promise<void>;
  upsertHourAggs: (rows: SalesHourAgg[]) => Promise<void>;
  /** Vendedoras já conhecidas do tenant (nome → código). Sem ela, agregados ficam só pelo nome. */
  loadSellerDirectory?: SellerLinkerDeps["loadSellerDirectory"];
  /** Vendedoras da loja (FUNCIONARIOS.Lista CARGO=1 + Consulta). Opcional: sem ela o passo é pulado. */
  fetchStoreSellers?: SellerLinkerDeps["fetchStoreSellers"];
  /** Upsert das vendedoras da loja (quem não veio vira in_erp=false) + liga dias antigos pelo nome. */
  syncStoreSellers?: SellerLinkerDeps["syncStoreSellers"];
  /** Persiste flag WPINK por loja (mapa produto / FILIAIS). */
  setStoresHasWpink: (rows: Array<{ storeId: string; hasWpink: boolean }>) => Promise<void>;
  /** Guarda o gerador da filial (lookup só roda quando falta). */
  setStoresGerador?: (rows: Array<{ storeId: string; geradorId: number }>) => Promise<void>;
  /** Avança `store.last_closed_day` (nunca volta). */
  markStoresClosed?: (rows: Array<{ storeId: string; day: string }>) => Promise<void>;
  /** `store.last_sync_at` = último Atualizar de hoje ok. */
  markStoresSynced?: (storeIds: string[], at: Date) => Promise<void>;
  /** Lista de hoje da última rodada completa por loja (Atualizar sem venda nova pula cupom e margem). */
  listaMemo?: ListaMemo;
  insertSyncRun: (args: {
    tenantId: string;
    credentialId: string;
    kind: SyncJobKind;
    ok: boolean;
    storesDone: number;
    error?: string;
    startedAt: Date;
    finishedAt: Date;
  }) => Promise<void>;
  updateCredential: (args: {
    credentialId: string;
    status?: SyncCredential["status"];
    lastError?: string;
    lastErrorAt?: Date;
    lastSuccessAt?: Date;
    lastLightSyncAt?: Date;
  }) => Promise<void>;
  /** Sessão Millennium persistida no tenant (compartilhada com o app). */
  getStoredSession: (credentialId: string) => Promise<string | null>;
  setStoredSession: (credentialId: string, session: string | null) => Promise<void>;
  /** Mês fechado da carga do histórico: relatório de cupom e margem 1× por loja no período. */
  closedMonth?: ClosedMonthSource;
  /** Atualizar / carga inicial na fila da credencial (a carga de mês fechado cede a vez entre dias). */
  hasPriorityJobQueued?: (credentialId: string) => Promise<boolean>;
  /** Carga do histórico em período: grava no job o dia mais antigo já gravado (`payload.progressDay`, barra da tela). */
  markJobProgress?: (args: { jobId: string; day: string }) => Promise<void>;
  /** Carga do histórico: enfileira o CLOSE de `day` (não duplica se já houver na fila/rodando). */
  enqueueMonthFillDay: (args: {
    tenantId: string;
    credentialId: string;
    day: string;
    fillUntil: string;
    /** Recarga de dias (ex.: custos corrigidos no ERP): só essas lojas; vazio = todas. */
    storeIds?: string[];
  }) => Promise<boolean>;
  now: () => Date;
};

/** Números do job para o log compacto (carga em período). */
export type RunSyncSummary = { sales: number; revenueCents: number; timings: StepTimings };

export type RunSyncResult =
  | { ok: true; storesDone: number; summary?: RunSyncSummary }
  | { ok: false; reason: "locked" | "busy" | "password" | "other"; error?: string };

export function ymdInTz(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDaysIso(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + delta));
  return utc.toISOString().slice(0, 10);
}

function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

/** 401 / sessão morta — não adianta continuar dia a dia. */
function isSessionDeadError(msg: string): boolean {
  const t = msg.toLowerCase();
  return /\b401\b/.test(t) || t.includes("unauthorized");
}

/** Contenção Millennium (sessão única / limite) — vale baixar concorrência e retry. */
export function isContentionError(msg: string): boolean {
  const t = msg.toLowerCase();
  return (
    t.includes("busy") ||
    t.includes("ocupad") ||
    t.includes("limite") ||
    t.includes("too many") ||
    t.includes("max session") ||
    t.includes("concurrent") ||
    t.includes("timeout") ||
    t.includes("timed out") ||
    t.includes("etimedout") ||
    t.includes("econnreset") ||
    t.includes("503") ||
    t.includes("429") ||
    t.includes("rate limit")
  );
}

/** Sessão caída ou ERP fora do ar / lento — na rodada automática pula em silêncio. */
export function isErpUnavailableError(msg: string): boolean {
  const t = msg.toLowerCase();
  return (
    isSessionDeadError(msg) ||
    isContentionError(msg) ||
    t.includes("fetch failed") ||
    t.includes("econnrefused") ||
    t.includes("enotfound") ||
    t.includes("socket") ||
    t.includes("aborted") ||
    t.includes("cancelad") ||
    t.includes("502") ||
    t.includes("504")
  );
}

/** Run up to `concurrency` async tasks over `items` (order of results = input order). */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/**
 * Processa itens em paralelo; se der contenção Millennium, desce N → ⌊N/2⌋ → 1 e retenta só os que falharam.
 * Índices originais preservados nos resultados.
 */
export async function mapPoolAdaptive<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  opts?: { initialConcurrency?: number },
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let pending = items.map((item, i) => ({ item, i }));
  let concurrency = Math.max(
    1,
    Math.min(opts?.initialConcurrency ?? items.length, items.length || 1),
  );

  while (pending.length > 0) {
    const batch = pending;
    pending = [];
    const limit = Math.min(concurrency, batch.length);
    if (batch.length === items.length) {
      detail(`Paralelo ×${limit} · ${batch.length} loja(s)/item(s)`);
    } else {
      detail(`Retry paralelo ×${limit} · ${batch.length} loja(s)/item(s)`);
    }

    const contention: Array<{ item: T; i: number }> = [];
    await mapPool(batch, limit, async (entry) => {
      try {
        results[entry.i] = await fn(entry.item, entry.i);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isContentionError(msg) && concurrency > 1) {
          contention.push(entry);
          console.warn(`  contenção [${entry.i}]: ${msg.slice(0, 120)}`);
        } else {
          throw e;
        }
      }
    });

    if (contention.length === 0) break;
    concurrency = Math.max(1, Math.floor(concurrency / 2));
    console.warn(`↓ concorrência → ${concurrency} · retry ${contention.length} item(ns)`);
    syncLog(
      "WARN",
      "millennium_ocupado",
      `Millennium ocupado/lento — reduzindo paralelismo para ${concurrency} e tentando de novo`,
      { detail: { itens: contention.length } },
    );
    pending = contention;
  }

  return results;
}

/**
 * Quantas lojas em paralelo (1 sessão Millennium).
 * Default = todas as lojas do job. `STORE_CONCURRENCY` opcional só como teto.
 */
export function storeFetchConcurrency(storeCount: number): number {
  const n = Math.max(1, storeCount);
  const raw = process.env.STORE_CONCURRENCY;
  if (raw == null || raw.trim() === "") return n;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return n;
  return Math.max(1, Math.min(Math.floor(parsed), n));
}

/**
 * LIGHT / FORCE / SEED: marca vem da margem (COD WP*) e o DetMov classifica pela descrição.
 * No SEED o mapa custava ~55s (LISTARVENDASSALDO do mês inteiro) sem mudar receita/CMV.
 */
export function shouldBuildProductBrandMap(
  kind: SyncJobKind,
  stores: SyncStore[],
  lightToday: boolean,
): boolean {
  if (lightToday) return false;
  if (kind === "FORCE" || kind === "FORCE_LIGHT" || kind === "SEED") return false;
  // Nenhuma loja marcada com WPINK → DetMov não roda; brand report basta.
  if (stores.length > 0 && stores.every((s) => s.hasWpink === false)) return false;
  if (kind === "HISTORY" || kind === "BACKFILL" || kind === "RANGE") {
    return true;
  }
  return false;
}

/** Janela do LISTAR enrich: SEED/HISTORY amplo; FORCE/RANGE só o dia (SKU do dia). */
function productCatalogWindow(
  kind: SyncJobKind,
  todayIso: string,
): { from: string; to: string } {
  if (kind === "SEED" || kind === "HISTORY" || kind === "BACKFILL") {
    return seedWindow(todayIso);
  }
  return { from: todayIso, to: todayIso };
}

/** Chunk inclusive range into ≤ maxDays windows. */
export function chunkInclusiveRange(
  start: string,
  end: string,
  maxDays = 30,
): Array<{ from: string; to: string }> {
  if (start > end) return [];
  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = minIso(addDaysIso(cursor, maxDays - 1), end);
    chunks.push({ from: cursor, to: chunkEnd });
    cursor = addDaysIso(chunkEnd, 1);
  }
  return chunks;
}

/** Dias inclusivos em [from, to]. */
export function inclusiveDayCount(from: string, to: string): number {
  if (from > to) return 0;
  let n = 0;
  let cursor = from;
  while (cursor <= to) {
    n += 1;
    cursor = addDaysIso(cursor, 1);
  }
  return n;
}

/**
 * Escada após timeout/vazio: mês → 15d → 7d → 1d.
 * `null` = já é 1 dia (não dá pra fatiar mais).
 */
export function nextFallbackMaxDays(from: string, to: string): number | null {
  const days = inclusiveDayCount(from, to);
  if (days <= 1) return null;
  if (days > 15) return 15;
  if (days > 7) return 7;
  return 1;
}

/** Fatia a janela que falhou no próximo degrau da escada. */
export function splitFailedWindow(
  from: string,
  to: string,
): Array<{ from: string; to: string }> {
  const max = nextFallbackMaxDays(from, to);
  if (max == null) return [];
  return chunkInclusiveRange(from, to, max);
}

/** Particiona em meses de calendário (ex.: ago/01–31, set/01–hoje). */
export function chunkByCalendarMonths(
  start: string,
  end: string,
): Array<{ from: string; to: string }> {
  if (start > end) return [];
  const out: Array<{ from: string; to: string }> = [];
  let cursor = start;
  while (cursor <= end) {
    const [y, m] = cursor.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const to = minIso(monthEnd, end);
    out.push({ from: cursor, to });
    cursor = addDaysIso(to, 1);
  }
  return out;
}

/** Carga do onboarding: dia 1 do mês atual (fuso da loja) → hoje. Passado = planilha (futuro). */
export function seedWindow(todayIso: string): { from: string; to: string } {
  return { from: `${todayIso.slice(0, 7)}-01`, to: todayIso };
}

/** Calendar day N months before `todayIso` (same day-of-month when possible). */
export function monthsBeforeIso(todayIso: string, months: number): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1 - months, d));
  return utc.toISOString().slice(0, 10);
}

/**
 * Chão do histórico: o mais recente entre inauguração e o dia 1º do mês `months` meses
 * antes do mês atual (ex.: set/26 com 2 → 01/07/26). Sempre mês inteiro.
 */
export function historyFloor(
  todayIso: string,
  openedAt?: string | null,
  months: number = HISTORY_CAP_MONTHS,
): string {
  const cap = `${monthsBeforeIso(`${todayIso.slice(0, 7)}-01`, months).slice(0, 7)}-01`;
  const opened =
    openedAt && /^\d{4}-\d{2}-\d{2}/.test(openedAt) ? openedAt.slice(0, 10) : null;
  return opened ? maxIso(cap, opened) : cap;
}

/** Inclusive calendar month immediately before the month of `dayIso`. */
export function previousCalendarMonth(dayIso: string): { from: string; to: string } {
  const [y, m] = dayIso.split("-").map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const from = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  const to = `${prevY}-${String(prevM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

/**
 * Próximo mês a buscar no HISTORY (um mês atrás do que já temos).
 * `earliestExisting` null → começa logo antes do SEED (`seedFrom`).
 */
export function nextHistoryWindow(opts: {
  today: string;
  openedAt?: string | null;
  earliestExisting: string | null;
  seedFrom: string;
  months?: number;
}): { from: string; to: string } | null {
  const floor = historyFloor(opts.today, opts.openedAt, opts.months);
  const cursor = opts.earliestExisting ?? opts.seedFrom;
  if (cursor <= floor) return null;
  const { from, to } = previousCalendarMonth(cursor);
  const fromClamped = maxIso(from, floor);
  const toClamped = minIso(to, addDaysIso(cursor, -1));
  if (fromClamped > toClamped) return null;
  return { from: fromClamped, to: toClamped };
}

/** Collapse discrete ISO days into contiguous inclusive windows. */
export function collapseDaysToWindows(days: string[]): Array<{ from: string; to: string }> {
  if (days.length === 0) return [];
  const sorted = [...new Set(days)].sort();
  const out: Array<{ from: string; to: string }> = [];
  let from = sorted[0]!;
  let to = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]!;
    if (d === addDaysIso(to, 1)) {
      to = d;
    } else {
      out.push(...chunkInclusiveRange(from, to));
      from = d;
      to = d;
    }
  }
  out.push(...chunkInclusiveRange(from, to));
  return out;
}

/**
 * Days to fetch for RANGE/FORCE within [from, to].
 * FORCE always includes today even if already present.
 */
export function missingDays(
  from: string,
  to: string,
  existing: string[],
  opts: { today: string; alwaysToday: boolean },
): string[] {
  const have = new Set(existing);
  const need: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    if (!have.has(cursor)) need.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  if (opts.alwaysToday) {
    // Sempre rebusca hoje (venda muda o dia inteiro), mesmo fora do período ou já no banco.
    const set = new Set(need);
    set.add(opts.today);
    return [...set].sort();
  }
  return need.sort();
}

/**
 * CMV / produtos: SEED/HISTORY = janela inteira;
 * FORCE = buracos + hoje (1 report/dia — barato o bastante p/ refrescar).
 * RANGE = só buracos.
 */
export async function daysNeedingHeavySync(
  deps: Pick<SyncJobDeps, "listDaysWithCmv" | "listDaysWithProduct">,
  args: {
    kind: SyncJobKind;
    tenantId: string;
    storeId: string;
    from: string;
    to: string;
    today: string;
    which: "cmv" | "product";
  },
): Promise<string[]> {
  const { kind, from, to, today } = args;
  if (kind === "SEED" || kind === "BACKFILL" || kind === "HISTORY") {
    return eachIsoDay(from, to);
  }
  const listHave = args.which === "cmv" ? deps.listDaysWithCmv.bind(deps) : deps.listDaysWithProduct.bind(deps);
  const have = await listHave({
    tenantId: args.tenantId,
    storeId: args.storeId,
    from,
    to,
  });
  const alwaysToday = kind === "FORCE" || kind === "FORCE_LIGHT";
  return missingDays(from, to, have, { today, alwaysToday });
}

/** Título do job no log do terminal. */
function jobTitle(kind: SyncJobKind): string {
  switch (kind) {
    case "SEED":
    case "BACKFILL":
      return "Carga inicial";
    case "HISTORY":
      return "Histórico";
    case "LIGHT":
      return "Sync do dia";
    case "FORCE":
    case "FORCE_LIGHT":
      return "Atualizar";
    case "RANGE":
      return "Período sob demanda";
    case "CLOSE":
      return "Fechamento do dia";
    default:
      return kind;
  }
}

/** Janela de CMV: FORCE = só hoje; RANGE = período do payload. */
function cmvWindowForJob(
  job: SyncJob,
  today: string,
): { from: string; to: string } | null {
  const kind = job.kind;
  if (kind === "LIGHT") return null;
  if (kind === "FORCE" || kind === "FORCE_LIGHT") {
    return { from: today, to: today };
  }
  if (kind === "SEED" || kind === "BACKFILL") return seedWindow(today);
  if (kind === "HISTORY") return null; // usa as janelas já buscadas
  const from = job.payload.from ?? today;
  const to = job.payload.to ?? today;
  return { from: minIso(from, to), to: maxIso(from, to) };
}

function shouldSyncCmv(kind: SyncJobKind): boolean {
  return (
    kind === "SEED" ||
    kind === "BACKFILL" ||
    kind === "HISTORY" ||
    kind === "FORCE" ||
    kind === "RANGE"
  );
}

/** Top produtos (relatório de cupom) sem Lista: SEED/HISTORY/FORCE/RANGE (não LIGHT). */
function shouldSyncProducts(kind: SyncJobKind): boolean {
  return (
    kind === "SEED" ||
    kind === "BACKFILL" ||
    kind === "HISTORY" ||
    kind === "FORCE" ||
    kind === "RANGE"
  );
}

async function windowsForStore(
  job: SyncJob,
  store: SyncStore,
  now: Date,
  deps: SyncJobDeps,
): Promise<Array<{ from: string; to: string }>> {
  const today = ymdInTz(now, store.timezone);
  const kind = job.kind;

  if (kind === "LIGHT" || kind === "FORCE" || kind === "FORCE_LIGHT") {
    // Atualizar = só hoje (fuso da loja). Passado = job noturno / SEED.
    return [{ from: today, to: today }];
  }

  if (kind === "SEED" || kind === "BACKFILL") {
    const { from, to } = seedWindow(today);
    // Lista de mês inteiro trava o Millennium (minutos + "Requisição cancelada"); 1 dia ≈ 0,6s.
    return chunkInclusiveRange(from, to, 1);
  }

  if (kind === "HISTORY") {
    const { from: seedFrom } = seedWindow(today);
    const earliest = await deps.earliestSalesDay({
      tenantId: job.tenantId,
      storeId: store.id,
    });
    const win = nextHistoryWindow({
      today,
      openedAt: store.openedAt,
      earliestExisting: earliest,
      seedFrom,
    });
    if (!win) return [];
    return chunkByCalendarMonths(win.from, win.to);
  }

  // RANGE (e kinds com payload de período): buracos no intervalo.
  const from = job.payload.from ?? today;
  const to = job.payload.to ?? today;
  const rangeFrom = minIso(from, to);
  const rangeTo = maxIso(from, to);

  const existing = await deps.listExistingDays({
    tenantId: job.tenantId,
    storeId: store.id,
    from: rangeFrom,
    to: rangeTo,
  });

  let have = existing;
  if (kind === "RANGE") {
    const payDone = await deps.listDaysPaymentComplete({
      tenantId: job.tenantId,
      storeId: store.id,
      from: rangeFrom,
      to: rangeTo,
    });
    const paySet = new Set(payDone);
    have = existing.filter((d) => paySet.has(d));
  }

  const days = missingDays(rangeFrom, rangeTo, have, { today, alwaysToday: false });
  return collapseDaysToWindows(days).flatMap((w) => chunkByCalendarMonths(w.from, w.to));
}

/** Sessão Millennium aberta neste processo — liberada no finally e no SIGINT. */
let activeMillenniumSession: string | null = null;

export function getActiveMillenniumSession(): string | null {
  return activeMillenniumSession;
}

export async function releaseActiveMillenniumSession(
  logout: (session: string) => Promise<void>,
): Promise<void> {
  const s = activeMillenniumSession;
  if (!s) return;
  activeMillenniumSession = null;
  // Não faz logout no ERP — sessão pertence ao tenant até o usuário desconectar.
  // Só tira da memória do processo.
  void logout;
  console.log("Sessão Millennium mantida no tenant (shutdown só libera memória do worker)");
}

/** Smoke leve: sessão morta → 401 (não usa cache de EVENTOs). */
async function sessionStillAlive(session: string): Promise<boolean> {
  // Testes unitários não batem no Millennium.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return true;
  try {
    const res = await fetch(`${millenniumBaseUrl()}/Millennium.EVENTOS.ListaTodos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "WTS-Session": session,
        "X-HTTP-Method": "GET",
        "X-IdentifierCase": "upper",
      },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    });
    return res.status !== 401;
  } catch {
    return false;
  }
}

/**
 * Reusa token do tenant; se não houver / 401, faz login e grava.
 * Renova (novo login) quando forceRenew ou smoke falha.
 */
async function ensureMillenniumSession(
  cred: SyncCredential,
  deps: SyncJobDeps,
  opts?: { forceRenew?: boolean },
): Promise<
  | { ok: true; session: string; reused: boolean }
  | { ok: false; reason: "busy" | "password" | "other"; raw: string }
> {
  if (!opts?.forceRenew) {
    const stored = await deps.getStoredSession(cred.id);
    if (stored) {
      const alive = await sessionStillAlive(stored);
      if (alive) {
        rememberMillenniumSession(cred.id, stored);
        return { ok: true, session: stored, reused: true };
      }
      console.warn("Sessão salva morta (401) — login fresco…");
      try {
        await deps.logout(stored);
      } catch {
        /* best-effort */
      }
      await deps.setStoredSession(cred.id, null);
      forgetMillenniumSession(cred.id);
    }
  } else {
    const old = await deps.getStoredSession(cred.id);
    if (old) {
      try {
        await deps.logout(old);
      } catch {
        /* best-effort */
      }
      await deps.setStoredSession(cred.id, null);
      forgetMillenniumSession(cred.id);
    }
  }

  const login = await deps.login(cred.username, cred.password);
  if (!login.ok) {
    return { ok: false, reason: login.reason, raw: login.raw };
  }
  rememberMillenniumSession(cred.id, login.session);
  await deps.setStoredSession(cred.id, login.session);
  return { ok: true, session: login.session, reused: false };
}

/**
 * Claim already happened; runner enforces one RUNNING per credential,
 * sequential stores, always logout after login, busy/password classification.
 */
/**
 * FORCE dia a dia — mesmo fluxo do Atualizar para cada dia de `from → to` e cada fuso das lojas,
 * com o relógio em 23:59 daquele dia (hoje = relógio real). Horas, marca/DetMov, CMV, categorias,
 * produtos, formas, equipe.
 * - CLOSE (fechamento noturno): payload.from/to; dia que falha derruba o job; não mexe em
 *   "Atualizado às…".
 * - SEED (onboarding): só **hoje** (o usuário entra no dashboard em segundos); grava "Atualizado às…"
 *   e enfileira a carga do histórico (CLOSE com `fillUntil`), de ontem até o início de `SYNC_ONBOARDING`
 *   (off = SEED termina sem ir ao ERP).
 * - Carga do histórico (CLOSE com `fillUntil`): 1 dia por job; terminou (ou falhou sem ser senha) →
 *   enfileira o dia anterior. Entre um dia e outro o Atualizar (prioridade na fila) passa na frente.
 */
async function runDailyForceJob(job: SyncJob, deps: SyncJobDeps): Promise<RunSyncResult> {
  if (await deps.hasRunningForCredential(job.credentialId)) return { ok: false, reason: "locked" };
  await deps.markJobRunning(job.id);
  const startedAt = deps.now();
  const tJob = nowMs();
  const isSeed = job.kind === "SEED";
  if (isSeed && syncOnboardingOff()) {
    await deps.markJobFinished({ jobId: job.id, status: "SUCCEEDED", error: SYNC_OFF_NOTE });
    console.log(`Carga inicial pulada (SYNC_ONBOARDING=off) · job ${job.id.slice(0, 8)}`);
    return { ok: true, storesDone: 0 };
  }
  const fillUntil = job.kind === "CLOSE" ? job.payload.fillUntil : undefined;
  const deep = Boolean(fillUntil && job.payload.deep);
  const label = isSeed ? "Carga inicial" : deep ? "Histórico antigo" : fillUntil ? "Carga do histórico" : "Fechamento";

  /** Próximo dia da carga do histórico (o anterior a `day`), se ainda não chegou no fim (`until`). */
  const chainMonthFill = async (day: string, until: string) => {
    if (deep) return;
    const prev = addDaysIso(day, -1);
    if (prev < until) {
      console.log(`  ${label}: chegou no dia ${until} — carga completa`);
      return;
    }
    try {
      const queued = await deps.enqueueMonthFillDay({
        tenantId: job.tenantId,
        credentialId: job.credentialId,
        day: prev,
        fillUntil: until,
        ...(!isSeed && job.payload.storeIds?.length ? { storeIds: job.payload.storeIds } : {}),
      });
      if (queued) detail(`  Carga do histórico: enfileirado ${prev}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  Carga do histórico: não enfileirou ${prev}: ${msg}`);
    }
  };

  const fail = async (
    reason: "busy" | "password" | "other",
    error: string,
    storesDone: number,
    chainDay = job.payload.from,
  ) => {
    if (fillUntil && reason !== "password" && chainDay) await chainMonthFill(chainDay, fillUntil);
    await deps.markJobFinished({ jobId: job.id, status: "FAILED", error });
    await deps.insertSyncRun({
      tenantId: job.tenantId,
      credentialId: job.credentialId,
      kind: job.kind,
      ok: false,
      storesDone,
      error,
      startedAt,
      finishedAt: deps.now(),
    });
    console.warn(`[sync] fail kind=${job.kind} job=${job.id.slice(0, 8)} · ${formatElapsed(tJob)} error=${error}`);
    return { ok: false as const, reason, error };
  };

  let stores = await deps.listStores(job.tenantId);
  if (job.payload.storeIds && job.payload.storeIds.length > 0) {
    const want = new Set(job.payload.storeIds);
    stores = stores.filter((s) => want.has(s.id));
  }
  const realNow = deps.now();
  let from = job.payload.from;
  let to = job.payload.to;
  const seedToday = ymdInTz(realNow, stores[0]?.timezone ?? "America/Sao_Paulo");
  if (isSeed) {
    from = seedToday;
    to = seedToday;
  }
  if (!from || !to) return fail("other", "fechamento sem dias no payload", 0);

  // Carga do histórico: os dias já fechados do mês (até `fillUntil`) num job só —
  // Lista, relatório de cupom e margem 1× por loja; os dias são gravados um a um.
  let closedMonth: ClosedMonthSource | undefined;
  if (fillUntil && from === to && isHistoryRangeDay(from, seedToday)) {
    const range = closedMonthRange(from, fillUntil);
    from = range.from;
    to = range.to;
    closedMonth = createClosedMonthSource(deps, from, to);
  }
  const runLabel = closedMonth ? `${label} (período)` : label;

  const byTz = new Map<string, string[]>();
  for (const s of stores) byTz.set(s.timezone, [...(byTz.get(s.timezone) ?? []), s.id]);
  const lastClosed = new Map(stores.map((s) => [s.id, s.lastClosedDay ?? null]));

  const days = eachIsoDay(minIso(from, to), maxIso(from, to));
  if (closedMonth) days.reverse();
  let yieldedAt: string | null = null;
  detail(
    `[sync] start kind=${job.kind} tenant=${job.tenantId.slice(0, 8)} job=${job.id.slice(0, 8)} · ${from} → ${to} · ${days.length} dia(s) · ${stores.length} loja(s) · Atualizar dia a dia`,
  );
  let storesDone = 0;
  let daysOk = 0;
  const failedDays: string[] = [];
  const rangeTimings = new StepTimings();
  if (closedMonth) {
    logRangeHeader({ title: runLabel, from: minIso(from, to), to: maxIso(from, to), storeCount: stores.length, jobId: job.id });
  }
  for (const [dayIndex, day] of days.entries()) {
    let dayStores = 0;
    const tDay = nowMs();
    const dayTimings = new StepTimings();
    let daySales = 0;
    let dayRevenueCents = 0;
    for (const [tz, tzStoreIds] of byTz) {
      const todayTz = ymdInTz(realNow, tz);
      if (day > todayTz) continue;
      // Fechamento da madrugada: pula loja que já fechou o dia (rodada automática depois do fechamento).
      const storeIds =
        isSeed || fillUntil
          ? tzStoreIds
          : tzStoreIds.filter((id) => {
              const lc = lastClosed.get(id);
              return !lc || lc < day;
            });
      if (storeIds.length === 0) continue;
      const dayNow = day === todayTz ? null : endOfDayInTz(day, tz);
      const dayDeps: SyncJobDeps = {
        ...deps,
        closedMonth,
        now: dayNow ? () => dayNow : deps.now,
        hasRunningForCredential: async () => false,
        markJobRunning: async () => {},
        markJobFinished: async () => {},
        insertSyncRun: async () => {},
        updateCredential: async ({ lastSuccessAt: _s, lastLightSyncAt: _l, lastErrorAt, ...rest }) => {
          if (rest.status == null && rest.lastError == null) return;
          await deps.updateCredential({ ...rest, ...(lastErrorAt ? { lastErrorAt: deps.now() } : {}) });
        },
      };
      detail(
        `▶ ${runLabel} · dia ${dayIndex + 1}/${days.length} (${day}) · ${storeIds.length} loja(s) · decorrido ${formatElapsed(tJob)}${dayNow ? "" : " · hoje"}`,
      );
      const res = await runSyncJob(
        {
          ...job,
          kind: "FORCE",
          logKind: job.kind,
          logTitle: days.length > 1 ? `${runLabel} · dia ${dayIndex + 1}/${days.length}` : runLabel,
          payload: { from: day, to: day, storeIds },
          ...(closedMonth ? { compactLog: true } : {}),
        },
        dayDeps,
      );
      if (res.ok && res.summary) {
        daySales += res.summary.sales;
        dayRevenueCents += res.summary.revenueCents;
        for (const [step, v] of res.summary.timings.entries()) dayTimings.add(step, v.ms, v.calls);
      }
      if (!res.ok) {
        if (res.reason === "locked") return fail("other", `${label.toLowerCase()} ${day}: credencial ocupada`, storesDone, day);
        if (!isSeed || res.reason === "password") {
          return fail(res.reason, `${label.toLowerCase()} ${day}: ${res.error ?? res.reason}`, storesDone, day);
        }
        failedDays.push(day);
        console.warn(`  ${label} ${day} falhou — segue para o próximo dia: ${res.error ?? res.reason}`);
        continue;
      }
      if (dayNow) await markStoresClosed(deps, storeIds.map((storeId) => ({ storeId, day })));
      dayStores += res.storesDone;
    }
    if (!failedDays.includes(day)) daysOk += 1;
    storesDone = Math.max(storesDone, dayStores);
    if (closedMonth) {
      for (const [step, v] of dayTimings.entries()) rangeTimings.add(step, v.ms, v.calls);
      logRangeDay({
        index: dayIndex,
        total: days.length,
        day,
        sales: daySales,
        revenueCents: dayRevenueCents,
        ms: nowMs() - tDay,
        timings: dayTimings,
      });
    }
    if (closedMonth && deps.markJobProgress) {
      try {
        await deps.markJobProgress({ jobId: job.id, day });
      } catch (e) {
        detail(`  progresso da carga não foi salvo: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (closedMonth && dayIndex < days.length - 1 && (await priorityJobQueued(deps, job.credentialId))) {
      yieldedAt = day;
      console.log(`  ${runLabel}: Atualizar na fila — pausa em ${day} e continua depois`);
      break;
    }
  }

  if (isSeed && daysOk === 0) {
    return fail("other", `carga inicial sem nenhum dia concluído (${failedDays.join(", ")})`, storesDone);
  }
  if (failedDays.length > 0) {
    console.warn(`  ${label}: ${failedDays.length} dia(s) com falha (${failedDays.join(", ")}) — ver Logs`);
  }

  const finishedAt = deps.now();
  await deps.updateCredential({
    credentialId: job.credentialId,
    lastSuccessAt: finishedAt,
    ...(isSeed ? { lastLightSyncAt: finishedAt } : {}),
  });
  await deps.markJobFinished({ jobId: job.id, status: "SUCCEEDED" });
  await deps.insertSyncRun({
    tenantId: job.tenantId,
    credentialId: job.credentialId,
    kind: job.kind,
    ok: true,
    storesDone,
    startedAt,
    finishedAt,
  });
  if (closedMonth) {
    logRangeEnd({
      ok: failedDays.length === 0,
      title: `${runLabel} concluído`,
      days: daysOk,
      totalDays: days.length,
      ms: nowMs() - tJob,
      timings: rangeTimings,
      ...(yieldedAt ? { note: `Pausou em ${brDay(yieldedAt)} para o Atualizar; continua depois` } : {}),
    });
  } else if (days.length > 1) {
    console.log(`✓ ${runLabel} · ${daysOk} dias · ${storesDone} loja(s) · ${formatElapsed(tJob)} no total`);
  }
  if (isSeed) {
    const until = onboardingHistoryUntil(seedToday);
    if (until) await chainMonthFill(seedToday, until);
  } else if (fillUntil) {
    await chainMonthFill(yieldedAt ?? minIso(from, to), fillUntil);
  }
  return { ok: true, storesDone };
}

async function priorityJobQueued(deps: SyncJobDeps, credentialId: string): Promise<boolean> {
  if (!deps.hasPriorityJobQueued) return false;
  try {
    return await deps.hasPriorityJobQueued(credentialId);
  } catch {
    return false;
  }
}

async function markStoresClosed(deps: SyncJobDeps, rows: Array<{ storeId: string; day: string }>): Promise<void> {
  if (rows.length === 0 || !deps.markStoresClosed) return;
  try {
    await deps.markStoresClosed(rows);
  } catch (e) {
    console.warn(`  ⚠ último dia fechado não foi salvo: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Deps de um dia passado: relógio no fim do dia e sem mexer em "Atualizado às…". */
function pastDayDeps(deps: SyncJobDeps, dayNow: Date): SyncJobDeps {
  return {
    ...deps,
    now: () => dayNow,
    updateCredential: async ({ lastSuccessAt: _s, lastLightSyncAt: _l, lastErrorAt, ...rest }) => {
      if (rest.status == null && rest.lastError == null) return;
      await deps.updateCredential({ ...rest, ...(lastErrorAt ? { lastErrorAt: new Date() } : {}) });
    },
  };
}

/**
 * Atualizar (FORCE de hoje) — botão do Topbar ou rodada automática (Configurações > Integrações).
 * 1. Automático sem `relogin`: sessão salva caída → pula em silêncio (a próxima rodada faz login 1×).
 * 2. Fecha antes os dias pendentes das lojas (até 3 por rodada, do mais antigo ao mais novo).
 * 3. Atualiza hoje; loja que já passou do fechamento + 30 min fecha o dia.
 */
async function runRefreshJob(job: SyncJob, deps: SyncJobDeps): Promise<RunSyncResult> {
  if (await deps.hasRunningForCredential(job.credentialId)) return { ok: false, reason: "locked" };
  await deps.markJobRunning(job.id);
  const startedAt = deps.now();
  const auto = job.payload.auto === true;

  const finish = async (res: RunSyncResult, storesDone: number): Promise<RunSyncResult> => {
    const error = res.ok ? undefined : (res.error ?? res.reason);
    const mark = error && auto && isSessionDeadError(error) ? `${AUTO_SESSION_MARK} ` : "";
    await deps.markJobFinished({
      jobId: job.id,
      status: res.ok ? "SUCCEEDED" : "FAILED",
      ...(error ? { error: `${mark}${error}` } : {}),
    });
    await deps.insertSyncRun({
      tenantId: job.tenantId,
      credentialId: job.credentialId,
      kind: job.kind,
      ok: res.ok,
      storesDone,
      ...(error ? { error } : {}),
      startedAt,
      finishedAt: deps.now(),
    });
    return res;
  };

  if (auto && !job.payload.relogin) {
    const stored = await deps.getStoredSession(job.credentialId);
    if (!stored || !(await sessionStillAlive(stored))) {
      console.log("Atualização automática · sessão do ERP indisponível — nova tentativa na próxima rodada");
      await deps.markJobFinished({
        jobId: job.id,
        status: "FAILED",
        error: `${AUTO_SESSION_MARK} sessão do ERP indisponível — nova tentativa na próxima rodada`,
      });
      return { ok: false, reason: "other", error: "sessão do ERP indisponível" };
    }
  }

  let stores = await deps.listStores(job.tenantId);
  if (job.payload.storeIds && job.payload.storeIds.length > 0) {
    const want = new Set(job.payload.storeIds);
    stores = stores.filter((s) => want.has(s.id));
  }
  const innerDeps: SyncJobDeps = {
    ...deps,
    hasRunningForCredential: async () => false,
    markJobRunning: async () => {},
    markJobFinished: async () => {},
    insertSyncRun: async () => {},
  };
  const innerJob = (payload: SyncJobPayload, logTitle?: string): SyncJob => ({
    ...job,
    kind: "FORCE",
    logKind: "FORCE",
    ...(logTitle ? { logTitle } : auto ? { logTitle: "Atualização automática" } : {}),
    quietFailures: auto,
    payload,
  });

  // Dias pendentes: dia → fuso → lojas.
  const realNow = deps.now();
  const pending = new Map<string, Map<string, string[]>>();
  for (const s of stores) {
    for (const day of pendingDays(s.lastClosedDay, ymdInTz(realNow, s.timezone))) {
      const byTz = pending.get(day) ?? new Map<string, string[]>();
      byTz.set(s.timezone, [...(byTz.get(s.timezone) ?? []), s.id]);
      pending.set(day, byTz);
    }
  }
  recovery: for (const day of [...pending.keys()].sort()) {
    for (const [tz, storeIds] of pending.get(day)!) {
      const res = await runSyncJob(
        innerJob({ from: day, to: day, storeIds }, `Fechamento pendente · ${day}`),
        pastDayDeps(innerDeps, endOfDayInTz(day, tz)),
      );
      if (!res.ok) {
        if (res.reason === "password" || isSessionDeadError(res.error ?? "")) return finish(res, 0);
        console.warn(`  Fechamento pendente ${day} falhou — segue para hoje: ${res.error ?? res.reason}`);
        break recovery;
      }
      await markStoresClosed(deps, storeIds.map((storeId) => ({ storeId, day })));
    }
  }

  const closeRequested = new Set(job.payload.closeStoreIds ?? []);
  const closesDay = (s: SyncStore, at: Date) =>
    closeRequested.has(s.id) || storePhase(parseStoreHours(s.hours), at, s.timezone) === "closeDue";
  const fullStoreIds = stores.filter((s) => closesDay(s, deps.now())).map((s) => s.id);
  const res = await runSyncJob(
    innerJob({
      ...(job.payload.from ? { from: job.payload.from } : {}),
      ...(job.payload.to ? { to: job.payload.to } : {}),
      ...(job.payload.storeIds?.length ? { storeIds: job.payload.storeIds } : {}),
      ...(fullStoreIds.length ? { fullStoreIds } : {}),
    }),
    innerDeps,
  );
  if (!res.ok) return finish(res, 0);

  const at = deps.now();
  if (deps.markStoresSynced && stores.length > 0) {
    await deps.markStoresSynced(stores.map((s) => s.id), at).catch((e: unknown) => {
      console.warn(`  ⚠ horário da última atualização da loja não foi salvo: ${e instanceof Error ? e.message : String(e)}`);
    });
  }
  // Fecha só quem rodou completo (virou "closeDue" durante a rodada → fecha na próxima).
  const full = new Set(fullStoreIds);
  await markStoresClosed(
    deps,
    stores
      .filter((s) => closesDay(s, at) && full.has(s.id))
      .map((s) => ({ storeId: s.id, day: localClock(at, s.timezone).day })),
  );
  return finish(res, res.storesDone);
}

export async function runSyncJob(job: SyncJob, deps: SyncJobDeps): Promise<RunSyncResult> {
  if (job.kind === "CLOSE" || job.kind === "SEED") return runDailyForceJob(job, deps);
  if (job.kind === "FORCE" && !job.logKind) return runRefreshJob(job, deps);
  if (await deps.hasRunningForCredential(job.credentialId)) {
    // Silencioso — claimNextJob já evita isso; se chegar aqui, deixa QUEUED.
    return { ok: false, reason: "locked" };
  }

  await deps.markJobRunning(job.id);
  beginSyncLog({ tenantId: job.tenantId, jobId: job.id, jobKind: job.logKind ?? job.kind });
  const startedAt = deps.now();
  const tJob = nowMs();
  // Relógio real (no fechamento, deps.now() é 23:59 do dia fechado).
  const wallStart = new Date();
  const title = job.logTitle ?? jobTitle(job.logKind ?? job.kind);
  let session: string | null = null;
  let storesDone = 0;
  /** Rodada automática que caiu por sessão / ERP fora do ar: nada vai para Logs. */
  let quietFailure = false;
  let erpUser: string | null = null;
  let logTz = "America/Sao_Paulo";
  let storeCount = 0;
  const storeDurations: Array<{ code: string; ms: number }> = [];
  const jobTimings = new StepTimings();
  let storeTimings = new Map<string, StepTimings>();
  const catalogGuard: CatalogGuard = { attempted: false };
  const compact = Boolean(job.compactLog);
  let totalSales = 0;
  let totalRevenueCents = 0;
  const totalTimings = () => {
    const all = new StepTimings();
    for (const t of [jobTimings, ...storeTimings.values()]) {
      for (const [step, v] of t.entries()) all.add(step, v.ms, v.calls);
    }
    return all;
  };

  detail(`[sync] start kind=${job.kind} tenant=${job.tenantId.slice(0, 8)} job=${job.id.slice(0, 8)}`);

  try {
    // HISTORY sem janelas: não gasta sessão. RANGE sem buracos ainda precisa CMV.
    if (job.kind === "HISTORY") {
      let previewStores = await deps.listStores(job.tenantId);
      if (job.payload.storeIds && job.payload.storeIds.length > 0) {
        const want = new Set(job.payload.storeIds);
        previewStores = previewStores.filter((s) => want.has(s.id));
      }
      const nowPreview = deps.now();
      let precisaMillennium = false;
      for (const store of previewStores) {
        const w = await windowsForStore(job, store, nowPreview, deps);
        if (w.length > 0) {
          precisaMillennium = true;
          break;
        }
      }
      if (!precisaMillennium) {
        console.log("Histórico completo até o teto/chão — nada a buscar");
        const finishedAt = deps.now();
        await deps.markJobFinished({ jobId: job.id, status: "SUCCEEDED" });
        await deps.insertSyncRun({
          tenantId: job.tenantId,
          credentialId: job.credentialId,
          kind: job.kind,
          ok: true,
          storesDone: previewStores.length,
          startedAt,
          finishedAt,
        });
        return { ok: true, storesDone: previewStores.length };
      }
    }

    const cred = await deps.loadCredential(job.credentialId);
    erpUser = cred.username;
    setSyncLogErpUser(cred.username);

    // Sessão ligada ao tenant: reusa token salvo; só loga se não houver / inválido.
    // Logout explícito fica com o usuário (Configurações / pause), não com o fim do job.
    const ensured = await ensureMillenniumSession(cred, deps);
    if (!ensured.ok) {
      const reason = ensured.reason;
      console.warn(
        `✗ ${title} · login no Millennium falhou (${reason}) · usuário ERP ${cred.username} · job ${job.id.slice(0, 8)}`,
      );
      if (job.quietFailures && reason !== "password") {
        quietFailure = true;
        await deps.markJobFinished({ jobId: job.id, status: "FAILED", error: ensured.raw });
        return { ok: false, reason, error: ensured.raw };
      }
      syncLog(
        "ERROR",
        "login",
        reason === "password"
          ? `Login no Millennium recusado (usuário/senha): ${ensured.raw}`
          : `Login no Millennium falhou: ${ensured.raw}`,
      );
      if (reason === "password") {
        await deps.updateCredential({
          credentialId: cred.id,
          status: "INVALID",
          lastError: ensured.raw,
          lastErrorAt: deps.now(),
        });
      } else {
        await deps.updateCredential({
          credentialId: cred.id,
          lastError: ensured.raw,
          lastErrorAt: deps.now(),
        });
      }
      await deps.markJobFinished({
        jobId: job.id,
        status: "FAILED",
        error: ensured.raw,
      });
      await deps.insertSyncRun({
        tenantId: job.tenantId,
        credentialId: job.credentialId,
        kind: job.kind,
        ok: false,
        storesDone: 0,
        error: ensured.raw,
        startedAt,
        finishedAt: deps.now(),
      });
      return { ok: false, reason: reason === "other" ? "other" : reason };
    }

    session = ensured.session;
    activeMillenniumSession = session;
    let storeList = await deps.listStores(job.tenantId);
    if (job.payload.storeIds && job.payload.storeIds.length > 0) {
      const want = new Set(job.payload.storeIds);
      storeList = storeList.filter((s) => want.has(s.id));
      detail(`Escopo · ${storeList.length} loja(s): ${storeList.map((s) => s.code).join(", ") || "(nenhuma)"}`);
      if (storeList.length === 0) {
        const finishedAt = deps.now();
        await deps.markJobFinished({ jobId: job.id, status: "SUCCEEDED" });
        await deps.insertSyncRun({
          tenantId: job.tenantId,
          credentialId: job.credentialId,
          kind: job.kind,
          ok: true,
          storesDone: 0,
          startedAt,
          finishedAt,
        });
        return { ok: true, storesDone: 0 };
      }
    }
    // Atualizar (e a carga inicial, que é o Atualizar dia a dia): uma loja por vez.
    const sequential = job.kind === "BACKFILL" || job.kind === "FORCE" || job.kind === "FORCE_LIGHT";
    // Dentro da loja, relatórios independentes em paralelo (cada um dia a dia); a loja seguinte só começa depois.
    const parallelReports = sequential;
    storeTimings = new Map(storeList.map((s) => [s.id, new StepTimings()]));
    storeCount = storeList.length;
    logTz = storeList[0]?.timezone ?? logTz;
    const logToday = ymdInTz(deps.now(), logTz);
    if (!compact) logJobHeader({
      title,
      from: job.payload.from ?? logToday,
      to: job.payload.to ?? logToday,
      storeCount,
      erpUser: cred.username,
      sessionReused: ensured.reused,
      tenantId: job.tenantId,
      jobId: job.id,
      startedAt: wallStart,
      timeZone: logTz,
    });
    const timingsByMillennium = new Map(storeList.map((s) => [s.millenniumStoreId, storeTimings.get(s.id)!]));
    const fetchStoreSellers = deps.fetchStoreSellers;
    const loadSellerDirectory = deps.loadSellerDirectory;
    const sellerLinker = loadSellerDirectory
      ? createSellerLinker({
          deps: {
            loadSellerDirectory,
            fetchStoreSellers: fetchStoreSellers
              ? (p) =>
                  timed(timingsByMillennium.get(p.millenniumStoreId), STEP.vendedoras, () =>
                    fetchStoreSellers({ ...p, ...(sequential ? { concurrency: 1 } : {}) }),
                  )
              : undefined,
            syncStoreSellers: deps.syncStoreSellers,
          },
          tenantId: job.tenantId,
          getSession: () => session,
          now: () => deps.now(),
          log: (level, message, store) => syncLog(level, "vendedoras", message, { store }),
          isSessionDead: isSessionDeadError,
        })
      : null;
    const linkSellersFor = (store: LinkerStore) =>
      sellerLinker ? (rows: SalesSellerDayAgg[]) => sellerLinker(store, rows) : undefined;

    const now = deps.now();
    // Gerador da filial fica salvo na loja; o lookup só roda quando alguma ainda não tem.
    const geradorMap = new Map<string, number>();
    for (const s of storeList) if (s.geradorId != null) geradorMap.set(s.code, s.geradorId);
    const missingGerador = storeList.filter((s) => s.geradorId == null);
    if (missingGerador.length > 0) {
      try {
        const tGer = nowMs();
        const found = await timed(jobTimings, STEP.gerador, () => deps.fetchFilialGeradorMap(session!));
        const toSave: Array<{ storeId: string; geradorId: number }> = [];
        for (const s of missingGerador) {
          const g = found.get(s.code);
          if (g == null) continue;
          geradorMap.set(s.code, g);
          toSave.push({ storeId: s.id, geradorId: g });
        }
        detail(`Gerador · ${toSave.length}/${missingGerador.length} loja(s) sem gerador salvo resolvidas · ${formatElapsed(tGer)}`);
        if (toSave.length > 0 && deps.setStoresGerador) {
          await deps.setStoresGerador(toSave).catch((e: unknown) => {
            console.warn(`  ⚠ gerador da loja não foi salvo: ${e instanceof Error ? e.message : String(e)}`);
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`  ⚠ lookup filial → gerador falhou: ${msg}`);
        syncLog("WARN", "gerador", `Lookup filial → gerador falhou (marca, categorias e top produtos pulados): ${msg}`);
      }
    }
    let productMap: ProductBrandMap = new Map();
    let geradorIdsWithWpink = new Set<number>();
    const geradorIds = [
      ...new Set(storeList.map((s) => geradorMap.get(s.code)).filter((g): g is number => g != null)),
    ];
    const lightToday =
      job.kind === "LIGHT" ||
      (job.kind === "FORCE_LIGHT" && !job.payload.from && !job.payload.to);
    // Pré-marca lojas já conhecidas com WPINK (evita DetMov sem mapa no FORCE).
    for (const s of storeList) {
      if (s.hasWpink === true) {
        const g = geradorMap.get(s.code);
        if (g != null) geradorIdsWithWpink.add(g);
      }
    }
    if (geradorIds.length > 0 && shouldBuildProductBrandMap(job.kind, storeList, lightToday)) {
      try {
        const catalogTz = storeList[0]?.timezone ?? "America/Sao_Paulo";
        const catalogToday = ymdInTz(now, catalogTz);
        const catalogWin = productCatalogWindow(job.kind, catalogToday);
        const brandStores = storeList
          .map((s) => {
            const geradorId = geradorMap.get(s.code);
            if (geradorId == null) return null;
            return { millenniumStoreId: s.millenniumStoreId, geradorId };
          })
          .filter((x): x is { millenniumStoreId: number; geradorId: number } => x != null);
        detail(`Product map · report+LISTAR · ${brandStores.length} filial(is) · ${catalogWin.from}→${catalogWin.to}`);
        const tProd = nowMs();
        const catalog = await timed(jobTimings, STEP.mapaProdutos, () =>
          deps.fetchProductBrandMap({
            session: session!,
            geradorIds,
            stores: brandStores,
            from: catalogWin.from,
            to: catalogWin.to,
            sequential,
          }),
        );
        productMap = catalog.map;
        geradorIdsWithWpink = catalog.geradorIdsWithWpink;
        detail(
          `Product→marca map · ${productMap.size} SKU(s) · WPINK em ${geradorIdsWithWpink.size}/${geradorIds.length} loja(s) · ${formatElapsed(tProd)}`,
        );
        // Só liga o flag (nunca desliga) — loja pode ter WPINK no relatório
        // mesmo sem SKU WPINK no mapa de estoque do gerador.
        const fromCatalog = storeList
          .filter((s) => {
            const g = geradorMap.get(s.code);
            return g != null && geradorIdsWithWpink.has(g);
          })
          .map((s) => ({ storeId: s.id, hasWpink: true as const }));
        if (fromCatalog.length > 0) await deps.setStoresHasWpink(fromCatalog);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`  ⚠ mapa produto → marca falhou: ${msg}`);
        syncLog("WARN", "mapa_produtos", `Mapa produto → marca falhou (split WEPINK/WPINK por descrição): ${msg}`);
      }
    } else if (geradorIds.length === 0) {
      console.warn("  ⚠ nenhuma loja com gerador — marca, categorias e cupom pulados");
      syncLog("WARN", "gerador", "Nenhuma filial com gerador no Millennium — marca, categorias e top produtos pulados");
    } else {
      detail(
        lightToday
          ? "Product map · skip (LIGHT — brand report basta)"
          : job.kind === "FORCE" || job.kind === "FORCE_LIGHT"
            ? "Product map · skip (FORCE — DetMov classifica por desc se precisar)"
            : "Product map · skip (nenhuma loja com WPINK)",
      );
    }

    if (lightToday) {
      // LIGHT: 1× VENDAS.Lista sem FILIAL (hoje) → particiona por FILIAL da linha.
      const tz = storeList[0]?.timezone ?? "America/Sao_Paulo";
      const today = ymdInTz(now, tz);
      const eventoSet = new Set<number>();
      for (const store of storeList) {
        const ids = await deps.resolveEventoIds(session, job.tenantId, store.code);
        for (const id of ids) eventoSet.add(id);
      }
      const eventoIds = [...eventoSet];
      if (eventoIds.length === 0) {
        throw new Error("Nenhum EVENTO de venda para as lojas do tenant");
      }
      console.log(
        `LIGHT hoje ${today} · ${storeList.length} loja(s) · 1× Lista FILIAL=null · EVENTOs ${eventoIds.join(",")}`,
      );
      const rawRows = await deps.fetchSalesLista({
        session,
        storeId: "",
        millenniumStoreId: null,
        from: today,
        to: today,
        eventoIds,
      });
      const byMillenium = new Map(storeList.map((s) => [s.millenniumStoreId, { id: s.id }]));
      const withFilial: SaleRowWithFilial[] = rawRows.map((r) => {
        const x = r as SaleRowWithFilial;
        if (x.millenniumFilial != null) {
          return {
            ...x,
            millenniumOpCode: x.millenniumOpCode ?? null,
            nf: x.nf ?? null,
            tipoOperacao: x.tipoOperacao ?? null,
          };
        }
        return {
          ...x,
          millenniumFilial: null,
          millenniumOpCode: x.millenniumOpCode ?? null,
          nf: x.nf ?? null,
          tipoOperacao: x.tipoOperacao ?? null,
        };
      });
      const parts = partitionRowsByFilial(withFilial, byMillenium);
      for (const store of storeList) {
        const rows = parts.get(store.id) ?? [];
        const agg = aggregateSales(rows, {
          tenantId: job.tenantId,
          timeZone: store.timezone,
          now,
          dayFrom: today,
          dayTo: today,
        });
        if (agg.days.length === 0) {
          await deps.upsertDayAggs([
            {
              tenantId: job.tenantId,
              storeId: store.id,
              day: today,
              brand: "ALL",
              revenueCents: 0,
              salesCount: 0,
              itemCount: 0,
            },
          ]);
          await persistListaDerivedDayAggs(deps, {
            tenantId: job.tenantId,
            storeId: store.id,
            timeZone: store.timezone,
            from: today,
            to: today,
            rows: [],
            now,
            linkSellers: linkSellersFor(store),
          });
        } else {
          await deps.upsertDayAggs(agg.days);
          if (agg.hours.length > 0) await deps.upsertHourAggs(agg.hours);
          await persistListaDerivedDayAggs(deps, {
            tenantId: job.tenantId,
            storeId: store.id,
            timeZone: store.timezone,
            from: today,
            to: today,
            rows,
            now,
            linkSellers: linkSellersFor(store),
          });
        }
        storesDone += 1;
        console.log(
          `Loja ${store.code} · ${rows.length} venda(s) · ${agg.days.length || 1} dia(s)`,
        );
        await upsertBrandSplit(deps, {
          session: session!,
          tenantId: job.tenantId,
          store,
          from: today,
          to: today,
          rows,
          productMap,
          geradorMap,
          geradorIdsWithWpink,
        });
      }
    } else {
      const concurrency = sequential ? 1 : storeFetchConcurrency(storeList.length);
      detail(
        `${storeList.length} loja(s) · ${parallelReports ? "1 loja por vez · relatórios da loja em paralelo" : `começa paralelo ×${concurrency}`}`,
      );

      const storeResults = await mapPoolAdaptive(
        storeList,
        async (store, i) => {
        const tStore = nowMs();
        const timings = storeTimings.get(store.id);
        if (!compact) logStoreStart({ index: i, total: storeList.length, code: store.code, name: store.name, done: storeDurations });
        const eventoIds = await deps.resolveEventoIds(session!, job.tenantId, store.code);
        if (eventoIds.length === 0) {
          throw new Error(`Nenhum EVENTO de venda para a loja ${store.code}`);
        }
        const windows = await windowsForStore(job, store, now, deps);
        const todayStore = ymdInTz(now, store.timezone);
        const cmvWin =
          cmvWindowForJob(job, todayStore) ??
          (windows.length > 0
            ? {
                from: windows.reduce((a, w) => (w.from < a ? w.from : a), windows[0]!.from),
                to: windows.reduce((a, w) => (w.to > a ? w.to : a), windows[0]!.to),
              }
            : null);

        if (windows.length === 0) {
          detail(`  [${store.code}] nada a buscar na Lista (já no banco)`);
          if (shouldSyncCmv(job.kind) && cmvWin) {
            const cmvDays = await daysNeedingHeavySync(deps, {
              kind: job.kind,
              tenantId: job.tenantId,
              storeId: store.id,
              from: cmvWin.from,
              to: cmvWin.to,
              today: todayStore,
              which: "cmv",
            });
            await syncCmvForRange(deps, {
              session: session!,
              tenantId: job.tenantId,
              store,
              from: cmvWin.from,
              to: cmvWin.to,
              days: cmvDays,
              timings,
            });
          }
          if (shouldSyncProducts(job.kind) && cmvWin) {
            const geradorId = geradorMap.get(store.code);
            if (geradorId == null) {
              console.warn(`  ⚠ [${store.code}] top produtos: sem gerador (pula)`);
              syncLog("WARN", "gerador", "Loja sem gerador no Millennium — top produtos e categorias pulados", {
                store,
              });
            } else {
              const prodDays = await daysNeedingHeavySync(deps, {
                kind: job.kind,
                tenantId: job.tenantId,
                storeId: store.id,
                from: cmvWin.from,
                to: cmvWin.to,
                today: todayStore,
                which: "product",
              });
              if (prodDays.length === 0) {
                detail(`  [${store.code}] produtos · skip (sem buraco)`);
              } else {
                await syncCouponProductsForDays(deps, {
                  session: session!,
                  tenantId: job.tenantId,
                  store,
                  geradorId,
                  days: prodDays,
                  catalogGuard,
                  timings,
                });
              }
            }
          }
          const ms = nowMs() - tStore;
          if (!compact) logStoreEnd({ facts: ["vendas já no banco"], ms, timings });
          storeDurations.push({ code: store.code, ms });
          return 1;
        }
        detail(`  [${store.code}] ${windows.length} janela(s) · EVENTOs ${eventoIds.join(",")}`);
        // Carga inicial: equipe completa antes das vendas (cadastro + código de gerador).
        if (job.logKind === "SEED" && sellerLinker) await sellerLinker.syncStore(store);
        // Relatório de cupom não depende da Lista; marca/CMV sim (usa as vendas).
        const geradorId = geradorMap.get(store.code) ?? null;
        if (geradorId == null) {
          console.warn(`  ⚠ [${store.code}] sem gerador — relatório de cupom pulado`);
          syncLog("WARN", "gerador", "Loja sem gerador no Millennium — top produtos e categorias pulados", {
            store,
          });
        }
        const runCoupon = () =>
          geradorId == null
            ? Promise.resolve(null)
            : fetchCouponLinesForWindows(deps, { session: session!, store, geradorId, windows, timings });
        const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));
        // Atualizar de hoje (relógio real — dias pendentes rodam com o relógio no fim do dia) fora do
        // fechamento: se a Lista vier igual à da última rodada completa, pula cupom e margem.
        const realToday = ymdInTz(wallStart, store.timezone);
        const memo =
          deps.listaMemo &&
          (job.logKind ?? job.kind) === "FORCE" &&
          !deps.closedMonth &&
          windows.length === 1 &&
          windows[0]!.from === realToday &&
          windows[0]!.to === realToday &&
          !(job.payload.fullStoreIds ?? []).includes(store.id)
            ? deps.listaMemo
            : null;
        const prevFingerprint = memo?.get(store.id);
        const mayReuse = prevFingerprint?.startsWith(`${realToday}:`) ?? false;
        const issuesBefore = syncLogIssueCount(store.id);
        // Atualizar: relatório de cupom ‖ (Lista → marca/CMV) ao mesmo tempo — salvo quando pode
        // pular: aí o cupom espera a Lista (pode nem ser chamado).
        const couponTask: Promise<CouponFetch | null | Error> | null =
          parallelReports && !mayReuse ? runCoupon().catch(asError) : null;
        const sellerWindows: ListaWindowArgs[] = [];

        let storeSales = 0;
        let storeDays = 0;
        let dayErrors = 0;
        let brandFrom = windows[0]!.from;
        let brandTo = windows[0]!.to;
        const listaForBrand: SaleRowWithFilial[] = [];
        for (const w of windows) {
          if (w.from < brandFrom) brandFrom = w.from;
          if (w.to > brandTo) brandTo = w.to;
        }
        const queue: Array<{ from: string; to: string }> = [...windows];
        while (queue.length > 0) {
          const { from, to } = queue.shift()!;
          detail(`  [${store.code}] → Lista ${from} → ${to}…`);
          const tLista = nowMs();
          let rows: Awaited<ReturnType<typeof deps.fetchSalesLista>> = [];
          try {
            const monthRows =
              deps.closedMonth?.covers(from) && deps.closedMonth.covers(to)
                ? await deps.closedMonth.listaRows({ session: session!, store, eventoIds, timings })
                : null;
            rows = monthRows
              ? monthRows.filter((r) => {
                  const day = ymdInTz(r.occurredAt, store.timezone);
                  return day >= from && day <= to;
                })
              : await timed(timings, STEP.lista, () =>
                  deps.fetchSalesLista({
                    session: session!,
                    storeId: store.id,
                    millenniumStoreId: store.millenniumStoreId,
                    from,
                    to,
                    eventoIds,
                  }),
                );
            detail(
              `  [${store.code}] Lista ok · ${rows.length} venda(s) · ${formatElapsed(tLista)}`,
            );
          } catch (dayErr) {
            const msg = dayErr instanceof Error ? dayErr.message : String(dayErr);
            if (isSessionDeadError(msg)) {
              throw new Error(`Sessão Millennium inválida (401) em ${from}→${to}`);
            }
            if (
              (job.kind === "SEED" || job.kind === "BACKFILL" || job.kind === "HISTORY") &&
              from !== to
            ) {
              // Janela de vários dias: não repete a mesma consulta pesada — fatia na hora.
              const parts = splitFailedWindow(from, to);
              console.warn(
                `  ⚠ [${store.code}] Falha em ${from}→${to}: ${msg} — caindo para ${nextFallbackMaxDays(from, to)}d (${parts.length} janela(s))`,
              );
              queue.unshift(...parts);
              continue;
            }
            if (job.kind === "SEED" || job.kind === "BACKFILL" || job.kind === "HISTORY") {
              console.warn(`  ⚠ [${store.code}] Falha em ${from}→${to}: ${msg} — nova tentativa`);
              try {
                rows = await timed(timings, STEP.lista, () =>
                  deps.fetchSalesLista({
                    session: session!,
                    storeId: store.id,
                    millenniumStoreId: store.millenniumStoreId,
                    from,
                    to,
                    eventoIds,
                  }),
                );
              } catch (retryErr) {
                const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
                if (isSessionDeadError(retryMsg)) {
                  throw new Error(`Sessão Millennium inválida (401) em ${from}→${to}`);
                }
                dayErrors += 1;
                console.warn(`  ⚠ [${store.code}] Desistindo de ${from}→${to}: ${retryMsg}`);
                syncLog("ERROR", "vendas", `Vendas (VENDAS.Lista) falhou duas vezes em ${from}→${to}: ${retryMsg}`, {
                  store,
                  day: from === to ? from : null,
                  error: retryErr,
                });
                if (from === to) {
                  await deps.upsertDayAggs([
                    {
                      tenantId: job.tenantId,
                      storeId: store.id,
                      day: from,
                      brand: "ALL",
                      revenueCents: 0,
                      salesCount: 0,
                      itemCount: 0,
                    },
                  ]);
                } else {
                  const parts = splitFailedWindow(from, to);
                  const step = nextFallbackMaxDays(from, to);
                  console.warn(
                    `  ⚠ [${store.code}] Range falhou — caindo para ${step}d (${from}→${to} → ${parts.length} janela(s))`,
                  );
                  queue.unshift(...parts);
                }
                continue;
              }
            } else {
              throw dayErr;
            }
          }

          if (rows.length === 0 && from !== to) {
            const parts = splitFailedWindow(from, to);
            const step = nextFallbackMaxDays(from, to);
            console.warn(
              `  ⚠ [${store.code}] Range ${from}→${to} vazio — caindo para ${step}d (${parts.length} janela(s))`,
            );
            queue.unshift(...parts);
            continue;
          }

          for (const r of rows) {
            const x = r as SaleRowWithFilial;
            listaForBrand.push({
              ...x,
              storeId: store.id,
              millenniumFilial: x.millenniumFilial ?? store.millenniumStoreId,
              millenniumOpCode: x.millenniumOpCode ?? null,
              nf: x.nf ?? null,
              tipoOperacao: x.tipoOperacao ?? null,
            });
          }

          const agg = aggregateSales(rows, {
            tenantId: job.tenantId,
            timeZone: store.timezone,
            now,
            dayFrom: from,
            dayTo: to,
          });

          // Dia sem venda grava R$ 0 — a carga inicial (FORCE dia a dia) conta o dia como coberto.
          if (
            agg.days.length === 0 &&
            from === to &&
            (job.kind === "SEED" || job.kind === "BACKFILL" || job.kind === "HISTORY" || job.kind === "FORCE")
          ) {
            await deps.upsertDayAggs([
              {
                tenantId: job.tenantId,
                storeId: store.id,
                day: from,
                brand: "ALL",
                revenueCents: 0,
                salesCount: 0,
                itemCount: 0,
              },
            ]);
            const win: ListaWindowArgs = {
              tenantId: job.tenantId,
              storeId: store.id,
              timeZone: store.timezone,
              from,
              to,
              rows: [],
              now,
              linkSellers: linkSellersFor(store),
            };
            await persistListaDerivedDayAggs(deps, { ...win, skipSellers: true });
            sellerWindows.push(win);
            storeDays += 1;
          } else {
            await deps.upsertDayAggs(agg.days);
            await deps.upsertHourAggs(agg.hours);
            const win: ListaWindowArgs = {
              tenantId: job.tenantId,
              storeId: store.id,
              timeZone: store.timezone,
              from,
              to,
              rows,
              now,
              linkSellers: linkSellersFor(store),
            };
            await persistListaDerivedDayAggs(deps, { ...win, skipSellers: true });
            sellerWindows.push(win);
            storeSales += rows.length;
            storeDays += agg.days.length;

            if (
              from !== to &&
              (job.kind === "SEED" || job.kind === "BACKFILL" || job.kind === "HISTORY")
            ) {
              const have = new Set(agg.days.map((d) => d.day));
              const zeros: typeof agg.days = [];
              let cursor = from;
              while (cursor <= to) {
                if (!have.has(cursor)) {
                  zeros.push({
                    tenantId: job.tenantId,
                    storeId: store.id,
                    day: cursor,
                    brand: "ALL",
                    revenueCents: 0,
                    salesCount: 0,
                    itemCount: 0,
                  });
                }
                cursor = addDaysIso(cursor, 1);
              }
              if (zeros.length > 0) {
                await deps.upsertDayAggs(zeros);
                storeDays += zeros.length;
              }
            }
          }
        }
        detail(
          `  [${store.code}] Lista/formas ok · ${storeSales} venda(s) · ${storeDays} dia(s)`,
        );
        const fingerprint = memo && dayErrors === 0 ? listaFingerprint(realToday, listaForBrand) : null;
        if (fingerprint && mayReuse && fingerprint === prevFingerprint) {
          const ms = nowMs() - tStore;
          const revenueCents = listaForBrand.reduce((a, r) => a + r.revenueCents, 0);
          totalSales += storeSales;
          totalRevenueCents += revenueCents;
          if (!compact) {
            logStoreEnd({
              facts: [
                `${storeSales} ${storeSales === 1 ? "venda" : "vendas"} · ${brlCents(revenueCents)}`,
                "sem venda nova — relatórios de cupom e margem pulados",
              ],
              ms,
              timings,
            });
          }
          storeDurations.push({ code: store.code, ms });
          return 1;
        }
        const couponPending = couponTask ?? runCoupon().catch(asError);
        const tBrand = nowMs();
        const detMovLines = new Map<string, DetMovLine[]>();
        const { cmvDaysDone, detMovCoupons, wpinkCents } = await upsertBrandSplit(deps, {
          session: session!,
          tenantId: job.tenantId,
          store,
          from: brandFrom,
          to: brandTo,
          rows: listaForBrand,
          productMap,
          geradorMap,
          geradorIdsWithWpink,
          detMovFrom:
            job.kind === "SEED" || job.kind === "BACKFILL" ? `${todayStore.slice(0, 7)}-01` : undefined,
          detMovConcurrency: sequential ? 1 : undefined,
          couponLines: couponPending.then((r) => (r == null || r instanceof Error ? null : r.lines)),
          detMovLines,
          timings,
        });
        detail(`  [${store.code}] marca total · ${formatElapsed(tBrand)}`);
        const coupon = await couponPending;
        if (coupon instanceof Error) throw coupon;
        const couponsByKey = coupon ? groupCouponLines(coupon.lines) : null;
        const sellersByCoupon = couponsByKey ? couponSellers(couponsByKey) : null;
        for (const win of sellerWindows) await persistSellerDayAggs(deps, { ...win, sellersByCoupon });
        if (coupon) {
          await saveCouponProducts(deps, {
            session: session!,
            tenantId: job.tenantId,
            store,
            coupon,
            listaRows: listaForBrand,
            catalogGuard,
            detMovLines,
            timings,
          });
        }
        // CMV / categorias: FORCE = buracos + hoje; SEED/HISTORY = janela; RANGE = só buracos.
        // Dias já cobertos pela margem no brand split não re-buscam CMV.
        const cmvDone = new Set(cmvDaysDone);
        if (shouldSyncCmv(job.kind) && cmvWin) {
          const cmvDays = (
            await daysNeedingHeavySync(deps, {
              kind: job.kind,
              tenantId: job.tenantId,
              storeId: store.id,
              from: cmvWin.from,
              to: cmvWin.to,
              today: todayStore,
              which: "cmv",
            })
          ).filter((d) => !cmvDone.has(d));
          await syncCmvForRange(deps, {
            session: session!,
            tenantId: job.tenantId,
            store,
            from: cmvWin.from,
            to: cmvWin.to,
            days: cmvDays,
            timings,
          });
        } else if (shouldSyncCmv(job.kind)) {
          detail(`  [${store.code}] → CMV · skip (sem janela)`);
        }
        if (memo) {
          // Só rodada sem nenhum aviso (cupom, margem, CMV, catálogo…) vale como base para pular.
          if (fingerprint && syncLogIssueCount(store.id) === issuesBefore) memo.set(store.id, fingerprint);
          else memo.forget(store.id);
        }
        const storeMs = nowMs() - tStore;
        const revenueCents = listaForBrand.reduce((a, r) => a + r.revenueCents, 0);
        const facts = [
          `${storeSales} ${storeSales === 1 ? "venda" : "vendas"} · ${brlCents(revenueCents)}`,
          ...(wpinkCents > 0 ? [`WPINK ${brlCents(wpinkCents)}`] : []),
          ...(storeDays > 1 ? [`${storeDays} dias`] : []),
          couponsByKey ? `${couponsByKey.size} cupons no relatório` : "relatório de cupom indisponível",
          ...(detMovCoupons > 0 ? [`${detMovCoupons} no detalhe (sem vendedora)`] : []),
        ];
        totalSales += storeSales;
        totalRevenueCents += revenueCents;
        if (!compact) logStoreEnd({ facts, ms: storeMs, timings, failures: dayErrors });
        else if (dayErrors > 0) console.warn(`  AVISO ${store.code}: ${dayErrors} janela(s) com falha`);
        storeDurations.push({ code: store.code, ms: storeMs });
        return 1;
        },
        { initialConcurrency: concurrency },
      );
      storesDone = storeResults.reduce((a, b) => a + (b ?? 0), 0);
    }

    const finishedAt = deps.now();
    const touchesToday =
      job.kind === "LIGHT" ||
      job.kind === "FORCE_LIGHT" ||
      job.kind === "FORCE" ||
      job.kind === "BACKFILL";
    await deps.updateCredential({
      credentialId: job.credentialId,
      lastSuccessAt: finishedAt,
      ...(touchesToday ? { lastLightSyncAt: finishedAt } : {}),
    });
    await deps.markJobFinished({ jobId: job.id, status: "SUCCEEDED" });
    await deps.insertSyncRun({
      tenantId: job.tenantId,
      credentialId: job.credentialId,
      kind: job.kind,
      ok: true,
      storesDone,
      startedAt,
      finishedAt,
    });
    if (compact) {
      return {
        ok: true,
        storesDone,
        summary: { sales: totalSales, revenueCents: totalRevenueCents, timings: totalTimings() },
      };
    }
    logJobEnd({
      ok: true,
      title,
      storesDone,
      storeCount,
      ms: nowMs() - tJob,
      timings: totalTimings(),
      erpUser,
      startedAt: wallStart,
      finishedAt: new Date(),
      timeZone: logTz,
      perStore: storeDurations,
    });

    return { ok: true, storesDone };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logJobEnd({
      ok: false,
      title,
      storesDone: storeDurations.length,
      storeCount,
      ms: nowMs() - tJob,
      timings: totalTimings(),
      erpUser,
      startedAt: wallStart,
      finishedAt: new Date(),
      timeZone: logTz,
      perStore: storeDurations,
      error: msg,
    });
    quietFailure = Boolean(job.quietFailures) && isErpUnavailableError(msg);
    if (!quietFailure) syncLog("ERROR", "job", `Sincronização interrompida: ${msg}`, { error: e });
    if (isSessionDeadError(msg)) {
      try {
        await deps.setStoredSession(job.credentialId, null);
        forgetMillenniumSession(job.credentialId);
      } catch {
        /* best-effort */
      }
    }
    if (!quietFailure) {
      await deps.updateCredential({
        credentialId: job.credentialId,
        lastError: msg,
        lastErrorAt: deps.now(),
      });
    }
    await deps.markJobFinished({ jobId: job.id, status: "FAILED", error: msg });
    await deps.insertSyncRun({
      tenantId: job.tenantId,
      credentialId: job.credentialId,
      kind: job.kind,
      ok: false,
      storesDone,
      error: msg,
      startedAt,
      finishedAt: deps.now(),
    });
    return { ok: false, reason: "other", error: msg };
  } finally {
    // Sessão permanece no tenant (DB) até o usuário desconectar em Integrações / pause.
    // Só limpa o ponteiro em memória deste processo.
    if (session) {
      activeMillenniumSession = null;
    }
    const logRows = endSyncLog();
    if (!quietFailure) await flushSyncLogs(deps, logRows);
  }
}

async function flushSyncLogs(deps: SyncJobDeps, rows: SyncLogRow[]): Promise<void> {
  if (rows.length === 0 || !deps.insertSyncLogs) return;
  try {
    await deps.insertSyncLogs(rows);
  } catch (e) {
    console.warn(`sync_log: falha ao gravar ${rows.length} registro(s): ${e instanceof Error ? e.message : String(e)}`);
  }
}
