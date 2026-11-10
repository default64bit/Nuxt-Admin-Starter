// Neutralises the nuxt-auth-utils route: the own `GET /api/v1/auth/session` is the only session read.
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, statusMessage: "Not Found" });
});
