import { SectionHeader } from "@/pages/operation/shared";

/** Estoque > Pedido de compra — em branco até a tela ser desenhada (só cabeçalho). */
export function PurchaseOrderPage() {
  return (
    <div>
      <SectionHeader section="Estoque" title="Pedido de compra" subtitle="Prepare o pedido de compra de cada loja." />
    </div>
  );
}

export default PurchaseOrderPage;
