/** Shared sales row / aggregate types (EN). Money = integer cents. */

export type SalesBrand = "WEPINK" | "WPINK" | "ALL";

/** One VENDAS.Lista line (or collapsed operation) after Millennium map. */
export type SaleRow = {
  operationCode: string;
  /** Instant used for day/hour buckets (DATA calendar + DATA_H clock). */
  occurredAt: Date;
  /** VALOR_FINAL in cents. */
  revenueCents: number;
  /** QUANTIDADE (items). */
  itemQty: number;
  storeId: string;
  brand?: SalesBrand;
  /** CONDICAO da Lista (meio de pagamento), já normalizado p/ UI. */
  paymentMethod?: string | null;
  /** VENDEDOR_MILLENNIUM da Lista (nome; vazio = fora do ranking). */
  sellerName?: string | null;
  /** FUNCIONARIO_GERADOR_GERADOR do relatório de cupom (código estável da vendedora). */
  sellerGeradorId?: number | null;
};

/** Daily bucket — matches sales_day_agg natural key. */
export type SalesDayAgg = {
  tenantId: string;
  storeId: string;
  /** Local calendar day YYYY-MM-DD in store timezone. */
  day: string;
  brand: SalesBrand;
  revenueCents: number;
  /** Distinct COD_OPERACAO count. */
  salesCount: number;
  itemCount: number;
  /**
   * CMV em centavos (RELATORIOMARGEM Σ CUSTO_TOTAL). brand=ALL na v1.
   * TODO(Configurações>Custos): × (1 + imposto_sobre_custo_pct).
   */
  cmvCents?: number;
};

/** Daily revenue by product tipo — sales_category_day_view (top produtos × product_catalog). */
export type SalesCategoryDayAgg = {
  tenantId: string;
  storeId: string;
  day: string;
  /** Millennium PRODUTO_TIPO_TIPO. */
  categoryId: number;
  categoryName: string;
  brand: SalesBrand;
  revenueCents: number;
  itemCount: number;
};

/** Distinct PRODUTO_TIPO already seen for the store (histórico sync). */
export type SalesCategoryRef = {
  categoryId: number;
  categoryName: string;
  brand: SalesBrand;
};

/** Daily revenue by payment method (CONDICAO) — sales_payment_day_agg. */
export type SalesPaymentDayAgg = {
  tenantId: string;
  storeId: string;
  day: string;
  /** Label de UI (Pix, Cartão de crédito, …). */
  paymentMethod: string;
  brand: SalesBrand;
  revenueCents: number;
  /** Distinct COD_OPERACAO count. */
  salesCount: number;
};

/** Turno cadastrado da funcionária (store_seller.shift_id → store_shift), p/ ligar às linhas do ranking. */
export type SellerShiftRef = {
  storeId: string;
  employeeId: number | null;
  geradorId: number | null;
  /** Nomes normalizados (mesma chave de `sellerKey`). */
  nameKeys: string[];
  name: string;
  /** HH:MM local da loja. */
  start: string;
  end: string;
};

/** Daily revenue by seller (VENDEDOR_MILLENNIUM) — sales_seller_day_agg. */
export type SalesSellerDayAgg = {
  tenantId: string;
  storeId: string;
  day: string;
  /** Nome normalizado (chave estável sem acento). */
  sellerKey: string;
  /** Rótulo de UI (title-case). */
  sellerName: string;
  /** Código da funcionária no Millennium (FUNCIONARIO) — resolvido pelo nome na gravação; null = só nome. */
  sellerEmployeeId?: number | null;
  /** Gerador da vendedora no Millennium (relatório de cupom); null = só pelo nome. */
  sellerGeradorId?: number | null;
  brand: SalesBrand;
  revenueCents: number;
  /** Distinct COD_OPERACAO count. */
  salesCount: number;
  /** Σ QUANTIDADE (itens). 0 em linhas gravadas antes de 2026-09-26. */
  itemCount?: number;
};

/** Daily cost by COD_PRODUTO (RELATORIOMARGEM) — sales_product_cost_day_agg. */
export type SalesProductCostDayAgg = {
  tenantId: string;
  storeId: string;
  day: string;
  /** COD_PRODUTO — join com SalesProductDayAgg.productCode. */
  productCode: string;
  itemCount: number;
  revenueCents: number;
  cmvCents: number;
};

/** Daily revenue by SKU ({E7A5C5C7}) — sales_product_day_agg. */
export type SalesProductDayAgg = {
  tenantId: string;
  storeId: string;
  day: string;
  /** Millennium produto.produto.produto. */
  productId: number;
  productCode: string;
  productName: string;
  brand: SalesBrand;
  revenueCents: number;
  itemCount: number;
};

/** Itens por pessoa (gerador) × produto × dia — matches sales_seller_product_day_agg (desafios). */
export type SalesSellerProductDayAgg = {
  tenantId: string;
  storeId: string;
  day: string;
  sellerGeradorId: number;
  /** Nome normalizado (liga pessoa sem cadastro). */
  sellerKey: string;
  sellerName: string;
  /** COD_PRODUTO; sem código = `#{productId}`. */
  productCode: string;
  productId: number;
  itemCount: number;
  revenueCents: number;
};

/** Hourly bucket — matches sales_hour_agg (current local day). */
export type SalesHourAgg = {
  tenantId: string;
  storeId: string;
  day: string;
  hour: number;
  brand: SalesBrand;
  revenueCents: number;
  salesCount: number;
  itemCount: number;
};

export type AggregateSalesResult = {
  days: SalesDayAgg[];
  hours: SalesHourAgg[];
};
