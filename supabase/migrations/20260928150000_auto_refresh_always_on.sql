-- Atualização automática volta a ser sempre ligada (chave removida da tela de Integrações).
update public.erp_credential set auto_refresh_enabled = true where auto_refresh_enabled is distinct from true;
