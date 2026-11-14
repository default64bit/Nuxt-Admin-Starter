import { z } from "zod";

/** Admin tables use explicit Previous/Next pages of a fixed size (no page-size selector in v1). */
export const ADMIN_PAGE_SIZE = 20;

/** The query every admin list shares: `page` (default 1) and an optional, trimmed search text `q`. */
export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? value : undefined)),
});
export type AdminListQuery = z.output<typeof adminListQuerySchema>;

export const pageOffset = (page: number) => (page - 1) * ADMIN_PAGE_SIZE;
