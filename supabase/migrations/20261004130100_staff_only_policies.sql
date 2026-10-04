-- Vendedor (membership SELLER) não lê nenhuma tabela da empresa: os dados dele vêm só da Edge seller-home.
-- Mesmo predicado de antes para Gestor/Gerente (membership ACTIVE), sem o papel SELLER (staff_tenant_ids()).
--
-- Recriadas (leitura por empresa, antes "membership ACTIVE de qualquer papel"):
--   erp_credential · erp_credential_select_own
--   store · store_select_own
--   sync_job · sync_job_select_own
--   sync_run · sync_run_select_own
--   sales_day_agg · sales_day_agg_select_own
--   sales_hour_agg · sales_hour_agg_select_own
--   sales_category_day_agg · sales_category_day_agg_select_own
--   sales_payment_day_agg · sales_payment_day_agg_select_own
--   erp_sales_evento · erp_sales_evento_select_own
--   sales_seller_day_agg · sales_seller_day_agg_select_own
--   sales_product_day_agg · sales_product_day_agg_select_own
--   store_seller · store_seller_select_own
--   sales_product_cost_day_agg · sales_product_cost_day_agg_select_own
--   store_shift · store_shift_select_own
--   store_cost_item · store_cost_item_select_own
--   store_stock · store_stock_select_own
--   sales_price_table_day_agg · sales_price_table_day_agg_select_own
--   goal · goal_select_own
--   challenge · challenge_select_own
--   sales_seller_product_day_agg · sales_seller_product_day_agg_select_own
--   store_purchase_stock · store_purchase_stock_select_own
--   store_purchase_min · store_purchase_min_select_own
--
-- Recriadas (tabelas globais, antes "using (true)" para qualquer logado; custos e preços dos produtos):
--   product_type · product_type_select_all
--   product_catalog · product_catalog_select_all
--   product_catalog_sync · product_catalog_sync_select_all
--   product_cost_table · product_cost_table_select_all
--   product_cost_table_price · product_cost_table_price_select_all
--   product_sale_table · product_sale_table_select_all
--   product_sale_price · product_sale_price_select_all
--
-- Recriadas (escrita da própria conta; vendedor não escolhe as próprias lojas):
--   membership_store · membership_store_insert_own
--   membership_store · membership_store_delete_own
--
-- Mantidas (o vendedor precisa para entrar no app; só as próprias linhas):
--   identity · identity_select_own, identity_update_own_temporary_password
--   membership · membership_select_own, membership_update_own_onboarding
--   membership_store · membership_store_select_own
--   tenant · tenant_select_own
--   announcement · announcement_select_published
--
-- Mantidas (já restritas a OWNER/MANAGER/ADMIN_GLOBAL ou ao dono da conta):
--   store · store_update_own · sync_log · sync_log_select_managers
--   erp_credential · erp_credential_update_auto_refresh · tenant · tenant_update_own_name
--   store_shift · store_shift_write_managers · store_seller · store_seller_update_shift
--   store_cost_item · store_cost_item_write_gestor · goal · goal_write_managers
--   challenge · challenge_write_managers · store_purchase_min · store_purchase_min_write

do $$
declare t text;
begin
  foreach t in array array[
    'erp_credential', 'store', 'sync_job', 'sync_run', 'sales_day_agg', 'sales_hour_agg',
    'sales_category_day_agg', 'sales_payment_day_agg', 'erp_sales_evento', 'sales_seller_day_agg',
    'sales_product_day_agg', 'store_seller', 'sales_product_cost_day_agg', 'store_shift',
    'store_cost_item', 'store_stock', 'sales_price_table_day_agg', 'goal', 'challenge',
    'sales_seller_product_day_agg', 'store_purchase_stock', 'store_purchase_min'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (tenant_id in (select public.staff_tenant_ids()))',
      t || '_select_own',
      t
    );
  end loop;

  foreach t in array array[
    'product_type', 'product_catalog', 'product_catalog_sync', 'product_cost_table',
    'product_cost_table_price', 'product_sale_table', 'product_sale_price'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_all', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (exists (select 1 from public.staff_tenant_ids()))',
      t || '_select_all',
      t
    );
  end loop;
end $$;

drop policy if exists membership_store_insert_own on public.membership_store;
create policy membership_store_insert_own
  on public.membership_store for insert
  to authenticated
  with check (
    membership_id in (
      select m.id from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.role <> 'SELLER'
    )
  );

drop policy if exists membership_store_delete_own on public.membership_store;
create policy membership_store_delete_own
  on public.membership_store for delete
  to authenticated
  using (
    membership_id in (
      select m.id from public.membership m
      join public.identity i on i.id = m.identity_id
      where i.auth_user_id = auth.uid()
        and m.role <> 'SELLER'
    )
  );
