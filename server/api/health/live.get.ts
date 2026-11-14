export default defineEventHandler((event) => {
  // Liveness answers only whether the Nitro process can serve requests;
  // readiness checks for database/storage belong to the operational readiness contract.
  setResponseHeader(event, "Cache-Control", "no-store");
  return { status: "ok" as const };
});
