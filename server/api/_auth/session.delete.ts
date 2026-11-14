// Neutralises the nuxt-auth-utils route: it must never clear a cookie or revoke anything.
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, statusMessage: "Not Found" });
});
