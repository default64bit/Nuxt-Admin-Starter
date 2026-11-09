// Unknown `/api/v1` paths answer with the standard JSON error body, never the HTML 404 page.
export default defineEventHandler(() => {
  throw createError({
    statusCode: 404,
    statusMessage: "Not Found",
    data: { code: "not-found" },
  });
});
