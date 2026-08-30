export const DEFAULT_TABLE_PAGE_SIZE = 25;

export function parseTablePage(
  searchParams: Record<string, string | string[] | undefined> | { page?: string },
  opts?: { pageSize?: number; paramName?: string }
) {
  const pageSize = opts?.pageSize ?? DEFAULT_TABLE_PAGE_SIZE;
  const paramName = opts?.paramName ?? "page";
  const raw = (searchParams as Record<string, string | string[] | undefined>)[paramName];
  const pageRaw = Array.isArray(raw) ? raw[0] : raw;
  const page = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

export function tablePageRange(page: number, pageSize: number, totalCount: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalCount);
  return { totalPages, safePage, from, to };
}
