/** `%q%` with the LIKE metacharacters escaped, so a search text is always matched literally (`ILIKE`/`LIKE` escape with a backslash). */
export const containsPattern = (query: string) => `%${query.replace(/[\\%_]/g, "\\$&")}%`;
