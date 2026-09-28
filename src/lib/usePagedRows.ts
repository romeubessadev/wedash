import { useEffect, useState } from "react";

/** Padrão das tabelas da WeDash: 10 linhas por página (desktop e celular). */
export const TABLE_PAGE_SIZE = 10;

/**
 * Pagina `rows` no padrão da WeDash. Volta para a página 1 quando `resetKey` muda
 * (filtro, busca, ordenação).
 */
export function usePagedRows<T>(rows: T[], resetKey?: string | number) {
  const pageSize = TABLE_PAGE_SIZE;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const pageRows = rows.slice((current - 1) * pageSize, current * pageSize);
  return { page: current, setPage, totalPages, pageRows, pageSize, total: rows.length };
}
