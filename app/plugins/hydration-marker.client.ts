// Marks the document once the app has hydrated (`<html data-hydrated="true">`). The server HTML never
// carries it, so it cannot cause a hydration mismatch. End-to-end tests wait for it before they
// interact, instead of racing the hydration with timeouts. `app:mounted` alone is too early: a page with
// async setup hydrates inside the root Suspense, which resolves later, and until then its buttons have no
// handlers. The marker therefore waits for both the mount and the Suspense resolve.
export default defineNuxtPlugin((nuxtApp) => {
  let mounted = false;
  let resolved = false;
  const mark = () => {
    if (mounted && resolved) document.documentElement.dataset.hydrated = "true";
  };
  nuxtApp.hook("app:mounted", () => {
    mounted = true;
    mark();
  });
  nuxtApp.hook("app:suspense:resolve", () => {
    resolved = true;
    mark();
  });
});
