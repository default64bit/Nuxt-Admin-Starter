import { z } from "zod";

/**
 * `GET /api/v1/admin/analytics/strips/users`: the Analytics strip above the Users list. Accounts created in the last 30
 * days with the previous 30 days' count and a daily sparkline, every account now, and how many are disabled.
 */
export const usersStripSchema = z.object({
  newAccounts: z.object({ current: z.number().int().min(0), previous: z.number().int().min(0) }),
  sparkline: z.array(z.object({ day: z.string(), count: z.number().int().min(0) })),
  total: z.number().int().min(0),
  disabled: z.number().int().min(0),
});
export type UsersStrip = z.output<typeof usersStripSchema>;
